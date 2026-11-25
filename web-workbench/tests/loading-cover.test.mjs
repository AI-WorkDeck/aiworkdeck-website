// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('editor loading cover is opaque, so the empty-state text never shows through it',async()=>{
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 const rule=/\.editor-cover\{([^}]*)\}/.exec(css)?.[1];
 assert.ok(rule,'.editor-cover rule exists');
 const background=/background:([^;]+)/.exec(rule)?.[1]||'';
 assert.ok(background&&!/transparent|rgba|color-mix|\/\s*0?\.\d/.test(background),`cover background must be opaque, got "${background}"`);
});
test('web build answers the shared editor system-font query with an empty list',async()=>{
 const build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(build,/sysfonts['"],\s*['"]enabled\.json['"]\),\s*'\{"fonts":\[\]\}/);
});
