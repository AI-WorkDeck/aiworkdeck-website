import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { parsePeriod, renderReportMarkdown } from '@/lib/transparency';

export const dynamic = 'force-dynamic';

/** 导出一期的 GitHub 版 Markdown。半年报要同时出现在官网和仓库里，这是仓库那一份。 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const period = request.nextUrl.searchParams.get('period') ?? '';
    let normalized: string;
    try {
        normalized = parsePeriod(period).period;
    } catch {
        return NextResponse.json({ error: 'bad_request', field: 'period' }, { status: 400 });
    }
    let markdown: string;
    try {
        markdown = renderReportMarkdown(normalized);
    } catch {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return new NextResponse(markdown, {
        headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="transparency-${normalized}.md"`,
        },
    });
}
