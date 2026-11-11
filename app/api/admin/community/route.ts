import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { getDb } from '@/lib/db';
import { listOpenReports, resolveReport, publicAuthor, getPost } from '@/lib/forum';
import { listChatSince } from '@/lib/chat';

/**
 * 社区论坛后台总览（dev-board#316）：待处理举报 + 最近帖子（含已隐藏/已删）+ 最近聊天。
 * 处置动作走既有公开路由（PATCH/DELETE /api/community/*，admin cookie 即鉴权）；
 * 这里只多一个 resolve_report。
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const reports = listOpenReports().map(r => {
        let snippet = '';
        let postId = '';
        if (r.targetType === 'post') {
            const post = getPost(r.targetId);
            snippet = post ? post.title : '（帖子已不存在）';
            postId = r.targetId;
        } else {
            const row = getDb()
                .prepare('SELECT postId, content, deletedAt FROM forum_comments WHERE id = ?')
                .get(r.targetId) as { postId: string; content: string; deletedAt: string | null } | undefined;
            snippet = row ? (row.deletedAt ? '（评论已删除）' : row.content.slice(0, 120)) : '（评论已不存在）';
            postId = row?.postId ?? '';
        }
        return {
            id: r.id,
            targetType: r.targetType,
            targetId: r.targetId,
            postId,
            snippet,
            reason: r.reason,
            reporter: publicAuthor(r.reporterUserId).displayName,
            createdAt: r.createdAt,
        };
    });

    const posts = (getDb()
        .prepare('SELECT * FROM forum_posts ORDER BY createdAt DESC LIMIT 50')
        .all() as Array<Record<string, unknown>>).map(p => ({
            id: p.id,
            type: p.type,
            title: p.title,
            author: publicAuthor(p.authorUserId as string).displayName,
            createdAt: p.createdAt,
            commentCount: p.commentCount,
            pinned: p.pinned === 1,
            featured: p.featured === 1,
            hidden: !!p.hiddenAt,
            deleted: !!p.deletedAt,
        }));

    const chat = listChatSince(0, 50)
        .reverse()
        .map(m => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt,
            author: publicAuthor(m.userId).displayName,
        }));

    return NextResponse.json({ reports, posts, chat });
}

export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    let body: { action?: unknown; id?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    if (body.action === 'resolve_report' && typeof body.id === 'number') {
        if (resolveReport(body.id)) return NextResponse.json({ ok: true });
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
