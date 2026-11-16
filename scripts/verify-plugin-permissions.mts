// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Plugin manifest permission parity guard.
// CANONICAL mirrors the main repo AI-WorkDeck/aiworkdeck:
//   backend/src/test/java/com/checkba/service/ai/PluginPermissionParityTest.java
// which pins the host's PluginService.KNOWN_PERMISSIONS and the SDK manifest schema.
// Adding or removing a permission means changing both repos in the same release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const { PLUGIN_PERMISSIONS, validatePluginPlatformManifest } = await import('@/lib/plugin-manifest-platform');
const { DEVELOPER_PERMISSIONS } = await import('@/lib/developer-contract');
const { buildTemplateZip } = await import('@/lib/plugin-template');

const CANONICAL = ['file_read', 'file_write', 'network', 'editor', 'ai', 'im',
  'notifications', 'lawfirm', 'speech', 'tasks', 'clipboard', 'worklog_read'];

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function check(label: string, run: () => void) { run(); console.log('PASS', label); passed++; }

check('upload validator list equals canonical', () => assert.deepEqual([...PLUGIN_PERMISSIONS], CANONICAL));
check('developer profile list equals canonical', () => assert.deepEqual([...DEVELOPER_PERMISSIONS], CANONICAL));

function errorOf(permissions: unknown[]): string {
  try { validatePluginPlatformManifest({ id: 'perm-check', permissions }, new Map()); return ''; } catch (e) { return String((e as Error).message); }
}
check('validator accepts every canonical permission (incl. worklog_read for pitch-materials 0.2.1)', () => {
  for (const p of CANONICAL) assert.doesNotMatch(errorOf([p]), /^permissions/, p);
  assert.doesNotMatch(errorOf(CANONICAL), /^permissions/);
});
check('validator rejects an unknown permission', () => assert.match(errorOf(['superuser']), /^permissions/));

function enums(node: unknown, out: string[][]): string[][] {
  if (Array.isArray(node)) node.forEach(n => enums(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const items = (o.permissions as { items?: { enum?: string[] } } | undefined)?.items;
    if (items?.enum) out.push(items.enum);
    Object.values(o).forEach(v => enums(v, out));
  }
  return out;
}
const zip = new AdmZip(buildTemplateZip('web'));
check('downloadable template schema enum equals canonical', () => {
  const found = enums(JSON.parse(zip.readAsText('sdk/plugin-sdk/manifest.schema.json')), []);
  assert.ok(found.length > 0);
  for (const e of found) assert.deepEqual(e, CANONICAL);
});
check('downloadable template Permission type equals canonical', () => {
  const m = /export type Permission = ([^;]+);/.exec(zip.readAsText('sdk/plugin-sdk/manifest.d.ts'));
  assert.ok(m);
  assert.deepEqual([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort(), [...CANONICAL].sort());
});

check('marketplace permission labels exist in every locale', () => {
  const files = fs.readdirSync(path.join(repo, 'dictionaries')).filter(f => f.endsWith('.json'));
  assert.equal(files.length, 20);
  for (const f of files) {
    const labels = JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', f), 'utf8')).pluginsPage.permissions;
    assert.deepEqual(Object.keys(labels).sort(), [...CANONICAL].sort(), f);
    for (const p of CANONICAL) assert.ok(String(labels[p]).trim(), `${f}: ${p}`);
  }
});

console.log(`plugin permission parity: ${passed} checks passed`);
