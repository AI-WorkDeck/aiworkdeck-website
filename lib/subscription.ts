// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type Database from 'better-sqlite3';
import { getDb } from './db';
import { postpaidPolicy, POSTPAID_VERSION } from './postpaid';
import { appstoreRenewalSnapshot } from './appstore-subscription';
import { bqtProRightsUntil } from './bqt-member';

/** Retail-value allowance, never cash or refundable credit. Each paid period snapshots these limits. */
import { SUBSCRIPTION_LIMITS } from './saas-pricing';
export { SUBSCRIPTION_LIMITS } from './saas-pricing';
export const PRO_INCLUDED_FEATURES = ['plan.pro', 'clipboard.unlimited', 'stage.unlimited', 'cloud.storage.3gb'] as const;
const DAY = 86400000;
interface Period { id: number; userId: string; startsAt: string; endsAt: string; monthlyCents: number; weeklyCents: number }
export interface SubscriptionSnapshot {
    active: boolean;
    expiresAt: string | null;
    periodId: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    monthlyLimitCents: number;
    monthlyUsedCents: number;
    weeklyStart: string | null;
    weeklyEnd: string | null;
    weeklyLimitCents: number;
    weeklyUsedCents: number;
    availableCents: number;
    walletFallbackEnabled: boolean;
    cloudStorageBytes: number;
    relayBytes: number;
    autoRenew?: ReturnType<typeof appstoreRenewalSnapshot>;
    /** 'bqt' = Pro 权益来自包晴天有效会员（无本站月度额度，只有功能与 3GB 云空间）。 */
    source?: 'bqt';
}

/** Also repairs already-paid Pro orders. Unique payment/cycle makes retries and renewal safe. */
export function provisionSubscriptionPeriods(d: Database.Database, userId: string): void {
    const payments = d.prepare('SELECT outTradeNo, plan, periodStart, periodEnd FROM pro_payment WHERE userId = ?').all(userId) as { outTradeNo: string; plan: string; periodStart: string; periodEnd: string }[];
    const insert = d.prepare('INSERT OR IGNORE INTO subscription_period (userId, outTradeNo, cycle, startsAt, endsAt, monthlyCents, weeklyCents) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const p of payments) {
        const cycles = p.plan === 'yearly' ? 12 : 1;
        for (let cycle = 0; cycle < cycles; cycle++) {
            const start = new Date(Date.parse(p.periodStart) + cycle * 30 * DAY).toISOString();
            const end = cycle === cycles - 1 ? p.periodEnd : new Date(Date.parse(start) + 30 * DAY).toISOString();
            insert.run(userId, p.outTradeNo, cycle, start, end, SUBSCRIPTION_LIMITS.monthlyCents, SUBSCRIPTION_LIMITS.weeklyCents);
        }
    }
}

