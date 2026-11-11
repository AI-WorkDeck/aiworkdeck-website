// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Read-only shadow-period reconciliation for one site (doc/postpaid-billing.md, "Shadow period").
 * Opens the SQLite file with readonly + query_only and never imports lib/db (which would migrate).
 * Usage (on the site box, repo root):
 *   NEXT_PUBLIC_AWD_SITE=cn node --experimental-strip-types scripts/postpaid-shadow-reconcile.mts [--db data/awd.db] [--from ISO] [--to ISO]
 * Prints one JSON report on stdout. Exit code 0 even when checks fail; read report.checks.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const GIB = 1073741824, DAY = 86400, SAFETY_LIMIT_BYTES = 100 * GIB, MAX_GAP_SECONDS = 3600, MIN_DAYS = 7;
const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const site = option('--site') ?? process.env.NEXT_PUBLIC_AWD_SITE ?? 'cn';
if (site !== 'cn' && site !== 'intl') throw new Error('--site must be cn or intl');
const currency = site === 'intl' ? 'USD' : 'CNY';
const rates = { storage: site === 'intl' ? 3 : 20, egress: site === 'intl' ? 15 : 60 };
const file = path.resolve(option('--db') ?? path.join(process.cwd(), 'data', 'awd.db'));
const from = option('--from') ?? '0000';
const to = option('--to') ?? new Date().toISOString();
const at = to.length > 4 ? to : new Date().toISOString();

const db = new Database(file, { readonly: true, fileMustExist: true });
db.pragma('query_only = ON');

type Event = { userId: string; eventId: string; kind: string; fromAt: string | null; toAt: string; bytes: string; byteSeconds: string; includedByteSeconds: string; wouldChargeCents: number; rateCents: number; currency: string; anomaly: string | null };
const events = db.prepare('SELECT userId,eventId,kind,fromAt,toAt,bytes,byteSeconds,includedByteSeconds,wouldChargeCents,rateCents,currency,anomaly FROM postpaid_shadow_event WHERE toAt>=? AND toAt<=? ORDER BY userId,kind,toAt').all(from, to) as Event[];

const anomalies: { type: string; userId?: string; eventId?: string; detail?: string }[] = [];
type Row = { userId: string; storageByteSeconds: bigint; includedByteSeconds: bigint; storageCents: number; egressBytes: bigint; egressCents: number; firstAt: string | null; lastAt: string | null; maxStoredBytes: bigint };
const users = new Map<string, Row>();
const row = (userId: string) => {
    let r = users.get(userId);
    if (!r) users.set(userId, r = { userId, storageByteSeconds: BigInt(0), includedByteSeconds: BigInt(0), storageCents: 0, egressBytes: BigInt(0), egressCents: 0, firstAt: null, lastAt: null, maxStoredBytes: BigInt(0) });
    return r;
};
let maxGapSeconds = 0;
for (const e of events) {
    const r = row(e.userId);
    if (e.anomaly) { anomalies.push({ type: e.anomaly, userId: e.userId, eventId: e.eventId }); continue; }
    if (e.currency !== currency) anomalies.push({ type: 'currency_mismatch', userId: e.userId, eventId: e.eventId, detail: `${e.currency} on ${currency} site` });
    if (e.rateCents !== rates[e.kind as 'storage' | 'egress']) anomalies.push({ type: 'rate_mismatch', userId: e.userId, eventId: e.eventId, detail: String(e.rateCents) });
    const bytes = BigInt(e.bytes);
    if (bytes < BigInt(0) || e.wouldChargeCents < 0) { anomalies.push({ type: 'negative_reading', userId: e.userId, eventId: e.eventId }); continue; }
    if (e.kind === 'egress') { r.egressBytes += bytes; r.egressCents += e.wouldChargeCents; continue; }
    if (e.kind !== 'storage') { anomalies.push({ type: 'unknown_kind', userId: e.userId, eventId: e.eventId, detail: e.kind }); continue; }
    if (bytes > r.maxStoredBytes) r.maxStoredBytes = bytes;
    r.firstAt ??= e.fromAt ?? e.toAt; r.lastAt = e.toAt;
    if (e.fromAt === null) continue; // baseline reading
    const seconds = (Date.parse(e.toAt) - Date.parse(e.fromAt)) / 1000;
    const total = BigInt(e.byteSeconds), included = BigInt(e.includedByteSeconds);
    // Recompute the integral: a stored total that disagrees with bytes x duration is an impossible reading.
    if (seconds <= 0 || total !== bytes * BigInt(Date.parse(e.toAt) - Date.parse(e.fromAt)) / BigInt(1000) || included > total) {
        anomalies.push({ type: 'impossible_reading', userId: e.userId, eventId: e.eventId }); continue;
    }
    if (seconds > MAX_GAP_SECONDS) anomalies.push({ type: 'gap', userId: e.userId, eventId: e.eventId, detail: `${Math.round(seconds)}s` });
    maxGapSeconds = Math.max(maxGapSeconds, seconds);
    if (bytes > BigInt(SAFETY_LIMIT_BYTES)) anomalies.push({ type: 'over_safety_limit', userId: e.userId, eventId: e.eventId, detail: e.bytes });
    r.storageByteSeconds += total; r.includedByteSeconds += included; r.storageCents += e.wouldChargeCents;
}

