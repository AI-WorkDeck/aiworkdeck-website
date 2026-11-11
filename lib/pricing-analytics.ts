/**
 * 官网定价页点击埋点的共享常量。无依赖：客户端监听器（PricingClickTracker）与
 * 服务端白名单（lib/telemetry-store.ts）都从这里取，避免两边拼写漂移。
 */

/**
 * 定价页 7 个 data-analytics 点击位（components/pricing/*）。改名必须两边同步，
 * scripts/verify-pricing-click-tracking.mts 会逐个比对组件里的属性。
 */
export const PRICING_CLICK_EVENTS = [
  'pricing_pro_trial',
  'pricing_pro_upgrade',
  'pricing_team_demo',
  'pricing_team_mail',
  'pricing_commercial_mail',
  'pricing_marketplace_terms',
  'pricing_marketplace_submit',
] as const;

/** 上报端点：沿用桌面端的匿名事件接口，不另开新表。 */
export const TELEMETRY_EVENTS_ENDPOINT = '/api/telemetry/events';

/**
 * 网页端上报用的固定 installId（全零 v4 形状）。**刻意固定**：网页点击不需要也不应该
 * 区分访客，固定值让它在库里无法串成任何个人轨迹；装机量口径只读 telemetry_rollup，
 * 不读 telemetry_event，所以不会被这个值污染。
 */
export const WEB_INSTALL_ID = '00000000-0000-4000-8000-000000000000';

