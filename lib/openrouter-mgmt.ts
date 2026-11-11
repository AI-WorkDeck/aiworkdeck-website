/**
 * OpenRouter Management API 客户端（PR-W2）。
 *
 * - Management key 只从环境变量 OPENROUTER_PROVISIONING_KEY 读取，
 *   绝不落库、绝不进日志、绝不出现在错误信息里。
 * - 账号轮换：OPENROUTER_PROVISIONING_KEY 是当前账号（新建 key 都走它），
 *   可选 OPENROUTER_PROVISIONING_KEY_RETIRED 是旧账号。每个 key 行记录铸造它的账号指纹
 *   （openrouter_keys.mgmtAccount = sha256(mgmtKey) 前 12 位，只存指纹不存 key），
 *   读/改/禁用某个 hash 时自动用铸造它的那个账号的 management key。
 * - 端点已于 2026-08-05 按官方文档核实：
 *   POST /api/v1/keys（创建，响应含 key 明文仅此一次 + hash）
 *   GET /api/v1/keys/{hash}（limit / usage / limit_remaining / disabled）
 *   PATCH /api/v1/keys/{hash}（limit 覆盖写 → 提额语义必须由调用方「读旧值 + 增量」）
 *   GET /api/v1/credits（主账户 total_credits / total_usage；无认证探测返回 401 证实存在）
 * - 全部请求带 15s 超时；错误分类为 network / client_error / server_error / not_configured。
 * - fetch 可注入（__setFetchForTests），无真实 key 也能动态验证。
 */

import crypto from 'crypto';
import { getDb } from './db';

const BASE = 'https://openrouter.ai/api/v1';
const TIMEOUT_MS = 15_000;

export type MgmtErrorKind = 'not_configured' | 'network' | 'client_error' | 'server_error';

export class OpenRouterMgmtError extends Error {
  kind: MgmtErrorKind;
  status?: number;
  constructor(kind: MgmtErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'OpenRouterMgmtError';
    this.kind = kind;
    this.status = status;
  }
}

let fetchImpl: typeof fetch = (...args) => fetch(...args);

/** 仅测试用：注入假 fetch；传 null 恢复真实 fetch。 */
export function __setFetchForTests(f: typeof fetch | null) {
  fetchImpl = f ?? ((...args) => fetch(...args));
}

export function isMgmtConfigured(): boolean {
  return !!process.env.OPENROUTER_PROVISIONING_KEY;
}

/** management key 的短指纹（仅用于标识账号，不可逆推出 key）。 */
export function accountFingerprint(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf-8').digest('hex').slice(0, 12);
}

export function isRetiredMgmtConfigured(): boolean {
  return !!process.env.OPENROUTER_PROVISIONING_KEY_RETIRED;
}

/** 当前账号指纹（新铸造的 key 行写入它）；未配置返回 null。 */
export function currentMgmtAccount(): string | null {
  const key = process.env.OPENROUTER_PROVISIONING_KEY;
  return key ? accountFingerprint(key) : null;
}

/** 旧账号指纹；未配置返回 null。 */
export function retiredMgmtAccount(): string | null {
  const key = process.env.OPENROUTER_PROVISIONING_KEY_RETIRED;
  return key ? accountFingerprint(key) : null;
}

function mgmtKey(account?: string | null): string {
  const key = process.env.OPENROUTER_PROVISIONING_KEY;
  const retired = process.env.OPENROUTER_PROVISIONING_KEY_RETIRED;
  if (account === undefined || account === null) {
    // 无账号标记：配了旧账号时，标记为空的行只可能是迁移前（旧账号）铸造的
    if (account === null && retired) return retired;
    if (!key) {
      throw new OpenRouterMgmtError(
        'not_configured',
        'OpenRouter Management key 未配置（环境变量 OPENROUTER_PROVISIONING_KEY）'
      );
    }
    return key;
  }
  if (key && accountFingerprint(key) === account) return key;
  if (retired && accountFingerprint(retired) === account) return retired;
  throw new OpenRouterMgmtError(
    'not_configured',
    `铸造该 key 的 OpenRouter 账号（${account}）的 Management key 未配置（OPENROUTER_PROVISIONING_KEY / OPENROUTER_PROVISIONING_KEY_RETIRED）`
  );
}

/**
 * 查某个 key hash 是铸造账号：undefined = 库里没有这个 hash（用当前账号），
 * null = 有行但无账号标记（迁移前的行）。
 */
