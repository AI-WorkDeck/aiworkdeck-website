/** /zh-TW-style paths redirect to our locale slug (Q16); the public membership page needs no 401 (W15). */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'package.json'));
const stub = (id: string, exports: object) => { const f = req.resolve(id); req.cache[f] = { id: f, filename: f, loaded: true, exports } as unknown as NodeJS.Module; };
stub('server-only', {});
stub('next/headers', { cookies: async () => ({ get: () => undefined, getAll: () => [] }), headers: async () => new Headers() });
const { NextRequest } = await import('next/server');
const { middleware } = await import('@/middleware');
const { siteConfig } = await import('@/lib/site-config');
const origin = siteConfig.origin;
const go = (p: string) => middleware(new NextRequest(`${origin}${p}`, { headers: { 'accept-language': 'en' } }));
for (const [from, to] of [['/zh-TW', '/zh-hant'], ['/zh-tw/pricing', '/zh-hant/pricing'], ['/zh_HK/faq', '/zh-hant/faq'], ['/en-US/legal/privacy', '/en/legal/privacy'], ['/zh-CN', '/zh'], ['/pt-BR/start?ref=x', '/pt/start?ref=x']] as const) {
    const res = go(from);
    assert.equal(res?.status, 308, `${from} is a permanent redirect`);
    assert.equal(res?.headers.get('location'), `${origin}${to}`, `${from} -> ${to}`);
}
assert.equal(go('/zh-hant/pricing'), undefined, 'real slugs are untouched');
assert.notEqual(go('/web-guide')?.headers.get('location'), `${origin}/web`, 'non-language segments are not treated as tags');
assert.equal(go('/xx-YY')?.headers.get('location'), `${origin}/en/xx-YY`, 'unknown tags fall back to the normal locale redirect');

const { GET } = await import('@/app/api/account/membership/route');
const anon = await GET(new NextRequest(`${origin}/api/account/membership?optional=1`));
assert.equal(anon.status, 200);
assert.deepEqual(await anon.json(), { signedIn: false }, 'the public page learns "signed out" without a 4xx');
assert.equal((await GET(new NextRequest(`${origin}/api/account/membership`))).status, 401, 'other callers keep the 401 contract');
console.log('PASS locale-tag redirects and signed-out membership response');
