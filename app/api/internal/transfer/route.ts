import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { findUserById } from '@/lib/users';
import { getSpendableBalance, InsufficientCreditsError } from '@/lib/credits';
import { requireEnabledPricing, creditsFor, assertUnitsWithinCap } from '@/lib/gateway/pricing';
import { chargeTransfer, refundTransfer } from '@/lib/gateway/spend';
import { GatewayError, isGatewayError } from '@/lib/gateway/errors';
import * as idem from '@/lib/gateway/idempotency';

export const dynamic = 'force-dynamic';

/**
 * 跨设备文件传输的窄权限内部记账口（设计 §2.4，dev-board#251 / 卡内官网侧）。
 *
 * **这不是桌面契约端点**：不出现在 doc/desktop-contract.md，不走 Bearer awdk_。
 * 调用方是同机部署的云后端（Spring，`addin.*` 那台机的 mobile 服务），走
 * `127.0.0.1:<next端口>` 直连；公网侧由 nginx 对 `location ^~ /api/internal/`
 * 直接 `return 404` 兜底（部署清单见 DEPLOY.md 新增小节）。
 *
 * **鉴权**：header `X-Internal-Secret` 恒定时间比较 env `AWD_TRANSFER_BILLING_SECRET`。
 * env 未配置（未开通该功能的默认状态）或 header 缺失/不符——**一律 404**，不是
 * 401/403：功能在没配置的部署上必须表现成「路由不存在」而不是「存在但被拒绝」，
 * 这样探测不出这条内部口子的存在。
 *
 * **窄权限，与被否决的方案是不同风险类**：桌面/插件那条被否决的「凭 accountId
 * 换任意 awdk_ Key」换出的是能任意花用户余额、调用任意网关服务的通用凭据；
 * 这条口子只做一件事——按 accountId 对 `transfer/relay` 一种计价项扣/退
 * `service_spend`，金额永远由服务端按 service_pricing 现算，调用方连数字都改不了，
 * 也拿不到任何可复用的凭据。
 *
 * accountId → 用户：accountId 就是 `/api/account/me` 回的那个字段
 * （users.json 的 uuid 主键），同一份 `findUserById` 反查；查无同样回 404，
 * 不区分「密钥不对」与「账户不存在」——两者对外的下一步没有区别的必要。
 */

function timingSafeEqualStr(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** 与「这条路由压根不存在」在观感上不可区分：空响应体、404。 */
function notFound(): NextResponse {
    return new NextResponse(null, { status: 404 });
}

function badRequest(message: string): NextResponse {
    return NextResponse.json({ error: 'bad_request', message }, { status: 400 });
}

/** GatewayError → 对应状态码信封；其余未预期的异常按 500 处理，不假装是网关业务错误。 */
function errorResponse(e: unknown): NextResponse {
    if (isGatewayError(e)) {
        return NextResponse.json(e.toBody(), { status: e.status });
    }
    return NextResponse.json({ error: 'internal_error', message: '内部记账口处理失败' }, { status: 500 });
}

const BYTES_PER_GB = 1024 ** 3;

/** body.bytes 必须是正整数字节数（JSON number）；非法一律 bad_request。 */
function readBytes(body: Record<string, unknown>): number {
    const bytes = body.bytes;
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) {
        throw new GatewayError('bad_request', 'bytes 必须是正整数');
    }
    return bytes;
}

/**
 * ledgerId 在云后端那边落的是 TEXT 列（chargeLedgerId string 64），
 * 经 JSON 转述给我们时可能是 number 也可能是数字字符串，两种都接。
 */
function readLedgerId(body: Record<string, unknown>): number {
    const raw = body.ledgerId;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
    if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw)) return Number(raw);
    throw new GatewayError('bad_request', '缺少或不合法的 ledgerId');
}

export async function POST(request: NextRequest) {
    const secret = process.env.AWD_TRANSFER_BILLING_SECRET;
    if (!secret) return notFound();

    const provided = request.headers.get('x-internal-secret');
    if (!provided || !timingSafeEqualStr(provided, secret)) return notFound();

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return badRequest('请求体不是合法 JSON');
    }

    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    const user = accountId ? findUserById(accountId) : undefined;
    if (!user) return notFound();

    const action = body.action;

    try {
        if (action === 'quote') {
            const bytes = readBytes(body);
            const row = requireEnabledPricing('transfer', 'relay');
            const units = bytes / BYTES_PER_GB;
            assertUnitsWithinCap(row, units);
            const credits = creditsFor(row, units);
            return NextResponse.json({ ok: true, credits, balanceCents: getSpendableBalance(user.id) });
        }

        if (action === 'charge') {
            const bytes = readBytes(body);
            const refId = typeof body.refId === 'string' && body.refId ? body.refId : undefined;
            if (!refId) throw new GatewayError('bad_request', '缺少 refId');
            const idempotencyKey = idem.assertValidKey(
                typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null
            );

            const row = requireEnabledPricing('transfer', 'relay');
            const units = bytes / BYTES_PER_GB;
            assertUnitsWithinCap(row, units);
            const credits = creditsFor(row, units);

            // 占键在计价之后、真扣钱之前——前面任何一条拒绝都不该留下一行 in_flight。
            const claimed = idem.claim(user.id, idempotencyKey, 'transfer', 'charge');
            if (claimed.kind === 'replay') {
                return NextResponse.json(claimed.response);
            }

            let ledgerId: number;
            try {
                const entry = chargeTransfer({ userId: user.id, bytes, credits, refId });
                ledgerId = entry.id;
            } catch (e) {
                idem.fail(user.id, idempotencyKey);
                if (e instanceof InsufficientCreditsError) {
                    return NextResponse.json(
                        {
                            error: 'no_credits',
                            availableCents: e.availableCents,
                            requiredCents: e.requiredCents,
                        },
                        { status: 409 }
                    );
                }
                throw e;
            }

            const response = { ok: true, credits, ledgerId };
            try {
                idem.complete(user.id, idempotencyKey, response, ledgerId);
            } catch {
                // 与网关正路由同款兜底：幂等结果写不进去 = 云后端重试会被再扣一次，
                // 不如把已扣的钱退回去并让本次失败（云后端按 UNAVAILABLE 处理）。
                refundTransfer({ userId: user.id, spendLedgerId: ledgerId });
                return NextResponse.json(
                    { error: 'upstream_failed', message: '记账暂时不可用，请稍后重试' },
                    { status: 502 }
                );
            }
            return NextResponse.json(response);
        }

        if (action === 'refund') {
            const spendLedgerId = readLedgerId(body);
            refundTransfer({ userId: user.id, spendLedgerId });
            return NextResponse.json({ ok: true });
        }

        return badRequest(`未知 action：${String(action)}`);
    } catch (e) {
        return errorResponse(e);
    }
}
