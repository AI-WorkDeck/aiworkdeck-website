import type Database from 'better-sqlite3';
import { getProIntroQuote, PRO_TEST_PRODUCT } from './pro-products';
import { isProPurchaseEnabled } from './pro-purchase-flag';
import { siteConfig } from './site-config';
import { wxpayAppAdapter } from './payments/wxpay-app-adapter';

/**
 * Personal Pro on the Android mainland app (com.aiworkdeck.mobile.cn), paid with WeChat APP pay (POLISH M3, plan C).
 *
 * The same one-time product as the website (lib/pro-products.ts: ¥149 / 30 days, first 3 months ¥9.9), the same order
 * kind ('subscription') and the same fulfilment (settleOrderPaid → fulfillProPayment); only the channel is wxpay-app.
 * The server chooses the SKU and amount (intro while eligible); the app shows and pays exactly that.
 *
 * Off unless MOBILE_WXPAY_PRO_ENABLED is true, and also off whenever website Pro sales are off (PRO_PURCHASE_ENABLED).
 */
export const MOBILE_WXPAY_PRO_FLAG = 'MOBILE_WXPAY_PRO_ENABLED';

export function mobileWxpayProEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env[MOBILE_WXPAY_PRO_FLAG] ?? '').trim().toLowerCase();
  return ['true', '1', 'on', 'yes'].includes(v);
}

/** Unified account ids allowed the 1-fen payment test (comma-separated). Empty = nobody. */
export const MOBILE_WXPAY_PRO_TEST_ACCOUNTS = 'MOBILE_WXPAY_PRO_TEST_ACCOUNTS';

export function isProPaymentTester(userId: string | null, env: Record<string, string | undefined> = process.env): boolean {
  if (!userId) return false;
  return (env[MOBILE_WXPAY_PRO_TEST_ACCOUNTS] ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(userId);
}

export type MobileProUnavailable = 'disabled' | 'channel_unavailable' | 'appstore_subscription_active';

export type MobileProQuote =
  | { available: false; reason: MobileProUnavailable }
  | {
      available: true;
      skuId: 'pro_monthly_intro' | 'pro_monthly' | 'pro_test';
      amountCents: number;
      standardAmountCents: number;
      introEligible: boolean;
      introRemainingMonths: number;
      days: number;
    };

/**
 * [userId] null = a signed-in app user who has no unified account yet: they see the offer a new account gets (the
 * intro price), and the account is created by create-pro when they actually buy.
 */
export function mobileProQuote(
  db: Database.Database,
  userId: string | null,
  env: Record<string, string | undefined> = process.env,
  now: string = new Date().toISOString()
): MobileProQuote {
  // The owner-approved payment test: allowlisted accounts get the 1-fen test product even while sales are switched off.
  if (isProPaymentTester(userId, env)) {
    if (siteConfig.currency !== 'CNY' || !wxpayAppAdapter.isConfigured()) return { available: false, reason: 'channel_unavailable' };
    return { available: true, skuId: 'pro_test', amountCents: PRO_TEST_PRODUCT.priceCents, standardAmountCents: PRO_TEST_PRODUCT.priceCents,
      introEligible: false, introRemainingMonths: 0, days: PRO_TEST_PRODUCT.days };
  }
  if (!mobileWxpayProEnabled(env) || !isProPurchaseEnabled(env)) return { available: false, reason: 'disabled' };
  if (siteConfig.currency !== 'CNY' || !wxpayAppAdapter.isConfigured()) return { available: false, reason: 'channel_unavailable' };
  // Same rule as the website: no new sale on top of an active Apple subscription.
  if (userId) {
    const apple = db.prepare("SELECT 1 FROM entitlements WHERE userId=? AND feature='pro.appstore' AND expiresAt>?").get(userId, now);
    if (apple) return { available: false, reason: 'appstore_subscription_active' };
  }
  const intro = getProIntroQuote(db, userId ?? '');
  return {
    available: true,
    skuId: intro.recommendedSkuId,
    amountCents: intro.recommendedAmountCents,
    standardAmountCents: intro.standardPriceCents,
    introEligible: intro.eligible,
    introRemainingMonths: intro.remainingMonths,
    days: 30,
  };
}
