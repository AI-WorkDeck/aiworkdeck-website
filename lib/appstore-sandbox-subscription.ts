// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Isolated App Review ledger. Never imports or writes the production funding database. */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { JWSTransactionDecodedPayload, JWSRenewalInfoDecodedPayload } from '@apple/app-store-server-library';

const PRODUCT = 'pro.monthly.cny.149';
export class SandboxSubscriptionRejected extends Error {
  constructor(public readonly code: string) { super(code); }
}
const reject = (code: string): never => { throw new SandboxSubscriptionRejected(code); };
export function sandboxAllowed(userId: string): boolean {
  return !!userId && !userId.startsWith('deleted:') &&
    (process.env.APPSTORE_SANDBOX_ACCOUNT_IDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(userId);
}
function allowed(userId: string) { if (!sandboxAllowed(userId)) reject('sandbox_account_not_allowed'); }
let db: Database.Database | undefined;
function ledger() {
  if (db) return db;
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filename = path.join(dir, 'appstore-sandbox.sqlite');
  db = new Database(filename);
  fs.chmodSync(filename, 0o600);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS account(userId TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS retired_token(token TEXT PRIMARY KEY, userId TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS subscription(originalId TEXT PRIMARY KEY, userId TEXT NOT NULL, autoRenew INTEGER, renewalSignedAt INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS receipt(transactionId TEXT PRIMARY KEY, originalId TEXT NOT NULL, userId TEXT NOT NULL,
      startsAt INTEGER NOT NULL, endsAt INTEGER NOT NULL, revokedAt INTEGER, signedAt INTEGER NOT NULL);`);
  return db;
}
/**
 * `sharedToken`: the account's production appAccountToken. An allowlisted account may also buy for real on
 * an App Store build; one token valid in both ledgers lets the verified transaction environment pick the
 * ledger. A replaced token stays mapped so earlier sandbox renewals still resolve.
 */
export function prepareSandboxSubscription(userId: string, sharedToken?: string) {
  allowed(userId);
  const d = ledger();
  return d.transaction(() => {
    const token = sharedToken?.toLowerCase();
    const current = d.prepare('SELECT token FROM account WHERE userId=?').get(userId) as {token: string} | undefined;
    if (token && current && current.token !== token) {
      d.prepare('INSERT OR IGNORE INTO retired_token(token,userId) VALUES (?,?)').run(current.token, userId);
      d.prepare('UPDATE account SET token=? WHERE userId=?').run(token, userId);
    }
    d.prepare('INSERT OR IGNORE INTO account(userId,token) VALUES (?,?)').run(userId, token ?? randomUUID());
    const row = d.prepare('SELECT token FROM account WHERE userId=?').get(userId) as {token: string};
    return { productId: PRODUCT, appAccountToken: row.token, sandbox: true };
  })();
}
function tokenOwner(d: Database.Database, token: string): string | undefined {
  const t = token.toLowerCase();
  const row = (d.prepare('SELECT userId FROM account WHERE token=?').get(t)
    ?? d.prepare('SELECT userId FROM retired_token WHERE token=?').get(t)) as {userId: string} | undefined;
  return row?.userId;
}
function timestamp(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value! <= 0 || value! > 8640000000000000) reject('invalid_transaction');
  return value!;
}
/** Routing hint after signature verification; apply still rechecks the current allowlist. */
export function sandboxMappedUserId(tx: JWSTransactionDecodedPayload): string | null {
  if (tx.environment !== 'Sandbox' || !tx.appAccountToken) return null;
  return tokenOwner(ledger(), tx.appAccountToken) ?? null;
}
/** Caller must first verify Apple certificate chain, bundle ID and Sandbox environment. */
export function applySandboxSubscription(tx: JWSTransactionDecodedPayload, expectedUserId?: string,
  renewal?: JWSRenewalInfoDecodedPayload, refundReversed = false) {
  if (tx.environment !== 'Sandbox') reject('environment_mismatch');
  if (tx.productId !== PRODUCT || tx.type !== 'Auto-Renewable Subscription' || tx.inAppOwnershipType !== 'PURCHASED') reject('invalid_product');
  if (!tx.transactionId || !tx.originalTransactionId || !tx.appAccountToken) reject('invalid_transaction');
  const start = timestamp(tx.purchaseDate), end = timestamp(tx.expiresDate), signed = timestamp(tx.signedDate);
  const revoked = tx.revocationDate == null ? null : timestamp(tx.revocationDate);
  if (end <= start || start > Date.now() + 300000) reject('invalid_period');
  if (renewal && (renewal.environment !== 'Sandbox' || renewal.originalTransactionId !== tx.originalTransactionId || renewal.productId !== PRODUCT || (renewal.appAccountToken && renewal.appAccountToken.toLowerCase() !== tx.appAccountToken!.toLowerCase()))) reject('renewal_mismatch');
  const d = ledger();
  return d.transaction(() => {
    const owner = tokenOwner(d, tx.appAccountToken!);
    if (!owner || (expectedUserId && owner !== expectedUserId)) reject('account_mismatch');
    const userId = owner!;
    allowed(userId);
    const original = tx.originalTransactionId!, transaction = tx.transactionId!;
    const binding = d.prepare('SELECT userId FROM subscription WHERE originalId=?').get(original) as {userId: string} | undefined;
    if (binding && binding.userId !== userId) reject('account_mismatch');
    const previous = d.prepare('SELECT * FROM receipt WHERE transactionId=?').get(transaction) as {userId: string; originalId: string; signedAt: number; revokedAt: number | null} | undefined;
    if (previous && (previous.userId !== userId || previous.originalId !== original)) reject('transaction_mismatch');
    d.prepare('INSERT OR IGNORE INTO subscription(originalId,userId) VALUES (?,?)').run(original, userId);
    if (!previous || signed > previous.signedAt || (revoked && !previous.revokedAt && signed === previous.signedAt)) {
      const effectiveRevoked = refundReversed && previous && signed > previous.signedAt && revoked === null ? null : previous?.revokedAt ?? revoked;
      d.prepare(`INSERT INTO receipt VALUES (?,?,?,?,?,?,?) ON CONFLICT(transactionId) DO UPDATE SET
        endsAt=excluded.endsAt,revokedAt=excluded.revokedAt,signedAt=excluded.signedAt`)
        .run(transaction, original, userId, start, end, effectiveRevoked, signed);
    }
    if (renewal && (renewal.autoRenewStatus === 0 || renewal.autoRenewStatus === 1)) {
      const renewalSigned = timestamp(renewal.signedDate);
      d.prepare('UPDATE subscription SET autoRenew=?,renewalSignedAt=? WHERE originalId=? AND renewalSignedAt<?')
        .run(renewal.autoRenewStatus, renewalSigned, original, renewalSigned);
    }
    return { userId, duplicate: !!previous, sandbox: true };
  })();
}
export function sandboxSubscriptionSnapshot(userId: string, now = Date.now()) {
  allowed(userId);
  const row = ledger().prepare(`SELECT r.startsAt, MIN(r.endsAt,COALESCE(r.revokedAt,r.endsAt)) AS effectiveEnd,s.autoRenew
    FROM receipt r JOIN subscription s ON s.originalId=r.originalId WHERE r.userId=?
    ORDER BY effectiveEnd DESC LIMIT 1`).get(userId) as {startsAt:number;effectiveEnd:number;autoRenew:number|null} | undefined;
  const active = !!row && row.startsAt <= now && row.effectiveEnd > now;
  return { sandbox: true, active, expiresAt: row ? new Date(row.effectiveEnd).toISOString() : null,
    periodId: null, periodStart: row ? new Date(row.startsAt).toISOString() : null,
    periodEnd: row ? new Date(row.effectiveEnd).toISOString() : null,
    monthlyLimitCents: 0, monthlyUsedCents: 0, weeklyStart: null, weeklyEnd: null,
    weeklyLimitCents: 0, weeklyUsedCents: 0, availableCents: 0, walletFallbackEnabled: false,
    cloudStorageBytes: 0, relayBytes: 0,
    autoRenew: row ? {provider: 'appstore' as const, productId: PRODUCT, enabled: row.autoRenew === null ? null : !!row.autoRenew, expiresAt: new Date(row.effectiveEnd).toISOString()} : null };
}
