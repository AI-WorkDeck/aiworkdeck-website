import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername, findUserById, isDeletedUser } from '@/lib/users';
import { deletedDisplayName } from '@/lib/account-deletion';
import { resolveRequestLocale } from '@/lib/api-locale';
import { getSessionUser } from '@/lib/sessions';
import { isAdminRequest } from '@/lib/admin';
import { listComments, addComment, deleteComment } from '@/lib/profile-comments';

/**
 * 作者主页评论（dev-board#306）。GET 公开，POST/DELETE 需登录。
 * 错误文案不含「登录/未授权/请先」（桌面端掉线判定子串，同 profile-sections 路由）。
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ username: string }> }) {
    const lang = resolveRequestLocale(request);
    const { username } = await ctx.params;
    const profileUser = findUserByUsername(decodeURIComponent(username));
    if (!profileUser) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const comments = listComments(profileUser.id).map(c => {
        const deleted = !!c.deletedAt;
        const author = findUserById(c.authorUserId);
        const authorAlive = !!author && !isDeletedUser(author);
        return {
            id: c.id,
            ...(c.parentId && { parentId: c.parentId }),
            content: deleted ? '' : c.content,
            createdAt: c.createdAt,
            ...(deleted && { deleted: true }),
            author: {
                id: c.authorUserId,
                username: authorAlive ? author!.username : '',
                displayName: authorAlive ? author!.displayName : deletedDisplayName(lang),
                avatarUpdatedAt: authorAlive ? author!.avatarUpdatedAt : undefined,
            },
        };
    });
    return NextResponse.json({ comments });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ username: string }> }) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { username } = await ctx.params;
    const profileUser = findUserByUsername(decodeURIComponent(username));
    if (!profileUser) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    let body: { content?: unknown; parentId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'empty' }, { status: 400 });
    }

    const { comment, error } = addComment({
        profileUserId: profileUser.id,
        authorUserId: user.id,
        content: typeof body.content === 'string' ? body.content : '',
        parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
    });
    if (error) {
        return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ comment });
}

export async function DELETE(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: { id?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const ok = !!id && deleteComment(id, user.id, isAdminRequest(request));
    if (!ok) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
