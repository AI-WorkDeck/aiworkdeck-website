/**
 * 定价页点击埋点验收（此前 7 个 data-analytics 只是属性，没有任何代码上报或落库）。
 *
 * 守的不变式：
 *   - components/pricing 里的 data-analytics 名字集合 = PRICING_CLICK_EVENTS（不多不少）
 *   - 7 个名字都在 /api/telemetry/events 的白名单里，按 sendBeacon 的载荷形状 POST 能落进 telemetry_event
 *   - 匿名：固定 installId，attrs 只有 lang；不在白名单的 pricing_* 名字被静默丢弃
 *   - 监听器不碰 Cookie / localStorage / sessionStorage / 账户，且挂在定价页上
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-pricing-click-tracking.mts
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });

const { PRICING_CLICK_EVENTS, WEB_INSTALL_ID, TELEMETRY_EVENTS_ENDPOINT } = await import('@/lib/pricing-analytics');
const { EVENT_WHITELIST } = await import('@/lib/telemetry-store');
const { getDb } = await import('@/lib/db');
const { POST: eventsPOST } = await import('@/app/api/telemetry/events/route');
const { NextRequest } = await import('next/server');

let checked = 0;
function ok(name: string) {
  checked++;
  console.log('  OK  ', name);
}
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

console.log('\n[1] 组件里的点击位 = 白名单常量');
{
  const dir = path.join(repoRoot, 'components/pricing');
  const found = new Set<string>();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.tsx')) continue;
    for (const m of read(`components/pricing/${f}`).matchAll(/data-analytics="([^"]+)"/g)) found.add(m[1]);
  }
  assert.strictEqual(PRICING_CLICK_EVENTS.length, 7);
  assert.deepStrictEqual([...found].sort(), [...PRICING_CLICK_EVENTS].sort(), 'data-analytics 与 PRICING_CLICK_EVENTS 不一致');
  ok(`7 个点击位逐字一致：${[...found].sort().join(', ')}`);
  for (const n of PRICING_CLICK_EVENTS) assert.ok(EVENT_WHITELIST.has(n), `${n} 不在白名单`);
  ok('7 个名字都在 /api/telemetry/events 白名单');
}

console.log('\n[2] sendBeacon 载荷能落库，且只落白名单内的名字');
{
  assert.strictEqual(TELEMETRY_EVENTS_ENDPOINT, '/api/telemetry/events');
  const ts = new Date().toISOString();
  const body = JSON.stringify({
    installId: WEB_INSTALL_ID,
    appVersion: 'web',
    events: [
      ...PRICING_CLICK_EVENTS.map((eventName) => ({ ts, eventName, attrs: { lang: 'zh' } })),
      { ts, eventName: 'pricing_not_a_real_button', attrs: { lang: 'zh' } },
    ],
  });
  const res = await eventsPOST(
    new NextRequest(`http://localhost${TELEMETRY_EVENTS_ENDPOINT}`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    })
  );
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true, accepted: 7 });
  const rows = getDb()
    .prepare(`SELECT installId, eventName, attrs, appVersion, convKey FROM telemetry_event ORDER BY id`)
    .all() as Array<{ installId: string; eventName: string; attrs: string; appVersion: string; convKey: string | null }>;
  assert.deepStrictEqual(rows.map((r) => r.eventName).sort(), [...PRICING_CLICK_EVENTS].sort());
  for (const r of rows) {
    assert.strictEqual(r.installId, WEB_INSTALL_ID);
    assert.strictEqual(r.appVersion, 'web');
    assert.strictEqual(r.convKey, null);
    assert.deepStrictEqual(JSON.parse(r.attrs), { lang: 'zh' });
  }
  ok('7 条落进 telemetry_event；白名单外的 pricing_* 被丢弃');
  ok('匿名：固定 installId、无 convKey、attrs 只有 lang');
}

console.log('\n[3] 监听器的隐私边界与挂载点');
{
  // 去掉注释再查：注释里写「不用 localStorage」不算违规
  const src = read('components/pricing/PricingClickTracker.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const banned of ['document.cookie', 'localStorage', 'sessionStorage', 'userAgent', 'document.referrer', 'fetch(']) {
    assert.ok(!src.includes(banned), `监听器不许用 ${banned}`);
  }
  assert.ok(src.includes('sendBeacon'), '必须用 sendBeacon（不阻塞跳转）');
  assert.ok(src.includes('WEB_INSTALL_ID'), 'installId 必须用固定常量');
  ok('不读 Cookie / Storage / UA / referrer；只用 sendBeacon + 固定 installId');
  assert.ok(read('components/pricing/PricingPageView.tsx').includes('<PricingClickTracker'), '定价页必须挂监听器');
  ok('PricingPageView 挂载了 PricingClickTracker');
}

console.log(`\n全部通过：${checked} 项`);
