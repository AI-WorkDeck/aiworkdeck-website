import { getDb, withTransaction } from './db';
import { getOrder, markOrderPaid, markOrderRefunded, MarkPaidResult, type Order } from './orders';
import { fulfillPurchase } from './purchases';
import { fulfillProPayment, isLegacyProSku, isProSku } from './pro-products';
import {
    APPSTORE_SOURCE_KIND,
    clawbackGrantedLots,
    grantCredits,
    rowToEntry,
    type ClawbackResult,
    type LedgerEntry,
    type LedgerKind,
} from './credits';
import { computeGrowth, tierFor } from './membership';
import { bqtProRightsUntil } from './bqt-member';

/**
 * 钱包 = Credits 的订单侧入口与流水查询（PR-W1，Credits 重构 P1 起改为批次记账）。
 *
 * 余额与批次的权威实现搬到了 lib/credits.ts：余额 = 未过期批次 remainingCents 之和。
 * 本文件只保留「订单确认 → 入账」与流水读取，避免钱的写入口散落多处。
 *
 * 金额正负语义（wallet_ledger.amountCents）：
 * - recharge  充值入账（topup 批次），必须 > 0
 * - gift      兑换码/赠送入账（reward 批次），必须 > 0
 * - earning   创作者分成入账（reward 批次），必须 > 0
 * - ai_alloc  AI 额度扣减，必须 < 0
 * - purchase  购买扣款，必须 < 0
 * - expire    奖励批次到期作废，必须 < 0
 * - adjust    人工调整与退款，非零即可
 */

export type { LedgerEntry, LedgerKind };
export {
    APPSTORE_SOURCE_KIND,
    clawbackGrantedLots,
    getBalance,
    getBalanceBreakdown,
    getRefundableCents,
    grantCredits,
    spendCredits,
    refundSpend,
    expireCredits,
    InsufficientCreditsError,
    REWARD_TTL_MONTHS,
    type BalanceBreakdown,
    type ClawbackResult,
    type CreditPool,
} from './credits';

interface LedgerRow {
    id: number;
    userId: string;
    ts: string;
    kind: LedgerKind;
    amountCents: number;
    balanceAfterCents: number;
    refOrderId: string | null;
    meta: string | null;
}

/** 流水，新的在前。 */
export function listLedger(
    userId: string,
    opts: { limit?: number; offset?: number } = {}
): { entries: LedgerEntry[]; total: number } {
    const db = getDb();
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = db
        .prepare('SELECT * FROM wallet_ledger WHERE userId = ? ORDER BY id DESC LIMIT ? OFFSET ?')
        .all(userId, limit, offset) as LedgerRow[];
    const totalRow = db
        .prepare('SELECT COUNT(*) AS c FROM wallet_ledger WHERE userId = ?')
        .get(userId) as { c: number };
    return { entries: rows.map(rowToEntry), total: totalRow.c };
}

/**
 * 订单确认支付 + 履约，同一事务原子完成。
 * notify/query 路由一律走这里，不再直接调 markOrderPaid。
 *
 * 幂等：markOrderPaid 返回 alreadyPaid=true（重复回调）时绝不再写任何东西；
 * 只有 pending -> paid 的那一次会入账/发权益。
 * - recharge：发一笔 **topup** 批次的 Credits（用户真金白银付进来的，不过期、可退）。
 * - purchase：fulfillPurchase 写 purchases + entitlements + 创作者分成。
 *   履约失败整个事务回滚，订单保持 pending。
 * - support：只置 paid。
 */
export function settleOrderPaid(
    outTradeNo: string,
    info: { transactionId?: string; payerOpenid?: string; paidAt?: string }
): MarkPaidResult | undefined {
    return withTransaction((db) => {
        const result = markOrderPaid(outTradeNo, info);
        if (!result || result.alreadyPaid) return result;
        const order = result.order;
        if (order.kind === 'recharge' && order.userId) {
            // Apple 内购的到账要打上可区分的 sourceKind：它不计入可退现
            // （`getRefundableCents`），堵掉「用 Apple 付款、向平台要 100% 原路退现」
            // 的套利口（设计 §4.3）。批次仍是 topup —— 内购买来的 Credits
            // **不许设有效期**（App Store 审核指南 3.1.1 原文），而 reward 池必须带有效期。
            const isAppstore = order.channel === 'appstore';
            grantCredits(db, {
                userId: order.userId,
                pool: 'topup',
                amountCents: order.amount,
                ledgerKind: 'recharge',
                ...(isAppstore ? { sourceKind: APPSTORE_SOURCE_KIND } : {}),
                refOrderId: order.id,
                meta: {
                    outTradeNo: order.outTradeNo,
                    transactionId: order.transactionId ?? null,
                    ...(isAppstore ? { channel: 'appstore' } : {}),
                },
            });
            // **内购单不发会员充值赠送**（设计 §4.3）：大陆版 IAP 实测净收 84.24%，
            // 而 Credits 的综合毛利只有 15%~25%；再叠一档 10% 的赠送会把这笔单的
            // 净利直接打成负数。这是一个显式的商业决定，不是遗漏——
            // 别在读到下面这个 if 时「顺手补齐」。
            if (isAppstore) return result;
            // 会员充值赠送：按**含本笔后**的成长值定档（上面的 recharge 流水已落库）。
            // 赠送必须是 reward 批次（24 个月有效期、不可退现）——做成 topup 会被
            // 「退未消耗余额」变相提现。ledgerKind 复用既有 'gift'，不扩 kind 枚举；
            // 幂等由 markOrderPaid 的 alreadyPaid 短路保证（走到这里必是首次结算）。
            const { growthPoints } = computeGrowth(db, order.userId);
            const permille = tierFor(growthPoints).bonusPermille;
            const bonus = Math.floor((order.amount * permille) / 1000);
            if (bonus > 0) {
                grantCredits(db, {
                    userId: order.userId,
                    pool: 'reward',
                    amountCents: bonus,
                    ledgerKind: 'gift',
                    sourceKind: 'membership_bonus',
                    refOrderId: order.id,
                    meta: { refOrderId: order.id, permille, membershipBonus: true },
                });
            }
        } else if (
            (order.kind === 'subscription' && isProSku(order.skuId)) ||
            // #228（e31e951）旧单：kind='purchase' + pro:monthly / pro:yearly。切换前已建的 pending 单
            // 付款后回调必须照常履约（含年付）；建单侧的年付/开关拦截不作用于这里。
            (order.kind === 'purchase' && isLegacyProSku(order.skuId))
        ) {
            // 个人 Pro：权益顺延 + subscription_paid (+ first_payment) + 试用转付费，同一事务、按 outTradeNo 幂等
            fulfillProPayment(db, order);
        } else if (order.kind === 'purchase') {
            fulfillPurchase(db, order);
        }
        return result;
    });
}

