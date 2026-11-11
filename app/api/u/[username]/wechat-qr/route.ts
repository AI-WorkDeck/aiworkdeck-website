import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername } from '@/lib/users';
import { readWechatQr } from '@/lib/profile-sections';

/** 作者主页联系方式模块的微信二维码图（作者添加即公开，dev-board#303） */
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, ctx: { params: Promise<{ username: string }> }) {
    const { username } = await ctx.params;
    const user = findUserByUsername(decodeURIComponent(username));
    if (!user) return new NextResponse(null, { status: 404 });
    const buf = readWechatQr(user.id);
    if (!buf) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(buf), {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=300' },
    });
}
