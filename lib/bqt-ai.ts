// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天律师的 AI 计费接线（平台 AI 网关 / 图片 / 付费 Skill / Web AI 共用）。
 *
 * 规则：通道打开时包晴天律师只走积分，本站钱包一分不动。
 *   - 预留前 bqtAuthorize（异步查权益与积分，按本次最多可能花的分），通过后在内存里记一张
 *     60 秒有效的「放行条」；同步的 reserve 用 bqtTakeApproval 核销——漏了预检的调用点会直接失败，
 *     而不是悄悄走本站钱包。
 *   - 预留不扣钱包：请求行的 reserveLedgerId 指向一条全站共用的 0 元哨兵流水（列是 NOT NULL 外键，
 *     本片不加迁移），fundingJson 记 {line:'bqt', lawyerId}。
 *   - 结算在标记 settled 的同一事务里 enqueueConsume，提交后 dispatchBqtConsume（不等结果）。
 *   - 每位律师同时最多 1 个在途请求（平台 AI 与 Web AI 合计），收窄「先查后扣」的竞态。
 */

import type Database from 'better-sqlite3';
import {
  bqtBalanceView, bqtChargeTarget, bqtEntitlementSnapshot, bqtPreflight, dispatchConsume, fetchBqtEntitlement,
  type BqtDenial,
} from './bqt-member';
import type { Locale } from '@/i18n-config';
import { pickLangText } from './api-locale';
import { isDeepSeekModelId } from './platform-ai/config';

export type BqtErrorCode = 'bqt_member_invalid' | 'bqt_ai_closed' | 'bqt_insufficient_points' | 'bqt_outstanding_debt' | 'bqt_unavailable' | 'bqt_model_not_allowed';

/** 与桌面端约定的错误码与 HTTP 状态（勿改名）。 */
export const BQT_ERROR_STATUS: Record<BqtErrorCode, number> = {
  bqt_member_invalid: 403, bqt_ai_closed: 403, bqt_insufficient_points: 402, bqt_outstanding_debt: 402, bqt_unavailable: 503, bqt_model_not_allowed: 403,
};

/** 文案红线（桌面端掉线判定）：不得出现「登录」「未授权」「请先」。 */
export const BQT_ERROR_TEXT: Record<BqtErrorCode | 'bqt_overseas_unsupported', [string, string]> = {
  bqt_member_invalid: ['包晴天会员已失效，暂时无法使用平台 AI', 'Your BQT membership is inactive, so platform AI is unavailable.'],
  bqt_ai_closed: ['包晴天会员权益未包含 AI 工作台', 'Your BQT membership does not include the AI Workbench.'],
  bqt_insufficient_points: ['包晴天积分不足，补充积分后可继续使用', 'Insufficient BQT points. Add points in BQT to continue.'],
  bqt_outstanding_debt: ['有一笔包晴天积分扣减尚未完成，处理完成前暂停平台 AI', 'A previous BQT points deduction is unresolved. Platform AI is paused until it is settled.'],
  bqt_unavailable: ['包晴天积分服务暂时不可用，请稍后重试', 'The BQT points service is temporarily unavailable. Try again later.'],
  bqt_model_not_allowed: ['包晴天律师账户仅可使用 DeepSeek 模型，请切换到 DeepSeek', 'BQT lawyer accounts can only use DeepSeek models. Switch to a DeepSeek model.'],
  bqt_overseas_unsupported: ['包晴天积分暂不支持海外模型通道', 'BQT points cannot be used for the overseas model channel.'],
};

export function bqtErrorMessage(code: keyof typeof BQT_ERROR_TEXT, lang: Locale): string {
  const [zh, en] = BQT_ERROR_TEXT[code];
  return pickLangText(lang, zh, en);
}

export class BqtDenialError extends Error {
  readonly status: number;
  constructor(public readonly code: BqtErrorCode) { super(code); this.name = 'BqtDenialError'; this.status = BQT_ERROR_STATUS[code]; }
}

export function bqtErrorCode(reason: BqtDenial): BqtErrorCode {
  return reason === 'bqt_unavailable' ? 'bqt_unavailable' : `bqt_${reason}`;
}

/** 2026-11-06 用户定：包晴天律师只能用 DeepSeek 模型（成本低）。 */
export function assertBqtModel(modelId: string): void {
  if (!isDeepSeekModelId(modelId)) throw new BqtDenialError('bqt_model_not_allowed');
}

