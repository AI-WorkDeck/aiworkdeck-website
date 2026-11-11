import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
    listCostAccounts,
    gatewayCostDetail,
    updateCostAccount,
    findCatalogEntry,
    relayStorageUsage,
    relayOssUsage,
} from '@/lib/cost-ledger';

export const dynamic = 'force-dynamic';

/** 管理后台「成本台账」：账户清单（含日耗与可用天数推算）+ 近 7 天平台代采明细 + 存储用量。 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json({
        accounts: listCostAccounts(),
        gatewayDetail: gatewayCostDetail(),
        alertMailConfigured: !!(
            process.env.AWD_COST_ALERT_EMAIL &&
            process.env.AWD_MAIL_RESEND_KEY &&
            process.env.AWD_MAIL_FROM
        ),
        storage: { relay: await relayStorageUsage(), oss: await relayOssUsage() },
    });
}

function badRequest(field: string) {
    return NextResponse.json({ error: 'bad_request', field }, { status: 400 });
}

/**
 * 手动记账：录余额、续费日、月成本、日耗覆盖、阈值、备注。
 * 只接受目录内的账户——目录随代码走（见 lib/cost-ledger.ts 顶部），不接受凭空建行。
 */
export async function PUT(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const service = typeof body.service === 'string' ? body.service : '';
    if (!service || !findCatalogEntry(service)) return badRequest('service');

    // 数值字段的三态：字段缺席 = 不动；null = 清空；数值 = 写入
    const intField = (key: string, min = 0): number | null | undefined | 'invalid' => {
        if (!(key in body)) return undefined;
        if (body[key] === null) return null;
        const n = Number(body[key]);
        return Number.isFinite(n) && n >= min ? Math.round(n) : 'invalid';
    };

    const balanceMinor = intField('balanceMinor');
    if (balanceMinor === 'invalid' || balanceMinor === null) return badRequest('balanceMinor');
    const monthlyCostCents = intField('monthlyCostCents');
    if (monthlyCostCents === 'invalid') return badRequest('monthlyCostCents');
    const burnOverrideMinorPerDay = intField('burnOverrideMinorPerDay');
    if (burnOverrideMinorPerDay === 'invalid') return badRequest('burnOverrideMinorPerDay');
    const alertDays = intField('alertDays', 1);
    if (alertDays === 'invalid' || alertDays === null) return badRequest('alertDays');

    let expiresAt: string | null | undefined;
    if ('expiresAt' in body) {
        if (body.expiresAt === null || body.expiresAt === '') {
            expiresAt = null;
        } else if (typeof body.expiresAt === 'string' && Number.isFinite(Date.parse(body.expiresAt))) {
            expiresAt = new Date(Date.parse(body.expiresAt)).toISOString();
        } else {
            return badRequest('expiresAt');
        }
    }

    let note: string | null | undefined;
    if ('note' in body) {
        if (body.note === null || body.note === '') note = null;
        else if (typeof body.note === 'string' && body.note.length <= 500) note = body.note;
        else return badRequest('note');
    }

    updateCostAccount({
        service,
        balanceMinor,
        monthlyCostCents,
        expiresAt,
        burnOverrideMinorPerDay,
        alertDays,
        note,
    });
    return NextResponse.json({ ok: true, accounts: listCostAccounts() });
}
