// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `/captcha-embed` 嵌入契约自测（doc/desktop-contract.md「/captcha-embed 嵌入契约」）。
 *
 * 为什么不并进 contract-check.mts：那份脚本直接调 route handler、刻意不起 next 服务；
 * 而这里要验的是**页面**加上 next.config.ts headers() 叠出来的响应头，只有真服务才产得出来。
 *
 * 对一个已在跑的站点执行（两站各构建、各起一次，各跑一遍）：
 *   NEXT_PUBLIC_AWD_SITE=intl npm run build && npm run start   # 另一个终端
 *   npx --yes tsx scripts/verify-captcha-embed.mts [http://localhost:3000]
 */
import assert from 'assert';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
let passed = 0;
const ok = (l: string) => { passed++; console.log('  ok -', l); };

/** 按指令名拆 CSP，便于逐条比对 */
function directives(csp: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of csp.split(';').map(s => s.trim()).filter(Boolean)) {
    const [name, ...rest] = part.split(/\s+/);
    m.set(name, rest.join(' '));
  }
  return m;
}

const res = await fetch(`${base}/captcha-embed?lang=en`, { redirect: 'manual' });
// 不许被 middleware 的 locale 重定向补成 /en/captcha-embed：那条路由不存在，iframe 里就是 404
assert.strictEqual(res.status, 200, `GET /captcha-embed 应为 200，实际 ${res.status} ${res.headers.get('location') ?? ''}`);
ok('GET /captcha-embed → 200（未被 locale 重定向）');

const csp = res.headers.get('content-security-policy') || '';
assert.ok(csp.includes('frame-ancestors *'), `CSP 应含 frame-ancestors *，实际：${csp}`);
const fa = directives(csp).get('frame-ancestors') || '';
assert.ok(fa.split(' ').includes('file:'), `frame-ancestors 应单列 file:（'*' 不含 file:，桌面端父页是 file://），实际：${fa}`);
ok(`content-security-policy 含 frame-ancestors ${fa}`);

const xfo = (res.headers.get('x-frame-options') || '').toUpperCase();
assert.ok(xfo !== 'SAMEORIGIN' && xfo !== 'DENY', `X-Frame-Options 必须被覆盖掉，实际：${xfo}`);
ok(`x-frame-options 不是 SAMEORIGIN/DENY（实际 ${xfo || '无'}）`);

// 除 frame-ancestors 外必须与全站 CSP 逐条相同——放开的只有「被谁嵌」这一条
const siteRes = await fetch(`${base}/robots.txt`, { redirect: 'manual' });
const site = directives(siteRes.headers.get('content-security-policy') || '');
const embed = directives(csp);
assert.strictEqual(site.get('frame-ancestors'), "'self'", '全站 CSP 仍应是 frame-ancestors \'self\'');
site.delete('frame-ancestors');
embed.delete('frame-ancestors');
assert.deepStrictEqual([...embed.entries()], [...site.entries()], '除 frame-ancestors 外应与全站 CSP 逐字相同');
ok('其余 CSP 指令与全站逐字相同；全站仍是 frame-ancestors \'self\'');

const html = await res.text();
assert.ok(/<meta name="robots" content="[^"]*noindex/.test(html), '页面应带 robots noindex');
ok('页面带 robots noindex');

console.log(`\n/captcha-embed 契约全绿：${passed} 项（${base}）`);
