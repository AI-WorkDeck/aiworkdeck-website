import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { collectAutoFigures, remoteOrigin, syncToken } from '@/lib/transparency-auto';
import { parsePeriod } from '@/lib/transparency';

export const dynamic = 'force-dynamic';

/** 后台「自动取数」：本站 + 国际站合并。远端拉不到照样返回本站数字，界面据此提示。 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const period = request.nextUrl.searchParams.get('period') ?? '';
    try {
        parsePeriod(period);
    } catch {
        return NextResponse.json({ error: 'bad_request', field: 'period' }, { status: 400 });
    }
    const result = await collectAutoFigures(period, { includeRemote: true });
    return NextResponse.json({ ...result, remoteOrigin: remoteOrigin(), syncConfigured: !!syncToken() });
}
