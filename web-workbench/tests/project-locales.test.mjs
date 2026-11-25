// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectLocales,projectLocale} from '../src/project-locales.js';
test('project controls cover every site locale with complete tokens',async()=>{
 const config=await readFile(new URL('../../i18n-config.ts',import.meta.url),'utf8');
 const locales=[...config.match(/locales: \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(Object.keys(projectLocales).sort(),locales.sort());
 for(const locale of locales){assert.equal(projectLocale(locale),locale);assert.deepEqual(Object.keys(projectLocales[locale]),Object.keys(projectLocales.en));for(const value of Object.values(projectLocales[locale]))assert.ok(typeof value==='string'&&value.length)}
});
test('first visit without ?lang= follows the site cookie, then the browser, and only then Chinese',async()=>{
 const {initialLocale}=await import('../src/project-locales.js');
 assert.equal(initialLocale({query:'ja',cookie:'awd_lang=en',languages:['de-DE']}),'ja','explicit ?lang= wins');
 assert.equal(initialLocale({query:'xx',cookie:'a=1; awd_lang=fr',languages:['de-DE']}),'fr','unknown ?lang= falls through to the site cookie');
 assert.equal(initialLocale({cookie:'awd_lang=system',languages:['en-US','zh-CN']}),'en','"system" cookie defers to the browser');
 assert.equal(initialLocale({languages:['en-US']}),'en','English browser on the international site gets English');
 assert.equal(initialLocale({languages:['zh-TW']}),'zh-hant');
 assert.equal(initialLocale({languages:['zh-CN','en']}),'zh');
 assert.equal(initialLocale({languages:['sw-KE','pt-BR']}),'pt','first supported browser language');
 assert.equal(initialLocale({languages:['sw-KE']}),'zh','nothing supported keeps the historical default');
 assert.equal(initialLocale(),'zh');
});
