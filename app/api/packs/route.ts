import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { listPacks } from '@/lib/packs-store';

export const dynamic = 'force-dynamic';

/** 我的原生资源包提交列表（含各版本审核状态） */
export async function GET(request: NextRequest) {
    const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.json({ packs: listPacks({ authorId: user.id }) });
}
