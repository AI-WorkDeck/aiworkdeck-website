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
