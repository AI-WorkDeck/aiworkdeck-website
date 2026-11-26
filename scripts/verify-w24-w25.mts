/**
 * W24 plugin pages and W25 intl ordering/tags. Run in an empty temp cwd with NEXT_PUBLIC_AWD_SITE=intl|cn.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
assert.ok(!fs.existsSync('data') && !fs.existsSync('package.json'), 'Use a fresh temporary cwd');
const site = process.env.NEXT_PUBLIC_AWD_SITE === 'intl' ? 'intl' : 'cn';
const now = Date.now();
const entry = (id: string, name: string, description: string, ageDays: number, authorId = 'awd-official') => ({
  id, version: '1.0.0', name, description, author: 'AI Workdeck', authorId, permissions: ['file_read'], tools: [], files: {}, size: 1,
  status: 'approved', scan: { classCount: 0, hits: [], findings: [], crossCheck: [], needsAttention: false }, downloads: 0,
  submittedAt: new Date(now - ageDays * 864e5).toISOString(), updatedAt: new Date(now - ageDays * 864e5).toISOString(),
  publishedAt: new Date(now - ageDays * 864e5).toISOString(),
});
fs.mkdirSync('data');
fs.writeFileSync('data/plugins.json', JSON.stringify([
  entry('project-im', 'Project Chat', 'Mainland China accounts only.', 0),
  entry('due-diligence', '尽调报告', '尽调底稿入库整理', 1),
  entry('calendar', 'Calendar', 'Cross-project calendar.', 5),
  entry('tencent-meeting', 'Tencent Meeting', 'Meetings.', 2),
]));
const { listStorePlugins, getStorePlugin } = await import(path.join(repo, 'lib/store-plugins.ts'));
const en = listStorePlugins('en').map((p: any) => `${p.id}:${+p.chinaOnly}${+p.chineseOnly}`);
if (site === 'intl') {
  // usable first, then China-only (newest first), then untranslated
  assert.deepEqual(en, ['calendar:00', 'project-im:10', 'tencent-meeting:10', 'due-diligence:01']);
} else {
  assert.deepEqual(en, ['project-im:00', 'tencent-meeting:00', 'calendar:00', 'due-diligence:01']);
}
// Chinese visitors never see the "Chinese only" note
assert.ok(listStorePlugins('zh').every((p: any) => !p.chineseOnly));
assert.ok(listStorePlugins('zh-hant').every((p: any) => !p.chineseOnly));
assert.equal(getStorePlugin('calendar', 'en')?.name, 'Calendar');
assert.equal(getStorePlugin('nope', 'en'), undefined);
// W24: the card links to /<lang>/plugins/<id>, which exists and shows the full text
const page = fs.readFileSync(path.join(repo, 'app/[lang]/marketplace/plugins/page.tsx'), 'utf8');
assert.match(page, /href=\{`\/\$\{lang\}\/plugins\/\$\{p\.id\}`\}/);
assert.ok(fs.existsSync(path.join(repo, 'app/[lang]/plugins/[id]/page.tsx')));
for (const f of fs.readdirSync(path.join(repo, 'dictionaries'))) {
  const d = JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', f), 'utf8')).pluginsPage.detail;
  for (const k of ['installTitle', 'installBody', 'permissionsTitle', 'chinaOnly', 'chineseOnly']) assert.ok(d?.[k], `${f}: pluginsPage.detail.${k}`);
  assert.ok(d.installBody.includes('{name}'), `${f}: installBody has {name}`);
}
console.log(`PASS W24/W25 (${site}): plugin page route, card link, intl ordering and notes`);
