import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { listCostAccounts, refreshAutoBalances, maybeSendCostAlert } from '@/lib/cost-ledger';

export const dynamic = 'force-dynamic';

/**
 * 成本台账的定时刷新入口：拉自动余额（OpenRouter / 阿里云）落快照，
 * 有账户跌破阈值时给维护者发预警邮件（72 小时内不重发）。
 *
 * 后台页的「立即刷新」按钮与 cron 打的是同一个端点——只有一份取数与预警逻辑。
 * 鉴权沿用 credits/expire 的既有口径：cron 直接带 awd_admin cookie。
 *
 * crontab（每天早上 8 点半，北京时间上班前把隔夜消耗算进去）：
 *   30 8 * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" \
 *     http://127.0.0.1:3000/api/admin/costs/refresh >> /var/log/awd-cost-refresh.log 2>&1
 */
export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const refresh = await refreshAutoBalances();
    const accounts = listCostAccounts();
    const alert = await maybeSendCostAlert(accounts).catch((e) => ({
        sent: false,
        reason: `alert_error:${e instanceof Error ? e.message : String(e)}`,
    }));
    return NextResponse.json({
        ok: true,
        at: new Date().toISOString(),
        ...refresh,
        alert,
        accounts,
    });
}
