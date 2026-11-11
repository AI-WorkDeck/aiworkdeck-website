import type { ServiceFunding } from '@/lib/subscription';
import { withTransaction } from '@/lib/db';
import { getBalance, spendCredits, InsufficientCreditsError } from '@/lib/credits';
import { getAiConfig, getExchangeRateInfo } from '@/lib/ai-config';
import { getUserMarginMultiplier } from '@/lib/circle-firms';
import { bqtBalanceView, bqtChargeTarget } from '@/lib/bqt-member';

/**
 * 官网 AI 生成（Skill 帮写 / 对话式创建）的按量记账。
 *
 * 口径（用户 2026-08-30 拍板，dev-board#293）：**免费+限流，但账要算在明面上**——
 * 每轮生成按 OpenRouter 返回的真实成本折算成 Credits，能扣就真扣
 * （spendCredits 的 reward 优先规则天然先吃注册赠额），扣不动（余额不足）
 * 不拦人，本轮由平台承担，但界面上把这笔账原样亮出来。目的不是收钱，
 * 是让用户看见成本、感到被尊重，而不是「反正白嫖」。
 *
 * 折算：cents = ceil(costUsd × marginMultiplier × exchangeRate × 100)。
 * 与站内 AI 额度同一套参数（lib/ai-config.ts），国际站汇率为 1。
 * 单轮实测量级：qwen3-max 约 $0.004 → 国内站约 4 分；kimi-k3 约 $0.08 → 约 70 分。
 *
 * ledgerKind 用现成的 `service_spend`（开放口，服务名进 meta.service，
 * 不动 kind 枚举就不用同步 contract-check/desktop-contract/词典三处，见 lib/credits.ts）。
 */
export interface AiUsageSettleInput {
  userId: string;
  funding?: ServiceFunding;
  /** OpenRouter usage.cost（美元）。流式响应 usage.include=true 时随最后一块给出。 */
  costUsd: number;
  costCny?: number;
  marginMultiplier?: number;
  nowIso?: string;
  model: string;
  /** 'skill_draft'（一句话生成）| 'skill_chat'（对话式创建） */
  service: 'skill_draft' | 'skill_chat';
  /** 对话式创建挂会话 id，方便对账 */
  conversationId?: string;
}

export interface AiUsageSettleResult {
  /** 折算后的应计金额（本币分）。上游没给 usage 时为 0。 */
  costCents: number;
  /** true=已从余额实扣；false=余额不足，本轮平台承担（或金额为 0） */
  charged: boolean;
  /** 结算后的余额（分） */
  balanceCents: number;
}

export function settleAiUsage(input: AiUsageSettleInput): AiUsageSettleResult {
  const marginMultiplier = input.marginMultiplier ?? getUserMarginMultiplier(input.userId);
  const exchangeRate = input.costCny !== undefined ? 1 : getExchangeRateInfo().rate;
  const cost = input.costCny ?? input.costUsd;
  const costCents =
    Number.isFinite(cost) && cost > 0
      ? Math.ceil(cost * marginMultiplier * exchangeRate * 100)
      : 0;

  if (costCents <= 0) {
    return { costCents: 0, charged: false, balanceCents: getBalance(input.userId) };
  }

  // 包晴天律师：本站钱包不收他们的钱；这笔免费限流的生成也不扣积分（扣不动会挂欠账、拦住付费 AI），
  // 按「扣不动」口径由平台承担、照样亮账，余额展示包晴天积分折分。
  const bqt = bqtChargeTarget(input.userId);
  if (bqt) return { costCents, charged: false, balanceCents: bqtBalanceView(input.userId, bqt.lawyerId)?.cents ?? 0 };

  try {
    withTransaction(db => {
      spendCredits(db, {
        userId: input.userId,
        nowIso: input.nowIso,
        funding: input.funding,
        amountCents: costCents,
        ledgerKind: 'service_spend',
        meta: {
          service: input.service,
          model: input.model,
          usdCost: input.costUsd,
          ...(input.costCny !== undefined ? { costCny: input.costCny, provider: 'bailian' } : {}),
          exchangeRate,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        },
      });
    });
    return { costCents, charged: true, balanceCents: getBalance(input.userId) };
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      // 冷启动期不设门槛：扣不动就平台请客，但成本照样报给前端亮账
      return { costCents, charged: false, balanceCents: getBalance(input.userId) };
    }
    throw e;
  }
}
