import type Database from 'better-sqlite3';

/**
 * 会员体系：成长值与等级（计费内核，2026-08-27 设计定稿）。
 *
 * 成长值只增不减（刻意从宽）：
 * - 充值：每 10 分（0.1 元）计 1 点 → floor(topupCents / 10)
 * - 消费：每 20 分（0.2 元）计 1 点 → floor(spendCents / 20)
 * - 退款不回扣。
 *
 * 消费口径与 lib/gateway/usage.ts 相同：预扣（meta.phase = 'hold'）那行已被
 * hold_release 全额冲销，不是真实消费，必须排除；只算 phase 为空或 'settle' 的行。
 *
 * 等级权益的硬实现只有一处：充值到账时按含本笔后的成长值定档，赠送
 * bonusPermille‰ 的 reward Credits（见 lib/wallet.ts settleOrderPaid）。
 *
 * 两站（CNY/USD）字段集合与语义逐字相同，只有金额的币种随站点。
 */

export interface MembershipTier {
    key: string;
    level: number;
    nameZh: string;
    nameEn: string;
    /** 达到该档所需成长值（下限，含） */
    threshold: number;
    /** 充值赠送千分比 */
    bonusPermille: number;
}

/** 七档等级表，按 level 升序。数值是产品定稿，不要改。 */
export const MEMBERSHIP_TIERS: readonly MembershipTier[] = [
    { key: 'paralegal', level: 1, nameZh: '律师助理', nameEn: 'Paralegal', threshold: 0, bonusPermille: 0 },
    { key: 'associate', level: 2, nameZh: '正式律师', nameEn: 'Associate', threshold: 300, bonusPermille: 10 },
    { key: 'lead', level: 3, nameZh: '主办律师', nameEn: 'Lead Counsel', threshold: 1500, bonusPermille: 20 },
    { key: 'senior', level: 4, nameZh: '资深律师', nameEn: 'Senior Counsel', threshold: 5000, bonusPermille: 40 },
    { key: 'salaried-partner', level: 5, nameZh: '授薪合伙人', nameEn: 'Salaried Partner', threshold: 15000, bonusPermille: 60 },
    { key: 'equity-partner', level: 6, nameZh: '权益合伙人', nameEn: 'Equity Partner', threshold: 50000, bonusPermille: 80 },
    { key: 'managing-partner', level: 7, nameZh: '管理委员会合伙人', nameEn: 'Managing Partner', threshold: 150000, bonusPermille: 100 },
];

export interface GrowthBreakdown {
    growthPoints: number;
    /** 历史充值总额（分，恒为正） */
    topupCents: number;
    /** 历史真实消费总额（分，取绝对值后求和） */
    spendCents: number;
}

/**
 * 从账本算成长值。
 * - topup：kind='recharge' 的入账（含微信/Stripe 充值与充值兑换码，行恒为正）。
 * - spend：ai_alloc / purchase / service_spend 的扣减行，排除未结算的预扣
 *   （meta.phase 存在且不是 'settle' 的行）。
 */
export function computeGrowth(db: Database.Database, userId: string): GrowthBreakdown {
    const topupRow = db
        .prepare(
            `SELECT COALESCE(SUM(amountCents), 0) AS cents
               FROM wallet_ledger
              WHERE userId = ? AND kind = 'recharge'`
        )
        .get(userId) as { cents: number };
    const spendRow = db
        .prepare(
            `SELECT COALESCE(SUM(-amountCents), 0) AS cents
               FROM wallet_ledger
              WHERE userId = ?
                AND kind IN ('ai_alloc', 'purchase', 'service_spend')
                AND amountCents < 0
                AND (json_extract(meta, '$.phase') IS NULL OR json_extract(meta, '$.phase') = 'settle')`
        )
        .get(userId) as { cents: number };

    const topupCents = topupRow.cents;
    const spendCents = spendRow.cents;
    return {
        growthPoints: Math.floor(topupCents / 10) + Math.floor(spendCents / 20),
        topupCents,
        spendCents,
    };
}

/** 当前等级：threshold <= points 的最高一档。points < 0 不会出现，兜底回第一档。 */
export function tierFor(points: number): MembershipTier {
    let current = MEMBERSHIP_TIERS[0];
    for (const tier of MEMBERSHIP_TIERS) {
        if (points >= tier.threshold) current = tier;
    }
    return current;
}

/** 下一档与还差多少点；已是顶档返回 null。 */
export function nextTierFor(
    points: number
): { tier: MembershipTier; remainingPoints: number } | null {
    for (const tier of MEMBERSHIP_TIERS) {
        if (points < tier.threshold) {
            return { tier, remainingPoints: tier.threshold - points };
        }
    }
    return null;
}

/** GET /api/account/membership 的响应形状（契约字段集，严格）。 */
export interface MembershipSnapshot {
    growthPoints: number;
    topupCents: number;
    spendCents: number;
    tier: { key: string; level: number; nameZh: string; nameEn: string; bonusPermille: number };
    nextTier: {
        key: string;
        level: number;
        nameZh: string;
        nameEn: string;
        threshold: number;
        remainingPoints: number;
    } | null;
    tiers: {
        key: string;
        level: number;
        nameZh: string;
        nameEn: string;
        threshold: number;
        bonusPermille: number;
    }[];
}

export function membershipSnapshot(db: Database.Database, userId: string): MembershipSnapshot {
    const { growthPoints, topupCents, spendCents } = computeGrowth(db, userId);
    const tier = tierFor(growthPoints);
    const next = nextTierFor(growthPoints);
    return {
        growthPoints,
        topupCents,
        spendCents,
        tier: {
            key: tier.key,
            level: tier.level,
            nameZh: tier.nameZh,
            nameEn: tier.nameEn,
            bonusPermille: tier.bonusPermille,
        },
        nextTier: next
            ? {
                  key: next.tier.key,
                  level: next.tier.level,
                  nameZh: next.tier.nameZh,
                  nameEn: next.tier.nameEn,
                  threshold: next.tier.threshold,
                  remainingPoints: next.remainingPoints,
              }
            : null,
        tiers: MEMBERSHIP_TIERS.map((t) => ({
            key: t.key,
            level: t.level,
            nameZh: t.nameZh,
            nameEn: t.nameEn,
            threshold: t.threshold,
            bonusPermille: t.bonusPermille,
        })),
    };
}