export interface BqtFunding { line: 'bqt'; lawyerId: string }
export function bqtFundingJson(lawyerId: string): string { return JSON.stringify({ line: 'bqt', lawyerId } satisfies BqtFunding); }
/** 请求行是不是包晴天线（看 fundingJson，而不是看现在的开关——开关中途变化不能改变已预留请求的结算口径）。 */
export function bqtFunding(fundingJson: string | null | undefined): BqtFunding | null {
  if (!fundingJson) return null;
  try {
    const f = JSON.parse(fundingJson);
    return f?.line === 'bqt' && typeof f.lawyerId === 'string' ? f : null;
  } catch { return null; }
}

// ─── 预检放行条 ──────────────────────────────────────────────────────

const APPROVAL_TTL_MS = 60_000;
const approvals = new Map<string, { cents: number; until: number }>();

/** 包晴天律师：查会员与积分（异步），通过后记放行条；非包晴天用户返回 null、不做任何事。 */
export async function bqtAuthorize(userId: string, refId: string, cents: number): Promise<{ lawyerId: string } | null> {
  const target = bqtChargeTarget(userId);
  if (!target) return null;
  const r = await bqtPreflight(userId, target.lawyerId, cents);
  if (!r.ok) throw new BqtDenialError(bqtErrorCode(r.reason));
  const now = Date.now();
  for (const [k, v] of approvals) if (v.until < now) approvals.delete(k);
  approvals.set(`${userId}\n${refId}`, { cents, until: now + APPROVAL_TTL_MS });
  return target;
}

/** 同步核销放行条。没有、过期或金额超出预检的，按服务不可用拒绝。 */
export function bqtTakeApproval(userId: string, refId: string, cents: number): void {
  const key = `${userId}\n${refId}`, a = approvals.get(key);
  approvals.delete(key);
  if (!a || a.until < Date.now() || a.cents < cents) throw new BqtDenialError('bqt_unavailable');
}

// ─── 预留与结算辅助 ───────────────────────────────────────────────────

const SENTINEL_USER = '__bqt_line__';

/** 0 元哨兵流水（全站一条，懒创建），只为满足 reserveLedgerId 的 NOT NULL 外键；不属于任何用户。 */
export function bqtReserveLedgerId(db: Database.Database): number {
  const row = db.prepare('SELECT id FROM wallet_ledger WHERE userId = ? ORDER BY id LIMIT 1').get(SENTINEL_USER) as { id: number } | undefined;
  if (row) return row.id;
  return Number(db.prepare("INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, meta) VALUES (?, ?, 'adjust', 0, 0, ?)")
    .run(SENTINEL_USER, new Date().toISOString(), JSON.stringify({ bqtReserveSentinel: true })).lastInsertRowid);
}

/** 该律师在平台 AI 与 Web AI 上是否已有在途请求（包晴天线限 1 个并发）。 */
export function bqtHasActiveRequest(db: Database.Database, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM platform_ai_request WHERE userId = ? AND state IN ('reserved','submitted','usage_pending')
    UNION ALL SELECT 1 FROM web_ai_request WHERE userId = ? AND state IN ('reserved','submitted','usage_pending') LIMIT 1`).get(userId, userId);
}

/** 提交后发出扣减；不让用户的响应等包晴天，失败只记日志（发件箱会补发或挂欠账）。 */
export function dispatchBqtConsume(requestNo: string | null | undefined): void {
  if (!requestNo) return;
  void dispatchConsume(requestNo).then(row => {
    if (row.state !== 'succeeded') console.warn(`[bqt] consume ${row.state} requestNo=${requestNo} lastError=${row.lastError ?? ''} resultCode=${row.resultCode ?? ''}`);
  }).catch(e => console.error(`[bqt] consume dispatch error requestNo=${requestNo}`, e instanceof Error ? e.message : e));
}

// ─── 额度展示 ─────────────────────────────────────────────────────────

/** 快照比 maxAgeMs 旧就刷新一次（失败不抛，展示按旧快照/0）。非包晴天用户无操作。 */
export async function refreshBqtSnapshot(userId: string, maxAgeMs = 60_000): Promise<void> {
  const target = bqtChargeTarget(userId);
  if (!target) return;
  const snap = bqtEntitlementSnapshot(target.lawyerId);
  if (snap && Date.now() - Date.parse(snap.fetchedAt) < maxAgeMs) return;
  await fetchBqtEntitlement(target.lawyerId).catch(() => undefined);
}

/** 「剩余 AI 额度」的本站分口径：会员无效、未开 AI、有失败欠账时为 0。 */
export function bqtAiCreditsCents(userId: string, lawyerId: string): number {
  const v = bqtBalanceView(userId, lawyerId);
  if (!v || v.status !== 'ACTIVE' || !v.aiWorkbench || v.failedCount > 0) return 0;
  return v.cents;
}
