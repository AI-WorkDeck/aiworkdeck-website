// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天律师积分通道（计费四条线之二）。
 *
 * 包晴天只提供「查权益」和「整笔扣积分」，没有冻结、没有退款。所以：
 *   - 花钱前用 bqtPreflight 查会员状态与可用积分（扣掉本地尚未扣成的欠账）；
 *   - 真正扣积分走发件箱：调用方在自己的本地事务里 enqueueConsume，提交后 dispatchConsume；
 *     超时/无响应/SYSTEM_BUSY 用原 requestNo、原积分重发（retryPendingConsumes），其余失败不重试；
 *   - 失败的扣减挂在用户身上（outstanding），未处理前拦新的花费，后台可放弃或换新单号重扣。
 *
 * 通道关闭（后台开关 / 环境变量缺失 / 未设比例）时 bqtLinkedLawyer 返回 null，包晴天律师走原有本站钱包。
 * 鉴权见《对 AI WorkDeck · 律师会员权益查询与积分扣减》：EXT_SITE 签名，签名不含 URL/Query/Body。
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDb, withTransaction } from './db';
import { getAiConfig } from './ai-config';

// ─── 配置 ─────────────────────────────────────────────────────────────

export interface BqtMemberEnv { baseUrl: string; appId: string; appSecret: string }

/** 生产用 https://uat.bqt.com（包晴天 2026-11-06 告知），测试 https://bqt-test.bqt.com。 */
export function bqtMemberEnv(): BqtMemberEnv | null {
  const baseUrl = process.env.AWD_BQT_MEMBER_BASE_URL?.trim().replace(/\/+$/, '');
  const appId = process.env.AWD_BQT_MEMBER_APP_ID?.trim();
  const appSecret = process.env.AWD_BQT_MEMBER_APP_SECRET?.trim();
  return baseUrl && appId && appSecret ? { baseUrl, appId, appSecret } : null;
}

