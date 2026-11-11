import { getDb, withTransaction } from './db';
import { getExchangeRateInfo } from './ai-config';
import { getUserMarginMultiplier } from './circle-firms';
import { settleUsage, withQuotaLock } from './ai-quota';
import type { OrKeyRow } from './openrouter-keys';
import * as mgmt from './openrouter-mgmt';

/**
 * OpenRouter 账号轮换（旧账号被上游封禁/停用时，把用户迁到新账号铸造的子 key）。
 *
 * 钱的口径不变：钱只从 settleUsage(远端 usage) 扣。所以轮换对每把旧 key 严格按
 *   结算 → 禁用 → 再结算（禁用后的最终读数）→ 标记退役并入回读清单
 * 的顺序走；不主动铸新 key——用户下一次 syncAiQuota 发现没有有效 key，会按
 * 「Credits 余额折算」铸造（余额已被上面的结算扣过，所以新 limit = 剩余，不会重复发放）。
 *
 * 退役 key 进入 openrouter_rotated_key，由对账循环用旧账号 key 继续回读，
 * 宽限期（默认 7 天）结束或用量连续 24 小时不变即收口，迟到用量因此不丢。
 */

export const ROTATION_GRACE_MS = 7 * 24 * 3600_000;
export const ROTATION_STABLE_MS = 24 * 3600_000;

export class RotationError extends Error {
  code: 'retired_key_missing' | 'current_key_missing' | 'same_account';
  constructor(code: RotationError['code'], message: string) {
    super(message);
    this.name = 'RotationError';
    this.code = code;
  }
}

export interface RotationItem {
  keyId: number;
  userId: string;
  orKeyHash: string;
  action: 'rotated' | 'would_rotate' | 'skipped_postpaid' | 'failed';
  finalUsageUsd?: number;
  settledCents?: number;
  error?: string;
}
export interface RotationReport {
  dryRun: boolean;
  retiredAccount: string;
  currentAccount: string;
  items: RotationItem[];
}

function candidates(retiredFp: string): OrKeyRow[] {
  // NULL = 迁移前未标记的行；已配置旧账号时它们只可能是旧账号铸造的
  return getDb()
    .prepare('SELECT * FROM openrouter_keys WHERE disabledAt IS NULL AND (mgmtAccount = ? OR mgmtAccount IS NULL) ORDER BY id')
    .all(retiredFp) as OrKeyRow[];
}

function isPostpaid(userId: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM postpaid_external_budget WHERE userId = ?').get(userId);
}

/** 幂等：重复执行时已退役的行不再是候选，什么都不会改。dryRun 不写库也不发任何写请求。 */
export async function rotateRetiredAccount(opts: { dryRun?: boolean } = {}): Promise<RotationReport> {
  const dryRun = opts.dryRun !== false;
  const retiredFp = mgmt.retiredMgmtAccount();
  const currentFp = mgmt.currentMgmtAccount();
  if (!retiredFp) throw new RotationError('retired_key_missing', '未配置 OPENROUTER_PROVISIONING_KEY_RETIRED（旧账号 Management key），无法轮换');
  if (!currentFp) throw new RotationError('current_key_missing', '未配置 OPENROUTER_PROVISIONING_KEY（新账号 Management key），无法轮换');
  if (retiredFp === currentFp) throw new RotationError('same_account', 'OPENROUTER_PROVISIONING_KEY 与 _RETIRED 是同一个账号');

  const items: RotationItem[] = [];
  for (const row of candidates(retiredFp)) {
    const item: RotationItem = { keyId: row.id, userId: row.userId, orKeyHash: row.orKeyHash, action: dryRun ? 'would_rotate' : 'rotated' };
    items.push(item);
    if (isPostpaid(row.userId)) {
      // 后付费预算账本绑定在 key 上，不在本流程范围内，需人工处理
      item.action = 'skipped_postpaid';
      continue;
    }
    try {
      if (dryRun) {
        item.finalUsageUsd = (await mgmt.getKey(row.orKeyHash)).usageUsd;
        continue;
      }
      await withQuotaLock(row.userId, async () => {
        const rate = getExchangeRateInfo().rate;
        const margin = getUserMarginMultiplier(row.userId);
        // (a) 先结算已知用量，再禁用，再读禁用后的最终用量补结算
        let cents = settleUsage(row, (await mgmt.getKey(row.orKeyHash)).usageUsd, rate, margin);
        // 轮换流程自己写 mgmtAccount：NULL 行此刻确认归属旧账号
        getDb().prepare('UPDATE openrouter_keys SET mgmtAccount = ? WHERE id = ? AND mgmtAccount IS NULL').run(retiredFp, row.id);
        await mgmt.disableKey(row.orKeyHash); // (b)
        const final = await mgmt.getKey(row.orKeyHash);
        if (!final.disabled) throw new Error('disable_unconfirmed');
        cents += settleUsage(row, final.usageUsd, rate, margin);
        const now = new Date().toISOString();
        withTransaction(db => { // (c)
          db.prepare('UPDATE openrouter_keys SET disabledAt = ? WHERE id = ? AND disabledAt IS NULL').run(now, row.id);
          db.prepare('INSERT OR IGNORE INTO openrouter_rotated_key (keyId, retiredAt, lastCheckedAt, lastUsageUsd, lastChangedAt) VALUES (?, ?, ?, ?, ?)')
            .run(row.id, now, now, final.usageUsd, now);
        });
        item.finalUsageUsd = final.usageUsd;
        item.settledCents = cents;
      });
    } catch (e) {
      item.action = 'failed';
      item.error = e instanceof Error ? e.message : String(e);
    }
  }
  return { dryRun, retiredAccount: retiredFp, currentAccount: currentFp, items };
}

