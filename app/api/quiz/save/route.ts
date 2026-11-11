import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { saveQuizResult } from '@/lib/quiz-results';
import { QUIZ_TYPE_MAP } from '@/lib/quiz-data';

/**
 * 登录用户把「法人格」结果存到个人主页（dev-board#329 维护者追加需求）。
 * 一人一条，重测覆盖；未登录 401（客户端据此切换成注册 CTA）。
 */
export async function POST(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: { typeId?: string; dims?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const type = QUIZ_TYPE_MAP[body.typeId ?? ''];
    const dims = Array.isArray(body.dims) && body.dims.length === 3 && body.dims.every(
        n => Number.isInteger(n) && n >= 0 && n <= 99
    ) ? (body.dims as [number, number, number]) : type?.dims;
    if (!type || !dims) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    saveQuizResult(user.id, type.id, dims);
    return NextResponse.json({ ok: true });
}
