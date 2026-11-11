import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { quizAdminStats } from '@/lib/quiz-results';

export const dynamic = 'force-dynamic';

/** 法人格增长面板数据（dev-board#329）：漏斗、类型分布、来源、测后注册引导 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json(quizAdminStats());
}
