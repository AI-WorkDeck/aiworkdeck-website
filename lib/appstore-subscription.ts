// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { JWSTransactionDecodedPayload, JWSRenewalInfoDecodedPayload } from '@apple/app-store-server-library';
import { getDb, withTransaction } from './db';
import { SUBSCRIPTION_LIMITS } from './saas-pricing';
import { appstoreEnv, appstoreAdapter } from './payments/appstore-adapter';
import { siteConfig } from './site-config';

export const APPSTORE_PRO_MONTHLY = 'pro.monthly.cny.149';
export const APPSTORE_PRO_FEATURE = 'pro.appstore';
export class SubscriptionRejected extends Error {
  constructor(public readonly code: string) { super(code); }
}
const reject = (code: string): never => { throw new SubscriptionRejected(code); };

export function appstoreSubscriptionCapability() {
  return { available: process.env.APPSTORE_SUBSCRIPTIONS_ENABLED === 'true'
    && siteConfig.currency === 'CNY' && appstoreAdapter.isConfigured(), productId: APPSTORE_PRO_MONTHLY };
}

/** Called only after an explicit purchase action and authenticated account resolution. */
export function prepareAppstoreSubscription(userId: string) {
  if (!appstoreSubscriptionCapability().available) reject('not_available');
  return withTransaction(d => {
    const existing = d.prepare("SELECT 1 FROM entitlements WHERE userId=? AND feature='pro' AND (expiresAt IS NULL OR expiresAt>?)")
      .get(userId, new Date().toISOString());
    if (existing) reject('existing_subscription');
    d.prepare('INSERT OR IGNORE INTO appstore_subscription_account(userId,appAccountToken) VALUES (?,?)')
      .run(userId, crypto.randomUUID());
    const account = d.prepare('SELECT appAccountToken FROM appstore_subscription_account WHERE userId=?').get(userId) as { appAccountToken: string };
    return { productId: APPSTORE_PRO_MONTHLY, appAccountToken: account.appAccountToken };
  });
}

/**
 * The account's production appAccountToken, created on first use. For sandbox-allowlisted accounts, whose
 * purchase may land in either environment; ordinary accounts go through prepareAppstoreSubscription.
 */
export function appstoreAccountToken(userId: string): string {
  return withTransaction(d => {
    d.prepare('INSERT OR IGNORE INTO appstore_subscription_account(userId,appAccountToken) VALUES (?,?)')
      .run(userId, crypto.randomUUID());
    return (d.prepare('SELECT appAccountToken FROM appstore_subscription_account WHERE userId=?').get(userId) as { appAccountToken: string }).appAccountToken;
  });
}

function iso(value: number | undefined): string {
  if (!Number.isSafeInteger(value) || value! <= 0) return reject('invalid_transaction');
  return new Date(value!).toISOString();
}

