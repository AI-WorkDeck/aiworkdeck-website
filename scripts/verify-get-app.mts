/** /get-app (fallback of the /app smart link): one heading, and desktop visitors get a way to the desktop app. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const repo = process.cwd();
const req = createRequire(path.join(repo, 'package.json'));
const stub = (id: string, exports: object) => { const f = req.resolve(id); req.cache[f] = { id: f, filename: f, loaded: true, exports } as unknown as NodeJS.Module; };
let ua = '';
stub('server-only', {});
stub('next/headers', { headers: async () => new Headers({ 'user-agent': ua }) });
const React = await import('react');
const { renderToReadableStream } = await import('react-dom/server');
// MobileAppSection is an async component: the streaming renderer waits for it, renderToStaticMarkup can't.
const renderAll = async (el: React.ReactElement) => { const stream = await renderToReadableStream(el); await stream.allReady; return await new Response(stream).text(); };
const { default: GetApp } = await import('@/app/[lang]/get-app/page');
for (const lang of ['en', 'zh']) {
    const t = JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', `${lang}.json`), 'utf8')).startPage.mobileApp;
    const render = async (agent: string) => { ua = agent; return renderAll(await GetApp({ params: Promise.resolve({ lang: lang as never }) })); };
    const desktop = await render('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/131 Safari/537.36');
    assert.equal(desktop.split(`>${t.title}<`).length - 1, 1, `${lang}: the 'Mobile app' heading appears once (hero only)`);
    assert.ok(desktop.includes(`/${lang}/start`) && desktop.includes(t.desktopLink), `${lang}: desktop visitors get the desktop download link`);
    const phone = await render('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 MicroMessenger/8.0');
    assert.ok(!phone.includes(t.desktopLink), `${lang}: no desktop link on phones`);
}
console.log('PASS /get-app: single heading, desktop link only for computers');
