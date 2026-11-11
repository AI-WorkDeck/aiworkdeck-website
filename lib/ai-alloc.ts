import { getDb, withTransaction } from './db';
import { refundSpend, grantCredits } from './credits';
import { getActiveKeyRow } from './openrouter-keys';
import * as mgmt from './openrouter-mgmt';

/**
 * 遗留分配的对账（PR-W2 的残留部分）。
 *
 * **这个模块已经不再产生新数据。** Credits 重构 P3 把「用户手动从余额分配 AI 额度」
 * 整条链路下线了，额度改由 lib/ai-quota.ts 按余额自动派生（limit = 已用 + 买得起的），
 * 用量事后回抄扣 Credits。allocateAiQuota 与其两阶段事务已随之删除——它的「增量提额」
 * 语义与新的「按余额派生」直接冲突，留着必被后人误用。
 *
 * 保留下来的只有一件事：**清扫旧模型留下的 pending 行**。那些行的钱已经扣了、
 * 额度到没到位不确定，必须实查远端定论：
 *   limit >= expectedLimitUsd（容差半美分）→ 当时其实成功了 → 补 done，不退款
 *   低于目标 / key 404                      → 确实没成 → 原批次原额退款
 *   网络或服务器错                          → 查不出来，本轮跳过，下次再对
 * 不核对就退款会让用户既拿回钱又白得额度；而 alloc 一旦置 failed，对账只扫 pending，
 * 永不回收，本地 limitUsd 与远端就此永久分叉。
 *
 * 触发点：POST /api/admin/ai/reconcile（定时任务）。旧的唯一触发点是 allocateAiQuota
 * 入口本身，入口下线时若不同批补上这个定时任务，超时的 pending 会永远悬着。
 */

export interface AiAllocationRow {
  id: string;
  userId: string;
  amountCents: number;
  usdDelta: number;
  status: 'pending' | 'done' | 'failed';
  orKeyHash: string | null;
  expectedLimitUsd: number | null;
  createdAt: string;
  settledAt: string | null;
  /** 本次扣款的流水行 id，退款据此原批次原额退回；迁移前的历史行为 null */
  spendLedgerId: number | null;
}

const PENDING_STALE_MS = 10 * 60 * 1000;
/** REAL 列与 OpenRouter 返回的浮点比较容差（半美分） */
const USD_EPSILON = 0.005;


/**
 * failed + 等额退款，同一事务原子完成；status 状态机保证幂等（只有 pending 行会被退）。
 *
 * 必须**原批次原额**退回（refundSpend 按扣款时记下的批次明细还原），不能简单地再发一笔。
 * 否则「分配一笔 → 上游失败退款」就成了把不可提现的 reward 洗成可退 topup 的路子。
 */
function refundAlloc(
  alloc: { id: string; userId: string; amountCents: number; spendLedgerId?: number | null },
  reason: string
) {
  withTransaction((db) => {
    const r = db
      .prepare("UPDATE ai_allocations SET status = 'failed', settledAt = ? WHERE id = ? AND status = 'pending'")
      .run(new Date().toISOString(), alloc.id);
    if (r.changes === 0) return;

    if (alloc.spendLedgerId) {
      refundSpend(db, alloc.spendLedgerId, {
        ledgerKind: 'adjust',
        meta: { autoRefund: true, allocId: alloc.id, reason },
      });
      return;
    }
    // 迁移前落下的 pending 行没有批次明细。这些余额在 P1 回填时已统一算作 topup，
    // 退成 topup 与回填口径一致，不会凭空造出可提现额度。
    grantCredits(db, {
      userId: alloc.userId,
      pool: 'topup',
      amountCents: alloc.amountCents,
      ledgerKind: 'adjust',
      meta: { autoRefund: true, allocId: alloc.id, reason, legacyNoLotDetail: true },
    });
  });
}

function markAllocDone(allocId: string, orKeyHash: string | null) {
  withTransaction((db) => {
    db.prepare(
      "UPDATE ai_allocations SET status = 'done', settledAt = ?, orKeyHash = COALESCE(?, orKeyHash) WHERE id = ? AND status = 'pending'"
    ).run(new Date().toISOString(), orKeyHash, allocId);
  });
}

type PatchProbe =
  | { state: 'applied'; remoteLimitUsd: number }
  | { state: 'not_applied' }
  | { state: 'unknown' };

/**
 * 实查远端 limit，判定一次抛了错的 patchKeyLimit 到底生效没有。
 * 判定口径与 reconcileStalePending 一致：limit >= 目标值（容差半美分）即认定已生效。
 */
async function probePatchApplied(hash: string, expectedLimitUsd: number): Promise<PatchProbe> {
  try {
    const remote = await mgmt.getKey(hash);
    return remote.limitUsd >= expectedLimitUsd - USD_EPSILON
      ? { state: 'applied', remoteLimitUsd: remote.limitUsd }
      : { state: 'not_applied' };
  } catch (e) {
    // key 都不存在了，PATCH 不可能生效 → 可安全退款
    if (e instanceof mgmt.OpenRouterMgmtError && e.kind === 'client_error' && e.status === 404) {
      return { state: 'not_applied' };
    }
    // 网络/服务器错：查不出来，不许猜
    return { state: 'unknown' };
  }
}


/**
 * 对账遗留 pending（超过 10 分钟）。网络/服务器错误的行跳过，留待下次。
 * 判定口径：getKey 实查 limit >= expectedLimitUsd（容差半美分）即认定当时成功。
 * expectedLimitUsd 为空说明当时还没走到调 OpenRouter 那步，直接退款。
 */
export async function reconcileStalePending(userId?: string): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_STALE_MS).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT * FROM ai_allocations WHERE status = 'pending' AND createdAt < ?${userId ? ' AND userId = ?' : ''}`
    )
    .all(...(userId ? [cutoff, userId] : [cutoff])) as AiAllocationRow[];

  for (const alloc of rows) {
    if (alloc.expectedLimitUsd == null) {
      refundAlloc(alloc, 'reconcile: 未走到 OpenRouter 调用即中断');
      continue;
    }
    // create 路径崩在 createKey 与落库之间时 orKeyHash 为空：查现存 key 行兜底
    const hash = alloc.orKeyHash ?? getActiveKeyRow(alloc.userId)?.orKeyHash ?? null;
    if (!hash) {
      // 连 key 行都没有：createKey 结果不可知，明文已丢，无法交付 → 退款。
      // 若远端真建出了孤儿 key，它从未交给任何用户，无法被消费，风险可接受（PR 描述注明）。
      refundAlloc(alloc, 'reconcile: 无可查证的 key hash');
      continue;
    }
    let remote: mgmt.RemoteKey;
    try {
      remote = await mgmt.getKey(hash);
    } catch (e) {
      if (e instanceof mgmt.OpenRouterMgmtError && e.kind === 'client_error' && e.status === 404) {
        refundAlloc(alloc, 'reconcile: key 不存在(404)');
      }
      // 网络/服务器错：本轮不动，下次再对账
      continue;
    }
    if (remote.limitUsd >= alloc.expectedLimitUsd - USD_EPSILON) {
      markAllocDone(alloc.id, hash);
      withTransaction((db) => {
        db.prepare('UPDATE openrouter_keys SET limitUsd = ? WHERE orKeyHash = ? AND disabledAt IS NULL').run(
          remote.limitUsd,
          hash
        );
      });
    } else {
      refundAlloc(alloc, `reconcile: 实查 limit ${remote.limitUsd} < 目标 ${alloc.expectedLimitUsd}`);
    }
  }
}