function accountOfHash(hash: string): string | null | undefined {
  try {
    const row = getDb()
      .prepare('SELECT mgmtAccount FROM openrouter_keys WHERE orKeyHash = ? ORDER BY id DESC LIMIT 1')
      .get(hash) as { mgmtAccount: string | null } | undefined;
    return row ? row.mgmtAccount : undefined;
  } catch {
    return undefined;
  }
}

/** 防御性脱敏：错误信息里绝不允许出现任何 sk-or- 开头的 key 材料。 */
function redact(text: string): string {
  return text.replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-***');
}

async function request(method: string, path: string, body?: unknown, account?: string | null): Promise<any> {
  const key = mgmtKey(account);
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // 不透传底层异常文本：可能包含请求头等敏感上下文
    throw new OpenRouterMgmtError('network', `OpenRouter 管理接口网络错误: ${method} ${path}`);
  }
  if (!res.ok) {
    const kind: MgmtErrorKind = res.status >= 500 ? 'server_error' : 'client_error';
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      detail = '';
    }
    throw new OpenRouterMgmtError(
      kind,
      redact(`OpenRouter 管理接口 ${res.status}: ${method} ${path} ${detail}`),
      res.status
    );
  }
  try {
    return await res.json();
  } catch {
    throw new OpenRouterMgmtError('server_error', `OpenRouter 管理接口响应不是 JSON: ${method} ${path}`);
  }
}

export interface CreatedKey {
  /** runtime key 明文，仅创建响应返回一次 */
  key: string;
  hash: string;
  limitUsd: number;
}

export interface RemoteKey {
  hash: string;
  name: string;
  limitUsd: number;
  usageUsd: number;
  /** OpenRouter 返回 null 表示无限额 */
  remainingUsd: number | null;
  disabled: boolean;
}

export interface Credits {
  totalCreditsUsd: number;
  totalUsageUsd: number;
  remainingUsd: number;
}

/** 创建 provisioned key（limit 单位：美元 credits）。 */
export async function createKey(name: string, limitUsd: number): Promise<CreatedKey> {
  const json = await request('POST', '/keys', { name, limit: limitUsd });
  const key = json?.key ?? json?.data?.key;
  const hash = json?.data?.hash ?? json?.hash;
  if (typeof key !== 'string' || typeof hash !== 'string') {
    throw new OpenRouterMgmtError('server_error', '创建 key 响应缺少 key/hash 字段');
  }
  return { key, hash, limitUsd: Number(json?.data?.limit ?? json?.limit ?? limitUsd) };
}

/** 查询 key 的 limit / usage（对账与实时用量都走这里）。 */
export async function getKey(hash: string): Promise<RemoteKey> {
  const json = await request('GET', `/keys/${encodeURIComponent(hash)}`, undefined, accountOfHash(hash));
  const data = json?.data ?? json;
  if (!data || typeof data !== 'object') {
    throw new OpenRouterMgmtError('server_error', '查询 key 响应结构异常');
  }
  return {
    hash: String(data.hash ?? hash),
    name: String(data.name ?? data.label ?? ''),
    limitUsd: Number(data.limit ?? 0),
    usageUsd: Number(data.usage ?? 0),
    remainingUsd: data.limit_remaining == null ? null : Number(data.limit_remaining),
    disabled: !!data.disabled,
  };
}

/**
 * 覆盖写 limit。OpenRouter 的 limit 是累计口径：
 * 提额必须由调用方先 getKey 读旧值，再传 旧值 + 增量（见 lib/ai-alloc.ts）。
 */
export async function patchKeyLimit(hash: string, newLimitUsd: number): Promise<void> {
  await request('PATCH', `/keys/${encodeURIComponent(hash)}`, { limit: newLimitUsd }, accountOfHash(hash));
}

/** 止损开关：即时禁用 key。 */
export async function disableKey(hash: string): Promise<void> {
  await request('PATCH', `/keys/${encodeURIComponent(hash)}`, { disabled: true }, accountOfHash(hash));
}

/** 主账户余额（所有 provisioned key 的共享池）。 */
export async function getCredits(): Promise<Credits> {
  const json = await request('GET', '/credits');
  const data = json?.data ?? json;
  const total = Number(data?.total_credits ?? 0);
  const usage = Number(data?.total_usage ?? 0);
  return { totalCreditsUsd: total, totalUsageUsd: usage, remainingUsd: total - usage };
}

/** Apply a postpaid budget and its admission state in the same provider request. */
export async function setPostpaidKeyBudget(hash:string,limit:number,disabled:boolean):Promise<void> {
  await request('PATCH', `/keys/${encodeURIComponent(hash)}`, {limit,disabled}, accountOfHash(hash));
}
