// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type Database from 'better-sqlite3';
import { getDb } from './db';
import type { Order } from './orders';
import { addDays } from './pro-products';
import { siteConfig } from './site-config';
import { findUserById } from './users';
import { BRAND_PROFILE } from './brand-profile';

/**
 * 插件周期通行证（非自动续费、预付天数按次顺延）。
 * 权益仍写入 entitlements（feature = "plugin:<pluginId>"），与桌面端 EntitlementService 对齐；
 * 履约流水写入 plugin_subscription_payment，按 outTradeNo 幂等。
 */
export type PluginSubPeriod = 'monthly' | 'quarterly' | 'halfyear' | 'yearly';
export type SupportedCurrency = 'CNY' | 'USD' | 'TWD';

function isSupportedCurrency(c: unknown): c is SupportedCurrency {
  return c === 'CNY' || c === 'USD' || c === 'TWD';
}

export interface PluginSubscriptionPlanDef {
  pluginId: string;
  period: PluginSubPeriod;
  skuId: string;
  days: number;
  /** 各币种标价（最小单位）。没有某币种标价的方案在该币种的站点上不出售。 */
  prices: Readonly<Partial<Record<SupportedCurrency, number>>>;
  nameZh: string;
  nameEn: string;
  savingsNoteZh?: string;
  savingsNoteEn?: string;
}

export const PLUGIN_SUBSCRIPTION_PLANS: readonly PluginSubscriptionPlanDef[] = [
  {
    pluginId: 'aifirm-partner',
    period: 'monthly',
    skuId: 'plugin_sub:aifirm-partner:monthly',
    days: 30,
    prices: { USD: 2900, CNY: 19900 },
    nameZh: 'AI Firm 案源广场 · 30天通行证',
    nameEn: 'AI Firm Lead Marketplace · 30-Day Pass',
  },
  {
    pluginId: 'aifirm-partner',
    period: 'quarterly',
    skuId: 'plugin_sub:aifirm-partner:quarterly',
    days: 90,
    prices: { USD: 7900, CNY: 52900 },
    nameZh: 'AI Firm 案源广场 · 90天通行证',
    nameEn: 'AI Firm Lead Marketplace · 90-Day Pass',
    savingsNoteZh: '折合每月约 ¥176（比单买30天省 ¥68）',
    savingsNoteEn: 'Saves $8 vs three 30-day passes',
  },
  // 贴牌站点自己的方案（如新台币价）来自私有的 brand-profile.json，不写进本仓库。
  ...(BRAND_PROFILE?.pluginPlans ?? []),
];

const PLAN_BY_SKU = new Map(PLUGIN_SUBSCRIPTION_PLANS.map(p => [p.skuId, p]));

export function supportsPluginSubscriptions(pluginId: unknown): pluginId is string {
  return typeof pluginId === 'string' && PLUGIN_SUBSCRIPTION_PLANS.some(p => p.pluginId === pluginId);
}

export function parsePluginSubSku(skuId: unknown): PluginSubscriptionPlanDef | null {
  if (typeof skuId !== 'string') return null;
  return PLAN_BY_SKU.get(skuId.trim()) ?? null;
}

export function isPluginSubSku(skuId: unknown): skuId is string {
  return parsePluginSubSku(skuId) !== null;
}

export interface PluginCatalogPlanView {
  skuId: string;
  pluginId: string;
  period: PluginSubPeriod;
  days: number;
  amountCents: number;
  currency: SupportedCurrency;
  nameZh: string;
  nameEn: string;
  savingsNoteZh: string | null;
  savingsNoteEn: string | null;
}

export function getPluginSubscriptionCatalog(
  pluginId: string,
  currency: SupportedCurrency
): PluginCatalogPlanView[] {
  return PLUGIN_SUBSCRIPTION_PLANS
    .filter(p => p.pluginId === pluginId && (p.prices[currency] ?? 0) > 0)
    .map(p => ({
      skuId: p.skuId,
      pluginId: p.pluginId,
      period: p.period,
      days: p.days,
      amountCents: p.prices[currency] as number,
      currency,
      nameZh: p.nameZh,
      nameEn: p.nameEn,
      savingsNoteZh: p.savingsNoteZh ?? null,
      savingsNoteEn: p.savingsNoteEn ?? null,
    }));
}

export type PluginSubValidationError = 'invalid_sku' | 'not_purchasable' | 'amount_mismatch';

export function validatePluginSubPurchase(
  skuId: unknown,
  amountCents: number,
  currency: string
): { plan: PluginSubscriptionPlanDef; amountCents: number; currency: SupportedCurrency } | { error: PluginSubValidationError } {
  const plan = parsePluginSubSku(skuId);
  if (!plan) return { error: 'invalid_sku' };
  if (!isSupportedCurrency(currency)) return { error: 'not_purchasable' };
  const expected = plan.prices[currency];
  if (!expected || expected <= 0) return { error: 'not_purchasable' };
  if (amountCents !== expected) return { error: 'amount_mismatch' };
  return { plan, amountCents: expected, currency };
}

