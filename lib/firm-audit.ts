// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 律所审计日志上报（readiness S20）。律所、角色、官网登录与账户 Key 只在官网发生，
 * 律所管理员却在案件库的「审计日志」里看——这里把这些事件推给同机案件库的内部口
 * `POST {AWD_FIRM_AUDIT_URL}/api/internal/firm-audit`（头 `X-Internal-Secret` = `AWD_FIRM_AUDIT_SECRET`，
 * 与名录 / 计费的密钥各不相同；案件库侧 `AWD_AUDIT_INGEST_SECRET` 配同一个值）。
 *
 * - **不挡官网请求**：`emitFirmAudit` 立即返回，发送在后台；失败重试 3 次（0 / 1s / 4s），每次 3s 超时。
 * - **幂等**：每条事件一个 `eventId`，重试带同一个，案件库按它去重。
 * - **只报律所的事**：没有律所（`firmId` 为空）不发；两个 env 任一未配（国际站与本地开发的默认态）不发。
 * - **隐私**：只发动作、操作人展示名与账户 id、对象、少量白名单标量；绝不发口令、验证码、Key 明文或哈希。
 */
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export type FirmAuditAction =
    | 'FIRM_MEMBER_JOINED'
    | 'FIRM_MEMBER_LEFT'
    | 'FIRM_MEMBER_REMOVED'
    | 'FIRM_ROLE_CHANGED'
    | 'FIRM_TEAM_JOINED'
    | 'FIRM_TEAM_LEFT'
    | 'FIRM_TEAM_REMOVED'
    | 'FIRM_CREATED'
    | 'FIRM_JOIN_CODE_REGENERATED'
    | 'WEBSITE_LOGIN_FAILED'
    | 'ACCOUNT_API_KEY_CREATED'
    | 'ACCOUNT_API_KEY_REVOKED';

export type FirmAuditDetail = Record<string, string | number | boolean | null | undefined>;

export interface FirmAuditInput {
    firmId: string | null | undefined;
    action: FirmAuditAction;
    actor?: { id: string; name?: string | null } | null;
    target?: { type: string; id?: string | null; label?: string | null } | null;
    detail?: FirmAuditDetail;
    failed?: boolean;
    ip?: string | null;
    userAgent?: string | null;
}

export interface FirmAuditPayload {
    eventId: string;
    firmId: string;
    action: FirmAuditAction;
    outcome: 'SUCCESS' | 'FAILURE';
    occurredAt: string;
    actorAccountId?: string;
    actorName?: string;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    detail?: Record<string, string | number | boolean>;
    sourceIp?: string;
    userAgent?: string;
}

const RETRY_DELAYS_MS = [0, 1000, 4000];
const TIMEOUT_MS = 3000;

type Transport = (url: string, secret: string, payload: FirmAuditPayload, timeoutMs: number) => Promise<number>;

const fetchTransport: Transport = async (url, secret, payload, timeoutMs) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
    });
    return res.status;
};

/**
 * 当前请求的来源（IP / UA）。团队与律所的 lib 函数拿不到 request，由路由外壳
 * （lib/team-http.ts 的 withTeamAuth）用 {@link withFirmAuditRequest} 包住，emit 时取用。
 */
const requestContext = new AsyncLocalStorage<{ ip: string | null; userAgent: string | null }>();

/**
 * 审计用的客户端地址：优先 `X-Real-IP`（我们的 nginx 用 `$remote_addr` 覆盖写入，客户端带来的会被替换），
 * 没有时取 `X-Forwarded-For` 的**最后一段**（nginx `$proxy_add_x_forwarded_for` 追加的那一段）。
 * 不取第一段：第一段是客户端自己填的，可以随便伪造。
 */
