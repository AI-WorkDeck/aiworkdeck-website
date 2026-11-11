import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { isAdminRequest } from '@/lib/admin';
import { resolveRequestLocale } from '@/lib/api-locale';
import { getPost, listPostComments, addPostComment, deletePostComment, publicAuthor } from '@/lib/forum';

/**
 * 帖子评论（dev-board#316）。契约与 /api/u/[username]/comments 完全同构：
 * GET 公开、POST/DELETE 需登录，平铺 + parentId，前端组树。
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const lang = resolveRequestLocale(request);
    const { id } = await ctx.params;
    const post = getPost(id);
    if (!post || post.deletedAt || post.hiddenAt) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const comments = listPostComments(id).map(c => {
        const deleted = !!c.deletedAt;
        return {
            id: c.id,
            ...(c.parentId && { parentId: c.parentId }),
            content: deleted ? '' : c.content,
            createdAt: c.createdAt,
            ...(deleted && { deleted: true }),
            author: publicAuthor(c.authorUserId, lang),
        };
    });
    return NextResponse.json({ comments });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { id } = await ctx.params;

    let body: { content?: unknown; parentId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'empty' }, { status: 400 });
    }

    const { comment, error } = addPostComment({
        postId: id,
        authorUserId: user.id,
        content: typeof body.content === 'string' ? body.content : '',
        parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
    });
    if (error) {
        return NextResponse.json({ error }, { status: error === 'not_found' ? 404 : 400 });
    }
    return NextResponse.json({ comment: { id: comment!.id } });
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
    const ok = !!id && deletePostComment(id, user.id, isAdminRequest(request));
    if (!ok) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
