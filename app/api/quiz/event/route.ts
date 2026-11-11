import { NextRequest, NextResponse } from 'next/server';
import { logQuizEvent, QUIZ_EVENTS, type QuizEvent } from '@/lib/quiz-results';
import { QUIZ_TYPE_MAP, sanitizeNickname } from '@/lib/quiz-data';

/**
 * 「法人格」埋点（dev-board#329）：客户端转化事件（start/complete/download）。
 * 事件名白名单，非法请求静默丢弃（埋点没有值得报错的失败）。
 */
export async function POST(request: NextRequest) {
    let body: { ev?: string; from?: string; typeId?: string; n?: string; v?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: true });
    }
    if ((QUIZ_EVENTS as readonly string[]).includes(body.ev ?? '')) {
        const nickname = typeof body.n === 'string' ? sanitizeNickname(body.n) : '';
        logQuizEvent(body.ev as QuizEvent, {
            from: typeof body.from === 'string' ? body.from : undefined,
            typeId: body.typeId && QUIZ_TYPE_MAP[body.typeId] ? body.typeId : undefined,
            n: nickname || undefined,
            v: body.v === 'biz' ? 'biz' : undefined,
        });
    }
    return NextResponse.json({ ok: true });
}