const one = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
const gib = (n: bigint, perDay = false) => Number(n * BigInt(1000) / BigInt(GIB) / (perDay ? BigInt(DAY) : BigInt(1))) / 1000;
const report = [...users.values()].map(r => {
    const accepted = !!one<{ n: number } | undefined>('SELECT 1 n FROM postpaid_policy WHERE userId=?', r.userId);
    const period = one<{ id: number; startsAt: string; monthlyCents: number; weeklyCents: number } | undefined>(`SELECT p.id,p.startsAt,p.monthlyCents,p.weeklyCents FROM subscription_period p WHERE p.userId=? AND p.startsAt<=? AND p.endsAt>?
        AND EXISTS(SELECT 1 FROM entitlements e WHERE e.userId=p.userId AND e.feature IN ('pro','pro.appstore') AND (e.expiresAt IS NULL OR e.expiresAt>?)) ORDER BY p.startsAt LIMIT 1`, r.userId, at, at, at);
    let allowanceAvailableCents = 0;
    if (period) {
        const weekStart = new Date(Date.parse(period.startsAt) + Math.floor((Date.parse(at) - Date.parse(period.startsAt)) / (7 * DAY * 1000)) * 7 * DAY * 1000).toISOString();
        const used = one<{ monthly: number; weekly: number }>('SELECT COALESCE(SUM(amountCents),0) monthly, COALESCE(SUM(CASE WHEN weekStart=? THEN amountCents ELSE 0 END),0) weekly FROM subscription_usage WHERE periodId=?', weekStart, period.id);
        allowanceAvailableCents = Math.max(0, Math.min(period.monthlyCents - used.monthly, period.weeklyCents - used.weekly));
    }
    const grantCents = one<{ n: number }>('SELECT COALESCE(SUM(amountCents),0) n FROM postpaid_grant WHERE userId=? AND startsAt<=? AND endsAt>?', r.userId, at, at).n;
    const walletCents = one<{ n: number }>('SELECT COALESCE(SUM(remainingCents),0) n FROM credit_lots WHERE userId=? AND (expiresAt IS NULL OR expiresAt>?)', r.userId, at).n;
    const paidOtherCurrency = one<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE userId=? AND status='paid' AND currency<>?", r.userId, currency).n;
    if (paidOtherCurrency) anomalies.push({ type: 'currency_mismatch', userId: r.userId, detail: `${paidOtherCurrency} paid orders not in ${currency}` });
    if (accepted) anomalies.push({ type: 'live_account_in_shadow', userId: r.userId });
    const creditLimitCents = (period?.monthlyCents ?? 0) + grantCents;
    const wouldChargeCents = r.storageCents + r.egressCents;
    const fromAllowance = Math.min(wouldChargeCents, allowanceAvailableCents);
    const fromWallet = Math.min(wouldChargeCents - fromAllowance, walletCents);
    const owedCents = wouldChargeCents - fromAllowance - fromWallet;
    const days = r.firstAt && r.lastAt ? (Date.parse(r.lastAt) - Date.parse(r.firstAt)) / 86400000 : 0;
    const projectedMonthlyCents = days > 0 ? Math.ceil(wouldChargeCents * 30 / days) : 0;
    return {
        userId: r.userId, accepted, observedDays: Math.round(days * 100) / 100,
        storage: { gibDays: gib(r.storageByteSeconds, true), includedGibDays: gib(r.includedByteSeconds, true), billableGibDays: gib(r.storageByteSeconds - r.includedByteSeconds, true), maxStoredGib: gib(r.maxStoredBytes), wouldChargeCents: r.storageCents },
        egress: { gib: gib(r.egressBytes), wouldChargeCents: r.egressCents },
        entitlements: { subscriptionActive: !!period, includedStorageGib: period ? 3 : 0, monthlyAllowanceCents: period?.monthlyCents ?? 0, allowanceAvailableCents, promotionalGrantCents: grantCents, walletCents, creditLimitCents },
        wouldChargeCents, covered: { fromAllowance, fromWallet }, owedCents,
        overLimit: owedCents > creditLimitCents, projectedMonthlyCents, projectedOverLimit: projectedMonthlyCents > creditLimitCents + walletCents,
    };
}).sort((a, b) => b.wouldChargeCents - a.wouldChargeCents);

