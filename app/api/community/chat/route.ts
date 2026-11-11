import { NextRequest, NextResponse } from 'next/server';
import type { Locale } from '@/i18n-config';
import { getSessionUser } from '@/lib/sessions';
import { isAdminRequest } from '@/lib/admin';
import { resolveRequestLocale } from '@/lib/api-locale';
import { addChatMessage, listChatSince, deleteChatMessage } from '@/lib/chat';
import { publicAuthor } from '@/lib/forum';

/**
 * 聊天室 REST 面（dev-board#317）：首次加载与轮询降级走 GET ?since=，发言走 POST。
 * 近实时增量推送在 ./stream（SSE）。游客可看、登录可发言。
 */
export const dynamic = 'force-dynamic';

function expandChatMessages(messages: ReturnType<typeof listChatSince>, lang: Locale) {
    return messages.map(m => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        author: publicAuthor(m.userId, lang),
    }));
}

export async function GET(request: NextRequest) {
    const lang = resolveRequestLocale(request);
    const sinceRaw = Number(request.nextUrl.searchParams.get('since') ?? '0');
    const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;
    const messages = listChatSince(since, since > 0 ? 200 : 100);
    const latest = messages.length > 0 ? messages[messages.length - 1].id : since;
    return NextResponse.json({ messages: expandChatMessages(messages, lang), latest });
}

export async function POST(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: { content?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'empty' }, { status: 400 });
    }
    const { message, error } = addChatMessage(user.id, typeof body.content === 'string' ? body.content : '');
    if (error) {
        return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ message: { id: message!.id } });
}

/** 管理员删消息（UGC 治理最小闸） */
export async function DELETE(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    let body: { id?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const id = typeof body.id === 'number' ? body.id : NaN;
    const ok = Number.isFinite(id) && deleteChatMessage(id);
    if (!ok) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
