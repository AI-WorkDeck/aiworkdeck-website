/** Skill charts show no placeholder rows or thin boards; 404 and submit pages have their own titles and language. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const repo = process.cwd();
const req = createRequire(path.join(repo, 'package.json'));
const stub = (id: string, exports: object) => { const f = req.resolve(id); req.cache[f] = { id: f, filename: f, loaded: true, exports } as unknown as NodeJS.Module; };
let lang = 'zh-hant';
stub('server-only', {});
stub('next/navigation', { useParams: () => ({ lang }), useRouter: () => ({ push() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() });
const dict = (l: string) => JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', `${l}.json`), 'utf8'));
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ');

// 404: every locale gets its own copy (zh-hant used to fall back to Simplified Chinese).
const { NotFoundContent } = await import('@/app/[lang]/NotFoundContent');
const copy = Object.fromEntries(['zh', 'zh-hant', 'en', 'ja'].map(l => [l, dict(l).notFoundPage]));
for (const l of ['zh-hant', 'ja', 'en']) {
    lang = l;
    assert.ok(text(renderToStaticMarkup(React.createElement(NotFoundContent, { copy: copy as never }))).includes(dict(l).notFoundPage.title), `404 in ${l}`);
}

// Skill charts on an empty store (today's reality): no 'open seat' placeholders, no empty boards, the join CTA stays.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awd-charts-'));
process.chdir(dir);
const { default: Charts } = await import('@/app/[lang]/skills/charts/page');
for (const l of ['en', 'zh']) {
    const html = text(renderToStaticMarkup(await Charts({ params: Promise.resolve({ lang: l as never }), searchParams: Promise.resolve({}) })));
    const t = dict(l).chartsPage;
    assert.ok(!html.includes(t.freeTitle) && !html.includes(t.creatorsTitle), `${l}: boards with fewer than 5 entries are hidden`);
    assert.ok(html.includes(t.joinCta), `${l}: join CTA still shown`);
    assert.equal(t.emptySlot, undefined, 'placeholder copy is gone');
}
process.chdir(repo);
fs.rmSync(dir, { recursive: true, force: true });

// Submit/developer pages: own titles instead of the home page title.
for (const [page, key] of [['plugins/developer', 'developerPage'], ['plugins/submit', 'pluginSubmitPage'], ['skills/submit', 'submitPage']] as const) {
    const mod = await import(`@/app/[lang]/${page}/page`);
    const meta = await mod.generateMetadata({ params: Promise.resolve({ lang: 'en' }) });
    assert.equal(meta.title, dict('en')[key].title, `${page} has its own title`);
}
assert.ok(!fs.existsSync(path.join(repo, 'components/ProductHuntBadge.tsx')), 'Product Hunt badge removed (CEO, W8)');
console.log('PASS charts hide thin boards; 404 per locale; submit pages titled');
