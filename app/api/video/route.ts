import { NextRequest, NextResponse } from 'next/server';
import { signDownloadUrl } from '@/lib/download-sign';
import { isKnownVideoId, videoFileFor, VIDEO_CDN_BASE } from '@/lib/videos';

/**
 * 视频出口：点播放时现签 CDN 限时链接并 302（签名逻辑同 /api/download）。
 * 只放行 lib/videos.ts 目录里登记过的 id，防止被当成任意路径签名器。
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
    const id = request.nextUrl.searchParams.get('id') ?? '';
    if (!isKnownVideoId(id)) {
        return NextResponse.json({ error: 'unknown_video' }, { status: 404 });
    }
    const poster = request.nextUrl.searchParams.get('kind') === 'poster';
    const res = NextResponse.redirect(signDownloadUrl(`${VIDEO_CDN_BASE}/${videoFileFor(id)}.${poster ? 'jpg' : 'mp4'}`), 302);
    // 签名 1 小时有效。封面每次签名 URL 都不同，跳转本身缓存半小时，免得每次进页都重下全部封面；
    // 视频跳转不缓存，点播放时总拿新签名。
    res.headers.set('Cache-Control', poster ? 'private, max-age=1800' : 'no-store');
    return res;
}
