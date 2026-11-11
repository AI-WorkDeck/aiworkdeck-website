// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs';
import path from 'path';
import { siteConfig } from '@/lib/site-config';

/**
 * 美元兑人民币的即时汇率（dev-board#853）。
 *
 * 国内站 Credits 以人民币分记账，要按汇率折成 OpenRouter 的美元额度。汇率原先只有
 * 站点默认值 7.3 加后台手填，比实际（约 6.8）偏高，用户的每一分钱都少买了约 7% 的 AI。
 * 这里只负责「取一个可信的即时值」；**生效哪一个**（手动 / 即时 / 默认）在
 * `lib/ai-config.ts` 的 `getExchangeRateInfo()` 里裁决，计费只认那一个出口。
 *
 * ## 只在本币不是美元的站点启用
 * 国际站本币就是美元，折算恒为 1——那边**一次都不拉**，也不读写缓存文件。
 *
 * ## 刷新：读取时惰性刷新，不引入 cron
 * 结果缓存在 `data/fx-rate.json`。读的时候发现缓存超过 12 小时，就在后台发起一次刷新，
 * **当前请求照用旧值**，不等网络。中间价每个工作日 9:15 公布一次，12 小时足够跟上。
 * 不用 cron 的理由：两台机器的 crontab 都是手工维护的（DEPLOY.md §9.5），多一条就多一个
 * 「合并了却没挂」的机会；而读取路径本来就频繁（账户页、桌面端、网关扣费后的重设），
 * 惰性刷新天然跟着流量走，没人用的时候也没必要拉。
 *
 * ## 护栏
 * - 值必须落在 [5, 10]，否则视为解析错误，换下一个源；
 * - 与上一次有效值相比单次变动超过 5% 不采用、记日志、继续用旧值，并把被拒的值
 *   留在缓存里给后台看（长时间停在「被拒」说明真实汇率已经大幅移动，维护者可切手动）；
 *   首次取数没有「上一次有效值」，只过区间护栏——站点默认值 7.3 本身就偏离实际 7% 以上，
 *   拿它当基准会让即时汇率永远上不来；
 * - 所有源都失败：沿用上次有效值；连上次有效值都没有时由调用方回退到站点默认值。
 * - 失败后 30 分钟内不重试，避免源挂掉时每个请求都去撞一次。
 */

const FX_FILE = () => path.join(process.cwd(), 'data', 'fx-rate.json');

export const FX_MIN_RATE = 5;
export const FX_MAX_RATE = 10;
/** 单次最大允许变动（相对上一次有效值） */
export const FX_MAX_JUMP = 0.05;
export const FX_REFRESH_MS = 12 * 60 * 60 * 1000;
export const FX_RETRY_MS = 30 * 60 * 1000;
export const FX_TIMEOUT_MS = 5_000;

export type FxSourceId = 'chinamoney' | 'frankfurter';

export interface FxSnapshot {
  rate: number;
  source: FxSourceId;
  /** 展示用的数据源名称 */
  sourceName: string;
  /** 数据源自己标注的日期/时间（中间价是公布时刻，ECB 是参考日），取不到为 null */
  asOf: string | null;
  /** 本站取到这个值的时刻（ISO） */
  fetchedAt: string;
}

export interface FxRejected {
  rate: number;
  source: FxSourceId;
  reason: 'out_of_range' | 'jump';
  at: string;
}

export interface FxCache {
  /** 上一次有效值 */
  last?: FxSnapshot;
  /** 最近一次刷新尝试的时刻（无论成败），用于失败退避 */
  lastAttemptAt?: string;
  /** 最近一次被护栏拒掉的值 */
  lastRejected?: FxRejected;
}

interface FxSource {
  id: FxSourceId;
  name: string;
  url: string;
  parse: (json: unknown) => { rate: number; asOf: string | null } | null;
}

/**
 * 中国外汇交易中心（CFETS）人民币汇率中间价。
 * `data.lastDate` 形如 `2026-09-23 9:15`（北京时间），`records[].vrtEName === 'USD/CNY'` 的 `price` 是字符串。
 */
export function parseChinamoney(json: unknown): { rate: number; asOf: string | null } | null {
  const j = json as { data?: { lastDate?: unknown }; records?: unknown };
  if (!j || !Array.isArray(j.records)) return null;
  const rec = (j.records as Array<{ vrtEName?: unknown; price?: unknown }>).find(
    r => r && r.vrtEName === 'USD/CNY'
  );
  if (!rec) return null;
  const rate = Number(rec.price);
  if (!Number.isFinite(rate)) return null;
  let asOf: string | null = null;
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/.exec(String(j.data?.lastDate ?? '').trim());
  if (m) asOf = `${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+08:00`;
  return { rate, asOf };
}

/** Frankfurter（欧洲央行参考汇率）：`{ base:'USD', date:'2026-09-22', rates:{ CNY: 6.7001 } }` */
export function parseFrankfurter(json: unknown): { rate: number; asOf: string | null } | null {
  const j = json as { base?: unknown; date?: unknown; rates?: { CNY?: unknown } };
  if (!j || j.base !== 'USD' || !j.rates) return null;
  const rate = Number(j.rates.CNY);
  if (!Number.isFinite(rate)) return null;
  return { rate, asOf: typeof j.date === 'string' ? j.date : null };
}

