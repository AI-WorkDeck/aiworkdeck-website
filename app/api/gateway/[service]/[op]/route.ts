import type { ServiceFunding } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { gatewayErrorResponse as errorResponse } from '@/lib/gateway/errors';
import { requireEnabledPricing, creditsFor, assertUnitsWithinCap } from '@/lib/gateway/pricing';
import { assertBalanceFor, chargeAfterSuccess, refundCharge } from '@/lib/gateway/spend';
import { resolveOp, adapterContext } from '@/lib/gateway/adapters';
import * as idem from '@/lib/gateway/idempotency';

export const dynamic = 'force-dynamic';

/**
 * 平台服务网关的通用同步入口（设计 §4.1）。
 *
 * 一次调用的完整顺序，**每一步的先后都有理由**：
 *
 *  1. 鉴权（Bearer awdk_）—— 唯一一处允许回 401 的地方，那是真的凭据问题
 *  2. 幂等键校验 —— 缺就 400，不给「先跑一次再说」的机会
 *  3. 请求体大小闸 —— 大对象不进 Next.js 进程（语音走 OSS 直传，见 asr 路由）
 *  4. 定价与开关 —— 不存在=not_configured（我们漏建行），关着=service_disabled（产品未开放）
 *  5. 申报计量的上限校验 —— 超限直接拒，不放行了再兜底
 *  6. 余额只读预检 —— 让用户在我们向上游付费之前就被拦住
 *  7. 占幂等键 —— 到这一步才占，前面任何一条拒绝都不该留下一行 in_flight
 *  8. 调上游
 *  9. **按上游返回的真实计量**扣费（客户端申报值到此为止只影响 5、6 两步）
 * 10. 记幂等结果
 *
 * 上游失败一律不扣费；已扣费后写幂等失败则退款（第 10 步之后才算完整交付）。
 */

/** 请求体上限。语音这类大对象走 OSS 直传，不经过这个进程。 */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ service: string; op: string }> }
) {
    const { service, op } = await params;

    const user = resolveKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let idempotencyKey: string;
    let funding: ServiceFunding;
    let body: Record<string, unknown>;
    let estimatedUnits: number;
    let pricing: ReturnType<typeof requireEnabledPricing>;

    try {
        idempotencyKey = idem.assertValidKey(request.headers.get('idempotency-key'));

        const declaredLength = Number(request.headers.get('content-length') ?? 0);
        if (declaredLength > MAX_BODY_BYTES) {
            return NextResponse.json(
                {
                    error: 'bad_request',
                    message: `请求体超过 ${MAX_BODY_BYTES / 1024 / 1024} MB 上限`,
                },
                { status: 413 }
            );
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
            return NextResponse.json(
                {
                    error: 'bad_request',
                    message: `请求体超过 ${MAX_BODY_BYTES / 1024 / 1024} MB 上限`,
                },
                { status: 413 }
            );
        }
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

        const { adapter } = resolveOp(service, op);
        pricing = requireEnabledPricing(service, op);

        estimatedUnits = adapter.estimateUnits ? adapter.estimateUnits(op, body) : 1;
        assertUnitsWithinCap(pricing, estimatedUnits);
        funding = assertBalanceFor(user.id, creditsFor(pricing, estimatedUnits));
    } catch (e) {
        return errorResponse(e);
    }

    // 占键。已完成的同键请求在这里直接回放，不重调上游、不重扣费。
    let claimed: idem.ClaimResult;
    try {
        claimed = idem.claim(user.id, idempotencyKey, service, op);
    } catch (e) {
        return errorResponse(e);
    }
    if (claimed.kind === 'replay') {
        return NextResponse.json(claimed.response, { headers: { 'x-gateway-replay': '1' } });
    }

    const { adapter, run } = resolveOp(service, op);
    const timeoutMs = adapter.timeoutMs ? adapter.timeoutMs(op) : 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let result;
    try {
        result = await run(body, adapterContext(user.id, controller.signal));
    } catch (e) {
        idem.fail(user.id, idempotencyKey);
        return errorResponse(e);
    } finally {
        clearTimeout(timer);
    }

    // 上游成功。**用真实计量计价**，客户端申报值到此为止不再参与。
    const charge = chargeAfterSuccess({
        userId: user.id,
        pricing,
        actualUnits: result.units,
        funding,
    });

    const response = {
        ok: true,
        data: result.data,
        billing: {
            service,
            op,
            units: result.units,
            unit: pricing.unit,
            chargedCents: charge.chargedCents,
        },
    };

    try {
        idem.complete(user.id, idempotencyKey, response, charge.ledgerId);
    } catch {
        // 幂等结果写不进去 = 这一笔无法被后续重试识别，用户重试会被再扣一次。
        // 与其留下这个隐患，不如把已扣的钱退回去并让本次调用失败。
        if (charge.ledgerId !== null) refundCharge(user.id, charge.ledgerId);
        return NextResponse.json(
            { error: 'upstream_failed', message: '服务暂时不可用，请稍后重试' },
            { status: 502 }
        );
    }

    return NextResponse.json(response);
}
