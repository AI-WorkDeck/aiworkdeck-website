// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import AdmZip from 'adm-zip';

assert.equal(fs.readdirSync(process.cwd()).length, 0, 'Run in a new empty temporary directory');
const now = new Date().toISOString();
const user = { id: 'region-author', username: 'region-author', displayName: 'Region Author', email: 'region@example.invalid', emailVerifiedAt: now, passwordHash: '', createdAt: now };
fs.mkdirSync('data');
fs.writeFileSync('data/users.json', JSON.stringify([user]));
const { createSession } = await import('@/lib/sessions');
const { getDb, closeDb } = await import('@/lib/db');
const { getPlugin } = await import('@/lib/plugins-store');
const { SITE_ID } = await import('@/lib/site-config');
const route = await import('@/app/api/plugins/route');
const session = createSession(user.id).token;
const zip = new AdmZip();
zip.addFile('manifest.json', Buffer.from(JSON.stringify({ id: 'region-fixture', name: 'Region Fixture', version: '1.0.0', homepage: 'https://example.invalid/source', frontendEntry: 'web/index.html' })));
zip.addFile('web/index.html', Buffer.from('fixture'));
const form = new FormData();
form.append('file', new File([new Uint8Array(zip.toBuffer())], 'plugin.zip'));
const response = await route.POST(new NextRequest('http://localhost/api/plugins', { method: 'POST', headers: { Cookie: `awd_session=${session}` }, body: form }));
if (SITE_ID === 'intl') {
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'submission_region_unavailable');
  assert.equal(getPlugin('region-fixture'), undefined);
  assert.equal((getDb().prepare('SELECT COUNT(*) AS n FROM plugin_submission_token').get() as { n: number }).n, 0);
  console.log('PASS international submission is rejected before persistence or mirror deletion');
} else {
  assert.equal(response.status, 200);
  assert.equal(getPlugin('region-fixture')?.status, 'pending');
  console.log('PASS China submission remains available');
}
closeDb();
