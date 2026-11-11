// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 即时汇率与计费汇率裁决（dev-board#853）。出站 fetch 全部打桩，不碰真实网络。
 *
 * 两站各跑一遍（CI 契约矩阵）：
 * - cn：解析 / 区间护栏 / 跳变护栏 / 源失败回退 / 手动优先 / 老文件迁移口径 /
 *       过期惰性刷新且不阻塞 / 失败退避 / 后台接口；
 * - intl：恒为 1，一次请求都不发、不落缓存文件，手动值也压不住它。
 *
 * 必须在空目录里执行（data/ 建在 cwd）：
 *   cd "$(mktemp -d)" && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-fx-rate.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

assert.ok(!fs.existsSync(path.join(process.cwd(), 'package.json')), '必须在隔离目录运行');
fs.mkdirSync('data', { recursive: true });
const FX_FILE = path.join('data', 'fx-rate.json');
const CFG_FILE = path.join('data', 'ai-config.json');

const fx = await import('@/lib/fx-rate');
const { getExchangeRateInfo } = await import('@/lib/ai-config');
const { SITE_ID, siteConfig } = await import('@/lib/site-config');

let checked = 0;
function ok(name: string) {
  checked++;
  console.log('  OK  ', name);
}

// ---------- 打桩 ----------
type Reply = { status?: number; body?: unknown; throws?: string } | (() => Promise<Response>);
let calls: string[] = [];
let replies: Record<'chinamoney' | 'frankfurter', Reply> = {
  chinamoney: { throws: 'offline' },
  frankfurter: { throws: 'offline' },
};
fx.__setFxFetchForTests((async (input: string | URL | Request) => {
  const url = String(input);
  calls.push(url);
  const r = url.includes('chinamoney') ? replies.chinamoney : replies.frankfurter;
  if (typeof r === 'function') return r();
  if (r.throws) throw new Error(r.throws);
  return new Response(JSON.stringify(r.body), {
    status: r.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch);

/** 2026-09-23 实取的 ccpr.json，裁掉了美元以外的币种 */
const cm = (price: string) => ({
  head: { version: '2.0', provider: 'CWAP', rep_code: '200' },
  data: { lastDateEn: '23/09/2026 9:15', lastDate: '2026-09-23 9:15' },
  records: [
    { vrtCode: '2', price: '7.6935', vrtName: '欧元/人民币', vrtEName: 'EUR/CNY' },
    { vrtCode: '1', price, vrtName: '美元/人民币', vrtEName: 'USD/CNY' },
  ],
});
/** 2026-09-23 实取的 frankfurter.dev 响应 */
const ff = (rate: number) => ({ amount: 1.0, base: 'USD', date: '2026-09-22', rates: { CNY: rate } });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
function seedCache(cache: object | null) {
  if (cache === null) fs.rmSync(FX_FILE, { force: true });
  else fs.writeFileSync(FX_FILE, JSON.stringify(cache));
}
function seedCfg(cfg: object | null) {
  if (cfg === null) fs.rmSync(CFG_FILE, { force: true });
  else fs.writeFileSync(CFG_FILE, JSON.stringify(cfg));
}
const snap = (rate: number, fetchedAt = hoursAgo(1)) => ({
  rate,
  source: 'chinamoney',
  sourceName: '中国外汇交易中心 人民币汇率中间价',
  asOf: null,
  fetchedAt,
});
/** 等后台刷新落盘：读缓存可能顺手触发刷新，不等完就改下一组桩会让两步互相踩 */
async function drain() {
  const p = fx.__fxRefreshInFlightForTests();
  if (p) await p;
}
function assertSane(rate: number, label: string) {
  assert.ok(Number.isFinite(rate) && rate > 0, `${label}：计费汇率必须是有限正数，实际 ${rate}`);
}

console.log(`site = ${SITE_ID}`);

if (!fx.siteUsesLiveFx()) {
  // ================= 国际站 =================
  assert.equal(siteConfig.usdExchangeRate, 1);
  seedCfg({ exchangeRateMode: 'manual', exchangeRate: 7.3 });
  replies = { chinamoney: { body: cm('6.7468') }, frankfurter: { body: ff(6.7) } };
  for (let i = 0; i < 3; i++) {
    const info = getExchangeRateInfo();
    assert.equal(info.rate, 1);
    assert.equal(info.source, 'default');
    assert.equal(info.updatedAt, null);
  }
  assert.equal(fx.getLiveFxRate(), null);
  assert.equal(fx.__fxRefreshInFlightForTests(), null);
  assert.equal(calls.length, 0, '国际站不得发出任何汇率请求');
  assert.ok(!fs.existsSync(FX_FILE), '国际站不得落汇率缓存');
  ok('国际站：恒为 1、source=default，手动值压不住，零出站请求、零缓存文件');
} else {
  // ================= 国内站 =================
  assert.ok(siteConfig.usdExchangeRate !== 1);
  const DEFAULT = siteConfig.usdExchangeRate;

  // ---- 1. 解析 ----
  assert.deepEqual(fx.parseChinamoney(cm('6.7468')), { rate: 6.7468, asOf: '2026-09-23T09:15:00+08:00' });
  assert.deepEqual(fx.parseFrankfurter(ff(6.7001)), { rate: 6.7001, asOf: '2026-09-22' });
  assert.equal(fx.parseChinamoney({ records: [{ vrtEName: 'EUR/CNY', price: '7.69' }] }), null, '没有 USD/CNY 行');
  assert.equal(fx.parseChinamoney({ records: [{ vrtEName: 'USD/CNY', price: '---' }] }), null, '价格不是数');
  assert.equal(fx.parseChinamoney(null), null);
  assert.equal(fx.parseFrankfurter({ base: 'EUR', rates: { CNY: 7.9 } }), null, '基准币不是美元');
  ok('解析：中间价与 ECB 两种响应都取对值与日期，畸形响应返回 null');

  // 解析成功 → 落缓存 → 计费生效
  seedCfg(null);
  seedCache(null);
  calls = [];
  replies = { chinamoney: { body: cm('6.7468') }, frankfurter: { body: ff(6.7001) } };
  await fx.refreshFxRate();
  let info = getExchangeRateInfo();
  assert.equal(info.rate, 6.7468);
  assert.equal(info.source, 'live');
  assert.equal(info.provider, '中国外汇交易中心 人民币汇率中间价');
  assert.equal(info.asOf, '2026-09-23T09:15:00+08:00');
  assert.ok(info.updatedAt && Number.isFinite(Date.parse(info.updatedAt)));
  assert.equal(calls.length, 1, '首选源成功就不再请求备选源');
  ok('解析成功：首选中间价，source=live，带数据源名称与更新时间');

  // ---- 2. 区间护栏 ----
  for (const bad of [4.99, 10.01, NaN, 0, -6.8]) {
    assert.deepEqual(fx.checkFxCandidate(bad, undefined), { ok: false, reason: 'out_of_range' }, `应拒绝 ${bad}`);
  }
  assert.deepEqual(fx.checkFxCandidate(5, undefined), { ok: true });
  assert.deepEqual(fx.checkFxCandidate(10, undefined), { ok: true });
  // 首选源给出越界值 → 换备选源
  seedCache(null);
  replies = { chinamoney: { body: cm('67.468') }, frankfurter: { body: ff(6.7001) } };
  await fx.refreshFxRate();
  let cache = fx.readFxCache();
  assert.equal(cache.last?.rate, 6.7001);
  assert.equal(cache.last?.source, 'frankfurter');
  assert.equal(cache.lastRejected?.reason, 'out_of_range');
  assert.equal(cache.lastRejected?.rate, 67.468);
  // 两个源都越界、且没有上次有效值 → 回退站点默认值
  seedCache(null);
  replies = { chinamoney: { body: cm('0.1467') }, frankfurter: { body: ff(146.7) } };
  await fx.refreshFxRate();
  info = getExchangeRateInfo();
  assert.equal(info.rate, DEFAULT);
  assert.equal(info.source, 'default');
  // 缓存文件被手改成越界值 → 当作不存在
  seedCache({ last: snap(73) });
  assert.equal(fx.readFxCache().last, undefined);
  assert.equal(getExchangeRateInfo().source, 'default');
  await drain();
  ok('区间护栏：[5,10] 之外一律拒绝，首选越界换备选，全越界回退默认值，坏缓存不入计费');

  // ---- 3. 跳变护栏 ----
  assert.deepEqual(fx.checkFxCandidate(6.75 * 1.049, 6.75), { ok: true });
  assert.deepEqual(fx.checkFxCandidate(6.75 * 1.051, 6.75), { ok: false, reason: 'jump' });
  assert.deepEqual(fx.checkFxCandidate(6.75 * 0.949, 6.75), { ok: false, reason: 'jump' });
  seedCache({ last: snap(6.75, hoursAgo(20)) });
  replies = { chinamoney: { body: cm('7.2000') }, frankfurter: { body: ff(7.19) } }; // +6.7%
  const warned: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => void warned.push(a.map(String).join(' '));
  await fx.refreshFxRate();
  console.warn = origWarn;
  cache = fx.readFxCache();
  assert.equal(cache.last?.rate, 6.75, '跳变超过 5% 不采用');
  assert.equal(cache.lastRejected?.reason, 'jump');
  assert.ok(cache.lastAttemptAt && Date.now() - Date.parse(cache.lastAttemptAt) < 60_000, '推进尝试时刻以便退避');
  assert.ok(warned.some(w => w.includes('[fx-rate]') && w.includes('7.2')), '被拒要记日志');
  assert.equal(getExchangeRateInfo().rate, 6.75);
  // 首次取数（没有上次有效值）不拿站点默认值当跳变基准：7.3 → 6.7 是 -8%，照样要能采用
  seedCache(null);
  replies = { chinamoney: { body: cm('6.7468') }, frankfurter: { body: ff(6.7) } };
  await fx.refreshFxRate();
  assert.equal(fx.readFxCache().last?.rate, 6.7468);
  ok('跳变护栏：较上次有效值超过 5% 不采用、记日志、沿用旧值；首次取数不以默认值为基准');

  // ---- 4. 源失败回退 ----
  seedCache({ last: snap(6.75, hoursAgo(20)) });
  calls = [];
  replies = { chinamoney: { status: 503, body: {} }, frankfurter: { body: ff(6.7001) } };
  await fx.refreshFxRate();
  assert.equal(fx.readFxCache().last?.source, 'frankfurter');
  assert.equal(calls.length, 2);
  // 两个源都挂 → 上次有效值
  seedCache({ last: snap(6.75, hoursAgo(20)) });
  replies = { chinamoney: { throws: 'ETIMEDOUT' }, frankfurter: { status: 500, body: {} } };
  console.warn = () => undefined;
  await fx.refreshFxRate();
  console.warn = origWarn;
  info = getExchangeRateInfo();
  assert.equal(info.rate, 6.75);
  assert.equal(info.source, 'live');
  // 连上次有效值都没有 → 站点默认值；任何情况下都不是 NaN / 0
  seedCache(null);
  console.warn = () => undefined;
  await fx.refreshFxRate();
  console.warn = origWarn;
  info = getExchangeRateInfo();
  assert.equal(info.rate, DEFAULT);
  assert.equal(info.source, 'default');
  assert.equal(info.updatedAt, null);
  for (const junk of ['{', '[]', '{"last":{"rate":"abc","fetchedAt":"x"}}', '{"last":{"rate":0,"fetchedAt":"2026-01-01T00:00:00Z"}}']) {
    fs.writeFileSync(FX_FILE, junk);
    console.warn = () => undefined;
    assertSane(getExchangeRateInfo().rate, `缓存内容 ${junk}`);
    assert.equal(getExchangeRateInfo().source, 'default');
    await drain();
    console.warn = origWarn;
  }
  ok('源失败回退：首选挂了用备选，全挂用上次有效值，再没有用站点默认值；坏文件永不产出 NaN/0');

  // ---- 5. 手动优先 与 老文件迁移口径 ----
  seedCache({ last: snap(6.75) });
  seedCfg({ exchangeRateMode: 'manual', exchangeRate: 7.1, exchangeRateUpdatedAt: '2026-09-23T01:00:00.000Z' });
  info = getExchangeRateInfo();
  assert.equal(info.rate, 7.1);
  assert.equal(info.source, 'manual');
  assert.equal(info.updatedAt, '2026-09-23T01:00:00.000Z');
  // 老文件：只有 exchangeRate、没有 mode → 视为自动，即时汇率生效，7.3 只留作手动备用值
  seedCfg({ apiKey: 'sk-or-legacy', exchangeRate: 7.3, marginMultiplier: 1.2 });
  info = getExchangeRateInfo();
  assert.equal(info.mode, 'auto');
  assert.equal(info.source, 'live');
  assert.equal(info.rate, 6.75);
  // 手动模式但手动值非法 → 不采信，落到即时
  seedCfg({ exchangeRateMode: 'manual', exchangeRate: 'abc' });
  assert.equal(getExchangeRateInfo().source, 'live');
  // 手动模式下不因计费读取而去拉即时汇率
  seedCfg({ exchangeRateMode: 'manual', exchangeRate: 7.1 });
  seedCache({ last: snap(6.75, hoursAgo(48)) });
  calls = [];
  getExchangeRateInfo();
  assert.equal(calls.length, 0);
  ok('手动优先：manual 模式以手动值为准；无 mode 的老文件按自动处理，7.3 不再压住即时汇率');

  // ---- 6. 缓存过期触发刷新，且不阻塞当前请求 ----
  seedCfg(null);
  seedCache({ last: snap(6.8, hoursAgo(13)) });
  calls = [];
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  replies = {
    chinamoney: async () => {
      await gate;
      return new Response(JSON.stringify(cm('6.7468')), { status: 200 });
    },
    frankfurter: { body: ff(6.7) },
  };
  const t0 = Date.now();
  info = getExchangeRateInfo();
  assert.ok(Date.now() - t0 < 200, '读取不得等网络');
  assert.equal(info.rate, 6.8, '当前请求照用旧值');
  const pending = fx.__fxRefreshInFlightForTests();
  assert.ok(pending, '过期缓存应在后台发起刷新');
  getExchangeRateInfo();
  getExchangeRateInfo();
  assert.equal(calls.length, 1, '刷新进行中不得重复发请求');
  release();
  await pending;
  info = getExchangeRateInfo();
  assert.equal(info.rate, 6.7468, '刷新落盘后下一次读取拿到新值');
  assert.equal(fx.__fxRefreshInFlightForTests(), null);
  // 新鲜缓存不刷新
  calls = [];
  seedCache({ last: snap(6.8, hoursAgo(11)) });
  getExchangeRateInfo();
  assert.equal(fx.__fxRefreshInFlightForTests(), null);
  assert.equal(calls.length, 0);
  // 过期但 30 分钟内刚失败过 → 退避，不重试
  seedCache({ last: snap(6.8, hoursAgo(13)), lastAttemptAt: hoursAgo(0.2) });
  getExchangeRateInfo();
  assert.equal(fx.__fxRefreshInFlightForTests(), null);
  assert.equal(calls.length, 0);
  ok('过期（>12h）在后台刷新、当前请求用旧值不等待、不重复发请求；未过期或退避期内不刷新');

  // ---- 7. 后台接口：来源开关 ----
  process.env.AWD_ADMIN_TOKEN = 'verify-fx-rate-admin-token';
  const { NextRequest } = await import('next/server');
  const adminRoute = await import('@/app/api/admin/ai/route');
  const overviewRoute = await import('@/app/api/admin/overview/route');
  const put = (body: unknown) =>
    adminRoute.PUT(
      new NextRequest('http://localhost/api/admin/ai', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', cookie: 'awd_admin=verify-fx-rate-admin-token' },
      })
    );
  seedCfg(null);
  seedCache({ last: snap(6.75) });
  let res = await put({ exchangeRateMode: 'manual' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'manual_rate_required');
  res = await put({ exchangeRateMode: 'sometimes' });
  assert.equal((await res.json()).error, 'invalid_exchange_rate_mode');
  res = await put({ exchangeRateMode: 'manual', exchangeRate: 7.05 });
  let body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ai.exchangeRate, 7.05);
  assert.equal(body.ai.exchangeRateSource, 'manual');
  const saved = JSON.parse(fs.readFileSync(CFG_FILE, 'utf-8'));
  assert.ok(saved.exchangeRateUpdatedAt, '改手动值要记时间');
  res = await put({ exchangeRateMode: 'auto' });
  body = await res.json();
  assert.equal(body.ai.exchangeRate, 6.75);
  assert.equal(body.ai.exchangeRateSource, 'live');
  assert.equal(JSON.parse(fs.readFileSync(CFG_FILE, 'utf-8')).exchangeRate, 7.05, '切回自动保留手动值');
  // 国内模型由服务器管理：拒绝修改，且不得修改已有汇率配置。
  const beforeReadOnly = fs.readFileSync(CFG_FILE, 'utf-8');
  res = await put({ model: 'qwen/qwen3-max' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'server_managed_credentials');
  assert.equal(fs.readFileSync(CFG_FILE, 'utf-8'), beforeReadOnly);
  // 只改仍可编辑的毛利、不带汇率字段：汇率配置保持不变。
  res = await put({ marginMultiplier: 1.3 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ai.exchangeRateSource, 'live');
  const ov = await (
    await overviewRoute.GET(
      new NextRequest('http://localhost/api/admin/overview', {
        headers: { cookie: 'awd_admin=verify-fx-rate-admin-token' },
      })
    )
  ).json();
  assert.equal(ov.ai.exchangeRate, 6.75);
  assert.equal(ov.ai.fx.source, 'live');
  assert.equal(ov.ai.fx.mode, 'auto');
  assert.equal(ov.ai.fx.manualRate, 7.05);
  assert.equal(ov.ai.fx.live.rate, 6.75);
  assert.equal(ov.ai.fx.provider, '中国外汇交易中心 人民币汇率中间价');
  assert.equal(ov.ai.fx.liveEnabled, true);
  ok('后台：切手动必须有值、模式非法拒绝、切回自动保留手动值，概览给出生效值/来源/时间/数据源');
}

console.log(`\nverify-fx-rate (${SITE_ID})：${checked} 组断言全部通过`);
