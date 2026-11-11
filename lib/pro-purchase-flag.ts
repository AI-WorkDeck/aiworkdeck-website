import { toBaseLocale, type Locale } from '@/i18n-config';

/**
 * 国内站个人 Pro 购买开关（PRO_PURCHASE_ENABLED）+ monthly-only 闸门。
 *
 * - 默认值见 PRO_PURCHASE_ENABLED_DEFAULT（一行可改）。当前 = 开：未设置等同生产现状。
 * - 应急止血：显式设 PRO_PURCHASE_ENABLED=false（或 0 / off / no）→ 定价页按钮不建单、建单 API 拒绝。
 * - 显式 true / 1 / on / yes → 开；其它无法识别的值按默认值处理。
 * - 年付不可购（M1 monthly-only）：pro_yearly 与 #228 旧 pro:yearly 一律 not_purchasable；
 *   年付价格常量保留在 lib/saas-pricing.ts，只是不渲染、不售卖。
 * - #228 旧 pro:monthly（kind=purchase）继续接受，归一为 kind=subscription / pro_monthly 履约，
 *   保证部署切换期已打开的旧页面不挂。
 * - 服务端建单口每次请求运行时读取；定价页按钮在服务端渲染时读取（页面若被静态化，需重新 build）。
 */
export const PRO_PURCHASE_FLAG_ENV = 'PRO_PURCHASE_ENABLED';

/** 默认值（未设置时）。改这一行即可切换默认开/关。 */
export const PRO_PURCHASE_ENABLED_DEFAULT = true;

export function isProPurchaseEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env[PRO_PURCHASE_FLAG_ENV];
  if (typeof raw !== 'string') return PRO_PURCHASE_ENABLED_DEFAULT;
  const v = raw.trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(v)) return false;
  if (['true', '1', 'on', 'yes'].includes(v)) return true;
  return PRO_PURCHASE_ENABLED_DEFAULT;
}

/** 识别 Pro SKU：现行 pro_monthly / pro_yearly，以及 #228 旧写法 pro:monthly / pro:yearly。 */
export function parseProSkuPlan(skuId: unknown): 'monthly' | 'yearly' | null {
  if (typeof skuId !== 'string') return null;
  const m = /^pro[_:](monthly|yearly)$/.exec(skuId.trim().toLowerCase());
  return m ? (m[1] as 'monthly' | 'yearly') : null;
}

export interface ProGateRejection {
  status: 403 | 400;
  code: 'pro_purchase_disabled' | 'not_purchasable';
  error: string;
}

/**
 * 建单口闸门：对任何 kind 携带的 Pro SKU（含旧写法）生效。返回 null = 放行（继续原有校验）。
 * 开关关 → 403 pro_purchase_disabled；年付（两种写法）→ 400 not_purchasable。
 */
export function checkProPurchaseGate(
  skuId: unknown,
  env: Record<string, string | undefined> = process.env,
  lang: Locale = 'zh'
): ProGateRejection | null {
  const plan = parseProSkuPlan(skuId);
  if (!plan) return null;
  const isEn = toBaseLocale(lang) === 'en';
  if (!isProPurchaseEnabled(env)) {
    return {
      status: 403,
      code: 'pro_purchase_disabled',
      error: isEn ? 'Pro purchase is not yet open' : 'Pro 购买暂未开放',
    };
  }
  if (plan === 'yearly') {
    return {
      status: 400,
      code: 'not_purchasable',
      error: isEn ? 'This item is not available for purchase' : '该商品不可购买',
    };
  }
  return null;
}

/** #228 旧写法 pro:monthly 归一为现行 subscription / pro_monthly；其余原样返回。 */
export function normalizeLegacyProSku(kind: string, skuId: unknown): { kind: string; skuId: unknown } {
  if (typeof skuId === 'string' && skuId.trim().toLowerCase() === 'pro:monthly') {
    return { kind: 'subscription', skuId: 'pro_monthly' };
  }
  return { kind, skuId };
}

/** 定价页 Pro 卡「直接升级 Pro」按钮的渲染模式（纯函数，便于测试）。 */
export type ProCheckoutMode = 'account-link' | 'coming-soon' | 'checkout';

export function proCheckoutMode(paymentChannel: string, purchaseEnabled: boolean): ProCheckoutMode {
  if (paymentChannel !== 'wxpay') return 'account-link'; // 国际站 Pro 不开售，行为不变
  return purchaseEnabled ? 'checkout' : 'coming-soon';
}