export interface BqtSettings {
  tunnelEnabled: boolean;
  /** 1 包晴天积分折合多少本站分（Credits 以分记账）。null = 未设置，通道不能开。 */
  centsPerPoint: number | null;
  /** 包晴天线的毛利乘数；null = 跟随全站 marginMultiplier。 */
  marginMultiplier: number | null;
  /** 有效会员（ACTIVE 且 aiWorkbench）是否享有 Pro 权益。 */
  grantProRights: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

interface SettingsRow { tunnelEnabled: number; centsPerPoint: number | null; marginMultiplier: number | null; grantProRights: number; updatedAt: string; updatedBy: string | null }

export function getBqtSettings(d: Database.Database = getDb()): BqtSettings {
  const r = d.prepare('SELECT * FROM bqt_settings WHERE id = 1').get() as SettingsRow;
  return { tunnelEnabled: r.tunnelEnabled === 1, centsPerPoint: r.centsPerPoint, marginMultiplier: r.marginMultiplier, grantProRights: r.grantProRights === 1, updatedAt: r.updatedAt, updatedBy: r.updatedBy };
}

export type BqtSettingsPatch = Partial<Pick<BqtSettings, 'tunnelEnabled' | 'centsPerPoint' | 'marginMultiplier' | 'grantProRights'>>;
export type BqtSettingsError = 'invalid_cents_per_point' | 'invalid_margin' | 'ratio_required' | 'env_missing';

function decimalsOk(n: number, max: number) { return Math.abs(n * 10 ** max - Math.round(n * 10 ** max)) < 1e-6; }

/** 校验 + 留痕。开通道需要环境变量齐全且比例已设。 */
export function updateBqtSettings(patch: BqtSettingsPatch, actor: string | null): { ok: true; settings: BqtSettings } | { ok: false; error: BqtSettingsError } {
  if (patch.centsPerPoint !== undefined && patch.centsPerPoint !== null) {
    const v = patch.centsPerPoint;
    // 允许「1 元 = N 积分」换算来的循环小数（N 最多 4 位小数），如 1 元 = 3 积分 → 33.33…
    if (!Number.isFinite(v) || v <= 0 || v > 100_000 || !(decimalsOk(v, 4) || decimalsOk(100 / v, 4))) return { ok: false, error: 'invalid_cents_per_point' };
  }
  if (patch.marginMultiplier !== undefined && patch.marginMultiplier !== null) {
    const v = patch.marginMultiplier;
    if (!Number.isFinite(v) || v < 1 || v > 10) return { ok: false, error: 'invalid_margin' };
  }
  return withTransaction(d => {
    const before = getBqtSettings(d);
    const next = { ...before, ...patch };
    if (next.tunnelEnabled && !(next.centsPerPoint && next.centsPerPoint > 0)) return { ok: false as const, error: 'ratio_required' as const };
    if (next.tunnelEnabled && !before.tunnelEnabled && !bqtMemberEnv()) return { ok: false as const, error: 'env_missing' as const };
    const now = new Date().toISOString();
    const audit = d.prepare('INSERT INTO bqt_settings_audit (changedAt, actor, field, oldValue, newValue) VALUES (?, ?, ?, ?, ?)');
    for (const key of ['tunnelEnabled', 'centsPerPoint', 'marginMultiplier', 'grantProRights'] as const) {
      if (patch[key] !== undefined && patch[key] !== before[key]) audit.run(now, actor, key, JSON.stringify(before[key]), JSON.stringify(next[key]));
    }
    d.prepare('UPDATE bqt_settings SET tunnelEnabled=?, centsPerPoint=?, marginMultiplier=?, grantProRights=?, updatedAt=?, updatedBy=? WHERE id=1')
      .run(next.tunnelEnabled ? 1 : 0, next.centsPerPoint, next.marginMultiplier, next.grantProRights ? 1 : 0, now, actor);
    return { ok: true as const, settings: getBqtSettings(d) };
  });
}

export function listBqtSettingsAudit(limit = 50) {
  return getDb().prepare('SELECT * FROM bqt_settings_audit ORDER BY id DESC LIMIT ?').all(limit) as Array<{ id: number; changedAt: string; actor: string | null; field: string; oldValue: string | null; newValue: string | null }>;
}

export function bqtTunnelActive(d: Database.Database = getDb()): boolean {
  const s = getBqtSettings(d);
  return s.tunnelEnabled && !!s.centsPerPoint && s.centsPerPoint > 0 && !!bqtMemberEnv();
}

export function bqtMarginMultiplier(): number {
  return getBqtSettings().marginMultiplier ?? getAiConfig().marginMultiplier;
}

/**
 * 通道打开且该用户扫码绑定过包晴天 → 返回 lawyerId；否则 null。
 * 绑定只是多了一个付款来源（DeepSeek 用量优先扣积分），不改变账户的其他能力：钱包、充值、全部模型照常。
 */
export function bqtLinkedLawyer(userId: string, d: Database.Database = getDb()): { lawyerId: string } | null {
  if (!bqtTunnelActive(d)) return null;
  const row = d.prepare('SELECT bqtUserId FROM bqt_user_binding WHERE userId = ?').get(userId) as { bqtUserId: string } | undefined;
  return row && /^\d{1,19}$/.test(row.bqtUserId) ? { lawyerId: row.bqtUserId } : null;
}

// ─── 积分 ↔ 分（积分以「百分之一积分」整数记，避免浮点） ─────────────────

/** 本站分 → 要扣的积分（百分之一积分），向上取整：宁可多扣 0.01 积分也不少收。 */
export function centsToPointsHundredths(cents: number, centsPerPoint: number): number {
  return Math.ceil((cents * 100) / centsPerPoint - 1e-6);
}
/** 积分（百分之一积分）→ 本站分，向下取整：展示与预检不夸大余额。 */
export function pointsHundredthsToCents(hundredths: number, centsPerPoint: number): number {
  return Math.floor((hundredths * centsPerPoint) / 100 + 1e-6);
}
export function formatPoints(hundredths: number): string {
  return `${Math.trunc(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}
function toHundredths(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ─── HTTP 客户端 ───────────────────────────────────────────────────────

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init);
/** 仅测试用。 */
export function setBqtFetchForTest(f: FetchLike | null) { fetchImpl = f ?? ((url, init) => fetch(url, init)); }

export function bqtSignHeaders(appId: string, appSecret: string, nowMs = Date.now(), nonce = crypto.randomBytes(16).toString('hex')): Record<string, string> {
  const signStr = `appId=${appId}&timestamp=${nowMs}&nonce=${nonce}&app_secret=${appSecret}`;
  const sign = crypto.createHmac('sha256', appSecret).update(signStr, 'utf8').digest('hex').toUpperCase();
  return { 'Content-Type': 'application/json', 'X-App-ID': appId, 'X-Timestamp': String(nowMs), 'X-Nonce': nonce, 'X-Sign': sign };
}

const TIMEOUT_MS = 10_000;

export class BqtUnavailableError extends Error {
  constructor(public readonly reason: string) { super(`bqt_unavailable: ${reason}`); this.name = 'BqtUnavailableError'; }
}

async function call(method: 'GET' | 'POST', pathAndQuery: string, body?: string): Promise<{ status: number; json: any } | { status: 0; error: string }> {
  const env = bqtMemberEnv();
  if (!env) return { status: 0, error: 'env_missing' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(env.baseUrl + pathAndQuery, { method, headers: bqtSignHeaders(env.appId, env.appSecret), body, signal: ctl.signal });
    const text = await res.text();
    try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: null }; }
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.name + ':' + e.message : String(e) };
  } finally { clearTimeout(timer); }
}

export interface BqtEntitlement {
  lawyerId: string;
  levelCode: 'LIGHT' | 'GROWTH' | null;
  status: 'ACTIVE' | 'EXPIRED';
  /** ISO（上海时间 +08:00），未开通/过期为 null */
  expireAt: string | null;
  aiWorkbench: boolean;
  usablePointsHundredths: number;
  fetchedAt: string;
}

export function canUseAiWorkbench(e: BqtEntitlement): boolean { return e.status === 'ACTIVE' && e.aiWorkbench; }

function parseEntitlement(data: any, fetchedAt: string): BqtEntitlement {
  const expire = typeof data?.expireTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(data.expireTime) ? `${data.expireTime}+08:00` : null;
  return {
    lawyerId: String(data?.lawyerId ?? ''),
    levelCode: data?.levelCode === 'LIGHT' || data?.levelCode === 'GROWTH' ? data.levelCode : null,
    status: data?.status === 'ACTIVE' ? 'ACTIVE' : 'EXPIRED',
    expireAt: expire ? new Date(expire).toISOString() : null,
    aiWorkbench: data?.aiWorkbench === true,
    usablePointsHundredths: toHundredths(data?.usablePoints),
    fetchedAt,
  };
}

/** 实时查权益，成功后写快照（供同步代码读 Pro 权益/展示余额）。失败抛 BqtUnavailableError。 */
export async function fetchBqtEntitlement(lawyerId: string): Promise<BqtEntitlement> {
  if (!/^\d{1,19}$/.test(lawyerId)) throw new BqtUnavailableError('invalid_lawyer_id');
  const r = await call('GET', `/bqt/api/ai/lawyer/member/entitlement?lawyerId=${lawyerId}`);
  if (r.status !== 200 || !('json' in r) || r.json?.code !== 0 || !r.json?.data) {
    throw new BqtUnavailableError('error' in r ? r.error : `http_${r.status}_code_${r.json?.code ?? 'none'}`);
  }
  const e = parseEntitlement(r.json.data, new Date().toISOString());
  getDb().prepare(`INSERT INTO bqt_entitlement_snapshot (lawyerId, json, fetchedAt) VALUES (?, ?, ?)
    ON CONFLICT(lawyerId) DO UPDATE SET json = excluded.json, fetchedAt = excluded.fetchedAt`).run(lawyerId, JSON.stringify(e), e.fetchedAt);
  return e;
}

/** 最近一次成功查询的快照（同步）。可能过期，调用方按 fetchedAt 自行判断。 */
export function bqtEntitlementSnapshot(lawyerId: string): BqtEntitlement | null {
  const row = getDb().prepare('SELECT json, fetchedAt FROM bqt_entitlement_snapshot WHERE lawyerId = ?').get(lawyerId) as { json: string; fetchedAt: string } | undefined;
  return row ? { ...JSON.parse(row.json) as BqtEntitlement, fetchedAt: row.fetchedAt } : null;
}

/** 快照新于 maxAgeMs 直接用，否则实时查；实时失败时若有快照则抛错（不拿旧快照做花钱判断）。 */
export async function getBqtEntitlement(lawyerId: string, maxAgeMs = 5_000): Promise<BqtEntitlement> {
  const snap = bqtEntitlementSnapshot(lawyerId);
  if (snap && Date.now() - Date.parse(snap.fetchedAt) < maxAgeMs) return snap;
  return fetchBqtEntitlement(lawyerId);
}

export type BqtResultCode = 'SUCCESS' | 'MEMBER_INVALID' | 'AI_CLOSED' | 'INSUFFICIENT_POINTS' | 'INVALID_POINTS' | 'LAWYER_UNAVAILABLE' | 'REQUEST_NO_CONFLICT' | 'SYSTEM_BUSY' | 'AMOUNT_MISMATCH';

export type ConsumeOutcome =
  | { kind: 'success'; idempotent: boolean; consumedHundredths: number; usablePointsHundredths: number }
  | { kind: 'retry'; reason: string }
  | { kind: 'rejected'; resultCode: string; code: number | null; consumedHundredths: number };

/** 单次 consume 请求，按文档把响应分成 成功 / 可重试 / 不可重试。 */
export async function postBqtConsume(input: { lawyerId: string; pointsHundredths: number; requestNo: string }): Promise<ConsumeOutcome> {
  const { lawyerId, pointsHundredths, requestNo } = input;
  if (!/^\d{1,19}$/.test(lawyerId) || !Number.isSafeInteger(pointsHundredths) || pointsHundredths <= 0 || !requestNo || requestNo.length > 64) {
    return { kind: 'rejected', resultCode: 'LOCAL_INVALID', code: null, consumedHundredths: 0 };
  }
  // lawyerId 是 Long，可能超出 JS 安全整数，按数字字面量原样拼进 JSON。
  const body = `{"lawyerId":${lawyerId},"points":${formatPoints(pointsHundredths)},"requestNo":${JSON.stringify(requestNo)}}`;
  const r = await call('POST', '/bqt/api/ai/lawyer/member/points/consume', body);
  if (!('json' in r)) return { kind: 'retry', reason: r.error };
  if (r.status !== 200 || !r.json) return { kind: 'retry', reason: `http_${r.status}` };
  const data = r.json.data;
  if (r.json.code === 0 && data?.resultCode === 'SUCCESS') {
    return { kind: 'success', idempotent: data.idempotent === true, consumedHundredths: toHundredths(data.consumedPoints), usablePointsHundredths: toHundredths(data.usablePoints) };
  }
  if (data?.resultCode === 'SYSTEM_BUSY') return { kind: 'retry', reason: 'SYSTEM_BUSY' };
  if (typeof data?.resultCode === 'string') {
    return { kind: 'rejected', resultCode: data.resultCode, code: typeof r.json.code === 'number' ? r.json.code : null, consumedHundredths: toHundredths(data.consumedPoints) };
  }
  // 参数缺失（10029）等：data 不是业务结果体，不会扣，按我方错误处理。
  return { kind: 'rejected', resultCode: `CODE_${r.json.code}`, code: typeof r.json.code === 'number' ? r.json.code : null, consumedHundredths: 0 };
}

// ─── 发件箱 ────────────────────────────────────────────────────────────

export type ConsumeState = 'pending' | 'sending' | 'succeeded' | 'failed' | 'waived';

export interface BqtConsumeRow {
  requestNo: string; userId: string; lawyerId: string; pointsHundredths: number; cents: number;
  service: string; refId: string | null; state: ConsumeState; resultCode: string | null; attempts: number;
  lastError: string | null; usablePointsAfter: string | null; createdAt: string; updatedAt: string;
  resolvedAt: string | null; resolvedBy: string | null;
}

export function consumeRow(requestNo: string, d: Database.Database = getDb()): BqtConsumeRow | undefined {
  return d.prepare('SELECT * FROM bqt_consume WHERE requestNo = ?').get(requestNo) as BqtConsumeRow | undefined;
}

/** 本站业务号 → 包晴天 requestNo（≤64，稳定）。 */
export function bqtRequestNo(service: string, refId: string): string {
  const raw = `aw-${service}-${refId}`;
  return raw.length <= 64 ? raw : `aw-${service.slice(0, 12)}-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40)}`;
}

/**
 * 在调用方的本地事务里登记一笔待扣积分（同步）。积分按当下比例由 cents 折算并定死——
 * 之后重发必须原积分，否则包晴天回 AMOUNT_MISMATCH。同号同参重复登记返回原行，参数不同抛错。
 */
export function enqueueConsume(d: Database.Database, input: { userId: string; lawyerId: string; cents: number; service: string; refId: string; requestNo?: string }): BqtConsumeRow {
  const centsPerPoint = getBqtSettings(d).centsPerPoint;
  if (!centsPerPoint) throw new Error('bqt_ratio_unset');
  if (!Number.isSafeInteger(input.cents) || input.cents <= 0) throw new Error('bqt_invalid_cents');
  const requestNo = input.requestNo ?? bqtRequestNo(input.service, input.refId);
  const pointsHundredths = centsToPointsHundredths(input.cents, centsPerPoint);
  const existing = consumeRow(requestNo, d);
  if (existing) {
    if (existing.userId === input.userId && existing.cents === input.cents) return existing;
    throw new Error('bqt_request_no_conflict');
  }
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO bqt_consume (requestNo, userId, lawyerId, pointsHundredths, cents, service, refId, state, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(requestNo, input.userId, input.lawyerId, pointsHundredths, input.cents, input.service, input.refId, now, now);
  return consumeRow(requestNo, d)!;
}

const inflight = new Map<string, Promise<BqtConsumeRow>>();

/** 发送一笔登记过的扣减。已成功/已失败/已放弃的直接返回；同进程同号并发合并为一次。 */
export function dispatchConsume(requestNo: string): Promise<BqtConsumeRow> {
  const running = inflight.get(requestNo);
  if (running) return running;
  const p = (async () => {
    const row = consumeRow(requestNo);
    if (!row) throw new Error('bqt_consume_not_found');
    if (row.state !== 'pending' && row.state !== 'sending') return row;
    const db = getDb();
    db.prepare("UPDATE bqt_consume SET state='sending', attempts=attempts+1, updatedAt=? WHERE requestNo=?").run(new Date().toISOString(), requestNo);
    const out = await postBqtConsume({ lawyerId: row.lawyerId, pointsHundredths: row.pointsHundredths, requestNo });
    const now = new Date().toISOString();
    if (out.kind === 'success') {
      db.prepare("UPDATE bqt_consume SET state='succeeded', resultCode='SUCCESS', lastError=NULL, usablePointsAfter=?, updatedAt=? WHERE requestNo=?")
        .run(formatPoints(out.usablePointsHundredths), now, requestNo);
      patchSnapshotPoints(row.lawyerId, out.usablePointsHundredths, now);
    } else if (out.kind === 'retry') {
      db.prepare("UPDATE bqt_consume SET state='pending', lastError=?, updatedAt=? WHERE requestNo=?").run(out.reason, now, requestNo);
    } else {
      db.prepare("UPDATE bqt_consume SET state='failed', resultCode=?, lastError=?, updatedAt=? WHERE requestNo=?")
        .run(out.resultCode, out.code === null ? null : String(out.code), now, requestNo);
      console.error(`[bqt] consume rejected requestNo=${requestNo} user=${row.userId} resultCode=${out.resultCode}`);
    }
    return consumeRow(requestNo)!;
  })().finally(() => inflight.delete(requestNo));
  inflight.set(requestNo, p);
  return p;
}

function patchSnapshotPoints(lawyerId: string, hundredths: number, at: string) {
  const snap = bqtEntitlementSnapshot(lawyerId);
  if (!snap) return;
  getDb().prepare('UPDATE bqt_entitlement_snapshot SET json=?, fetchedAt=? WHERE lawyerId=?')
    .run(JSON.stringify({ ...snap, usablePointsHundredths: hundredths, fetchedAt: at }), at, lawyerId);
}

/** 补发：pending（上次可重试）与 sending（进程中途退出）超过 staleMs 的，用原单号原积分重发。 */
export async function retryPendingConsumes(staleMs = 30_000, limit = 50): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const rows = getDb().prepare("SELECT requestNo FROM bqt_consume WHERE state IN ('pending','sending') AND updatedAt < ? ORDER BY updatedAt LIMIT ?").all(cutoff, limit) as Array<{ requestNo: string }>;
  for (const { requestNo } of rows) await dispatchConsume(requestNo);
  return rows.length;
}

/** 已提供服务但还没扣成的本站分（pending/sending/failed 未处理）。预检和余额展示都要先减掉。 */
export function bqtOutstandingCents(userId: string, d: Database.Database = getDb()): { cents: number; failed: number } {
  const r = d.prepare(`SELECT COALESCE(SUM(cents),0) cents, COALESCE(SUM(state='failed'),0) failed FROM bqt_consume
    WHERE userId=? AND state IN ('pending','sending','failed')`).get(userId) as { cents: number; failed: number };
  return { cents: r.cents, failed: r.failed };
}

/** 后台：放弃一笔失败的扣减（平台承担）。 */
export function waiveConsume(requestNo: string, actor: string | null): boolean {
  const now = new Date().toISOString();
  return getDb().prepare("UPDATE bqt_consume SET state='waived', resolvedAt=?, resolvedBy=?, updatedAt=? WHERE requestNo=? AND state='failed'").run(now, actor, now, requestNo).changes === 1;
}

/** 后台：律师补足积分后重扣。包晴天要求失败单号不复用，所以原单标记放弃、按原积分开新单号。 */
export function reissueConsume(requestNo: string, actor: string | null): BqtConsumeRow | null {
  return withTransaction(d => {
    const row = consumeRow(requestNo, d);
    if (!row || row.state !== 'failed') return null;
    const n = (d.prepare("SELECT COUNT(*) n FROM bqt_consume WHERE refId=? AND service=?").get(row.refId, row.service) as { n: number }).n;
    const base = row.requestNo.slice(0, 58);
    const next = `${base}-r${n}`;
    const now = new Date().toISOString();
    d.prepare("UPDATE bqt_consume SET state='waived', resolvedAt=?, resolvedBy=?, updatedAt=? WHERE requestNo=?").run(now, `reissued:${actor ?? ''}`, now, requestNo);
    d.prepare(`INSERT INTO bqt_consume (requestNo, userId, lawyerId, pointsHundredths, cents, service, refId, state, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(next, row.userId, row.lawyerId, row.pointsHundredths, row.cents, row.service, row.refId, now, now);
    return consumeRow(next, d)!;
  });
}

