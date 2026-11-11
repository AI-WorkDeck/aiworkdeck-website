/**
 * 官网 Pricing 区块的价格单一来源。调价只改这里，词典与组件不含价格数字。
 * 两站（cn/intl）统一人民币计价，不折算美元——这是定价决策，不是站点分叉点。
 *
 * ## 与 SaaS 三卡的关系（2026-10-09）
 *
 * 本文件的 internalBase / oemBase / tierFees 是**商业授权询价明细**
 *（闭源交付 / OEM / 按人数年费），供 FAQ 询价或邮件后附档表使用。
 * **不要**把它们渲染到 `/{lang}/pricing` 首屏三卡（开源 / 个人 Pro / Team）。
 * SaaS 订阅数字见 `lib/saas-pricing.ts`。
 */
export const PRICING = {
    /** 商业授权 · 内部使用 起价 */
    internalBase: '¥39,800',
    /** OEM · 再分发授权 起价 */
    oemBase: '¥300,000',
    /**
     * 内部使用授权档位表年费，顺序与词典 `pricing.tiers.rows` 一一对应；
     * 最后一档是「起」价（组件按索引选 feePerYearFrom 模板）。
     */
    tierFees: ['¥39,800', '¥98,000', '¥248,000', '¥398,000'],
    /** 实施部署 / 定制开发 / 企业插件的人天单价区间 */
    perPersonDay: '¥3,000–6,000',
} as const;

/** 本地部署内部使用优惠，2026-10-13 用户授权制定。非 OEM、非 SaaS 席位价。
 * 按可访问系统总人数计；相同范围续年沿用此年费，扩容按届时档位确认。
 * 标准部署限单环境现有组件；本地模型/离线/第三方适配另行评估。
 */
export const DEPLOYMENT_PRICING = {
    tiers: [
        { maxUsers: 20, licenseYear: 9800, setup: 6000 },
        { maxUsers: 50, licenseYear: 19800, setup: 10000 },
        { maxUsers: 100, licenseYear: 39800, setup: 16000 },
        { maxUsers: 200, licenseYear: 49800, setup: 24000 },
    ],
    personDay: 2000,
} as const;
