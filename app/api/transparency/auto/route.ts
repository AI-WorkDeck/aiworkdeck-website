import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { collectAutoFigures, syncToken } from '@/lib/transparency-auto';
import { parsePeriod } from '@/lib/transparency';

export const dynamic = 'force-dynamic';

function bearerOk(request: NextRequest): boolean {
    const token = syncToken();
    if (!token) return false;
    const header = request.headers.get('authorization') ?? '';
    const candidate = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 跨站取数口（dev-board#612）。两台服务器配同一把 `AWD_TRANSPARENCY_SYNC_TOKEN`，
 * 一边向另一边要**本站的聚合数字**——注册数、安装数、按通道汇总的收入、成本估算。
 * 逐条订单、逐个用户一概不出去，这里没有任何 PII。
 *
 * 未配置密钥时整条路由回 404 而不是 401：与「这个站没开这个口子」不可区分，
 * 省得别人拿它探测哪台机器配了跨站同步（同 §7.4 的内部记账口）。
 *
 * `includeRemote` 恒为 false：远端再去拉远端就会绕回来，两台机器互相等超时。
 */
export async function GET(request: NextRequest) {
    if (!syncToken()) return new NextResponse(null, { status: 404 });
    if (!bearerOk(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const period = request.nextUrl.searchParams.get('period') ?? '';
    try {
        parsePeriod(period);
    } catch {
        return NextResponse.json({ error: 'bad_period' }, { status: 400 });
    }
    const { local } = await collectAutoFigures(period);
    return NextResponse.json({ figures: local });
}
