// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shadow metering: what postpaid storage/egress WOULD cost, recorded only in postpaid_shadow_*.
 * Never spends, reserves, creates debt or cases, changes cloud access, or notifies.
 * Precedence: an account that accepted the live policy is billed live, so its shadow events are skipped.
 */
import { createHash } from 'crypto';
import { withTransaction } from './db';
import { postpaidPolicy, POSTPAID_VERSION } from './postpaid';
import { subscriptionSnapshot } from './subscription';
import { siteConfig } from './site-config';

const GIB = BigInt(1073741824), MONTH_SECONDS = BigInt(2592000);
const FUTURE_TOLERANCE_MS = 5 * 60000;
export const shadowEnabled = () => process.env.AWD_POSTPAID_SHADOW_ENABLED === 'true';
const storageRate = () => BigInt(siteConfig.id === 'intl' ? 3 : 20);
const egressRate = () => BigInt(siteConfig.id === 'intl' ? 15 : 60);

function reading(value: unknown): bigint {
    if (typeof value !== 'string' || !/^-?\d{1,40}$/.test(value)) throw new Error('invalid_shadow_reading');
    return BigInt(value);
}
function instant(value: unknown): string {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('invalid_shadow_reading');
    return new Date(value).toISOString();
}
function requireShadow() { if (!shadowEnabled()) throw new Error('postpaid_shadow_disabled'); }

export interface ShadowStorageInput { eventId: string; observedAt: string; storedBytes: string }
export interface ShadowEgressInput { eventId: string; observedAt: string; bytes: string; completed?: boolean }
export type ShadowResult = { recorded: boolean; skipped?: 'live'; anomaly?: string | null; wouldChargeCents?: number };

