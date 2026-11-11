import { getAiConfig } from './ai-config';

/**
 * 固定 feature 商品目录（PR-W3）。
 *
 * 这些是桌面端本地小功能的一次性解锁 SKU（总 Spec §5）：购买后写 entitlements，
 * 桌面端 EntitlementService 按 feature 名放开免费额度限制。
 * 价格默认值在此，管理后台「商品定价」可改（存 data/ai-config.json 的 featurePrices，
 * 与 AI 配置同一套文件层机制）。
 */

export interface FeatureProduct {
  /** entitlement feature 名，与桌面端 FeatureCatalog 对齐 */
  key: 'clipboard.unlimited' | 'stage.unlimited';
  /** 中文名是订单/账单里的规范名称，英文名仅用于 EN 页面展示 */
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  defaultPriceCents: number;
}

/** 定价上限：¥1999（与 Skill/插件定价同一上限） */
export const MAX_PRICE_CENTS = 199900;

export const FEATURE_PRODUCTS: FeatureProduct[] = [
  {
    key: 'clipboard.unlimited',
    name: '无线剪贴板无限版',
    nameEn: 'Unlimited Wireless Clipboard',
    description: '解除免费额度限制（最多回溯 20 条且保留 3 天），剪贴记录不限量、不过期。',
    descriptionEn: 'Removes the free-tier limit (last 20 entries, kept for 3 days): unlimited clipboard history that never expires.',
    defaultPriceCents: 1990,
  },
  {
    key: 'stage.unlimited',
    name: 'Stage 文件缓存区无限版',
    nameEn: 'Unlimited Stage File Cache',
    description: '解除免费额度限制（最多 20 个文件、总量 500MB），缓存区容量不设上限。',
    descriptionEn: 'Removes the free-tier limit (up to 20 files, 500MB total): no cap on the cache area.',
    defaultPriceCents: 1990,
  },
];

export function getFeatureProduct(key: string): (FeatureProduct & { priceCents: number }) | undefined {
  const product = FEATURE_PRODUCTS.find(p => p.key === key);
  if (!product) return undefined;
  return { ...product, priceCents: featurePriceCents(product) };
}

export function listFeatureProducts(): Array<FeatureProduct & { priceCents: number }> {
  return FEATURE_PRODUCTS.map(p => ({ ...p, priceCents: featurePriceCents(p) }));
}

/** 生效价格 = admin 覆盖价（合法时）否则默认价 */
function featurePriceCents(product: FeatureProduct): number {
  const override = getAiConfig().featurePrices?.[product.key];
  if (Number.isInteger(override) && (override as number) >= 1 && (override as number) <= MAX_PRICE_CENTS) {
    return override as number;
  }
  return product.defaultPriceCents;
}
