/** /start prefetches the real web-editor engine files, and never on Save-Data or slow connections. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { WEB_ENGINE_PREFETCH_URLS, shouldPrefetchWebEngine } = await import('@/lib/web-engine-prefetch');
const manifest = JSON.parse(fs.readFileSync('web-workbench/asset-manifest.json', 'utf8'));
for (const url of WEB_ENGINE_PREFETCH_URLS) {
    const rel = url.replace('/web/editor/', '');
    // Fonts are served Brotli-compressed under compressed/<name>; the manifest keys them by name.
    const known = manifest.files[rel.replace(/^compressed\//, '')] !== undefined;
    assert.ok(known, `${url} is a real workbench asset (asset-manifest.json)`);
}
assert.equal(shouldPrefetchWebEngine(undefined), true, 'browsers without the Network Information API');
assert.equal(shouldPrefetchWebEngine({ effectiveType: '4g' }), true);
assert.equal(shouldPrefetchWebEngine({ saveData: true, effectiveType: '4g' }), false, 'respect Save-Data');
for (const slow of ['slow-2g', '2g', '3g']) assert.equal(shouldPrefetchWebEngine({ effectiveType: slow }), false, `no 70 MB prefetch on ${slow}`);
const start = fs.readFileSync('app/[lang]/start/page.tsx', 'utf8');
assert.match(start, /<WebVersionLink href=\{`\/web\/\?lang=\$\{lang\}`\}/, '/start uses the prefetching link');
console.log('PASS web engine prefetch targets real assets and respects data-saving connections');