const unmapped = one<{ observedAt: string; users: number; bytes: string; sampleJson: string } | undefined>('SELECT observedAt,users,bytes,sampleJson FROM postpaid_shadow_unmapped WHERE observedAt<=? ORDER BY observedAt DESC LIMIT 1', to);
if (unmapped?.users) anomalies.push({ type: 'unmapped_cloud_users', detail: `${unmapped.users} users, ${gib(BigInt(unmapped.bytes))} GiB, sample ${unmapped.sampleJson}` });
const coverage = events.length ? (Date.parse(events.reduce((m, e) => e.toAt > m ? e.toAt : m, '')) - Date.parse(events.reduce((m, e) => e.toAt < m ? e.toAt : m, '9999'))) / 86400000 : 0;
const count = (type: string) => anomalies.filter(a => a.type === type).length;
const totals = report.reduce((t, u) => ({ wouldChargeCents: t.wouldChargeCents + u.wouldChargeCents, owedCents: t.owedCents + u.owedCents, storageGibDays: t.storageGibDays + u.storage.gibDays, egressGib: t.egressGib + u.egress.gib }), { wouldChargeCents: 0, owedCents: 0, storageGibDays: 0, egressGib: 0 });

console.log(JSON.stringify({
    site, currency, unit: 'currency minor units (cents/fen)', database: file, window: { from, to }, generatedAt: new Date().toISOString(),
    totals: { users: report.length, ...totals, overLimitUsers: report.filter(u => u.overLimit).length, projectedOverLimitUsers: report.filter(u => u.projectedOverLimit).length, maxGapSeconds: Math.round(maxGapSeconds), coverageDays: Math.round(coverage * 100) / 100 },
    checks: {
        coverageAtLeast7Days: coverage >= MIN_DAYS,
        noReadingAnomalies: ['negative_reading', 'future_reading', 'out_of_order', 'impossible_reading', 'unknown_kind', 'rate_mismatch'].every(t => count(t) === 0),
        noCurrencyMismatch: count('currency_mismatch') === 0,
        noGapsOverOneHour: count('gap') === 0,
        noUnmappedCloudUsers: !unmapped?.users,
        noLiveAccountsInShadow: count('live_account_in_shadow') === 0,
        unmappedReportSeen: !!unmapped,
    },
    anomalyCounts: Object.fromEntries([...new Set(anomalies.map(a => a.type))].map(t => [t, count(t)])),
    anomalies: anomalies.slice(0, 500),
    users: report,
}, null, 2));
db.close();
