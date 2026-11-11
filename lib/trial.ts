import { getDb, withTransaction } from './db';
import { getBalance } from './credits';
import { siteConfig } from './site-config';

/**
 * 试用计量 v0.1.1 的服务端权威（TRIAL-API-CONTRACT）。
 *
 * 策略 `min_of_days_or_calls`：14 天或 80 次 AI 回合，先到为准。桌面端只代理、缓存、展示，
 * **不判定、不扣减**；判定全在这里。
 *
 * - 发放（grantTrial）：注册 / 每次建会话时幂等调用。真付过钱的账户不发放；已有行（含 converted）不动。
 * - 计次（recordTrialTurn）：按 (accountId, turnId) 幂等，ai_turn_ledger UNIQUE 兜底，同一事务内 +1。
 *   awaiting_input 与 completed 一样算 1 次（总经理 2026-10-10 决定：上报与否由桌面判定）。
 *   上报失败桌面不重试（v0.1.1），所以这里不做补账。
 * - 拦截（trialBlockReason）：试用用户（非 paid、Credits 为 0）用尽 / 到期时，
 *   ai-usage 与平台 AI key 签发回 409 trial_exhausted / trial_expired。
 * 条款类文案一律「以协议为准」，本模块不产出对外文案。
 */

export const TRIAL_DAYS = 14;
export const TRIAL_CALLS = 80;
const DAY_MS = 86_400_000;

export type TrialStatus = 'none' | 'active' | 'exhausted_calls' | 'expired_days' | 'converted';

export interface TrialBalance {
  granted: boolean;
  status: TrialStatus;
  policy: 'min_of_days_or_calls';
  daysQuota: number;
  callsQuota: number;
  callsUsed: number;
  remainingDays: number;
  remainingCalls: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  region: string;
  serverTime: string;
}

interface TrialRow {
  accountId: string;
  status: Exclude<TrialStatus, 'none'>;
  daysQuota: number;
  callsQuota: number;
  callsUsed: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  region: string | null;
}

function readRow(accountId: string): TrialRow | undefined {
  return getDb().prepare('SELECT * FROM trial_balance WHERE accountId = ?').get(accountId) as TrialRow | undefined;
}

/** 由行与当前时刻推出有效状态（不写库）。先到为准：已落库的终态不再改写。 */
function effectiveStatus(row: TrialRow, now: string): TrialRow['status'] {
  if (row.status !== 'active') return row.status;
  if (row.callsUsed >= row.callsQuota) return 'exhausted_calls';
  if (row.trialEndsAt && now >= row.trialEndsAt) return 'expired_days';
  return 'active';
}

/** 把到期这类「随时间发生」的终态落库，保证先到为准不会被之后的计次改写。 */
function settleStatus(row: TrialRow, now: string): TrialRow {
  const status = effectiveStatus(row, now);
  if (status !== row.status) {
    getDb()
      .prepare(`UPDATE trial_balance SET status = ?, updatedAt = ? WHERE accountId = ? AND status = 'active'`)
      .run(status, now, row.accountId);
    return { ...row, status };
  }
  return row;
}

function shape(row: TrialRow | undefined, now: string): TrialBalance {
  const base = {
    policy: 'min_of_days_or_calls' as const,
    region: row?.region ?? siteConfig.id,
    serverTime: now,
  };
  if (!row) {
    return {
      ...base,
      granted: false,
      status: 'none',
      daysQuota: TRIAL_DAYS,
      callsQuota: TRIAL_CALLS,
      callsUsed: 0,
      remainingDays: TRIAL_DAYS,
      remainingCalls: TRIAL_CALLS,
      trialStartedAt: null,
      trialEndsAt: null,
    };
  }
  const status = effectiveStatus(row, now);
  const remainingCalls = Math.max(0, row.callsQuota - row.callsUsed);
  const msLeft = row.trialEndsAt ? Date.parse(row.trialEndsAt) - Date.parse(now) : 0;
  const remainingDays = Math.max(0, Math.ceil(msLeft / DAY_MS));
  return {
    ...base,
    // granted 以 trialStartedAt 为准（曾真正发过试用）；仅 status=converted 不够
    granted: !!row.trialStartedAt,
    status,
    daysQuota: row.daysQuota,
    callsQuota: row.callsQuota,
    callsUsed: row.callsUsed,
    remainingDays: status === 'active' ? remainingDays : status === 'converted' ? remainingDays : 0,
    remainingCalls: status === 'active' || status === 'converted' ? remainingCalls : 0,
    trialStartedAt: row.trialStartedAt,
    trialEndsAt: row.trialEndsAt,
  };
}

/**
 * 发放资格只看「真付过钱」：成功的 recharge/purchase/subscription 订单，或有效期内的权益。
 * **刻意不用 getPlan**：注册赠额（signup-grant 写 gift 账本行）会让 getPlan 报 paid，
 * 用它判资格等于注册赠额活动期间的新用户一个都拿不到试用。赠额用户在用尽 / 到期后
 * 仍可凭 Credits 用平台 AI（见 trialBlockReason）。曾买过 Pro（含已到期）也不再发放。
 */