/** 按优先级排列：首选中间价（人民币计价的官方口径），备选 ECB（与中间价通常差 1% 以内）。 */
export const FX_SOURCES: readonly FxSource[] = [
  {
    id: 'chinamoney',
    name: '中国外汇交易中心 人民币汇率中间价',
    url: 'https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json',
    parse: parseChinamoney,
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter（欧洲央行参考汇率）',
    url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY',
    parse: parseFrankfurter,
  },
];

/** 护栏：先区间，再跳变。`prev` 为空（首次取数）时只过区间。 */
export function checkFxCandidate(
  rate: number,
  prev: number | undefined
): { ok: true } | { ok: false; reason: 'out_of_range' | 'jump' } {
  if (!Number.isFinite(rate) || rate < FX_MIN_RATE || rate > FX_MAX_RATE) {
    return { ok: false, reason: 'out_of_range' };
  }
  if (prev !== undefined && Math.abs(rate - prev) / prev > FX_MAX_JUMP) {
    return { ok: false, reason: 'jump' };
  }
  return { ok: true };
}

/** 本站是否需要汇率：本币就是美元（usdExchangeRate === 1）的站点一律不拉。 */
export function siteUsesLiveFx(): boolean {
  return siteConfig.usdExchangeRate !== 1;
}

function validSnapshot(s: unknown): s is FxSnapshot {
  const v = s as FxSnapshot;
  return (
    !!v &&
    Number.isFinite(v.rate) &&
    v.rate >= FX_MIN_RATE &&
    v.rate <= FX_MAX_RATE &&
    typeof v.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(v.fetchedAt))
  );
}

export function readFxCache(): FxCache {
  try {
    const raw = JSON.parse(fs.readFileSync(FX_FILE(), 'utf-8')) as FxCache;
    // 文件被手改或写坏时，坏掉的 last 当作不存在，绝不让它流进计费
    return { ...raw, last: validSnapshot(raw.last) ? raw.last : undefined };
  } catch {
    return {};
  }
}

function writeFxCache(cache: FxCache) {
  const file = FX_FILE();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 先写临时文件再改名：读的一侧永远看不到写了一半的 JSON
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, file);
}

let fetchImpl: typeof fetch = (...args) => fetch(...args);
let inFlight: Promise<void> | null = null;

/** 测试钩子：替换出站 fetch（传 null 还原）。沿用 openrouter-mgmt 的同名机制。 */
export function __setFxFetchForTests(fn: typeof fetch | null) {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

/** 测试钩子：当前后台刷新的 promise（没有则 null），用来等刷新落盘。 */
export function __fxRefreshInFlightForTests(): Promise<void> | null {
  return inFlight;
}

/** 立即刷新一次（后台调度与测试共用）。不抛错：失败只记日志、只推进 lastAttemptAt。 */
export async function refreshFxRate(): Promise<void> {
  const cache = readFxCache();
  const prev = cache.last?.rate;
  const next: FxCache = { ...cache, lastAttemptAt: new Date().toISOString() };
  const errors: string[] = [];

  for (const src of FX_SOURCES) {
    try {
      const res = await fetchImpl(src.url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FX_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = src.parse(await res.json());
      if (!parsed) throw new Error('无法解析');
      const verdict = checkFxCandidate(parsed.rate, prev);
      if (!verdict.ok) {
        next.lastRejected = { rate: parsed.rate, source: src.id, reason: verdict.reason, at: next.lastAttemptAt! };
        console.warn(
          `[fx-rate] 拒绝 ${src.id} 的汇率 ${parsed.rate}（${verdict.reason === 'jump' ? `较上次有效值 ${prev} 变动超过 ${FX_MAX_JUMP * 100}%` : `不在 [${FX_MIN_RATE}, ${FX_MAX_RATE}] 内`}），继续用旧值`
        );
        continue;
      }
      next.last = { rate: parsed.rate, source: src.id, sourceName: src.name, asOf: parsed.asOf, fetchedAt: next.lastAttemptAt! };
      writeFxCache(next);
      return;
    } catch (e) {
      errors.push(`${src.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.warn(`[fx-rate] 汇率源不可用，继续用上次有效值：${errors.join('；')}`);
  writeFxCache(next);
}

function ageMs(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Date.now() - t : Infinity;
}

/**
 * 读上一次有效的即时汇率（同步、不等网络）。缓存过期时顺手在后台发起刷新。
 * 本币是美元的站点恒返回 null 且不发任何请求。
 */
export function getLiveFxRate(): FxSnapshot | null {
  if (!siteUsesLiveFx()) return null;
  const cache = readFxCache();
  const stale = ageMs(cache.last?.fetchedAt) > FX_REFRESH_MS;
  const backedOff = ageMs(cache.lastAttemptAt) < FX_RETRY_MS;
  if (stale && !backedOff && !inFlight) {
    inFlight = refreshFxRate()
      .catch(e => console.warn('[fx-rate] 刷新异常', e))
      .finally(() => {
        inFlight = null;
      });
  }
  return cache.last ?? null;
}
