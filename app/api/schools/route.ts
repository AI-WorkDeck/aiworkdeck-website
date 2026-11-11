import { NextRequest, NextResponse } from 'next/server';
import { searchSchools } from '@/lib/schools';

/** 学校选择器联想（dev-board#307）。公开只读；名单是静态数据，短缓存即可。 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    return NextResponse.json(
        { schools: searchSchools(q.slice(0, 40)) },
        { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
}
