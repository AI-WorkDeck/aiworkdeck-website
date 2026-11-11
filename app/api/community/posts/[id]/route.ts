import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { isAdminRequest } from '@/lib/admin';
import { deletePost, setPostFlags } from '@/lib/forum';

export const dynamic = 'force-dynamic';

/** 删帖：作者本人或管理员，软删。 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const user = await getSessionUser();
    const admin = isAdminRequest(request);
    if (!user && !admin) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { id } = await ctx.params;
    const ok = deletePost(id, user?.id ?? '', admin);
    if (!ok) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}

/** 管理员开关：置顶/精选/隐藏。 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const { id } = await ctx.params;
    let body: { pinned?: unknown; featured?: unknown; hidden?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'empty' }, { status: 400 });
    }
    const ok = setPostFlags(id, {
        ...(typeof body.pinned === 'boolean' ? { pinned: body.pinned } : {}),
        ...(typeof body.featured === 'boolean' ? { featured: body.featured } : {}),
        ...(typeof body.hidden === 'boolean' ? { hidden: body.hidden } : {}),
    });
    if (!ok) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
