/**
 * POLISH X47: zh-TW visitors and the desktop skill marketplace get Traditional (Taiwan terms) skill text.
 * Run in an empty directory (data/ is created in cwd):
 *   cd <empty dir> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-registry-skills-zh-hant.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

assert.ok(!fs.existsSync('package.json'), 'Use an isolated fixture directory');
fs.mkdirSync('data', { recursive: true });
const now = new Date().toISOString();
const skill = {
  id: 'divorce-draft', name: '离婚协议书起草', description: '根据用户信息生成文档，支持设置默认项目', icon: '◆', version: '1.0.0',
  triggers: ['起草离婚协议', 'draft divorce agreement'], allowedTools: [], prompt: 'p', authorId: 'nobody', downloads: 0, createdAt: now, updatedAt: now,
};
fs.writeFileSync(path.join('data', 'skills.json'), JSON.stringify([skill]));

const { NextRequest } = await import('next/server');
const { GET } = await import('@/app/api/registry/skills/route');
const { localizeSkill } = await import('@/lib/skill-en');

const hant = { name: '離婚協議書起草', description: '根據使用者資訊生成文件，支援設定預設專案', triggers: ['起草離婚協議', 'draft divorce agreement'] };

const plain = await (await GET()).json();
assert.equal(plain[0].name, skill.name, 'default output unchanged');
assert.equal(plain[0].description, skill.description);
assert.deepEqual(plain[0].triggers, skill.triggers);
assert.deepEqual(plain[0].i18n['zh-hant'], hant, 'every entry carries i18n.zh-hant');

const tw = await (await GET(new NextRequest('http://localhost/api/registry/skills?lang=zh-hant'))).json();
assert.equal(tw[0].name, hant.name, '?lang=zh-hant serves Traditional in place');
assert.equal(tw[0].description, hant.description);

const page = localizeSkill(skill, 'zh-hant');
assert.equal(page.name, hant.name, 'website skill pages convert for zh-hant');
assert.deepEqual(page.triggers, hant.triggers);
assert.equal(localizeSkill(skill, 'zh').name, skill.name, 'zh stays Simplified');
console.log('PASS registry skills zh-hant: default unchanged, i18n.zh-hant present, ?lang=zh-hant and website pages Traditional');
