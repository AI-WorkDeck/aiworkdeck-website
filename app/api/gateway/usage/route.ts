import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { monthlyUsageByService } from '@/lib/gateway/usage';
import { getBalance } from '@/lib/credits';
import { accountBillingFields, bqtDisplayBalanceCents } from '@/lib/bqt-account';
import { pendingHoldCents } from '@/lib/gateway/spend';

export const dynamic = 'force-dynamic';

/**
 * 本月各项服务的 Credits 消耗。桌面端「平台服务」面板每项服务旁边那个数字。
 *
 * **刻意与 `/api/gateway/pricing` 分开，不合并进去**：单价是几乎不动的配置，
 * 桌面端给它挂了 10 分钟 TTL 缓存；用量是花一笔就要变的数字。合成一个端点，
 * 两种保鲜要求就得互相迁就——要么缓存把用量冻住十分钟（用户刚转写完看不到扣费），
 * 要么为了用量取消缓存（每次工具调用都来问一遍单价）。分开各取所需。
 *
 * 口径见 lib/gateway/usage.ts：预扣三行账里只算 settle，hold 已被 release 冲销。
 */
export async function GET(request: NextRequest) {
    const user = resolveKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const usage = monthlyUsageByService(user.id);
    return NextResponse.json({
        ...usage,
        // 顺带回余额与占用中的预扣：面板要在同一屏里回答「本月花了多少 / 还剩多少 /
        // 有多少正被一项没出结果的任务占着」，分三个端点问会拿到三个时刻的快照。
        balanceCents: bqtDisplayBalanceCents(user.id) ?? getBalance(user.id),
        pendingHoldCents: pendingHoldCents(user.id),
        ...accountBillingFields(user.id),
    });
}
