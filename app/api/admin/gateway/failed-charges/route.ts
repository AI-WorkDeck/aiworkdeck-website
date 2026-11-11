import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { failedChargeReport, failedChargeCsv } from '@/lib/gateway/failed-charges';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 只读对账：已扣费但上游为 MCP 错误的网关调用。
 * ?service=pkulaw&from=YYYY-MM-DD&to=YYYY-MM-DD（UTC，to 含当日）
 * &format=csv 导出全部用户行；JSON 的用户行用 &page=1&pageSize=50（上限 200）分页。
 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const q = request.nextUrl.searchParams;
    const service = q.get('service')?.trim() || 'pkulaw';
    const from = q.get('from');
    const to = q.get('to');
    for (const [field, v] of [['from', from], ['to', to]] as const) {
        if (v && (!DATE_RE.test(v) || Number.isNaN(Date.parse(v)))) {
            return NextResponse.json({ error: 'bad_request', field }, { status: 400 });
        }
    }
    const report = failedChargeReport(service, from, to);
    if (q.get('format') === 'csv') {
        return new NextResponse(failedChargeCsv(report), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="failed-charges-${service}.csv"`,
                'Cache-Control': 'no-store',
            },
        });
    }
    const pageSize = Math.min(200, Math.max(1, Number(q.get('pageSize')) || 50));
    const page = Math.max(1, Number(q.get('page')) || 1);
    return NextResponse.json({
        ...report,
        users: report.users.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, totalUsers: report.users.length },
    });
}
