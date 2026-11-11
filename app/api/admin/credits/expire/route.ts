import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { withTransaction } from '@/lib/db';
import { expireCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';

/**
 * 奖励批次到期清理（定时任务入口）。
 *
 * 做成端点而不是独立脚本，是为了**只有一份到期逻辑**：脚本里另写一遍 SQL，
 * 迟早会与 lib/credits.ts 漂移，而这是钱。
 *
 * 余额的正确性不依赖本任务——getBalance 本就把过期批次排除在外。
 * 这里只负责把批次剩余清零并补一行 expire 流水，让用户在流水里看得到发生了什么。
 * 因此漏跑一天不会算错钱，只是流水晚一天出现。
 *
 * 鉴权沿用后台唯一凭据：awd_admin cookie 的值就是 AWD_ADMIN_TOKEN 原文，
 * 所以 cron 直接带 cookie 即可，不必为一个定时任务把 Bearer 也放进 isAdminRequest
 * （那会同时放宽全部 admin 端点的入口）。
 *
 * crontab（每天凌晨 4 点，与 backup-db 的 3 点错开）：
 *   0 4 * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" \
 *     http://127.0.0.1:3000/api/admin/credits/expire >> /var/log/awd-credits-expire.log 2>&1
 */
export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const result = withTransaction(db => expireCredits(db));
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
