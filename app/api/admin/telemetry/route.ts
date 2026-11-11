import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { isDateStr, summarizeTelemetry, TelemetrySummary } from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

/**
 * 管理后台使用统计聚合。
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD（默认最近 90 天）
 * GET ?format=csv → dailyActive + totals + matterDist 平铺为 CSV 下载
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 89 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const from = isDateStr(params.get('from')) ? (params.get('from') as string) : defaultFrom;
  const to = isDateStr(params.get('to')) ? (params.get('to') as string) : today;
  if (from > to) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
  }
  const summary = summarizeTelemetry(from, to);

  if (params.get('format') === 'csv') {
    const csv = toCsv(summary);
    // 前置 BOM，Excel 打开中文不乱码
    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="telemetry-${from}-${to}.csv"`,
      },
    });
  }
  return NextResponse.json(summary);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** dailyActive + totals + matterDist 平铺：section,key,value 三列。 */
function toCsv(s: TelemetrySummary): string {
  const lines: string[] = ['section,key,value'];
  for (const d of s.dailyActive) {
    lines.push(`daily_active,${csvCell(d.date)},${d.count}`);
  }
  for (const [k, v] of Object.entries(s.totals)) {
    lines.push(`totals,${csvCell(k)},${v}`);
  }
  for (const m of s.matterDist) {
    lines.push(`matter_dist,${csvCell(m.name)},${m.count}`);
  }
  return lines.join('\n') + '\n';
}
