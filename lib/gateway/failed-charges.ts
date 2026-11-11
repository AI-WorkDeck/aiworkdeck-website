import { getDb } from '../db';
import { findUserById } from '../users';
import { isMcpErrorBody } from './adapters/types';

/**
 * 对账报表：网关已扣费、但上游正文其实是 MCP 层错误（`isError` / JSON-RPC error）的调用。
 * 只读。金额取自 wallet_ledger 里 spendLedgerId 指向的真实扣减行，不假设单价。
 * 1 Credit = 1 分（账本 amountCents 即 Credits 的最小单位），故 credits 与 cents 同值。
 * 已有 refundOf 指向该扣减行的退款流水的调用单列为 refunded，不计入待退合计。
 */

export interface FailedChargeUser {
    userId: string;
    username: string | null;
    displayName: string | null;
    calls: number;
    amountCents: number;
}

export interface FailedChargeReport {
    service: string;
    from: string | null;
    to: string | null;
    totals: { calls: number; amountCents: number; amountCredits: number; refundedCalls: number };
    firstFailureAt: string | null;
    lastFailureAt: string | null;
    perOp: { op: string; calls: number; amountCents: number }[];
    users: FailedChargeUser[];
}

interface Row {
    userId: string;
    op: string;
    createdAt: string;
    responseJson: string | null;
    chargedCents: number | null;
    refunded: number;
}

function rawBody(responseJson: string | null): string | null {
    if (!responseJson) return null;
    try {
        const raw = (JSON.parse(responseJson) as { data?: { raw?: unknown } })?.data?.raw;
        return typeof raw === 'string' ? raw : null;
    } catch {
        return null;
    }
}

/** from/to 为 YYYY-MM-DD（UTC），to 含当日。 */
export function failedChargeReport(service: string, from?: string | null, to?: string | null): FailedChargeReport {
    const fromIso = from ? `${from}T00:00:00.000Z` : null;
    const toIso = to ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString() : null;
    const rows = getDb()
        .prepare(
            `SELECT g.userId, g.op, g.createdAt, g.responseJson,
                    -l.amountCents AS chargedCents,
                    EXISTS (SELECT 1 FROM wallet_ledger r
                             WHERE json_extract(r.meta, '$.refundOf') = g.spendLedgerId) AS refunded
               FROM gateway_request g
               LEFT JOIN wallet_ledger l ON l.id = g.spendLedgerId
              WHERE g.service = ? AND g.spendLedgerId IS NOT NULL
                AND (? IS NULL OR g.createdAt >= ?)
                AND (? IS NULL OR g.createdAt < ?)
              ORDER BY g.createdAt`
        )
        .all(service, fromIso, fromIso, toIso, toIso) as Row[];

    const users = new Map<string, FailedChargeUser>();
    const ops = new Map<string, { op: string; calls: number; amountCents: number }>();
    let calls = 0, amount = 0, refundedCalls = 0;
    let first: string | null = null, last: string | null = null;
    for (const r of rows) {
        const body = rawBody(r.responseJson);
        if (body === null || !isMcpErrorBody(body)) continue;
        if (r.refunded) { refundedCalls++; continue; }
        const cents = r.chargedCents ?? 0;
        calls++; amount += cents;
        first ??= r.createdAt;
        last = r.createdAt;
        const u = users.get(r.userId) ?? (() => {
            const found = findUserById(r.userId);
            const n: FailedChargeUser = {
                userId: r.userId,
                username: found?.username ?? null,
                displayName: found?.displayName ?? null,
                calls: 0,
                amountCents: 0,
            };
            users.set(r.userId, n);
            return n;
        })();
        u.calls++; u.amountCents += cents;
        const o = ops.get(r.op) ?? { op: r.op, calls: 0, amountCents: 0 };
        o.calls++; o.amountCents += cents;
        ops.set(r.op, o);
    }
    return {
        service, from: from ?? null, to: to ?? null,
        totals: { calls, amountCents: amount, amountCredits: amount, refundedCalls },
        firstFailureAt: first, lastFailureAt: last,
        perOp: [...ops.values()].sort((a, b) => b.calls - a.calls),
        users: [...users.values()].sort((a, b) => b.amountCents - a.amountCents || b.calls - a.calls),
    };
}

function csvCell(v: string | number | null): string {
    const s = v === null ? '' : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function failedChargeCsv(report: FailedChargeReport): string {
    const lines = ['userId,username,displayName,calls,amountCents,amountCredits'];
    for (const u of report.users) {
        lines.push([u.userId, u.username, u.displayName, u.calls, u.amountCents, u.amountCents].map(csvCell).join(','));
    }
    return lines.join('\n') + '\n';
}
