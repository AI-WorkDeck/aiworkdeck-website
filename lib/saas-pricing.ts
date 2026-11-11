/**
 * SaaS 订阅档位数字的单一来源（定稿 v2）。
 *
 * 调价只改这里；组件与词典模板用占位符（如 `{monthly}`）插值，不散写数字。
 * 「年付省 ¥298」等优惠算术在支付实扣确认前**不上稿**——本模块故意不导出
 * yearlySavings / showYearlySavings，避免误用。
 *
 * 商业授权询价档表（内部使用 / OEM / 人数年费）仍在 `lib/pricing.ts`，
 * 不在本页首屏渲染。
 */
export const SAAS_PRICING = {
    /** 个人 Pro 月付展示价 */
    proMonthly: '¥149',
    /** 个人 Pro 年付展示价 */
    proYearly: '¥1490',
    /**
     * Team 席位参考带（仅小字；大字永远是「按席位计费 · 联系我们」）。
     * 首屏不锁死唯一席位价。
     */
    teamSeatReference: '¥399–799',
    /** 市场成交：作者所得比例（%）— 对齐 MARKETPLACE-TERMS §2 */
    marketplaceAuthorShare: 85,
    /** 市场成交：平台抽成比例（%） */
    marketplacePlatformShare: 15,
} as const;

export type SaasPricing = typeof SAAS_PRICING;

/**
 * 个人 Pro 实扣价（单位：分，CNY）。微信 Native 建单与回调校验的唯一金额来源。
 * 必须与上面的展示价一致——scripts/verify-pro-subscription.mts 会断言两者对得上。
 */
export const SAAS_PRICE_FEN = {
    proMonthly: 14900,
    proYearly: 149000,
} as const;

/** GitHub legal 条款（市场抽成权威） */
export const MARKETPLACE_TERMS_URL =
    'https://github.com/AI-WorkDeck/aiworkdeck/blob/master/legal/MARKETPLACE-TERMS.md';

/** 商业授权说明 */
export const COMMERCIAL_LICENSE_URL =
    'https://github.com/AI-WorkDeck/aiworkdeck/blob/master/legal/COMMERCIAL-LICENSE.md';

/** Pro retail-value allowance; snapshotted per paid period, never wallet cash. */
export const SUBSCRIPTION_LIMITS = { monthlyCents: 74500, weeklyCents: 20000, cloudStorageBytes: 3 * 1024 ** 3, relayBytes: 200 * 1024 ** 2 } as const;
