/**
 * POLISH W16: the official-plugins intro names the Marketplace (the locale's nav label), never the retired "Plugin Center".
 * POLISH W17: a skill card without an author leaves the author slot empty instead of printing "Unknown".
 *   npx tsx --tsconfig tsconfig.json scripts/verify-w16-w17.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const RETIRED = /Plugin Center|插件中心|外掛中心|centre de plugins|centro de plugins|Plugin-Center|プラグインセンター|플러그인 센터/i;
for (const f of fs.readdirSync('dictionaries')) {
  const d = JSON.parse(fs.readFileSync(`dictionaries/${f}`, 'utf8'));
  const intro: string = d.pluginsPage.officialIntro;
  assert.ok(!RETIRED.test(intro), `${f}: officialIntro still uses the retired Plugin Center term`);
  assert.ok(intro.includes(d.common.nav.marketplace), `${f}: officialIntro names the Marketplace as the nav does (${d.common.nav.marketplace})`);
}

const { SkillCard } = await import('@/components/skills/SkillCard');
const dict = JSON.parse(fs.readFileSync('dictionaries/en.json', 'utf8'));
const now = new Date().toISOString();
const skill = { id: 's1', name: 'Clause check', description: 'd', icon: '◆', version: '1.0.0', triggers: ['check'], allowedTools: [], prompt: 'p', authorId: 'gone', downloads: 3, createdAt: now, updatedAt: now };
const html = renderToStaticMarkup(React.createElement(SkillCard, { lang: 'en', dict, skill } as never));
assert.ok(!/Unknown/.test(html), 'no "Unknown" author on the card');
assert.match(html, /3 /, 'downloads still shown');
const withAuthor = renderToStaticMarkup(React.createElement(SkillCard, { lang: 'en', dict, skill, author: { username: 'ann', displayName: 'Ann Lee' } } as never));
assert.match(withAuthor, /Ann Lee/, 'a real author still shows');
console.log('PASS W16 Marketplace wording in 20 locales; W17 no "Unknown" author on skill cards');
