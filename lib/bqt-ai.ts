// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天积分的 AI 计费接线（平台 AI 网关）。
 *
 * 规则（2026-11-12 用户定）：绑定包晴天只是多一个付款来源，不是另一种账户。
 *   - 只有 DeepSeek 模型的平台 AI 用量会用积分，并且优先用积分（便宜、是会员权益）。
 *   - 积分不够、会员失效、未开 AI 工作台、有未扣成的欠账、包晴天连不上、已有一个在途积分请求——
 *     任何一种都不报错，这次直接走本站钱包（钱包也不够才是普通的余额不足）。
 *   - 其他一切（别的模型、Web AI、付费 Skill、云空间、OCR 等网关服务）一律走本站钱包。
 *   - 预检 bqtAuthorize 通过后记一张 60 秒有效的「放行条」；同步的 reserve 用 bqtTakeApproval 核销，
 *     核销到了才走积分，否则走钱包。
 *   - 积分请求不动钱包：请求行的 reserveLedgerId 指向一条全站共用的 0 元哨兵流水，fundingJson 记 {line:'bqt', lawyerId}。
 *   - 结算在标记 settled 的同一事务里 enqueueConsume，提交后 dispatchBqtConsume（不等结果）。
 */

import type Database from 'better-sqlite3';
import {
  bqtBalanceView, bqtLinkedLawyer, bqtEntitlementSnapshot, bqtPreflight, dispatchConsume, fetchBqtEntitlement,
} from './bqt-member';
import { isDeepSeekModelId } from './platform-ai/config';
import { getDb } from './db';

/** 积分只抵 DeepSeek 模型的用量（2026-11-06 定，便宜）；其他模型走钱包。 */
export function isBqtEligibleModel(modelId: string): boolean {
  return isDeepSeekModelId(modelId);
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

/**
 * 尝试用积分付这一次（异步查会员与积分）。能用 → 记放行条并返回 lawyerId；不能用 → null，调用方走钱包。
 * 从不抛错：包晴天的任何问题都只是让这次回落到钱包。
 */
export async function bqtAuthorize(userId: string, refId: string, cents: number, modelId: string): Promise<{ lawyerId: string } | null> {
  const target = bqtLinkedLawyer(userId);
  if (!target || !isBqtEligibleModel(modelId)) return null;
  // 每位律师同时最多 1 个在途积分请求（收窄「先查后扣」的竞态）；第二个并发请求直接走钱包。
  if (bqtHasActiveRequest(getDb(), userId)) return null;
  const r = await bqtPreflight(userId, target.lawyerId, cents);
  if (!r.ok) {
    if (r.reason === 'bqt_unavailable') console.warn(`[bqt] preflight unavailable userId=${userId}, falling back to wallet`);
    return null;
  }
  const now = Date.now();
  for (const [k, v] of approvals) if (v.until < now) approvals.delete(k);
  approvals.set(`${userId}\n${refId}`, { cents, until: now + APPROVAL_TTL_MS });
  return target;
}

/** 同步核销放行条：有效且金额覆盖 → true（走积分）；否则 false（走钱包）。 */
export function bqtTakeApproval(userId: string, refId: string, cents: number): boolean {
  const key = `${userId}\n${refId}`, a = approvals.get(key);
  approvals.delete(key);
  return !!a && a.until >= Date.now() && a.cents >= cents;
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

/** 该用户是否已有在途的积分请求（平台 AI 与 Web AI 合计；钱包付的请求不算）。 */
export function bqtHasActiveRequest(db: Database.Database, userId: string): boolean {
  const bqt = `json_extract(fundingJson,'$.line') = 'bqt'`;
  return !!db.prepare(`SELECT 1 FROM platform_ai_request WHERE userId = ? AND ${bqt} AND state IN ('reserved','submitted','usage_pending')
    UNION ALL SELECT 1 FROM web_ai_request WHERE userId = ? AND ${bqt} AND state IN ('reserved','submitted','usage_pending') LIMIT 1`).get(userId, userId);
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
  const target = bqtLinkedLawyer(userId);
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
