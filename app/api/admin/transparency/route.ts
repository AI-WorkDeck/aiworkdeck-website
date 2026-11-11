import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
    COST_KEYS,
    REVENUE_CHANNELS,
    blankReportData,
    deleteReport,
    getReport,
    listReceipts,
    listReports,
    parsePeriod,
    setReportStatus,
    summarizeReport,
    upsertReport,
    type CostKey,
    type CostLine,
    type Money,
    type Num,
    type RevenueChannel,
    type RevenueLine,
    type Source,
    type TransparencyReportData,
} from '@/lib/transparency';

export const dynamic = 'force-dynamic';

function unauthorized() {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function badRequest(field: string) {
    return NextResponse.json({ error: 'bad_request', field }, { status: 400 });
}

/**
 * 入参清洗。**不信任前端传来的任何一个字段**：这份 JSON 会原样落库、
 * 原样出现在公开页与导出的 Markdown 里，一个 NaN 或一个超长字符串
 * 就够把公开账目变成一页乱码。所以整份数据在这里重建一遍，
 * 只有认识的键、合法的值才进得去。
 */
class BadShape extends Error {}

function asSource(v: unknown): Source {
    return v === 'auto' ? 'auto' : 'manual';
}

function asNote(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.slice(0, 300) : undefined;
}

function asNum(v: unknown, field: string): Num {
    const o = (v ?? {}) as Record<string, unknown>;
    let value: number | null = null;
    if (o.value !== null && o.value !== undefined && o.value !== '') {
        const n = Number(o.value);
        if (!Number.isFinite(n) || n < 0) throw new BadShape(field);
        value = Math.round(n);
    }
    return { value, source: asSource(o.source), note: asNote(o.note) };
}

function asMoney(v: unknown, field: string): Money {
    const o = (v ?? {}) as Record<string, unknown>;
    let cents: number | null = null;
    if (o.cents !== null && o.cents !== undefined && o.cents !== '') {
        const n = Number(o.cents);
        if (!Number.isFinite(n) || n < 0) throw new BadShape(field);
        cents = Math.round(n);
    }
    if (o.currency !== 'CNY' && o.currency !== 'USD') throw new BadShape(`${field}.currency`);
    return { cents, currency: o.currency, source: asSource(o.source), note: asNote(o.note) };
}

function asText(v: unknown, max: number): string {
    return typeof v === 'string' ? v.slice(0, max) : '';
}

function sanitize(input: unknown): TransparencyReportData {
    const raw = (input ?? {}) as Record<string, any>;
    const blank = blankReportData();
    const metricsRaw = raw.metrics ?? {};

    const revenue: RevenueLine[] = (Array.isArray(raw.revenue) ? raw.revenue : [])
        .slice(0, 20)
        .map((line: any, i: number) => {
            const channel = REVENUE_CHANNELS.includes(line?.channel as RevenueChannel)
                ? (line.channel as RevenueChannel)
                : null;
            if (!channel) throw new BadShape(`revenue[${i}].channel`);
            return {
                channel,
                gross: asMoney(line.gross, `revenue[${i}].gross`),
                fee: asMoney(line.fee, `revenue[${i}].fee`),
            };
        });

    const costs: CostLine[] = (Array.isArray(raw.costs) ? raw.costs : [])
        .slice(0, 40)
        .map((line: any, i: number) => {
            const key = COST_KEYS.includes(line?.key as CostKey) ? (line.key as CostKey) : null;
            if (!key) throw new BadShape(`costs[${i}].key`);
            const label = typeof line.label === 'string' && line.label.trim() ? line.label.slice(0, 80) : undefined;
            return { key, amount: asMoney(line.amount, `costs[${i}].amount`), label };
        });

    let usdToCnyRate: number | null = null;
    if (raw.usdToCnyRate !== null && raw.usdToCnyRate !== undefined && raw.usdToCnyRate !== '') {
        const n = Number(raw.usdToCnyRate);
        if (!Number.isFinite(n) || n <= 0 || n > 1000) throw new BadShape('usdToCnyRate');
        usdToCnyRate = n;
    }

    return {
        metrics: {
            usersTotal: asNum(metricsRaw.usersTotal ?? blank.metrics.usersTotal, 'metrics.usersTotal'),
            usersNew: asNum(metricsRaw.usersNew ?? blank.metrics.usersNew, 'metrics.usersNew'),
            installsTotal: asNum(metricsRaw.installsTotal ?? blank.metrics.installsTotal, 'metrics.installsTotal'),
            installsActive: asNum(metricsRaw.installsActive ?? blank.metrics.installsActive, 'metrics.installsActive'),
            downloads: asNum(metricsRaw.downloads ?? blank.metrics.downloads, 'metrics.downloads'),
        },
        revenue,
        costs,
        founderCosts: asMoney(raw.founderCosts ?? blank.founderCosts, 'founderCosts'),
        usdToCnyRate,
        donation: {
            amount: asMoney(raw.donation?.amount ?? blank.donation.amount, 'donation.amount'),
            org: asText(raw.donation?.org, 200),
            note: asText(raw.donation?.note, 2000),
        },
        remarks: asText(raw.remarks, 5000),
    };
}

function withDetail(period: string) {
    const report = getReport(period);
    if (!report) return null;
    return { report, summary: summarizeReport(report.data), receipts: listReceipts(period) };
}

/** `?period=` 取单期（含凭证与汇总）；不带参数列全部期次（草稿也列——这是后台）。 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) return unauthorized();
    const period = request.nextUrl.searchParams.get('period');
    if (!period) {
        return NextResponse.json({
            reports: listReports().map((r) => ({
                period: r.period,
                status: r.status,
                publishedAt: r.publishedAt,
                updatedAt: r.updatedAt,
            })),
        });
    }
    try {
        parsePeriod(period);
    } catch {
        return badRequest('period');
    }
    const detail = withDetail(period);
    if (!detail) {
        return NextResponse.json({ report: null, summary: null, receipts: [] });
    }
    return NextResponse.json(detail);
}

/** 存草稿 / 改内容。状态不动——已发布的期次改了错字不该悄悄下线。 */
export async function PUT(request: NextRequest) {
    if (!isAdminRequest(request)) return unauthorized();
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return badRequest('body');
    }
    const period = typeof body.period === 'string' ? body.period : '';
    try {
        parsePeriod(period);
    } catch {
        return badRequest('period');
    }
    let data: TransparencyReportData;
    try {
        data = sanitize(body.data);
    } catch (e) {
        return badRequest(e instanceof BadShape ? e.message : 'data');
    }
    upsertReport(period, data);
    return NextResponse.json(withDetail(period));
}

/** 发布 / 撤回。 */
export async function PATCH(request: NextRequest) {
    if (!isAdminRequest(request)) return unauthorized();
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return badRequest('body');
    }
    const period = typeof body.period === 'string' ? body.period : '';
    try {
        parsePeriod(period);
    } catch {
        return badRequest('period');
    }
    if (body.status !== 'draft' && body.status !== 'published') return badRequest('status');
    if (!getReport(period)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    setReportStatus(period, body.status);
    return NextResponse.json(withDetail(period));
}

export async function DELETE(request: NextRequest) {
    if (!isAdminRequest(request)) return unauthorized();
    const period = request.nextUrl.searchParams.get('period') ?? '';
    try {
        parsePeriod(period);
    } catch {
        return badRequest('period');
    }
    deleteReport(period);
    return NextResponse.json({ ok: true });
}
