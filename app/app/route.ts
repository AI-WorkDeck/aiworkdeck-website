import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { SITE_ID } from '@/lib/site-config';
import { resolveAppLink } from '@/lib/mobile-stores';
import { resolveRequestLocale } from '@/middleware';

/**
 * 智能短链 /app：按 UA 把手机送进对应应用商店；桌面/未知 UA 落到带二维码的选择页。
 * 302 + no-store，目标以后可换。
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const ua = request.headers.get('user-agent') ?? '';
    const ref = request.nextUrl.searchParams.get('ref');
    if (ref) {
        try {
            fs.appendFileSync(
                path.join(process.cwd(), 'data', 'start-refs.jsonl'),
                JSON.stringify({ at: new Date().toISOString(), ref: ref.slice(0, 64), mobile: /Mobile|Android|iPhone|iPad/i.test(ua), app: true }) + '\n'
            );
        } catch { /* 统计尽力而为 */ }
    }

    const decision = resolveAppLink(ua, SITE_ID);
    // 相对路径 Location：站点在反代后面，不依赖请求里看到的内部 host
    const location = decision.kind === 'redirect' ? decision.url : `/${resolveRequestLocale(request)}/get-app`;
    return new NextResponse(null, {
        status: 302,
        headers: { Location: location, 'Cache-Control': 'no-store', Vary: 'User-Agent' },
    });
}
