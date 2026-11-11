import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { listPricing, findPricing, upsertPricing } from '@/lib/gateway/pricing';
import { getThresholds } from '@/lib/gateway/config';
import { signupGrantStats, isWithinGrantWindow } from '@/lib/signup-grant';
import { withTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 管理后台「服务定价」：`service_pricing` 全表 + 注册赠额活动的发放情况。
 *
 * 在此之前调价只能手工改库——一条 UPDATE 忘了同步重算 `creditsPerUnit`，
 * 网关就会按旧单价继续扣，而账面上的成本已经变了，毛利要等对账那天才发现是错的。
 * 走 `upsertPricing` 就不会有这个缝：单价永远由成本 × 加价率现算。
 *
 * 采购成本只在**这里**下发（`/api/gateway/pricing` 刻意不给），后台是维护者自己看的。
 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const t = getThresholds();
    return NextResponse.json({
        pricing: listPricing(),
        signupGrant: {
            amountCents: t.signupGrantCents,
            startAt: t.signupGrantStartAt,
            endAt: t.signupGrantEndAt,
            /** 此刻新注册的人能不能领到（金额为 0 或不在窗口内都是领不到） */
            active: t.signupGrantCents > 0 && isWithinGrantWindow(new Date().toISOString()),
            granted: signupGrantStats(),
        },
    });
}

function badRequest(field: string) {
    return NextResponse.json({ error: 'bad_request', field }, { status: 400 });
}

/**
 * 改一行定价。`creditsPerUnit` 不接受客户端传值——它由 `upsertPricing` 现算。
 *
 * 只能改**已存在**的行：定价行与 adapter 一一对应，凭空建一行 service 名字对不上
 * 任何 adapter 的定价，只会在网关侧变成一条永远命中不到的死配置。新服务的行随
 * adapter 一起由迁移建。
 */
export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const service = typeof body.service === 'string' ? body.service : '';
    const op = typeof body.op === 'string' ? body.op : '';
    if (!service || !op) return badRequest('service');

    const current = findPricing(service, op);
    // findPricing 会回退到通配行，而这里要改的是**这一行**——拿通配行顶替，
    // 会让「改 tts/voices」静默改到 tts/* 上去。
    if (!current || current.service !== service || current.op !== op) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const cost = Number(body.costCentsPerUnit);
    const margin = Number(body.marginMultiplier);
    const maxUnits = Number(body.maxUnitsPerCall);
    if (!Number.isFinite(cost) || cost < 0) return badRequest('costCentsPerUnit');
    // 加价率必须 > 0（表级 CHECK 也拦）：0 或负数意味着「按成本白送」乃至「倒贴」，
    // 这不是一个调价失误该有的静默后果。
    if (!Number.isFinite(margin) || margin <= 0) return badRequest('marginMultiplier');
    if (!Number.isInteger(maxUnits) || maxUnits <= 0) return badRequest('maxUnitsPerCall');
    if (typeof body.enabled !== 'boolean') return badRequest('enabled');

    // unit 不给改：它是「这项服务按什么计量」，由 adapter 从上游响应里取哪个值决定，
    // 后台改成别的只会让单价与实际计量对不上号。
    const row = upsertPricing({
        service,
        op,
        unit: current.unit,
        costCentsPerUnit: cost,
        marginMultiplier: margin,
        maxUnitsPerCall: maxUnits,
        enabled: body.enabled,
    });

    // 调价直接改变每一次调用扣多少钱，必须留痕：出现「这个月毛利怎么塌了」的时候，
    // 第一件要查的事就是有没有人在什么时候把哪一行调过。
    withTransaction((d) => {
        d.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
            new Date().toISOString(),
            'service_pricing_update',
            JSON.stringify({
                service,
                op,
                before: {
                    costCentsPerUnit: current.costCentsPerUnit,
                    marginMultiplier: current.marginMultiplier,
                    creditsPerUnit: current.creditsPerUnit,
                    maxUnitsPerCall: current.maxUnitsPerCall,
                    enabled: current.enabled,
                },
                after: {
                    costCentsPerUnit: row.costCentsPerUnit,
                    marginMultiplier: row.marginMultiplier,
                    creditsPerUnit: row.creditsPerUnit,
                    maxUnitsPerCall: row.maxUnitsPerCall,
                    enabled: row.enabled,
                },
            })
        );
    });

    return NextResponse.json({ ok: true, row });
}
