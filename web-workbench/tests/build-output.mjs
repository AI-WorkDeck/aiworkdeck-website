// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Run after npm run build: compare actual corresponding-source archive bytes.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const root=new URL('../',import.meta.url),out=new URL('../../public/web/',import.meta.url);
const zip=await JSZip.loadAsync(await fs.readFile(new URL('source.zip',out)));
for(const file of ['src/load-progress.js','src/boot-progress-view.js','scripts/progress-sizes.mjs','tests/load-progress.test.mjs','tests/progress-browser.mjs','src/runtime-transport.js','scripts/runtime-transform.mjs','scripts/build.mjs','tests/runtime-transport.test.mjs','tests/runtime-browser.mjs','README.md','UPSTREAM.md']) {
  assert.deepEqual(await zip.file('web-workbench/'+file).async('nodebuffer'),await fs.readFile(new URL(file,root)),file);
}
const manifest=JSON.parse(await fs.readFile(new URL('source-manifest.json',root),'utf8'));
for(const [file,hash] of Object.entries(manifest.files)) {
  const bytes=await zip.file('web-workbench/vendor/core/'+file).async('nodebuffer');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,file);
}
const html=await fs.readFile(new URL('editor/editor.html',out),'utf8');
assert.doesNotMatch(html,/<link[^>]+rel=["'](?:preload|prefetch)["'][^>]+(?:soffice|cjk)/i);
console.log('PASS corresponding source archive, pinned vendor hashes and no runtime/font preload hints');