/**
 * 回读某用户（不传则全部）已退役 key 的迟到用量，用铸造账号（旧账号）的 key 结算。
 * 收口条件：超过宽限期，或用量连续 ROTATION_STABLE_MS 没变化，或远端已 404。
 */
export async function settleRotatedKeys(userId?: string, now = new Date()): Promise<{ checked: number; settledCents: number; failed: number }> {
  const rows = getDb()
    .prepare(`SELECT k.*, r.retiredAt, r.lastUsageUsd, r.lastChangedAt FROM openrouter_rotated_key r
      JOIN openrouter_keys k ON k.id = r.keyId WHERE r.doneAt IS NULL ${userId ? 'AND k.userId = ?' : ''}`)
    .all(...(userId ? [userId] : [])) as (OrKeyRow & { retiredAt: string; lastUsageUsd: number | null; lastChangedAt: string | null })[];
  let settledCents = 0;
  let failed = 0;
  const iso = now.toISOString();
  for (const row of rows) {
    const done = () => getDb().prepare('UPDATE openrouter_rotated_key SET doneAt = ?, lastCheckedAt = ? WHERE keyId = ?').run(iso, iso, row.id);
    try {
      await withQuotaLock(row.userId, async () => {
        let usage: number;
        try {
          usage = (await mgmt.getKey(row.orKeyHash)).usageUsd;
        } catch (e) {
          if (e instanceof mgmt.OpenRouterMgmtError && e.kind === 'client_error' && e.status === 404) { done(); return; }
          throw e;
        }
        settledCents += settleUsage(row, usage, getExchangeRateInfo().rate, getUserMarginMultiplier(row.userId));
        const changed = row.lastUsageUsd == null || Math.abs(usage - row.lastUsageUsd) > 1e-9;
        const lastChangedAt = changed ? iso : row.lastChangedAt ?? row.retiredAt;
        getDb().prepare('UPDATE openrouter_rotated_key SET lastCheckedAt = ?, lastUsageUsd = ?, lastChangedAt = ? WHERE keyId = ?')
          .run(iso, usage, lastChangedAt, row.id);
        if (now.getTime() - Date.parse(row.retiredAt) >= ROTATION_GRACE_MS || now.getTime() - Date.parse(lastChangedAt) >= ROTATION_STABLE_MS) done();
      });
    } catch {
      failed++;
      // 宽限期已过仍读不到：不无限重试，收口并交给 admin 人工核对
      if (now.getTime() - Date.parse(row.retiredAt) >= ROTATION_GRACE_MS) done();
    }
  }
  return { checked: rows.length, settledCents, failed };
}

/** 管理页用：各账号有效 key 数 + 待回读的退役 key 数。 */
export function accountOverview() {
  const current = mgmt.currentMgmtAccount();
  const retired = mgmt.retiredMgmtAccount();
  const rows = getDb()
    .prepare('SELECT mgmtAccount AS account, COUNT(*) AS n FROM openrouter_keys WHERE disabledAt IS NULL GROUP BY mgmtAccount')
    .all() as { account: string | null; n: number }[];
  const pending = getDb().prepare('SELECT COUNT(*) AS n FROM openrouter_rotated_key WHERE doneAt IS NULL').get() as { n: number };
  return {
    currentAccount: current,
    retiredAccount: retired,
    activeKeys: rows.map(r => ({
      account: r.account,
      role: r.account === current ? 'current' : r.account === retired ? 'retired' : r.account === null ? (retired ? 'retired' : 'current') : 'unknown',
      count: r.n,
    })),
    pendingRetiredKeys: pending.n,
  };
}
