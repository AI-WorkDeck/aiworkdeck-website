import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, withTransaction } from './db';
import { getBalanceBreakdown, getRefundableCents, spendCredits } from './credits';
import { deleteApiKeysByUser } from './api-keys';
import { deleteSessionsByUser } from './sessions';
import { markUserDeleted } from './users';
import { deleteAvatar } from './avatars';
import * as mgmt from './openrouter-mgmt';
import { siteConfig, formatSiteAmount } from './site-config';
import { toBaseLocale, type Locale } from '@/i18n-config';

/**
 * 自助注销账户。
 *
 * 隐私政策第九条对外承诺「随时注销」，第八条承诺「账户信息：注销后 30 日内删除或
 * 匿名化」。国际站上线后这同时是 GDPR 第 17 条的硬要求。此前只有邮件人工一条路。
 *
 * ## 数据面的两个事实决定了整套做法
 *
 * 1. **没有任何外键。** `getDb()` 里的 `pragma foreign_keys = ON` 是空转——建表时
 *    一个 REFERENCES 都没写。userId 全是裸 TEXT，删账户不会级联到任何地方，
 *    每张表都得手点名。
 * 2. **跨两种存储。** 用户与会话在 JSON 文件（同步 fs 全量覆盖写、无锁），
 *    钱与权益在 SQLite。**一个事务盖不住全部**，见下面的执行顺序。
 *
 * ## 删 / 留 / 墓碑
 *
 * | 数据 | 处置 | 依据 |
 * |---|---|---|
 * | sessions.json、api_keys | 真删 | 凭据，无留存价值 |
 * | data/avatars/{id}.webp | 真删 | 用户上传的人像，属账户信息 |
 * | openrouter_keys.encKey | 远端作废后置 NULL | 密文是活的付费 key |
 * | credit_lots (reward) 剩余 | 清零 + expire 流水 | 条款明写奖励 Credits 不退还 |
 * | orders / wallet_ledger / credit_lots / purchases / entitlements / creator_earnings / gift_codes / web_ai_request / web_ai_agent_run | userId → 墓碑 | 交易记录须留存 ≥10 年 |
 * | orders.payerOpenid | 置 NULL | 微信 openid 可关联到自然人，税务留存不需要它 |
 * | admin_audit.detail | **原样不动** | 审计记录不许改写 |
 * | telemetry_* | **什么都不做** | 两张表根本没有 userId 列，去删等于承认存在关联 |
 * | 广场投稿（skills/plugins） | 保留，付费的改免费 | 「下架后 90 日内删除；已分发的副本不受影响」 |
 *
 * ## 墓碑值为什么必须是稳定确定值
 *
 * `deleted:` + 原 UUID 的 sha256 前 16 位。同一个 userId 在 purchases 的 buyer 与
 * creator 两侧、在 orders 与 wallet_ledger 之间必须换出**同一个**值，否则财务对账
 * 直接断链。随机值或时间戳都不行。
 *
 * 几个绝不能置 NULL 的地方：
 * - `gift_codes.redeemedByUserId`：`lib/gift-codes.ts` 两处用
 *   `WHERE redeemedByUserId IS NULL AND revokedAt IS NULL` 判定可核销，
 *   置空等于把已用掉的兑换码复活，任何人拿到码就能再兑一次。
 * - `orders.userId`：`lib/orders.ts` 有一条 `WHERE userId IS NULL AND idempotencyKey = ?`
 *   的匿名打赏查询，置空会让注销用户的订单混进那个池子。
 */

const SKILLS_FILE = path.join(process.cwd(), 'data', 'skills.json');
const PLUGINS_FILE = path.join(process.cwd(), 'data', 'plugins.json');
const FAILED_SUBMISSIONS_FILE = path.join(process.cwd(), 'data', 'failed-submissions.jsonl');

/** 按请求语言或站点默认语言取文案。前端另有自己的词典，这里只保证服务端直出可读。 */
function L(zh: string, en: string, lang: Locale = siteConfig.defaultLocale): string {
  return toBaseLocale(lang) === 'zh' ? zh : en;
}

/** 墓碑行在广场上显示的作者名。中性措辞，不用 unknown 这种像故障的词。 */
export function deletedDisplayName(lang: Locale = siteConfig.defaultLocale): string {
  return L('已注销用户', 'Deleted user', lang);
}