// ─── 预检与展示 ────────────────────────────────────────────────────────

export type BqtDenial = 'member_invalid' | 'ai_closed' | 'insufficient_points' | 'outstanding_debt' | 'bqt_unavailable';

/**
 * 花钱前的检查。requiredCents 是本次最多可能花的本站分（已含毛利）。
 * 有失败未处理的扣减一律拦；可用额度 = 实时积分折分 − 尚未扣成的分。
 */
export async function bqtPreflight(userId: string, lawyerId: string, requiredCents: number):
  Promise<{ ok: true; entitlement: BqtEntitlement; availableCents: number } | { ok: false; reason: BqtDenial; entitlement?: BqtEntitlement }> {
  const owed = bqtOutstandingCents(userId);
  if (owed.failed > 0) return { ok: false, reason: 'outstanding_debt' };
  let e: BqtEntitlement;
  try { e = await getBqtEntitlement(lawyerId); } catch { return { ok: false, reason: 'bqt_unavailable' }; }
  if (e.status !== 'ACTIVE') return { ok: false, reason: 'member_invalid', entitlement: e };
  if (!e.aiWorkbench) return { ok: false, reason: 'ai_closed', entitlement: e };
  const centsPerPoint = getBqtSettings().centsPerPoint!;
  const availableCents = pointsHundredthsToCents(e.usablePointsHundredths, centsPerPoint) - owed.cents;
  if (availableCents < requiredCents) return { ok: false, reason: 'insufficient_points', entitlement: e };
  return { ok: true, entitlement: e, availableCents };
}

