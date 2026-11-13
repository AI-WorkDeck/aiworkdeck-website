import type Database from 'better-sqlite3';
import { PRO_INTRO_MONTHS, SAAS_PRICE_FEN } from './saas-pricing';
import type { Order } from './orders';
import { provisionSubscriptionPeriods } from './subscription';

/**
 * 个人 Pro 商品（微信 Native 一次性购买，非自动续费）。
 *
 * 对齐增长规格 `/workspace/增长/Pro一次性商品规格-v0.1.md`（GM 已批 v0.1）：
 *   - SKU：`pro_monthly`（¥149 / 30 天）/ `pro_yearly`（¥1490 / 365 天）
 *   - 金额只认 SAAS_PRICE_FEN（14900 / 149000 分）
 *   - 订单 `orders.kind = 'subscription'`（增长倾向 A）
 *   - 结算走既有 settleFromChannel → settleOrderPaid；验签沿用 lib/wxpay.ts
 *   - 大陆站（CNY / 微信）可售；国际站拒绝
 *
 * 履约（fulfillProPayment）在 settleOrderPaid 的同一事务里完成：
 *   1. pro_payment 落一行（outTradeNo 唯一，先查后写 → 幂等）
 *   2. entitlements('pro') 到期时间顺延（未到期则从原到期日起算；按天 30/365）
 *   3. billing_event 记 subscription_paid；该账户首笔已付另记 first_payment（同用户不重复）
 *   4. 若已有 trial_balance 行则置 converted（同一 order_no 只转换一次）；无行则跳过，不 INSERT
 * 任何一步抛错整个事务回滚、订单保持 pending。
 * 对外文案禁止「自动续费 / 到期扣款 / 订阅扣费」——本模块不产出那些字样。
 */

export type ProPlan = 'monthly' | 'yearly';

export interface ProProduct {
  skuId: 'pro_monthly_intro' | 'pro_monthly' | 'pro_yearly';
  plan: ProPlan;
  name: string;
  nameEn: string;
  priceCents: number;
  /** 支付成功起算的权益天数（月付 30 / 年付 365） */
  days: number;
}

export const PRO_ENTITLEMENT_FEATURE = 'pro';
export const SUBSCRIPTION_PAID_EVENT = 'subscription_paid';
export const FIRST_PAYMENT_EVENT = 'first_payment';

export const PRO_PRODUCTS: readonly ProProduct[] = [
  {
    skuId: 'pro_monthly_intro',
    plan: 'monthly',
    name: 'AI WorkDeck 个人 Pro（首 3 个月特惠）',
    nameEn: 'AI WorkDeck Pro (first 3 months intro)',
    priceCents: SAAS_PRICE_FEN.proIntroMonthly,
    days: 30,
  },
  {
    skuId: 'pro_monthly',
    plan: 'monthly',
    name: 'AI WorkDeck 个人 Pro（月付）',
    nameEn: 'AI WorkDeck Pro (monthly)',
    priceCents: SAAS_PRICE_FEN.proMonthly,
    days: 30,
  },
  {
    skuId: 'pro_yearly',
    plan: 'yearly',
    name: 'AI WorkDeck 个人 Pro（年付）',
    nameEn: 'AI WorkDeck Pro (yearly)',
    priceCents: SAAS_PRICE_FEN.proYearly,
    days: 365,
  },
];

export interface ProIntroQuote {
  eligible: boolean;
  priceCents: number;
  standardPriceCents: number;
  totalMonths: number;
  usedMonths: number;
  remainingMonths: number;
  recommendedSkuId: 'pro_monthly_intro' | 'pro_monthly';
  recommendedAmountCents: number;
}