export interface PluginSubscriptionStatus {
  pluginId: string;
  feature: string;
  active: boolean;
  expiresAt: string | null;
  lastPlanPeriod: PluginSubPeriod | null;
  lastPaidAt: string | null;
}

export function getPluginSubscriptionStatus(
  userId: string,
  pluginId: string,
  now: string = new Date().toISOString()
): PluginSubscriptionStatus {
  const db = getDb();
  const feature = `plugin:${pluginId}`;
  const ent = db
    .prepare('SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = ?')
    .get(userId, feature) as { expiresAt: string | null } | undefined;
  const last = db
    .prepare(
      `SELECT planPeriod, createdAt FROM plugin_subscription_payment
        WHERE userId = ? AND pluginId = ? ORDER BY createdAt DESC LIMIT 1`
    )
    .get(userId, pluginId) as { planPeriod: PluginSubPeriod; createdAt: string } | undefined;

  const active = !!ent && (ent.expiresAt === null || ent.expiresAt > now);
  return {
    pluginId,
    feature,
    active,
    expiresAt: active ? (ent?.expiresAt ?? null) : (ent?.expiresAt ?? null),
    lastPlanPeriod: last?.planPeriod ?? null,
    lastPaidAt: last?.createdAt ?? null,
  };
}

export interface PluginSubFulfillResult {
  duplicate: boolean;
  periodStart?: string;
  periodEnd?: string;
}

export function fulfillPluginSubscription(
  db: Database.Database,
  order: Order,
  now: string = new Date().toISOString()
): PluginSubFulfillResult {
  if (!db.inTransaction) {
    throw new Error('fulfillPluginSubscription 必须在事务内调用（withTransaction 包裹）');
  }
  if (!order.userId) throw new Error(`插件订阅订单缺少 userId: ${order.outTradeNo}`);
  const plan = parsePluginSubSku(order.skuId);
  if (!plan) throw new Error(`插件订阅订单 skuId 无法解析: ${order.outTradeNo} ${order.skuId}`);
  if (!isSupportedCurrency(order.currency)) {
    throw new Error(`插件订阅订单币种不受支持: ${order.outTradeNo} ${order.currency}`);
  }
  const expectedAmount = plan.prices[order.currency];
  if (order.amount !== expectedAmount) {
    throw new Error(`插件订阅订单金额与标价不符: ${order.outTradeNo} ${order.amount} != ${expectedAmount}`);
  }

  const seen = db
    .prepare('SELECT 1 AS x FROM plugin_subscription_payment WHERE outTradeNo = ?')
    .get(order.outTradeNo) as { x: number } | undefined;
  if (seen) return { duplicate: true };

  const userId = order.userId;
  const feature = `plugin:${plan.pluginId}`;
  const current = db
    .prepare('SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = ?')
    .get(userId, feature) as { expiresAt: string | null } | undefined;
  const permanent = !!current && current.expiresAt === null;
  const periodStart = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
  const periodEnd = addDays(periodStart, plan.days);

  db.prepare(
    `INSERT INTO plugin_subscription_payment
       (outTradeNo, userId, pluginId, skuId, planPeriod, days, amountCents, currency, periodStart, periodEnd, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(order.outTradeNo, userId, plan.pluginId, plan.skuId, plan.period, plan.days, order.amount, order.currency, periodStart, periodEnd, now);

  if (!permanent) {
    db.prepare(
      `INSERT INTO entitlements (userId, feature, orderId, createdAt, expiresAt)
       VALUES (@userId, @feature, @orderId, @now, @periodEnd)
       ON CONFLICT (userId, feature) DO UPDATE SET
         orderId = excluded.orderId,
         expiresAt = excluded.expiresAt`
    ).run({ userId, feature, orderId: order.id, now, periodEnd });
  }

  return { duplicate: false, periodStart, periodEnd };
}

const ASSERTION_TTL_SECONDS = 600;

export interface IssuedPluginAssertion {
  token: string;
  active: boolean;
  expiresAt: string | null;
  exp: number;
}

export async function issuePluginAssertion(
  userId: string,
  pluginId: string,
  secret: string
): Promise<IssuedPluginAssertion> {
  const profile = findUserById(userId);
  const sub = profile?.id || userId;
  const displayName = profile?.displayName || profile?.username || '';
  const status = getPluginSubscriptionStatus(sub, pluginId);
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + ASSERTION_TTL_SECONDS;
  const payload = {
    v: 1,
    iss: siteConfig.id === 'cn' ? 'aiworkdeck.com' : 'workdeck.ai',
    sub,
    displayName,
    pluginId,
    active: status.active,
    expiresAt: status.expiresAt,
    iat: nowSec,
    exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingKey = await globalThis.crypto.subtle.importKey(
    'raw',
    Buffer.from(secret, 'utf8'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await globalThis.crypto.subtle.sign(
    'HMAC',
    signingKey,
    Buffer.from(`awdpa1.${payloadB64}`, 'utf8')
  );
  const sigB64 = Buffer.from(sigBuf).toString('base64url');
  return {
    token: `awdpa1.${payloadB64}.${sigB64}`,
    active: status.active,
    expiresAt: status.expiresAt,
    exp,
  };
}