/** Integrates the previous reading over [previous, observedAt], split at historical entitlement boundaries. */
export function recordShadowStorage(userId: string, input: ShadowStorageInput, now = new Date().toISOString()): ShadowResult {
    requireShadow();
    if (!input.eventId || input.eventId.length > 200) throw new Error('invalid_shadow_reading');
    const observedAt = instant(input.observedAt), stored = reading(input.storedBytes);
    const hash = createHash('sha256').update(JSON.stringify(['storage', input.eventId, observedAt, stored.toString()])).digest('hex');
    return withTransaction(db => {
        const old = db.prepare('SELECT payloadHash,anomaly,wouldChargeCents FROM postpaid_shadow_event WHERE userId=? AND eventId=?').get(userId, input.eventId) as { payloadHash: string; anomaly: string | null; wouldChargeCents: number } | undefined;
        if (old) { if (old.payloadHash !== hash) throw new Error('usage_event_conflict'); return { recorded: false, anomaly: old.anomaly, wouldChargeCents: old.wouldChargeCents }; }
        if (postpaidPolicy(userId, db)?.version === POSTPAID_VERSION) return { recorded: false, skipped: 'live' };
        const meter = db.prepare("SELECT observedAt,bytes,remainder FROM postpaid_shadow_meter WHERE userId=? AND kind='storage'").get(userId) as { observedAt: string; bytes: string; remainder: string } | undefined;
        const anomaly = stored < BigInt(0) ? 'negative_reading'
            : Date.parse(observedAt) > Date.parse(now) + FUTURE_TOLERANCE_MS ? 'future_reading'
            : meter && Date.parse(observedAt) <= Date.parse(meter.observedAt) ? 'out_of_order' : null;
        const insert = db.prepare('INSERT INTO postpaid_shadow_event(userId,eventId,kind,payloadHash,fromAt,toAt,bytes,byteSeconds,includedByteSeconds,wouldChargeCents,rateCents,currency,anomaly,receivedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        const rate = storageRate();
        if (anomaly || !meter) {
            // The first reading is a baseline: unknown earlier occupancy is borne by the platform, as in live metering.
            insert.run(userId, input.eventId, 'storage', hash, null, observedAt, stored.toString(), '0', '0', 0, Number(rate), siteConfig.currency, anomaly, now);
            if (!anomaly) db.prepare("INSERT INTO postpaid_shadow_meter(userId,kind,observedAt,bytes) VALUES(?,'storage',?,?)").run(userId, observedAt, stored.toString());
            return { recorded: true, anomaly, wouldChargeCents: 0 };
        }
        const from = Date.parse(meter.observedAt), to = Date.parse(observedAt), bytes = BigInt(meter.bytes);
        const boundaries = new Set<number>([from, to]);
        const periods = db.prepare('SELECT startsAt,endsAt FROM subscription_period WHERE userId=? AND startsAt<? AND endsAt>?').all(userId, observedAt, meter.observedAt) as { startsAt: string; endsAt: string }[];
        for (const p of periods) { boundaries.add(Date.parse(p.startsAt)); boundaries.add(Date.parse(p.endsAt)); }
        const ents = db.prepare("SELECT createdAt,expiresAt FROM entitlements WHERE userId=? AND feature IN ('pro','pro.appstore')").all(userId) as { createdAt: string; expiresAt: string | null }[];
        for (const e of ents) { boundaries.add(Date.parse(e.createdAt)); if (e.expiresAt) boundaries.add(Date.parse(e.expiresAt)); }
        const sorted = [...boundaries].filter(t => Number.isFinite(t) && t >= from && t <= to).sort((a, b) => a - b);
        let totalMilli = BigInt(0), includedMilli = BigInt(0), billableMilli = BigInt(0);
        for (let i = 0; i < sorted.length - 1; i++) {
            const duration = BigInt(sorted[i + 1] - sorted[i]);
            const capacity = BigInt(subscriptionSnapshot(userId, new Date(sorted[i]).toISOString(), db).cloudStorageBytes);
            const free = bytes < capacity ? bytes : capacity;
            totalMilli += bytes * duration; includedMilli += free * duration; billableMilli += (bytes - free) * duration;
        }
        const denominator = GIB * MONTH_SECONDS * BigInt(1000);
        const numerator = billableMilli * rate + BigInt(meter.remainder);
        const charge = Number(numerator / denominator);
        insert.run(userId, input.eventId, 'storage', hash, meter.observedAt, observedAt, bytes.toString(), (totalMilli / BigInt(1000)).toString(), (includedMilli / BigInt(1000)).toString(), charge, Number(rate), siteConfig.currency, null, now);
        db.prepare("UPDATE postpaid_shadow_meter SET observedAt=?,bytes=?,remainder=? WHERE userId=? AND kind='storage'").run(observedAt, stored.toString(), (numerator % denominator).toString(), userId);
        return { recorded: true, anomaly: null, wouldChargeCents: charge };
    });
}

/** Records bytes the cloud actually wrote (or, for streamed responses, the response size it sent). */
export function recordShadowEgress(userId: string, input: ShadowEgressInput, now = new Date().toISOString()): ShadowResult {
    requireShadow();
    if (!input.eventId || input.eventId.length > 200) throw new Error('invalid_shadow_reading');
    const observedAt = instant(input.observedAt), bytes = reading(input.bytes);
    const hash = createHash('sha256').update(JSON.stringify(['egress', input.eventId, observedAt, bytes.toString(), input.completed === true])).digest('hex');
    return withTransaction(db => {
        const old = db.prepare('SELECT payloadHash,anomaly,wouldChargeCents FROM postpaid_shadow_event WHERE userId=? AND eventId=?').get(userId, input.eventId) as { payloadHash: string; anomaly: string | null; wouldChargeCents: number } | undefined;
        if (old) { if (old.payloadHash !== hash) throw new Error('usage_event_conflict'); return { recorded: false, anomaly: old.anomaly, wouldChargeCents: old.wouldChargeCents }; }
        if (postpaidPolicy(userId, db)?.version === POSTPAID_VERSION) return { recorded: false, skipped: 'live' };
        const anomaly = bytes < BigInt(0) ? 'negative_reading' : Date.parse(observedAt) > Date.parse(now) + FUTURE_TOLERANCE_MS ? 'future_reading' : null;
        const rate = egressRate();
        let charge = 0;
        if (!anomaly) {
            const meter = db.prepare("SELECT remainder FROM postpaid_shadow_meter WHERE userId=? AND kind='egress'").get(userId) as { remainder: string } | undefined;
            const numerator = bytes * rate + BigInt(meter?.remainder ?? '0');
            charge = Number(numerator / GIB);
            db.prepare("INSERT INTO postpaid_shadow_meter(userId,kind,remainder) VALUES(?,'egress',?) ON CONFLICT(userId,kind) DO UPDATE SET remainder=excluded.remainder").run(userId, (numerator % GIB).toString());
        }
        db.prepare('INSERT INTO postpaid_shadow_event(userId,eventId,kind,payloadHash,fromAt,toAt,bytes,wouldChargeCents,rateCents,currency,anomaly,receivedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(userId, input.eventId, 'egress', hash, null, observedAt, bytes.toString(), charge, Number(rate), siteConfig.currency, anomaly, now);
        return { recorded: true, anomaly, wouldChargeCents: charge };
    });
}

/** Cloud accounts holding data but with no account-centre mapping. Cloud user ids only, no personal data. */
export function recordShadowUnmapped(input: { observedAt: string; users: number; bytes: string; sample?: unknown }, now = new Date().toISOString()) {
    requireShadow();
    const observedAt = instant(input.observedAt), bytes = reading(input.bytes);
    if (!Number.isSafeInteger(input.users) || input.users < 0) throw new Error('invalid_shadow_reading');
    const sample = Array.isArray(input.sample) ? input.sample.filter(v => Number.isSafeInteger(v)).slice(0, 50) : [];
    withTransaction(db => db.prepare('INSERT OR IGNORE INTO postpaid_shadow_unmapped(observedAt,users,bytes,sampleJson,receivedAt) VALUES(?,?,?,?,?)').run(observedAt, input.users, bytes.toString(), JSON.stringify(sample), now));
    return { recorded: true };
}
