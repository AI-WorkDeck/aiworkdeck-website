/** Sign-in page: one site-specific line about account systems, and the reviewer login only on ?review=1. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const repo = path.dirname(path.dirname(self));
const site = process.argv[2];
if (!site) {
    for (const s of ['cn', 'intl']) execFileSync(path.join(repo, 'node_modules/.bin/tsx'), ['--tsconfig', path.join(repo, 'tsconfig.json'), self, s], { cwd: repo, env: { ...process.env, NEXT_PUBLIC_AWD_SITE: s }, stdio: 'inherit' });
} else {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(repo, 'package.json'));
    const stub = (id: string, exports: object) => { const f = req.resolve(id); req.cache[f] = { id: f, filename: f, loaded: true, exports } as unknown as NodeJS.Module; };
    stub('server-only', {});
    const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
    stub('next/navigation', { useRouter: () => router, usePathname: () => '/en/account', useSearchParams: () => new URLSearchParams(), useParams: () => ({}) });
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SiteNotice } = await import('@/app/[lang]/account/SiteNotice');
    const { AuthForms } = await import('@/app/[lang]/account/AuthForms');
    const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");
    for (const lang of ['en', 'zh', 'zh-hant'] as const) {
        const dict = JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', `${lang}.json`), 'utf8'));
        const sn = dict.accountPage.siteNotice;
        const notice = text(await SiteNotice({ lang, dict }));
        assert.ok(notice.includes(site === 'intl' ? sn.summaryIntl : sn.summaryCn), `${site}/${lang}: banner line picked by site`);
        assert.ok(!notice.includes(site === 'intl' ? sn.summaryCn : sn.summaryIntl), `${site}/${lang}: not the other site's line`);
        const props = { lang, dict, codeChannelReady: true };
        assert.ok(!text(React.createElement(AuthForms, props)).includes(dict.authPage.reviewLogin), `${lang}: no reviewer login link for regular visitors`);
        assert.ok(text(React.createElement(AuthForms, { ...props, reviewEntry: true })).includes(dict.authPage.reviewLogin), `${lang}: reviewer login reachable via ?review=1`);
    }
    if (site === 'cn') {
        const hant = JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', 'zh-hant.json'), 'utf8'));
        const s = JSON.stringify([hant.authPage, hant.accountPage.siteNotice]);
        for (const simplifiedTerm of ['賬號', '數據庫', '登錄', '創建', '加載', '郵箱']) assert.ok(!s.includes(simplifiedTerm), `zh-hant sign-in copy uses Taiwan terms, not "${simplifiedTerm}"`);
    }
    console.log(`PASS ${site}: site-specific account banner; reviewer login only on ?review=1`);
}