/**
 * plan 判定（契约 §9）：该用户与平台有过实质付费关系 → "paid"，否则 "free"。
 *
 * 三个来源缺一不可：
 * - 成功的 recharge / purchase 订单（微信直付）
 * - 任意 recharge / gift 账本行（覆盖兑换码充值——它不产生订单，只写账本）
 * - 任意权益行（覆盖权益兑换码——它既不产生订单也不写账本）
 * 只看 orders 会让「靠兑换码充值到有余额」的用户报 free，与桌面端展示的余额自相矛盾。
 */
export type AccountPlan = 'paid' | 'free' | 'expired';

/**
 * 账户套餐口径（契约见 doc/desktop-contract.md「plan 的判定口径」）。
 *
 * - `paid`：有非 Pro 的成功 recharge/purchase 订单、有 recharge/gift 账本行，
 *   或有**仍在有效期内**的权益（永久权益 expiresAt NULL 恒有效）。
 * - `expired`：以上都不满足，但曾经买过个人 Pro 且 Pro 已到期。
 *   Pro 订单本身（kind=`subscription` / skuId `pro_monthly`|`pro_yearly`）**不**计入 paid——否则到期的 Pro 永远是 paid。
 * - `free`：其余。
 *
 * 任何「付费用户数 / 按席位」统计都只能数有效期内的权益：过期的限时权益在这里与
 * listEntitlements / hasEntitlement 同一口径，一律不算。
 */
export function getPlan(userId: string, now: string = new Date().toISOString()): AccountPlan {
    const row = getDb()
        .prepare(
            `SELECT
         (EXISTS(SELECT 1 FROM orders WHERE userId = @userId AND status = 'paid' AND kind IN ('recharge','purchase')
                   AND (skuId IS NULL OR (skuId NOT LIKE 'pro:%' AND skuId NOT LIKE 'pro_%')))
         OR EXISTS(SELECT 1 FROM wallet_ledger WHERE userId = @userId AND kind IN ('recharge','gift'))
         OR EXISTS(SELECT 1 FROM entitlements WHERE userId = @userId AND (expiresAt IS NULL OR expiresAt > @now))) AS paid,
         EXISTS(SELECT 1 FROM entitlements WHERE userId = @userId AND feature IN ('pro','pro.appstore')
                  AND expiresAt IS NOT NULL AND expiresAt <= @now) AS expired`
        )
        .get({ userId, now }) as { paid: number; expired: number };
    // 包晴天有效会员享有 Pro 权益，与本站付费同口径报 paid。
    if (row.paid || bqtProRightsUntil(userId, now)) return 'paid';
    return row.expired ? 'expired' : 'free';
}

/**
 * 追回一张订单发出去的 Credits（Apple 退款，设计 §4.3）。
 *
 * 苹果对 IAP 有单方面退款权，`REFUND` 通知是**退款已经成功之后**才发的，
 * 我们没有事先审批权——所以这条路必须存在，且必须幂等（苹果会重推）。
 *
 * 幂等靠 `orders.refundedAt`：已经记过退款的单直接返回 `alreadyRefunded`，
 * 一分钱都不再动。订单的 `status` **保持 paid**（它确实付过），只是多了退款戳。
 *
 * 返回 `shortfallCents > 0` 表示当初发的币已经被花掉一部分、追不回来。
 * **本轮没有欠账能力**（wallet 不支持负余额），调用方只能记日志告警。
 */
export function clawbackOrderCredits(
    outTradeNo: string,
    info: { refundedAt: string; reason?: string }
): { order: Order; alreadyRefunded: boolean; clawback?: ClawbackResult } | undefined {
    return withTransaction((db) => {
        const order = getOrder(outTradeNo);
        if (!order) return undefined;
        if (order.refundedAt) return { order, alreadyRefunded: true };

        markOrderRefunded(outTradeNo, info.refundedAt);
        const refreshed = getOrder(outTradeNo)!;
        if (!order.userId || order.status !== 'paid') {
            // 没发过币（单还没结算，或匿名单）：记上退款戳就够了
            return { order: refreshed, alreadyRefunded: false };
        }
        const clawback = clawbackGrantedLots(db, {
            userId: order.userId,
            refOrderId: order.id,
            amountCents: order.amount,
            meta: {
                refund: true,
                channel: order.channel,
                outTradeNo: order.outTradeNo,
                ...(info.reason ? { reason: info.reason } : {}),
            },
        });
        return { order: refreshed, alreadyRefunded: false, clawback };
    });
}
