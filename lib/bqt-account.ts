// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天律师在账户侧的口径：计费线判定与对外字段。底层通道见 lib/bqt-member.ts。
 * 2026-11-12 起绑定包晴天不再是单独的计费线：钱包、充值、全部模型照常，bqtMember 只是多展示一份积分。
 */

import { refreshBqtSnapshot as refreshAiSnapshot } from './bqt-ai';
import { bqtBalanceView, bqtLinkedLawyer, type BqtEntitlement } from './bqt-member';
import { getUserCircleFirm } from './circle-firms';

/** 'bqt' 保留在类型里只为老客户端契约；服务端不再返回它（返回它会让客户端藏起充值与钱包）。 */
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
  /** 本站照常可充值（老客户端读这个字段）。 */
  rechargeAllowed: true;
}

/** 有联盟律所绑定 → circle；其余 standard。绑定包晴天不改变计费线。 */
export function billingLine(userId: string): BillingLine {
  return getUserCircleFirm(userId) ? 'circle' : 'standard';
}

/** 读快照（同步）。没绑定包晴天、通道关着，或从未成功查到过权益 → null。 */
export function bqtMemberView(userId: string): BqtMemberView | null {
  const target = bqtLinkedLawyer(userId);
  if (!target) return null;
  const v = bqtBalanceView(userId, target.lawyerId);
  return v ? { ...v, rechargeAllowed: true } : null;
}

export function accountBillingFields(userId: string): { billingLine: BillingLine; bqtMember: BqtMemberView | null } {
  return { billingLine: billingLine(userId), bqtMember: bqtMemberView(userId) };
}

/** 异步路由里刷新快照（maxAgeMs 内不重复查），失败吞掉——展示与 Pro 判定继续用旧快照。 */
export function refreshBqtSnapshot(userId: string, maxAgeMs = 30_000): Promise<void> {
  return refreshAiSnapshot(userId, maxAgeMs);
}
