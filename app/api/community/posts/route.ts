import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { addPost } from '@/lib/forum';

/**
 * 发帖（dev-board#316）。信息流与详情都是服务端渲染，这里只有 POST。
 * 错误文案不含「登录/未授权/请先」（桌面端掉线判定子串，全站惯例）。
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: { type?: unknown; title?: unknown; content?: unknown; tag?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'empty' }, { status: 400 });
    }

    const type = body.type === 'blog' ? 'blog' : 'thread';
    const { post, error } = addPost({
        type,
        title: typeof body.title === 'string' ? body.title : '',
        content: typeof body.content === 'string' ? body.content : '',
        tag: typeof body.tag === 'string' && body.tag ? body.tag : undefined,
        authorUserId: user.id,
    });
    if (error) {
        return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ post: { id: post!.id } });
}
