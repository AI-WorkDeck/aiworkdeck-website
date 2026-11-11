// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天律师在账户侧的口径（计费线判定、对外字段、非 AI 扣费走发件箱的小工具）。
 * 底层通道见 lib/bqt-member.ts；通道关闭时这里的一切都退化为 null / 'standard'|'circle'。
 */

import { dispatchBqtConsume, refreshBqtSnapshot as refreshAiSnapshot } from './bqt-ai';
import type Database from 'better-sqlite3';
import { bqtBalanceView, bqtChargeTarget, enqueueConsume, type BqtEntitlement } from './bqt-member';
import { getUserCircleFirm } from './circle-firms';
import { pickLangText } from './api-locale';
import type { Locale } from '@/i18n-config';

export type BillingLine = 'bqt' | 'circle' | 'standard';

/** 对桌面/官网的契约字段，名字不要改。 */
export interface BqtMemberView {
  points: string;
  cents: number;
  outstandingCents: number;
  failedCount: number;
  centsPerPoint: number;
  levelCode: BqtEntitlement['levelCode'];
  status: BqtEntitlement['status'];
  aiWorkbench: boolean;
  expireAt: string | null;
  fetchedAt: string;
  rechargeAllowed: false;
}

/** 包晴天赢：通道开着且扫码绑定过 → bqt；否则有联盟律所绑定 → circle；其余 standard。 */
export function billingLine(userId: string): BillingLine {
  if (bqtChargeTarget(userId)) return 'bqt';
  return getUserCircleFirm(userId) ? 'circle' : 'standard';
}

/** 读快照（同步）。不是包晴天线，或从未成功查到过权益 → null。 */
export function bqtMemberView(userId: string): BqtMemberView | null {
  const target = bqtChargeTarget(userId);
  if (!target) return null;
  const v = bqtBalanceView(userId, target.lawyerId);
  return v ? { ...v, rechargeAllowed: false } : null;
}

export function accountBillingFields(userId: string): { billingLine: BillingLine; bqtMember: BqtMemberView | null } {
  return { billingLine: billingLine(userId), bqtMember: bqtMemberView(userId) };
}

/** 包晴天线用户对外报的余额（分）；不是包晴天线返回 null，调用方用原值。 */
export function bqtDisplayBalanceCents(userId: string): number | null {
  if (!bqtChargeTarget(userId)) return null;
  return bqtMemberView(userId)?.cents ?? 0;
}

/**
 * 同步代码里的「现在还能花多少」（读快照）：会员失效、AI 工作台关闭、有失败未处理的扣减都算 0。
 * 只用于事前放行判断；真正扣不扣得到以包晴天 consume 结果为准。给了 maxAgeMs 时快照过旧也算 0（不拿旧快照做花钱判断）。
 */
export function bqtSpendableCents(userId: string, maxAgeMs?: number): number {
  const v = bqtMemberView(userId);
  if (!v || v.status !== 'ACTIVE' || !v.aiWorkbench || v.failedCount > 0) return 0;
  if (maxAgeMs !== undefined && Date.now() - Date.parse(v.fetchedAt) > maxAgeMs) return 0;
  return v.cents;
}

/** 异步路由里刷新快照（maxAgeMs 内不重复查），失败吞掉——展示与 Pro 判定继续用旧快照。 */
export function refreshBqtSnapshot(userId: string, maxAgeMs = 30_000): Promise<void> {
  return refreshAiSnapshot(userId, maxAgeMs);
}

/** 拒绝直接充值/购买 Pro 的统一错误码。 */
export const BQT_RECHARGE_ERROR = 'bqt_recharge_via_bqt';
export function bqtRechargeMessage(lang: Locale): string {
  return pickLangText(lang, '包晴天律师账户的充值与会员续费请在包晴天 App 内完成，本站不直接收款。',
    'Baoqingtian lawyer accounts top up and renew membership in the Baoqingtian app; this site does not accept direct payment for them.');
}

/** 已交付的非 AI 服务记一笔待扣积分（在调用方事务内），返回 requestNo；提交后交给 dispatchBqtLater。 */
export function enqueueBqtServiceCharge(d: Database.Database, input: { userId: string; lawyerId: string; cents: number; service: string; refId: string }): string {
  return enqueueConsume(d, { ...input, refId: `${input.userId}:${input.refId}` }).requestNo;
}

/** 事务提交之后发出（不阻塞调用方）；没发成的留在 pending，由 retryPendingConsumes 补发。 */
export const dispatchBqtLater = dispatchBqtConsume;
