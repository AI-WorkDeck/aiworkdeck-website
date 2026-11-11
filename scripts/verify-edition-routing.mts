import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
const { middleware } = await import('@/middleware');
const { communityHomePath } = await import('@/lib/edition-paths');
const { SITE_ID, crossSiteUrl, siteConfig } = await import('@/lib/site-config');

assert.equal(communityHomePath('en', 'intl'), '/en');
assert.equal(communityHomePath('zh', 'cn'), '/zh');
assert.equal(communityHomePath('en'), '/en');
const origin = siteConfig.origin;
const request = (path: string) => new NextRequest(`${origin}${path}`, { headers: { 'accept-language': 'en' } });
const location = (path: string) => middleware(request(path))?.headers.get('location');

// Locale detection must preserve referral, feature and encoded query values.
assert.equal(location('/start?ref=u-alice&next=%2Fen%2Faccount&tag=a&tag=b'), `${origin}/en/start?ref=u-alice&next=%2Fen%2Faccount&tag=a&tag=b`);
assert.equal(location('/?feature-request=1'), `${origin}/en?feature-request=1`);

// A regional opt-in is removed once; unrelated query parameters and deep links survive.
const optIn = middleware(request(`/en/start?site=${SITE_ID}&ref=u-alice`));
assert.equal(optIn?.headers.get('location'), `${origin}/en/start?ref=u-alice`);
assert.equal(optIn?.cookies.get('awd_site')?.value, SITE_ID);
assert.equal(middleware(request('/en/start?ref=u-alice')), undefined);

// App-store crawlers may discard cookies: public mobile links must render without
// removing the explicit region and sending the next request to another operator.
for (const path of [
    '/mobile-account',
    '/mobile-account/en?flow=register',
    '/mobile-account/zh?flow=reset&legacyEmail=1',
    '/mobile-account/en/privacy?scope=general',
    '/mobile-account/en/deletion',
    '/en/legal/mobile-privacy',
    '/zh/legal/mobile-account-deletion',
]) {
    const url = `${path}${path.includes('?') ? '&' : '?'}site=${SITE_ID}`;
    const mobile = middleware(request(url));
    assert.equal(mobile?.headers.get('location'), null, url);
    assert.equal(mobile?.headers.get('x-middleware-next'), '1', url);
    assert.equal(mobile?.cookies.get('awd_site')?.value, SITE_ID, url);
}
for (const path of ['/mobile-accounting/en', '/en/legal/privacy', '/en/legal/mobile-privacy-extra', '/en/legal/mobile-account-deletion/extra']) {
    assert.equal(location(`${path}?site=${SITE_ID}&ref=u-alice`), `${origin}${path}?ref=u-alice`);
}
const otherSite = SITE_ID === 'intl' ? 'cn' : 'intl';
assert.equal(middleware(request(`/mobile-account/en/privacy?site=${otherSite}`))?.cookies.get('awd_site'), undefined);

// A link without a locale first sets the region cookie, then adds the locale, without a loop.
const clean = location(`/start?site=${SITE_ID}&ref=u-alice`)!;
assert.equal(clean, `${origin}/start?ref=u-alice`);
assert.equal(location(new URL(clean).pathname + new URL(clean).search), `${origin}/en/start?ref=u-alice`);
assert.equal(location('/en/account'), undefined);
assert.equal(location('/en/community/post/123'), undefined);
if (SITE_ID === 'intl') {
    const us = middleware(new NextRequest('https://www.aiworkdeck.us/en/start?site=intl&ref=u-alice'));
    assert.equal(us?.headers.get('location'), 'https://www.aiworkdeck.us/en/start?ref=u-alice');
    assert.equal(us?.cookies.get('awd_site')?.value, 'intl');
}

for (const target of ['cn', 'intl'] as const) {
    const start = new URL(crossSiteUrl(target, '/zh/start?ref=u-alice'));
    assert.equal(start.pathname, '/zh/start');
    assert.equal(start.searchParams.get('ref'), 'u-alice');
    assert.equal(start.searchParams.get('site'), target);
    assert.equal(new URL(crossSiteUrl(target, '/en/account')).pathname, '/en/account');
}

// API consumers must never enter the edition or locale flows.
const api = middleware(request('/api/account/me'));
assert.equal(api?.headers.get('location'), null);
console.log(`Edition and regional routing checks passed (${SITE_ID}).`);

// Pricing is an independent page again (feat/pricing-page-v2): no permanentRedirect to FAQ.
// Avoid importing the RSC page module here (get-dictionary is server-only); assert source instead.
const pricingPageSrc = await readFile(new URL('../app/[lang]/pricing/page.tsx', import.meta.url), 'utf8');
assert.ok(!/\bpermanentRedirect\s*\(/.test(pricingPageSrc), 'pricing page must not call permanentRedirect');
assert.ok(pricingPageSrc.includes('PricingPageView'), 'pricing page must render PricingPageView');
assert.ok(pricingPageSrc.includes('getDictionary'), 'pricing page loads dictionary on the server');
const sitemapSrc = await readFile(new URL('../app/sitemap.ts', import.meta.url), 'utf8');
assert.ok(sitemapSrc.includes("path: '/pricing'"), 'sitemap must list /pricing');
console.log('Independent /pricing page is restored (no FAQ permanentRedirect); sitemap lists /pricing.');

// Retired Enterprise bookmarks must return 404 on both sites, never redirect.
const { default: Enterprise } = await import('../app/[lang]/enterprise/page');
await assert.rejects(Enterprise(), (error: unknown) =>
    error instanceof Error && 'digest' in error && error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404',
);
console.log('Retired Enterprise bookmarks return 404 on both sites.');
