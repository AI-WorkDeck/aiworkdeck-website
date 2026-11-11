import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { listPricing } from '@/lib/gateway/pricing';
import { pendingHoldCents } from '@/lib/gateway/spend';
import { getBalance } from '@/lib/credits';
import { accountBillingFields, bqtDisplayBalanceCents } from '@/lib/bqt-account';

export const dynamic = 'force-dynamic';

/**
 * 单价表（展示用）。
 *
 * **不是扣费依据**——真正计价永远在服务端按 service_pricing 现查。
 * 这条端点存在的意义只有一个：让桌面端能在动作之前告诉用户「这次大概花多少」，
 * 以及在「平台服务」面板里显示每项服务是开放还是未开放。
 *
 * 桌面端应加 10 分钟 TTL 缓存，别每次工具调用都来问一次。
 *
 * 顺带回余额与「正被占用的预扣」：账户页要能解释「为什么我的余额少了一块，
 * 但账单上那笔转写还没出结果」——不解释的话用户会同时发现转写和 AI 对话都停了，
 * 却不知道是转写的预扣吃掉的。
 */
export async function GET(request: NextRequest) {
    const user = resolveKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const rows = listPricing().map((r) => ({
        service: r.service,
        op: r.op,
        unit: r.unit,
        creditsPerUnit: r.creditsPerUnit,
        maxUnitsPerCall: r.maxUnitsPerCall,
        enabled: r.enabled,
    }));

    return NextResponse.json({
        pricing: rows,
        balanceCents: bqtDisplayBalanceCents(user.id) ?? getBalance(user.id),
        pendingHoldCents: pendingHoldCents(user.id),
        ...accountBillingFields(user.id),
    });
}
