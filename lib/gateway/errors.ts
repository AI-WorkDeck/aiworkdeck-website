import { NextResponse } from 'next/server';

/**
 * 网关错误码族。
 *
 * **三类故障必须分开**，因为桌面端要据此给不同文案与不同的下一步：
 * 「我们还没开放这项服务」「上游供应商挂了」「我们自己的服务器不可达」
 * 在用户眼里会落成同一句话，而正确的下一步完全不同。
 *
 * 桌面端既有的 AccountException.Kind 把 5xx 一律归 NETWORK，文案是
 * 「无法连接 AI WorkDeck 服务器，请检查网络后重试」——把我们的故障说成
 * 用户的网络问题，用户会去重启路由器。
 *
 * **文案红线**：message 不许含「登录」「未授权」「请先」三个子串。
 * 桌面端 frontend/src/services/api.js 拿它们判掉线并清会话，
 * 「余额不足请先充值」正好三个全踩中。`assertSafeMessage` 在构造时就拦住。
 */

export type GatewayErrorCode =
    /** service_pricing.enabled = 0，产品尚未提供这项服务 */
    | 'service_disabled'
    /** 上游供应商返回错误或超时 */
    | 'upstream_failed'
    /** 余额不足 */
    | 'no_credits'
    /** 请求本身不合法（缺幂等键、计量超上限、参数缺失） */
    | 'bad_request'
    /** 同一幂等键的上一次调用还在途 */
    | 'in_flight'
    /** 单次任务累计花费超过用户设定的上限，可确认后继续 */
    | 'budget_exceeded'
    /** 我们自己没配好（缺供应商凭证） */
    | 'not_configured';

/** 各错误码对应的 HTTP 状态码。**一律不用 401/403**——桌面端把 4xx 判为凭据失效，
 *  401/403 会让它立刻清空已购权益缓存。鉴权失败由路由层单独回 401，那是真的凭据问题。 */
const STATUS: Record<GatewayErrorCode, number> = {
    service_disabled: 409,
    upstream_failed: 502,
    no_credits: 409,
    bad_request: 400,
    in_flight: 409,
    budget_exceeded: 409,
    not_configured: 503,
};

/** 掉线判定子串。命中即说明这条文案会被桌面端误判成「未登录」并清掉本地会话。 */
const LOGOUT_LOOKALIKES = ['登录', '未授权', '请先'];

export function assertSafeMessage(message: string): void {
    for (const s of LOGOUT_LOOKALIKES) {
        if (message.includes(s)) {
            throw new Error(
                `网关错误文案命中掉线判定子串「${s}」，会让桌面端清空本地会话：${message}`
            );
        }
    }
}

export class GatewayError extends Error {
    readonly code: GatewayErrorCode;
    readonly status: number;
    readonly detail?: Record<string, unknown>;

    constructor(code: GatewayErrorCode, message: string, detail?: Record<string, unknown>) {
        assertSafeMessage(message);
        super(message);
        this.name = 'GatewayError';
        this.code = code;
        this.status = STATUS[code];
        this.detail = detail;
    }

    toBody(): Record<string, unknown> {
        return { error: this.code, message: this.message, ...(this.detail ?? {}) };
    }
}

export function isGatewayError(e: unknown): e is GatewayError {
    return e instanceof GatewayError;
}

/**
 * 异常 → HTTP 信封。**所有网关路由共用这一个**：
 * 状态码映射与「未知异常一律 502 而不是 500」这条口径抄第二遍就会走样，
 * 而走样的方向通常是漏个 4xx 出去——桌面端把 4xx 判为凭据失效，代价是清空权益缓存。
 */
export function gatewayErrorResponse(e: unknown): NextResponse {
    if (isGatewayError(e)) {
        return NextResponse.json(e.toBody(), { status: e.status });
    }
    if (e instanceof Error && e.name === 'AbortError') {
        return NextResponse.json(
            { error: 'upstream_failed', message: '上游服务响应超时，请稍后重试' },
            { status: 504 }
        );
    }
    return NextResponse.json(
        { error: 'upstream_failed', message: '服务暂时不可用，请稍后重试' },
        { status: 502 }
    );
}