export function auditClientIp(request: Request): string | null {
    const real = request.headers.get('x-real-ip')?.trim();
    if (real) return real;
    const parts = (request.headers.get('x-forwarded-for') ?? '').split(',').map(p => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
}

/** 在一次请求的处理范围内运行 fn，期间上报的事件带上这次请求的来源 IP 与 UA。 */
export function withFirmAuditRequest<T>(request: Request, fn: () => T): T {
    return requestContext.run({ ip: auditClientIp(request), userAgent: request.headers.get('user-agent') }, fn);
}

let transport: Transport = fetchTransport;
let retryDelays = RETRY_DELAYS_MS;
const pending = new Set<Promise<void>>();

/** 只给验证脚本用：换传输与重试间隔。 */
export function __setFirmAuditTransportForTest(t: Transport | null, delays?: number[]): void {
    transport = t ?? fetchTransport;
    retryDelays = delays ?? RETRY_DELAYS_MS;
}

/** 只给验证脚本用：等所有在途上报结束。 */
export async function flushFirmAudit(): Promise<void> {
    while (pending.size) await Promise.allSettled([...pending]);
}

function clip(v: string | null | undefined, max: number): string | undefined {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t ? [...t].slice(0, max).join('') : undefined;
}

export function buildFirmAuditPayload(input: FirmAuditInput, now = new Date()): FirmAuditPayload | null {
    const firmId = clip(input.firmId, 64);
    if (!firmId) return null;
    const detail: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(input.detail ?? {})) {
        if (typeof v === 'string') detail[k] = [...v].slice(0, 200).join('');
        else if (typeof v === 'number' || typeof v === 'boolean') detail[k] = v;
    }
    const p: FirmAuditPayload = {
        eventId: crypto.randomUUID(),
        firmId,
        action: input.action,
        outcome: input.failed ? 'FAILURE' : 'SUCCESS',
        occurredAt: now.toISOString(),
    };
    const actorId = clip(input.actor?.id, 128);
    if (actorId) p.actorAccountId = actorId;
    const actorName = clip(input.actor?.name, 128);
    if (actorName) p.actorName = actorName;
    if (input.target) {
        p.targetType = clip(input.target.type, 32);
        p.targetId = clip(input.target.id, 64);
        p.targetLabel = clip(input.target.label, 256);
    }
    if (Object.keys(detail).length) p.detail = detail;
    const ip = clip(input.ip, 64);
    if (ip) p.sourceIp = ip;
    const ua = clip(input.userAgent, 256);
    if (ua) p.userAgent = ua;
    return p;
}

function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
}

async function deliver(url: string, secret: string, payload: FirmAuditPayload): Promise<void> {
    for (const delay of retryDelays) {
        if (delay) await sleep(delay);
        try {
            const status = await transport(url, secret, payload, TIMEOUT_MS);
            // 2xx 收到；4xx 是永久错误（404 = 对端没开这条口子 / 密钥不符，400 = 事件不合法）——重试没用
            if (status < 500) {
                if (status >= 300) console.warn('[firm-audit] rejected', payload.action, status);
                return;
            }
        } catch {
            // 网络 / 超时：重试
        }
    }
    console.warn('[firm-audit] gave up after retries', payload.action, payload.eventId);
}

/** 上报一条律所审计事件。立即返回、永不抛；没有律所或未配置时什么都不做。 */
export function emitFirmAudit(input: FirmAuditInput): void {
    try {
        const base = (process.env.AWD_FIRM_AUDIT_URL ?? '').trim().replace(/\/+$/, '');
        const secret = (process.env.AWD_FIRM_AUDIT_SECRET ?? '').trim();
        if (!base || !secret) return;
        const ctx = requestContext.getStore();
        const payload = buildFirmAuditPayload(ctx ? { ...input, ip: input.ip ?? ctx.ip, userAgent: input.userAgent ?? ctx.userAgent } : input);
        if (!payload) return;
        const job = deliver(`${base}/api/internal/firm-audit`, secret, payload).catch(() => {});
        pending.add(job);
        void job.finally(() => pending.delete(job));
    } catch {
        // 审计是旁白：任何意外都不许影响官网请求
    }
}