/** Input MUST have passed Apple's signature, bundle and environment verification. */
export function applyAppstoreSubscription(tx: JWSTransactionDecodedPayload, expectedUserId?: string,
  renewal?: JWSRenewalInfoDecodedPayload, refundReversed = false) {
  if (siteConfig.currency !== 'CNY' || tx.environment !== appstoreEnv()) reject('environment_mismatch');
  if (tx.productId !== APPSTORE_PRO_MONTHLY || tx.type !== 'Auto-Renewable Subscription' || tx.inAppOwnershipType !== 'PURCHASED') reject('invalid_product');
  const transactionId = tx.transactionId;
  const original = tx.originalTransactionId;
  if (!transactionId || !original || !tx.appAccountToken || !Number.isSafeInteger(tx.signedDate)) reject('invalid_transaction');
  const startsAt = iso(tx.purchaseDate), endsAt = iso(tx.expiresDate);
  const revokedAt = tx.revocationDate ? iso(tx.revocationDate) : null;
  if (endsAt <= startsAt || tx.purchaseDate! > Date.now() + 300000) reject('invalid_period');
  if (renewal && (renewal.originalTransactionId !== original || renewal.productId !== APPSTORE_PRO_MONTHLY
    || renewal.environment !== appstoreEnv())) reject('renewal_mismatch');
  return withTransaction(d => {
    const account = d.prepare('SELECT userId FROM appstore_subscription_account WHERE appAccountToken=?')
      .get(tx.appAccountToken!.toLowerCase()) as { userId: string } | undefined;
    if (!account || account.userId.startsWith('deleted:') || (expectedUserId && account.userId !== expectedUserId)) reject('account_mismatch');
    const userId = account!.userId;
    const bound = d.prepare('SELECT userId FROM appstore_subscription WHERE originalTransactionId=?').get(original) as { userId: string } | undefined;
    if (bound && bound.userId !== userId) reject('account_mismatch');
    const seen = d.prepare('SELECT * FROM appstore_subscription_transaction WHERE transactionId=?').get(transactionId) as {
      userId: string; originalTransactionId: string; signedAt: number; revokedAt: string | null;
    } | undefined;
    if (seen && (seen.userId !== userId || seen.originalTransactionId !== original)) reject('transaction_mismatch');
    d.prepare('INSERT OR IGNORE INTO appstore_subscription(originalTransactionId,userId,productId) VALUES (?,?,?)')
      .run(original, userId, APPSTORE_PRO_MONTHLY);
    // Never let an old purchase replay undo a refund. A later renewal has its own transaction ID.
    if (!seen || tx.signedDate! > seen.signedAt || (revokedAt && !seen.revokedAt && tx.signedDate === seen.signedAt)) {
      const revoked = refundReversed && seen && tx.signedDate! > seen.signedAt && !revokedAt
        ? null : seen?.revokedAt ?? revokedAt;
      const effectiveEnd = revoked && revoked < endsAt ? revoked : endsAt;
      d.prepare(`INSERT INTO appstore_subscription_transaction(transactionId,originalTransactionId,userId,startsAt,endsAt,revokedAt,signedAt)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(transactionId) DO UPDATE SET endsAt=excluded.endsAt,
        revokedAt=excluded.revokedAt,signedAt=MAX(signedAt,excluded.signedAt)`)
        .run(transactionId, original, userId, startsAt, endsAt, revoked, tx.signedDate);
      // Same shared allowance ledger; Apple supplies the calendar-month boundaries. No wallet grant.
      d.prepare(`INSERT INTO subscription_period(userId,outTradeNo,cycle,startsAt,endsAt,monthlyCents,weeklyCents)
        VALUES (?,?,0,?,?,?,?) ON CONFLICT(outTradeNo,cycle) DO UPDATE SET endsAt=excluded.endsAt`)
        .run(userId, `appstore:${transactionId}`, startsAt, effectiveEnd, SUBSCRIPTION_LIMITS.monthlyCents, SUBSCRIPTION_LIMITS.weeklyCents);
    }
    if (renewal && renewal.signedDate && (renewal.autoRenewStatus === 0 || renewal.autoRenewStatus === 1)) {
      d.prepare(`UPDATE appstore_subscription SET autoRenewEnabled=?,renewalSignedAt=?
        WHERE originalTransactionId=? AND renewalSignedAt < ?`)
        .run(renewal.autoRenewStatus, renewal.signedDate, original, renewal.signedDate);
    }
    const expiry = d.prepare(`SELECT MAX(CASE WHEN revokedAt IS NOT NULL AND revokedAt < endsAt THEN revokedAt ELSE endsAt END) AS end
      FROM appstore_subscription_transaction WHERE userId=?`).get(userId) as { end: string };
    // Separate provenance preserves independently purchased or gifted Pro on refund/expiry.
    d.prepare(`INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES (?,?,?,?,?)
      ON CONFLICT(userId,feature) DO UPDATE SET expiresAt=excluded.expiresAt`)
      .run(userId, APPSTORE_PRO_FEATURE, `appstore:${original}`, startsAt, expiry.end);
    return { userId, duplicate: !!seen };
  });
}

export function appstoreRenewalSnapshot(userId: string, d: Database.Database = getDb()) {
  const row = d.prepare(`SELECT s.productId,s.autoRenewEnabled,MAX(CASE WHEN t.revokedAt IS NOT NULL AND t.revokedAt < t.endsAt THEN t.revokedAt ELSE t.endsAt END) AS expiresAt
    FROM appstore_subscription s JOIN appstore_subscription_transaction t USING(originalTransactionId)
    WHERE s.userId=? GROUP BY s.originalTransactionId ORDER BY expiresAt DESC LIMIT 1`)
    .get(userId) as { productId: string; autoRenewEnabled: number | null; expiresAt: string } | undefined;
  return row ? { provider: 'appstore' as const, productId: row.productId,
    enabled: row.autoRenewEnabled === null ? null : !!row.autoRenewEnabled, expiresAt: row.expiresAt } : null;
}