/** Per-account introductory offer quote: first 3 Pro monthly cycles at ¥9.9/mo, then ¥149/mo. */
export function getProIntroQuote(db: Database.Database, userId: string): ProIntroQuote {
  const wechatRow = db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN plan = 'yearly' THEN 12 ELSE 1 END), 0) AS n FROM pro_payment WHERE userId = ?"
    )
    .get(userId) as { n: number };
  let appStoreCycles = 0;
  const hasAppStoreTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'appstore_subscription_transaction'")
    .get();
  if (hasAppStoreTable) {
    const appleRow = db
      .prepare('SELECT COALESCE(COUNT(*), 0) AS n FROM appstore_subscription_transaction WHERE userId = ? AND revokedAt IS NULL')
      .get(userId) as { n: number };
    appStoreCycles = Number(appleRow?.n ?? 0);
  }
  const paidCycles = Number(wechatRow?.n ?? 0) + appStoreCycles;
  const usedMonths = Math.min(PRO_INTRO_MONTHS, Math.max(0, paidCycles));
  const remainingMonths = Math.max(0, PRO_INTRO_MONTHS - usedMonths);
  const eligible = remainingMonths > 0;
  return {
    eligible,
    priceCents: SAAS_PRICE_FEN.proIntroMonthly,
    standardPriceCents: SAAS_PRICE_FEN.proMonthly,
    totalMonths: PRO_INTRO_MONTHS,
    usedMonths,
    remainingMonths,
    recommendedSkuId: eligible ? 'pro_monthly_intro' : 'pro_monthly',
    recommendedAmountCents: eligible ? SAAS_PRICE_FEN.proIntroMonthly : SAAS_PRICE_FEN.proMonthly,
  };
}

export function isProSku(skuId: unknown): skuId is ProProduct['skuId'] {
  return typeof skuId === 'string' && PRO_PRODUCTS.some((p) => p.skuId === skuId);
}

/** #228（e31e951）旧 SKU 写法：pro:monthly / pro:yearly（生产旧单 kind='purchase'）。 */
export const LEGACY_PRO_SKU: Readonly<Record<string, ProProduct['skuId']>> = {
  'pro:monthly': 'pro_monthly',
  'pro:yearly': 'pro_yearly',
};

export function isLegacyProSku(skuId: unknown): boolean {
  return typeof skuId === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_PRO_SKU, skuId);
}

/** 现行 SKU 直查；旧写法 pro:* 映射到现行商品（仅用于旧单履约，不放开建单）。 */
export function getProProduct(skuId: unknown): ProProduct | undefined {
  const id = typeof skuId === 'string' && isLegacyProSku(skuId) ? LEGACY_PRO_SKU[skuId] : skuId;
  return PRO_PRODUCTS.find((p) => p.skuId === id);
}

export type ProValidationError = 'invalid_sku' | 'not_purchasable' | 'amount_mismatch';

/** 下单前校验：SKU 存在、仅人民币站、金额等于标价。可续购，不做 already_owned。 */
export function validateProPurchase(
  skuId: unknown,
  amountCents: number,
  currency: string
): { product: ProProduct } | { error: ProValidationError } {
  const product = getProProduct(skuId);
  if (!product) return { error: 'invalid_sku' };
  if (currency !== 'CNY') return { error: 'not_purchasable' };
  if (amountCents !== product.priceCents) return { error: 'amount_mismatch' };
  return { product };
}

/** UTC 按天顺延。月付 30 / 年付 365，与增长规格一致（不用自然月）。 */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** @deprecated 规格改按天；保留别名以免外部脚本短暂引用。请改用 addDays。 */
export function addMonths(iso: string, months: number): string {
  return addDays(iso, months * 30);
}


/** ISO → UTC 日历日 `YYYY-MM-DD`，成功页「有效期至」展示用。 */
export function formatProExpiresDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * 成功页 / 查询接口用的到期时刻：优先履约写入的 periodEnd；
 * 否则按规格「支付成功起算」paidAt + SKU.days（月 30 / 年 365）。
 */
export function resolveProExpiresAt(
  skuId: unknown,
  paidAt: string | null | undefined,
  periodEnd?: string | null
): string | null {
  if (periodEnd) return periodEnd;
  const product = getProProduct(skuId);
  if (!product) return null;
  const start = paidAt || new Date().toISOString();
  return addDays(start, product.days);
}

export interface ProFulfillResult {
  /** true = 该 outTradeNo 已履约过，本次零写入 */
  duplicate: boolean;
  periodStart?: string;
  periodEnd?: string;
  isFirstPayment?: boolean;
}

/**
 * Pro 履约。**必须在事务内调用**（settleOrderPaid 的 withTransaction）。
 * 幂等键 outTradeNo：pro_payment.outTradeNo UNIQUE + 先查后写；
 * billing_event (eventName, outTradeNo) UNIQUE 兜底。
 */