/**
 * userId → 墓碑值。**确定性**：同一 userId 永远得到同一结果，跨表跨次调用一致。
 * 前缀 `deleted:` 保证它不可能与任何真实 UUID 相等。
 */
export function tombstoneUserId(userId: string): string {
  return 'deleted:' + crypto.createHash('sha256').update(userId, 'utf-8').digest('hex').slice(0, 16);
}

export type DeletionBlockerCode =
  | 'has_pending_balance'
  | 'has_unsettled_earnings'
  | 'has_pending_allocation';

export interface DeletionBlocked {
  blocked: DeletionBlockerCode;
  message: string;
}

/** 远端 AI 通道没作废成功。不是闸门，是「现在不能安全地删」。 */
export interface DeletionKeyDisableFailed {
  keyDisableFailed: true;
  message: string;
}

export interface DeletionDone {
  deletedAt: string;
  notes: string[];
}

export type DeleteAccountResult = DeletionDone | DeletionBlocked | DeletionKeyDisableFailed;

class BlockedError extends Error {
  constructor(public readonly detail: DeletionBlocked) {
    super(detail.blocked);
    this.name = 'BlockedError';
  }
}

// ---------------------------------------------------------------------------
// 前置闸门（只读）
// ---------------------------------------------------------------------------

/**
 * 三条硬闸门。任一命中就不许自助注销——这些都是「平台与用户之间钱还没算清」的状态，
 * 删掉账户就没人能再把它算清了。返回 null 表示可以走。
 *
 * 纯只读，且**在事务内会被再跑一遍**：闸门到写入之间可能有一笔支付回调落地。
 */