/** 账户页/桌面展示用（同步，读快照）。快照缺失返回 null，调用方可先 await fetchBqtEntitlement 刷新。 */
export function bqtBalanceView(userId: string, lawyerId: string): null | {
  points: string; cents: number; outstandingCents: number; failedCount: number; centsPerPoint: number;
  levelCode: BqtEntitlement['levelCode']; status: BqtEntitlement['status']; aiWorkbench: boolean; expireAt: string | null; fetchedAt: string;
} {
  const e = bqtEntitlementSnapshot(lawyerId);
  const centsPerPoint = getBqtSettings().centsPerPoint;
  if (!e || !centsPerPoint) return null;
  const owed = bqtOutstandingCents(userId);
  return {
    points: formatPoints(e.usablePointsHundredths),
    cents: Math.max(0, pointsHundredthsToCents(e.usablePointsHundredths, centsPerPoint) - owed.cents),
    outstandingCents: owed.cents, failedCount: owed.failed, centsPerPoint,
    levelCode: e.levelCode, status: e.status, aiWorkbench: e.aiWorkbench, expireAt: e.expireAt, fetchedAt: e.fetchedAt,
  };
}

/** Pro 权益到期时刻（同步，读快照）：通道开、后台允许、会员有效且开了 AI 工作台。 */
export function bqtProRightsUntil(userId: string, nowIso = new Date().toISOString()): string | null {
  const target = bqtLinkedLawyer(userId);
  if (!target || !getBqtSettings().grantProRights) return null;
  const e = bqtEntitlementSnapshot(target.lawyerId);
  if (!e || !canUseAiWorkbench(e) || !e.expireAt || e.expireAt <= nowIso) return null;
  return e.expireAt;
}