export function fulfillProPayment(
  db: Database.Database,
  order: Order,
  now: string = new Date().toISOString()
): ProFulfillResult {
  if (!db.inTransaction) {
    throw new Error('fulfillProPayment 必须在事务内调用（withTransaction 包裹）');
  }
  if (!order.userId) throw new Error(`Pro 订单缺少 userId: ${order.outTradeNo}`);
  const product = getProProduct(order.skuId);
  if (!product) throw new Error(`Pro 订单 skuId 无法解析: ${order.outTradeNo} ${order.skuId}`);
  if (order.currency !== 'CNY') {
    throw new Error(`Pro 订单仅限人民币站: ${order.outTradeNo} ${order.currency}`);
  }
  if (order.amount !== product.priceCents) {
    // settleFromChannel 已比过「通道金额 = 订单金额」；这里守「订单金额 = 标价」，
    // 防止绕过建单口直接落库的异常订单发出权益
    throw new Error(`Pro 订单金额与标价不符: ${order.outTradeNo} ${order.amount} != ${product.priceCents}`);
  }

  const seen = db
    .prepare('SELECT 1 AS x FROM pro_payment WHERE outTradeNo = ?')
    .get(order.outTradeNo) as { x: number } | undefined;
  if (seen) return { duplicate: true };

  const userId = order.userId;
  // 账户级首笔：pro_payment 尚无该用户行，且未写过 first_payment（双重判定，同用户不重复）
  const priorPayments = (
    db.prepare('SELECT COUNT(*) AS n FROM pro_payment WHERE userId = ?').get(userId) as { n: number }
  ).n;
  const hadFirstEvent = !!db
    .prepare('SELECT 1 AS x FROM billing_event WHERE eventName = ? AND userId = ?')
    .get(FIRST_PAYMENT_EVENT, userId);
  const isFirstPayment = priorPayments === 0 && !hadFirstEvent;

  const current = db
    .prepare('SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = ?')
    .get(userId, PRO_ENTITLEMENT_FEATURE) as { expiresAt: string | null } | undefined;
  const permanent = !!current && current.expiresAt === null;
  const periodStart = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
  const periodEnd = addDays(periodStart, product.days);

  db.prepare(
    `INSERT INTO pro_payment (outTradeNo, userId, plan, amountCents, periodStart, periodEnd, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(order.outTradeNo, userId, product.plan, order.amount, periodStart, periodEnd, now);

  if (!permanent) {
    db.prepare(
      `INSERT INTO entitlements (userId, feature, orderId, createdAt, expiresAt)
       VALUES (@userId, @feature, @orderId, @now, @periodEnd)
       ON CONFLICT (userId, feature) DO UPDATE SET
         orderId = excluded.orderId,
         expiresAt = excluded.expiresAt`
    ).run({ userId, feature: PRO_ENTITLEMENT_FEATURE, orderId: order.id, now, periodEnd });
  }

  const attrs = JSON.stringify({
    plan: product.plan,
    sku_id: product.skuId,
    skuId: product.skuId,
    seats: 1,
    amount_cents: order.amount,
    amountCents: order.amount,
    currency: order.currency,
    channel: order.channel,
    order_no: order.outTradeNo,
    periodStart,
    periodEnd,
    is_first_payment: isFirstPayment,
  });

  db.prepare(
    `INSERT INTO billing_event (eventName, userId, outTradeNo, attrs, ts)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (eventName, outTradeNo) DO NOTHING`
  ).run(SUBSCRIPTION_PAID_EVENT, userId, order.outTradeNo, attrs, now);

  if (isFirstPayment) {
    db.prepare(
      `INSERT INTO billing_event (eventName, userId, outTradeNo, attrs, ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (eventName, outTradeNo) DO NOTHING`
    ).run(FIRST_PAYMENT_EVENT, userId, order.outTradeNo, attrs, now);
  }

  // 试用转付费：有行才置 converted；无行则跳过（checklist §1.7 / 增长定稿）。
  // 付费用户后续 grantTrial 由 hasPaidBefore（已付订单 / 有效权益）拦截，不必在此 INSERT。
  const trialRow = db
    .prepare('SELECT 1 AS x FROM trial_balance WHERE accountId = ?')
    .get(userId) as { x: number } | undefined;
  if (trialRow) {
    db.prepare(
      `UPDATE trial_balance SET
         status = 'converted',
         convertedAt = COALESCE(convertedAt, @now),
         convertedOrderNo = COALESCE(convertedOrderNo, @outTradeNo),
         updatedAt = @now
       WHERE accountId = @userId`
    ).run({ userId, now, outTradeNo: order.outTradeNo });
  }

  provisionSubscriptionPeriods(db, userId);
  return { duplicate: false, periodStart, periodEnd, isFirstPayment };
}