export function findDeletionBlocker(userId: string, lang: Locale = siteConfig.defaultLocale): DeletionBlocked | null {
  const db = getDb();
  const email = siteConfig.legalEntity.contactEmail;

  const unsettled = db
    .prepare('SELECT COUNT(*) AS c FROM creator_earnings WHERE creatorUserId = ? AND settledAt IS NULL')
    .get(userId) as { c: number };
  if (unsettled.c > 0) {
    return {
      blocked: 'has_unsettled_earnings',
      message: L(
        `账户还有 ${unsettled.c} 笔未结算的创作者收益，平台欠着这笔钱，暂不能自助注销。可发邮件至 ${email} 由人工结清后办理。`,
        `Your account has ${unsettled.c} unsettled creator earning(s) still owed to you, so self-service deletion is unavailable. Email ${email} and we will settle them for you first.`,
        lang
      ),
    };
  }

  // 充值余额条款上可申请原路退还，而 lib/wxpay.ts 根本没有退款接口，
  // Stripe 侧退款也要人工确认——自助注销把它一并烧掉等于私吞。
  const refundable = getRefundableCents(userId);
  if (refundable > 0) {
    return {
      blocked: 'has_pending_balance',
      message: L(
        `账户还有 ${formatSiteAmount(refundable)} 充值余额可申请退还，暂不能自助注销。可发邮件至 ${email} 办理退还后再来。`,
        `Your account still holds ${formatSiteAmount(refundable)} in refundable top-up balance, so self-service deletion is unavailable. Email ${email} to arrange the refund first.`,
        lang
      ),
    };
  }

  const pending = db
    .prepare("SELECT COUNT(*) AS c FROM ai_allocations WHERE userId = ? AND status = 'pending'")
    .get(userId) as { c: number };
  // 这些 Web 请求仍可能退还预留款并按实际用量扣款，必须保留原 userId 与资金的关联。
  // refunded_pending 已退款且禁止事后追扣，只保留运营事件，不阻断用户注销。
  const pendingWeb = db
    .prepare("SELECT COUNT(*) AS c FROM web_ai_request WHERE userId = ? AND state IN ('reserved','submitted','usage_pending')")
    .get(userId) as { c: number };
  const pendingSkill = db.prepare("SELECT COUNT(*) AS c FROM skill_ai_request WHERE userId = ? AND state IN ('submitted','usage_pending')").get(userId) as { c: number };
  const pendingPlatform = db.prepare("SELECT COUNT(*) AS c FROM platform_ai_request WHERE userId = ? AND state IN ('reserved','submitted','usage_pending')").get(userId) as { c: number };
  if (pending.c > 0 || pendingWeb.c > 0 || pendingPlatform.c > 0 || pendingSkill.c > 0) {
    return {
      blocked: 'has_pending_allocation',
      message: L(
        `有一笔 AI 额度分配或 Web AI 请求尚未结算，暂不能自助注销。稍后再试，或发邮件至 ${email}。`,
        `An AI quota allocation or Web AI request is still pending settlement, so self-service deletion is unavailable. Try again later, or email ${email}.`,
        lang
      ),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 文件侧
// ---------------------------------------------------------------------------

function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

interface SubmissionLike {
  authorId?: string;
  priceCents?: number;
}

/**
 * 把该作者的付费投稿改成免费，并统计他一共有多少条投稿。
 *
 * 不删投稿：已分发的副本收不回，隐私政策写的就是「下架后 90 日内删除；已分发的副本
 * 不受影响」。但价格必须归零——否则平台在替一个不存在的人收钱，每卖一份就往
 * creator_earnings 里累一笔永远结不掉的应付账款（而注销闸门恰恰卡的就是这个）。
 *
 * 归零的写法是删字段而不是写 0，与 skills-store / plugins-store 的
 * 「0 = 免费不落字段」约定一致。
 *
 * 直接读写 JSON 而不走 store 模块：两个 store 都没有「按作者批量改价」的出口，
 * 本轮不改它们（见文件末尾待办）。
 */
function unpricePaidSubmissions(file: string, userId: string): { total: number; unpriced: number } {
  if (!fs.existsSync(file)) return { total: 0, unpriced: 0 };
  let list: SubmissionLike[];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(parsed)) return { total: 0, unpriced: 0 };
    list = parsed;
  } catch {
    return { total: 0, unpriced: 0 };
  }

  let total = 0;
  let unpriced = 0;
  for (const entry of list) {
    if (!entry || entry.authorId !== userId) continue;
    total += 1;
    if (typeof entry.priceCents === 'number' && entry.priceCents > 0) {
      delete entry.priceCents;
      unpriced += 1;
    }
  }
  if (unpriced > 0) writeJsonAtomic(file, list);
  return { total, unpriced };
}

/**
 * 删掉该用户在 data/failed-submissions.jsonl 里的留底行。
 *
 * 这个文件是校验失败投稿的人工挽回底稿（lib/skills-store.ts 的 logFailedSubmission），
 * 逐行含 userId + 投稿正文，属于账户信息，注销必须一并删。
 * 解析不了的行原样保留：那不是我们写的格式，不该由注销流程替它做判断。
 */
function purgeFailedSubmissions(userId: string): number {
  if (!fs.existsSync(FAILED_SUBMISSIONS_FILE)) return 0;
  const lines = fs.readFileSync(FAILED_SUBMISSIONS_FILE, 'utf-8').split('\n');
  const kept: string[] = [];
  let removed = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let record: { userId?: string } | null = null;
    try {
      record = JSON.parse(line);
    } catch {
      record = null;
    }
    if (record && record.userId === userId) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  if (removed > 0) {
    const tmp = `${FAILED_SUBMISSIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : '');
    fs.renameSync(tmp, FAILED_SUBMISSIONS_FILE);
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 执行注销。调用方负责鉴权、用户名二次确认与清 cookie。
 *
 * 执行顺序（**一个事务不够**，better-sqlite3 的 withTransaction 是同步的，里面不能 await）：
 *   1. 前置闸门（只读）
 *   2. `await mgmt.disableKey(...)` —— 事务外的远端调用
 *   3. withTransaction：SQLite 侧全部删除 / 墓碑化
 *   4. 文件侧：users.json、sessions.json、failed-submissions.jsonl、投稿改价
 *
 * 第 3 步之后的任何一步失败，账户在 SQLite 侧已墓碑化而 users.json 还在——
 * 用户仍能登录但财务记录已与他脱钩。两种存储没有共同事务，这个缝隙消不掉，
 * 只能把最不可逆的（远端 key 作废）放最前、把可重放的（文件侧）放最后。
 */
export async function deleteAccount(userId: string, lang: Locale = siteConfig.defaultLocale): Promise<DeleteAccountResult> {
  // --- 1. 前置闸门 ---
  const blocker = findDeletionBlocker(userId, lang);
  if (blocker) return blocker;

  // --- 2. 远端作废 provisioned key（事务外）---
  //
  // 必须先于本地置 encKey = NULL：密文解出来是一把**活的、能花平台钱**的 OpenRouter
  // key，而用户的桌面端本地还留着明文。先清密文再作废，中间任何一步失败都会留下
  // 一条无主的花钱通道。因此这一步失败即**整体中止**，不降级、不留 note 放行。
  const activeKeys = getDb()
    .prepare('SELECT id, orKeyHash FROM openrouter_keys WHERE userId = ? AND disabledAt IS NULL')
    .all(userId) as { id: number; orKeyHash: string }[];

  const email = siteConfig.legalEntity.contactEmail;
  const keyFailure: DeletionKeyDisableFailed = {
    keyDisableFailed: true,
    message: L(
      `平台 AI 通道暂时联系不上，为避免留下一条无人负责的计费通道，本次注销没有执行。稍后重试，或发邮件至 ${email}。`,
      `The platform AI channel is temporarily unreachable. To avoid leaving an unattended billing channel behind, nothing was deleted. Try again later, or email ${email}.`,
      lang
    ),
  };

  if (activeKeys.length > 0) {
    if (!mgmt.isMgmtConfigured()) return keyFailure;
    for (const key of activeKeys) {
      try {
        await mgmt.disableKey(key.orKeyHash);
      } catch (e) {
        // 404 = 远端已经没有这把 key，等同于已作废
        const gone =
          e instanceof mgmt.OpenRouterMgmtError && e.kind === 'client_error' && e.status === 404;
        if (!gone) return keyFailure;
      }
    }
  }

  // --- 3. SQLite 侧 ---
  const now = new Date().toISOString();
  const tombstone = tombstoneUserId(userId);
  let clearedRewardCents = 0;
  let deletedKeys = 0;

  try {
    withTransaction(db => {
      // 闸门复查：第 1 步到这里之间可能落地一笔支付回调 / 一笔分成 / Web AI 预留。
      // 命中就抛错整体回滚，绝不在「钱刚到账」的瞬间把账户墓碑化。
      const again = findDeletionBlocker(userId, lang);
      if (again) throw new BlockedError(again);

      // 奖励 Credits 清零。闸门已保证 topup 剩余为 0，所以当前余额全是 reward，
      // 走 spendCredits 正好按「reward 优先」把它们扣干净，并留下一行 expire 流水
      // 与批次明细。条款明写奖励 Credits 不退还，这里是把它落成数据层的事实。
      const balance = getBalanceBreakdown(userId, now);
      clearedRewardCents = balance.rewardCents;
      if (clearedRewardCents > 0) {
        spendCredits(db, {
          userId,
          amountCents: clearedRewardCents,
          ledgerKind: 'expire',
          meta: { reason: 'account_deleted' },
          nowIso: now,
        });
      }

      // 凭据真删
      deletedKeys = deleteApiKeysByUser(db, userId);

      // provisioned key：远端已作废，本地落状态并抹掉密文。
      // 行本身留着——orKeyHash 是「这把 key 确实被作废过」的唯一凭据。
      db.prepare(
        'UPDATE openrouter_keys SET disabledAt = COALESCE(disabledAt, ?), encKey = NULL, userId = ? WHERE userId = ?'
      ).run(now, tombstone, userId);

      // 墓碑化。**必须一次全换**：任何一张漏掉的表都能把 userId 重新接回其余记录，
      // 半套墓碑等于没有墓碑。
      db.prepare('UPDATE orders SET userId = ?, payerOpenid = NULL WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE wallet_ledger SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE credit_lots SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE purchases SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE purchases SET creatorUserId = ? WHERE creatorUserId = ?').run(tombstone, userId);
      db.prepare('UPDATE entitlements SET userId = ? WHERE userId = ?').run(tombstone, userId);
      for (const table of ['appstore_subscription_account', 'appstore_subscription', 'appstore_subscription_transaction',
        'pro_payment', 'subscription_period', 'subscription_preferences',
        'postpaid_policy','postpaid_grant','postpaid_debt','postpaid_case','postpaid_cleanup_claim',
        'postpaid_meter','postpaid_usage','postpaid_egress','postpaid_export','postpaid_external_budget','postpaid_payment_review']) {
        db.prepare(`UPDATE ${table} SET userId=? WHERE userId=?`).run(tombstone, userId);
      }
      db.prepare('UPDATE creator_earnings SET creatorUserId = ? WHERE creatorUserId = ?').run(tombstone, userId);
      db.prepare('UPDATE gift_codes SET redeemedByUserId = ? WHERE redeemedByUserId = ?').run(tombstone, userId);
      db.prepare('UPDATE ai_allocations SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE web_ai_request SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE skill_ai_request SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE platform_ai_request SET userId = ? WHERE userId = ?').run(tombstone, userId);
      db.prepare('UPDATE web_ai_agent_run SET userId = ? WHERE userId = ?').run(tombstone, userId);

      // 注销本身留痕：往后有人看到 orders 里挂着 `deleted:xxxx` 才查得到这是什么、
      // 什么时候发生的。只记墓碑值，不记原 userId——记了就等于再造一张对照表。
      // admin_audit 既有行的 detail 一个字都不动。
      db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
        now,
        'account_deleted',
        JSON.stringify({
          tombstone,
          clearedRewardCents,
          deletedApiKeys: deletedKeys,
          disabledAiKeys: activeKeys.length,
        })
      );
    });
  } catch (e) {
    if (e instanceof BlockedError) return e.detail;
    throw e;
  }

  // --- 4. 文件侧 ---
  // users.json 先改：它是「这个账户没了」的权威标记，getUserByToken 与
  // findUserByApiKey 都以它为准，即便下面几步炸了也已经进不来。
  markUserDeleted(userId, deletedDisplayName());
  // markUserDeleted 只抹了 users.json 里的戳，人像文件要单独删——留着就是一张
  // 仍能被 /api/avatar/<id> 读出来的人脸照片。
  deleteAvatar(userId);
  deleteSessionsByUser(userId);
  const purgedDrafts = purgeFailedSubmissions(userId);
  const skills = unpricePaidSubmissions(SKILLS_FILE, userId);
  const plugins = unpricePaidSubmissions(PLUGINS_FILE, userId);

  // --- 结果 ---
  const notes: string[] = [];
  if (clearedRewardCents > 0) {
    notes.push(
      L(
        `奖励 Credits ${formatSiteAmount(clearedRewardCents)} 已按条款作废（奖励部分不退还）。`,
        `${formatSiteAmount(clearedRewardCents)} of reward Credits has been voided, as reward Credits are non-refundable under the terms.`,
        lang
      )
    );
  }
  if (activeKeys.length > 0) {
    notes.push(
      L(
        '平台 AI 通道已作废，桌面端保存的那把密钥即刻失效。',
        'Your platform AI channel has been revoked; the key stored on the desktop app stops working immediately.',
        lang
      )
    );
  }
  if (deletedKeys > 0) {
    notes.push(
      L(
        `${deletedKeys} 个账户 Key 已删除，用它连接的桌面端会断开。`,
        `${deletedKeys} account key(s) deleted; desktop apps connected with them will disconnect.`,
        lang
      )
    );
  }
  const unpricedTotal = skills.unpriced + plugins.unpriced;
  if (unpricedTotal > 0) {
    notes.push(
      L(
        `${unpricedTotal} 个付费投稿已改为免费，平台不再为其收款。`,
        `${unpricedTotal} paid submission(s) have been switched to free; the platform will no longer collect payment for them.`,
        lang
      )
    );
  }
  const submissionTotal = skills.total + plugins.total;
  if (submissionTotal > 0) {
    notes.push(
      L(
        `${submissionTotal} 个投稿仍留在广场，作者名显示为「${deletedDisplayName(lang)}」；已分发的副本不受影响。`,
        `${submissionTotal} submission(s) remain in the marketplace, credited to "${deletedDisplayName(lang)}"; copies already distributed are unaffected.`,
        lang
      )
    );
  }
  if (purgedDrafts > 0) {
    notes.push(
      L(
        `${purgedDrafts} 份未通过校验的投稿草稿留底已删除。`,
        `${purgedDrafts} saved draft(s) of rejected submissions have been deleted.`,
        lang
      )
    );
  }
  notes.push(
    L(
      '账户信息将在 30 日内完成删除或匿名化。交易记录依《税收征收管理法实施细则》第二十九条留存不少于 10 年，但已与你的身份解除关联。',
      'Account information will be deleted or anonymised within 30 days. Transaction records are retained for at least 10 years as required by tax law, but they no longer carry your identity.',
      lang
    )
  );

  return { deletedAt: now, notes };
}