function hasPaidBefore(accountId: string, now: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT
         EXISTS(SELECT 1 FROM orders WHERE userId = @id AND status = 'paid' AND kind IN ('recharge','purchase','subscription'))
         OR EXISTS(SELECT 1 FROM appstore_subscription_transaction WHERE userId = @id)
         OR EXISTS(SELECT 1 FROM entitlements WHERE userId = @id AND (expiresAt IS NULL OR expiresAt > @now)) AS paid`
    )
    .get({ id: accountId, now }) as { paid: number };
  return !!row.paid;
}

/**
 * 幂等发放。已有行（任何状态）→ 不动；真付过钱的账户 → 不发放。
 * 返回 true 表示本次新发放。
 */
export function grantTrial(accountId: string, now: string = new Date().toISOString()): boolean {
  if (readRow(accountId)) return false;
  if (hasPaidBefore(accountId, now)) return false;
  const endsAt = new Date(Date.parse(now) + TRIAL_DAYS * DAY_MS).toISOString();
  const r = getDb()
    .prepare(
      `INSERT INTO trial_balance
         (accountId, status, daysQuota, callsQuota, callsUsed, trialStartedAt, trialEndsAt, region, updatedAt)
       VALUES (?, 'active', ?, ?, 0, ?, ?, ?, ?)
       ON CONFLICT (accountId) DO NOTHING`
    )
    .run(accountId, TRIAL_DAYS, TRIAL_CALLS, now, endsAt, siteConfig.id, now);
  return r.changes > 0;
}

/** 发放失败绝不能挡住登录：调用方（建会话）只吞错记日志。 */
export function grantTrialSafely(accountId: string): void {
  try {
    grantTrial(accountId);
  } catch (e) {
    console.error('[trial] 发放失败（不影响登录）:', accountId, e);
  }
}

export function getTrialBalance(accountId: string, now: string = new Date().toISOString()): TrialBalance {
  const row = readRow(accountId);
  return shape(row ? settleStatus(row, now) : undefined, now);
}

export const TURN_OUTCOMES = ['completed', 'awaiting_input'] as const;
export type TurnOutcome = (typeof TURN_OUTCOMES)[number];

export interface TurnReport {
  turnId: string;
  outcome: TurnOutcome;
  hasAssistantResult: boolean;
  endedAt: string | null;
}

export type TurnParseError = 'invalid_turn_id' | 'invalid_outcome' | 'invalid_body';

export function parseTurnReport(body: unknown): TurnReport | { error: TurnParseError } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_body' };
  const b = body as Record<string, unknown>;
  if (typeof b.turnId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(b.turnId)) {
    return { error: 'invalid_turn_id' };
  }
  if (!TURN_OUTCOMES.includes(b.outcome as TurnOutcome)) return { error: 'invalid_outcome' };
  const endedAt = typeof b.endedAt === 'string' && !Number.isNaN(Date.parse(b.endedAt)) ? b.endedAt : null;
  return {
    turnId: b.turnId,
    outcome: b.outcome as TurnOutcome,
    hasAssistantResult: b.hasAssistantResult === true,
    endedAt,
  };
}

export interface TurnResult {
  counted: boolean;
  duplicate: boolean;
  balance: TrialBalance;
}

/**
 * 计一次回合。幂等键 (accountId, turnId)：重复上报 → duplicate:true、不重复扣。
 * 只有 status=active 且有助手正文时 billable；把次数用到 callsQuota 的那一次照常计，
 * 之后状态即为 exhausted_calls。
 */
export function recordTrialTurn(
  accountId: string,
  report: TurnReport,
  now: string = new Date().toISOString()
): TurnResult {
  return withTransaction((db) => {
    const seen = db
      .prepare('SELECT billable FROM ai_turn_ledger WHERE accountId = ? AND turnId = ?')
      .get(accountId, report.turnId) as { billable: number } | undefined;
    let row = readRow(accountId);
    if (row) row = settleStatus(row, now);
    if (seen) {
      return { counted: false, duplicate: true, balance: shape(row, now) };
    }

    let reason: string | null = null;
    if (!row || !row.trialStartedAt) reason = row ? 'converted' : 'not_granted';
    else if (row.status !== 'active') reason = row.status;
    else if (!report.hasAssistantResult) reason = 'no_assistant_result';
    const billable = reason === null;

    db.prepare(
      `INSERT INTO ai_turn_ledger (accountId, turnId, outcome, billable, reason, endedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(accountId, report.turnId, report.outcome, billable ? 1 : 0, reason, report.endedAt, now);

    if (billable) {
      db.prepare(
        `UPDATE trial_balance SET callsUsed = callsUsed + 1, updatedAt = ? WHERE accountId = ?`
      ).run(now, accountId);
      row = settleStatus(readRow(accountId)!, now);
    }
    return { counted: billable, duplicate: false, balance: shape(row, now) };
  });
}

/**
 * 试用用户的平台 AI 拦截。真付过钱（有效权益 / 成功订单）或 Credits > 0 的账户不受试用约束。
 * 返回 null = 放行。
 */
export function trialBlockReason(
  accountId: string,
  now: string = new Date().toISOString()
): 'trial_exhausted' | 'trial_expired' | null {
  const row = readRow(accountId);
  if (!row || !row.trialStartedAt) return null;
  if (hasPaidBefore(accountId, now) || getBalance(accountId, now) > 0) return null;
  const status = settleStatus(row, now).status;
  if (status === 'exhausted_calls') return 'trial_exhausted';
  if (status === 'expired_days') return 'trial_expired';
  return null;
}
