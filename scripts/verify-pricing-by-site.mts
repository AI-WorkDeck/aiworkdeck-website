/** Each site's pricing page offers only what a visitor there can buy, without internal jargon. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const repo = path.dirname(path.dirname(self));
const site = process.argv[2];
if (!site) {
    for (const s of ['cn', 'intl']) {
        execFileSync(path.join(repo, 'node_modules/.bin/tsx'), ['--tsconfig', path.join(repo, 'tsconfig.json'), self, s], { cwd: repo, env: { ...process.env, NEXT_PUBLIC_AWD_SITE: s }, stdio: 'inherit' });
    }
} else {
    // Rendering server components outside Next: let the 'server-only' marker import resolve to nothing.
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(repo, 'package.json'));
    const marker = req.resolve('server-only');
    req.cache[marker] = { id: marker, filename: marker, loaded: true, exports: {} } as unknown as NodeJS.Module;
    // Client components read the router; outside Next there is none, so give them an inert one.
    const nav = req.resolve('next/navigation');
    const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
    req.cache[nav] = { id: nav, filename: nav, loaded: true, exports: { useRouter: () => router, usePathname: () => '/en/pricing', useSearchParams: () => new URLSearchParams(), useParams: () => ({}) } } as unknown as NodeJS.Module;
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PricingPageView } = await import('@/components/pricing/PricingPageView');
    const fs = await import('node:fs');
    // get-dictionary is server-only; the page reads the same JSON.
    const getDictionary = async (lang: string) => JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', `${lang}.json`), 'utf8'));
    for (const lang of ['en', 'zh', 'ja'] as const) {
        const dict = await getDictionary(lang);
        const html = renderToStaticMarkup(React.createElement(PricingPageView, { lang, t: dict.pricingPage, grantLabels: dict.common?.grant }));
        const text = html.replace(/<[^>]+>/g, ' ');
        for (const jargon of ['MARKETPLACE-TERMS', '×1.2', 'counsel', '法务书面确认', 'gross×split', 'ARR']) {
            assert.ok(!text.includes(jargon), `${site}/${lang}: no internal jargon "${jargon}"`);
        }
        if (site === 'intl') {
            assert.ok(!text.includes('¥'), `intl/${lang}: no yuan prices`);
            assert.ok(!text.includes(dict.pricingPage.pro.title), `intl/${lang}: no Personal Pro card`);
            assert.ok(text.includes(dict.pricingPage.heroTitleIntl), `intl/${lang}: leads with free-with-your-own-key`);
            assert.ok(/\$100/.test(text), `intl/${lang}: USD wallet top-up shown`);
        } else {
            assert.ok(text.includes(dict.pricingPage.pro.title), `cn/${lang}: Personal Pro card stays`);
            assert.ok(text.includes('¥149') || text.includes('¥9.9'), `cn/${lang}: CNY Pro price stays`);
        }
    }
    console.log(`PASS ${site}: pricing page shows only what this site sells, no internal jargon`);
}