export function subscriptionSnapshot(userId: string, now = new Date().toISOString(), d = getDb()): SubscriptionSnapshot {
    provisionSubscriptionPeriods(d, userId);
    const fallback = d.prepare('SELECT walletFallbackEnabled FROM subscription_preferences WHERE userId = ?').get(userId) as { walletFallbackEnabled: number } | undefined;
    const p = d.prepare(`SELECT p.* FROM subscription_period p WHERE p.userId = ? AND p.startsAt <= ? AND p.endsAt > ?
        AND EXISTS(SELECT 1 FROM entitlements e WHERE e.userId = p.userId AND e.feature IN ('pro','pro.appstore') AND (e.expiresAt IS NULL OR e.expiresAt > ?))
        ORDER BY p.startsAt LIMIT 1`).get(userId, now, now, now) as Period | undefined;
    const entitlement = d.prepare("SELECT expiresAt FROM entitlements WHERE userId = ? AND feature IN ('pro','pro.appstore') ORDER BY (expiresAt IS NULL) DESC, expiresAt DESC LIMIT 1").get(userId) as { expiresAt: string | null } | undefined;
    const base: SubscriptionSnapshot = { active: !!p, expiresAt: p ? entitlement?.expiresAt ?? null : null, periodId: p?.id ?? null, periodStart: p?.startsAt ?? null, periodEnd: p?.endsAt ?? null, monthlyLimitCents: p?.monthlyCents ?? 0, monthlyUsedCents: 0, weeklyStart: null, weeklyEnd: null, weeklyLimitCents: p?.weeklyCents ?? 0, weeklyUsedCents: 0, availableCents: 0, walletFallbackEnabled: !!fallback?.walletFallbackEnabled, cloudStorageBytes: p ? SUBSCRIPTION_LIMITS.cloudStorageBytes : 0, relayBytes: SUBSCRIPTION_LIMITS.relayBytes, autoRenew: appstoreRenewalSnapshot(userId, d) };
    if (!p) {
        const bqtUntil = bqtProRightsUntil(userId, now);
        return bqtUntil ? { ...base, active: true, expiresAt: bqtUntil, cloudStorageBytes: SUBSCRIPTION_LIMITS.cloudStorageBytes, source: 'bqt' } : base;
    }
    const weekStart = new Date(Date.parse(p.startsAt) + Math.floor((Date.parse(now) - Date.parse(p.startsAt)) / (7 * DAY)) * 7 * DAY).toISOString();
    const weekEnd = new Date(Math.min(Date.parse(p.endsAt), Date.parse(weekStart) + 7 * DAY)).toISOString();
    const sums = d.prepare('SELECT COALESCE(SUM(amountCents),0) AS monthly, COALESCE(SUM(CASE WHEN weekStart = ? THEN amountCents ELSE 0 END),0) AS weekly FROM subscription_usage WHERE periodId = ?').get(weekStart, p.id) as { monthly: number; weekly: number };
    return { ...base, monthlyUsedCents: sums.monthly, weeklyUsedCents: sums.weekly, weeklyStart: weekStart, weeklyEnd: weekEnd, availableCents: Math.max(0, Math.min(p.monthlyCents - sums.monthly, p.weeklyCents - sums.weekly)) };
}

export function setWalletFallback(userId: string, enabled: boolean): void {
    getDb().prepare('INSERT INTO subscription_preferences(userId,walletFallbackEnabled) VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET walletFallbackEnabled=excluded.walletFallbackEnabled').run(userId, enabled ? 1 : 0);
}

/** Funding authorization captured before work starts, and retained across expiry/reset boundaries. */
export interface ServiceFunding {
    periodId: number | null;
    weekStart: string | null;
    walletAllowed: boolean;
    postpaidVersion?: string;
}
export function captureServiceFunding(userId: string, now = new Date().toISOString()): ServiceFunding {
    const sub = subscriptionSnapshot(userId, now);
    return { periodId: sub.periodId, weekStart: sub.weeklyStart, walletAllowed: postpaidPolicy(userId)?.version === POSTPAID_VERSION || !sub.active || sub.walletFallbackEnabled, ...(postpaidPolicy(userId)?.version === POSTPAID_VERSION ? {postpaidVersion:POSTPAID_VERSION} : {}) };
}

/** Settle previously authorized work against its original period, never against the new week's pool. */
export function subscriptionFundingBudget(userId: string, funding: ServiceFunding, d = getDb()): number {
    if (funding.periodId == null || funding.weekStart == null) return 0;
    const period = d.prepare('SELECT * FROM subscription_period WHERE id = ? AND userId = ?').get(funding.periodId, userId) as Period | undefined;
    if (!period) return 0;
    const sums = d.prepare('SELECT COALESCE(SUM(amountCents),0) AS monthly, COALESCE(SUM(CASE WHEN weekStart = ? THEN amountCents ELSE 0 END),0) AS weekly FROM subscription_usage WHERE periodId = ?').get(funding.weekStart, period.id) as { monthly: number; weekly: number };
    return Math.max(0, Math.min(period.monthlyCents - sums.monthly, period.weeklyCents - sums.weekly));
}
