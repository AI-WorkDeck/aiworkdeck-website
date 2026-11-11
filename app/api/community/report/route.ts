import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { addReport } from '@/lib/forum';

/** 举报（UGC 治理最小闸，dev-board#316）：登录可举报帖子/评论，同人同目标去重。 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: { targetType?: unknown; targetId?: unknown; reason?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'empty_target' }, { status: 400 });
    }
    const targetType = body.targetType === 'comment' ? 'comment' : 'post';
    const { error } = addReport({
        targetType,
        targetId: typeof body.targetId === 'string' ? body.targetId : '',
        reporterUserId: user.id,
        reason: typeof body.reason === 'string' ? body.reason : '',
    });
    if (error) {
        return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}
