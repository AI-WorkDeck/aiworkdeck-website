import { GatewayError } from '../errors';
import { type GatewayVendorConfig } from '../config';

/**
 * 供应商适配层的公共类型与参数校验。
 *
 * 每家上游一个 adapter 文件，adapter 只做两件事：**把参数翻译成上游请求**，
 * **把上游响应翻译成 `{units, data}`**。它不碰 Credits、不碰幂等、不碰定价——
 * 那三样在 route 里统一处理，否则每接一家就要重抄一遍记账逻辑，抄到第三家必然漏。
 *
 * `units` 是**上游返回的真实计量**，是唯一的计价依据。
 * adapter 拿不到真实计量时（例如一次企业工商查询就是一次调用）返回 1，
 * 与该服务 `service_pricing.unit = 'call'` 对应。
 *
 * `estimateUnits` 是**客户端申报值的解释**，只用于预扣估算与余额闸，
 * 且在 route 里受 `maxUnitsPerCall` 硬约束。默认与 units 无关，恒为 1。
 */

export interface AdapterResult {
    /** 上游真实计量。计价只认这个值。 */
    units: number;
    /** 原样回给桌面端的数据 */
    data: unknown;
}

export interface AdapterContext {
    userId: string;
    vendor: GatewayVendorConfig;
    signal: AbortSignal;
}

export type AdapterOp = (params: Record<string, unknown>, ctx: AdapterContext) => Promise<AdapterResult>;

export interface ServiceAdapter {
    service: string;
    ops: Record<string, AdapterOp>;
    /** 按客户端申报的参数估一个计量，用于预扣与余额闸。默认 1。 */
    estimateUnits?: (op: string, params: Record<string, unknown>) => number;
    /** 各 op 的上游超时（毫秒）。缺省 30 秒。 */
    timeoutMs?: (op: string) => number;
}

export function requireString(params: Record<string, unknown>, name: string): string {
    const v = params[name];
    if (typeof v !== 'string' || v.trim() === '') {
        throw new GatewayError('bad_request', `缺少参数 ${name}`);
    }
    return v;
}

export function optionalString(params: Record<string, unknown>, name: string): string | undefined {
    const v = params[name];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

export function objectParam(params: Record<string, unknown>, name: string): Record<string, unknown> {
    const v = params[name];
    if (v === undefined || v === null) return {};
    if (typeof v !== 'object' || Array.isArray(v)) {
        throw new GatewayError('bad_request', `参数 ${name} 必须是对象`);
    }
    return v as Record<string, unknown>;
}

/**
 * 缺凭证时**一律 not_configured，绝不半残执行**。
 *
 * 半残执行的形态是「少一项凭证也照发请求」：上游回一个我们没预料到的 4xx，
 * 被归成 upstream_failed，用户看到的是「供应商挂了」，而真实原因是我们没配好。
 * 缺哪几项一并带回去，运维才知道该补什么。
 */
export function requireVendorFields<K extends keyof GatewayVendorConfig>(
    vendor: GatewayVendorConfig,
    service: string,
    fields: K[]
): { [P in K]: string } {
    const missing = fields.filter((f) => !vendor[f]);
    if (missing.length > 0) {
        throw new GatewayError('not_configured', `平台尚未配置「${service}」服务的凭证`, {
            missing,
        });
    }
    return Object.fromEntries(fields.map((f) => [f, String(vendor[f])])) as { [P in K]: string };
}

/**
 * MCP 供应商（法宝 / 企查查 MCP）的响应是否是 MCP 层错误：
 * JSON-RPC `error` 对象，或 `result.isError === true`（如 "Unknown tool: xxx"）。
 * 正文可能是 JSON，也可能是 SSE（`data: {...}` 行），两种都认。
 */
export function isMcpErrorBody(text: string): boolean {
    const candidates: string[] = [text];
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('data:')) candidates.push(line.slice(5).trim());
    }
    for (const c of candidates) {
        try {
            const msg = JSON.parse(c) as { error?: unknown; result?: { isError?: unknown } };
            if (msg && typeof msg === 'object' && (msg.error || msg.result?.isError === true)) return true;
        } catch {
            // 不是 JSON，试下一个候选
        }
    }
    return false;
}

/**
 * MCP 供应商成功交付的结果。MCP 层错误时 units=0 → 不计费，
 * 但正文仍原样放在 data.raw，桌面端解析器照常把错误文本展示给用户。
 */
export function mcpRawResult(text: string): AdapterResult {
    return { units: isMcpErrorBody(text) ? 0 : 1, data: { raw: text } };
}
