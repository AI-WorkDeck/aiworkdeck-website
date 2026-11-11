// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import AdmZip from 'adm-zip';
assert.equal(fs.readdirSync(process.cwd()).length, 0, 'Run in a new empty temporary directory');
const users = ['author-a', 'author-b'].map(id => ({ id, username: id, displayName: id, email: `${id}@example.invalid`, emailVerifiedAt: new Date().toISOString(), passwordHash: '', createdAt: new Date().toISOString() }));
fs.mkdirSync('data'); fs.writeFileSync('data/users.json', JSON.stringify(users));
process.env.AWD_ADMIN_TOKEN = 'synthetic-admin-only-testing';
const { createSession } = await import('@/lib/sessions');
const { getDb, closeDb } = await import('@/lib/db');
const store = await import('@/lib/developers');
const own = await import('@/app/api/developers/route'); const apply = await import('@/app/api/developers/apply/route');
const tokens = await import('@/app/api/developers/token/route'); const admin = await import('@/app/api/admin/developers/route');
const plugins = await import('@/app/api/plugins/route'); const adminPlugins = await import('@/app/api/admin/plugins/[id]/route');
const sessions = users.map(u => createSession(u.id).token);
let count = 0;
function check(name: string, action: () => void) { action(); console.log('PASS', name); count++; }
function req(path: string, method = 'GET', body?: unknown, auth: 'none' | 'admin' | number = 0, extra: Record<string, string> = {}) {
  const cookie = auth === 'admin' ? `awd_admin=${process.env.AWD_ADMIN_TOKEN}` : typeof auth === 'number' ? `awd_session=${sessions[auth]}` : '';
  return new NextRequest(`http://localhost${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: 'http://localhost' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const { sameOriginMutation } = await import('@/lib/developer-api');
const { siteConfig, siteOrigins } = await import('@/lib/site-config');
const publicOrigin = siteConfig.origin;
function proxyRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/developers', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: publicOrigin, Host: new URL(publicOrigin).host, 'X-Forwarded-Proto': 'https', ...headers } });
}
check('public HTTPS origin with preserved Host works behind internal Next listener', () => assert.doesNotThrow(() => sameOriginMutation(proxyRequest())));
for (const origin of siteOrigins) check(`public alias behind proxy: ${origin}`, () => assert.doesNotThrow(() => sameOriginMutation(proxyRequest({ Origin: origin, Host: new URL(origin).host }))));
for (const [name, headers] of Object.entries<Record<string, string>>({
  'foreign origin': { Origin: 'https://attacker.invalid' },
  'forged forwarded headers': { Origin: 'https://attacker.invalid', 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https' },
  'foreign Host': { Host: 'attacker.invalid' },
  'absent Origin': { Origin: '' },
  'opaque Origin': { Origin: 'null' },
  'Origin with path': { Origin: publicOrigin + '/unexpected' },
  'insecure public Origin': { Origin: publicOrigin.replace('https:', 'http:') },
  'cross-site fetch': { 'Sec-Fetch-Site': 'cross-site' },
  'loopback mismatched port': { Origin: 'http://127.0.0.1:19753', Host: '127.0.0.1:19754' },
})) check(`CSRF rejects ${name}`, () => assert.throws(() => sameOriginMutation(proxyRequest(headers)), /origin_not_allowed/));
for (const origin of ['http://127.0.0.1:19753', 'https://127.0.0.1:19754', 'http://localhost:19753']) {
  check(`isolated loopback exact Host allowed: ${origin}`, () => assert.doesNotThrow(() => sameOriginMutation(proxyRequest({ Origin: origin, Host: new URL(origin).host }))));
}
const profile = { kind: 'individual', displayName: 'Test developer', organization: '', contactType: 'email', contact: users[0].email, experience: 'Built a synthetic demo', plan: 'Read only a selected synthetic file', permissions: ['file_read'] };
let r = await own.GET(req('/api/developers', 'GET', undefined, 'none')); check('anonymous private API denied', () => assert.equal(r.status, 401));
r = await own.PUT(req('/api/developers', 'PUT', { profile, expectedVersion: 0 })); let p = (await r.json()).profile;
check('profile persisted draft with verified account email', () => { assert.equal(p.status, 'draft'); assert.equal(p.contactVerification, 'account-email'); });
r = await own.PUT(req('/api/developers', 'PUT', { profile, expectedVersion: 0 })); check('stale profile save denied', () => assert.equal(r.status, 409));
r = await own.GET(req('/api/developers', 'GET', undefined, 1)); const otherProfile = await r.json(); check('private profile never leaks to another author', () => assert.equal(otherProfile.profile, null));
r = await tokens.POST(req('/api/developers/token', 'POST', {})); check('draft cannot mint submission token', () => assert.equal(r.status, 403));
r = await apply.POST(req('/api/developers/apply', 'POST', { expectedVersion: p.version })); p = (await r.json()).profile;
check('apply changes to pending', () => assert.equal(p.status, 'pending'));
r = await admin.POST(req('/api/admin/developers', 'POST', { userId: users[0].id, expectedVersion: p.version, action: 'approve' })); check('ordinary author cannot approve self', () => assert.equal(r.status, 401));
r = await admin.POST(req('/api/admin/developers', 'POST', { userId: users[0].id, expectedVersion: p.version, action: 'approve' }, 'admin')); p = (await r.json()).profile;
check('real admin route approves account-verified contact', () => assert.equal(p.status, 'approved'));
r = await tokens.POST(req('/api/developers/token', 'POST', { label: 'Synthetic Agent', expiresInDays: 1 })); const issued = await r.json();
check('random token issued once with scope and expiry', () => { assert.equal(r.status, 200); assert.match(issued.token, /^awd_plugin_[A-Za-z0-9_-]{43}$/); assert.deepEqual(issued.scope, ['plugins:read', 'plugins:submit']); });
const bearer = { Authorization: `Bearer ${issued.token}` };
r = await own.GET(req('/api/developers')); const privateData = await r.json();
check('token never reappears in metadata or persistent database', () => { assert.ok(!JSON.stringify(privateData).includes(issued.token)); assert.ok(!JSON.stringify(getDb().prepare('SELECT * FROM plugin_submission_token').all()).includes(issued.token)); assert.equal(r.headers.get('cache-control'), 'no-store'); });
const authMe = await import('@/app/api/auth/me/route');
r = await authMe.GET(req('/api/auth/me', 'GET', undefined, 'none', bearer)); const authData = await r.json();
check('submission token cannot authenticate account API', () => assert.equal(authData.user, null));
r = await admin.GET(req('/api/admin/developers', 'GET', undefined, 'none', bearer)); check('submission token cannot authenticate administrator API', () => assert.equal(r.status, 401));
r = await own.GET(req('/api/developers', 'GET', undefined, 0, bearer)); check('submission token cannot access profile even with cookie', () => assert.equal(r.status, 401));
r = await tokens.POST(req('/api/developers/token', 'POST', {}, 0, bearer)); check('submission token cannot issue more tokens', () => assert.equal(r.status, 401));
r = await plugins.GET(req('/api/plugins', 'GET', undefined, 0, { Authorization: 'Bearer invalid' })); check('invalid bearer never falls back to valid cookie', () => assert.equal(r.status, 401));
r = await plugins.GET(req('/api/plugins', 'GET', undefined, 'none', bearer)); check('valid bearer lists own submissions', () => assert.equal(r.status, 200));
check('lastUsedAt updated', () => assert.ok((store.listSubmissionTokens(users[0].id)[0] as any).lastUsedAt));
function zip(id: string, permissions = ['file_read']) { const z = new AdmZip(); z.addFile('manifest.json', Buffer.from(JSON.stringify({ id, name: 'Synthetic', version: '1.0.0', frontendEntry: 'web/index.html', permissions }))); z.addFile('web/index.html', Buffer.from('<!doctype html><html><body>Test</body></html>')); return z.toBuffer(); }
function postZip(id: string, auth = bearer, permissions?: string[]) { const f = new FormData(); f.append('file', new File([new Uint8Array(zip(id, permissions))], 'plugin.zip')); return plugins.POST(new NextRequest('http://localhost/api/plugins', { method: 'POST', headers: auth, body: f })); }
r = await postZip('developer-fixture'); check('bearer package accepted pending', () => assert.equal(r.status, 200)); assert.equal((await r.json()).plugin.status, 'pending');
r = await postZip('excess-permissions', bearer, ['network']); check('unapproved permission refused before persistence', () => assert.equal(r.status, 403)); assert.equal((await import('@/lib/plugins-store')).getPlugin('excess-permissions'), undefined);
r = await plugins.GET(req('/api/plugins', 'GET', undefined, 1)); check('legacy account can list own submissions without qualification', () => assert.equal(r.status, 200)); assert.deepEqual((await r.json()).plugins, []);
const racing = store.issueSubmissionToken(users[0].id, 'Revoked during body upload', 1);
const racingForm = new FormData(); racingForm.append('file', new File([new Uint8Array(zip('upload-revocation'))], 'plugin.zip'));
const racingRequest = new NextRequest('http://localhost/api/plugins', { method: 'POST', headers: { Authorization: `Bearer ${racing.token}` }, body: racingForm });
let releaseBody!: () => void;
const originalFormData = racingRequest.formData.bind(racingRequest);
racingRequest.formData = async () => { await new Promise<void>(resolve => { releaseBody = resolve; }); return originalFormData(); };
const inFlight = plugins.POST(racingRequest); store.revokeSubmissionToken(users[0].id, racing.id); releaseBody();
r = await inFlight;
check('revocation while awaiting upload blocks persistence', () => { assert.equal(r.status, 401); assert.equal((getDb().prepare('SELECT id FROM plugin_submission_token WHERE id=?').get(racing.id) as any).id, racing.id); });
assert.equal((await import('@/lib/plugins-store')).getPlugin('upload-revocation'), undefined);
r = await tokens.DELETE(req('/api/developers/token', 'DELETE', { id: issued.id }, 1)); check('another owner cannot revoke token', () => assert.equal(r.status, 404));
r = await admin.POST(req('/api/admin/developers', 'POST', { userId: users[0].id, expectedVersion: p.version, action: 'suspend', note: 'Synthetic suspension' }, 'admin')); p = (await r.json()).profile;
r = await plugins.GET(req('/api/plugins', 'GET', undefined, 'none', bearer)); check('suspension immediately blocks existing bearer', () => assert.equal(r.status, 403));
r = await adminPlugins.POST(req('/api/admin/plugins/developer-fixture', 'POST', { version: '1.0.0', action: 'approve' }, 'admin'), { params: Promise.resolve({ id: 'developer-fixture' }) }); check('suspension blocks plugin approval before notification/signing', () => assert.equal(r.status, 403));
r = await own.PUT(req('/api/developers', 'PUT', { profile, expectedVersion: p.version })); p = (await r.json()).profile; check('save cannot self-unsuspend', () => assert.equal(p.status, 'suspended'));
r = await apply.POST(req('/api/developers/apply', 'POST', { expectedVersion: p.version })); check('suspended author cannot reapply to bypass review', () => assert.equal(r.status, 409));
r = await admin.POST(req('/api/admin/developers', 'POST', { userId: users[0].id, expectedVersion: p.version, action: 'approve' }, 'admin')); p = (await r.json()).profile;
r = await tokens.DELETE(req('/api/developers/token', 'DELETE', { id: issued.id })); check('owner revokes token', () => assert.equal(r.status, 200));
r = await plugins.GET(req('/api/plugins', 'GET', undefined, 'none', bearer)); check('revocation takes effect immediately', () => assert.equal(r.status, 401));
const expired = store.issueSubmissionToken(users[0].id, 'Expired synthetic', 1); getDb().prepare('UPDATE plugin_submission_token SET expiresAt=? WHERE id=?').run('2000-01-01T00:00:00.000Z', expired.id);
check('expired token refused', () => assert.throws(() => store.submissionTokenUser(expired.token), /invalid_plugin_token/));
r = await own.PUT(req('/api/developers', 'PUT', { profile: { ...profile, contact: 'unverified@example.invalid' }, expectedVersion: p.version })); p = (await r.json()).profile;
check('contact/profile edit removes approval and verification', () => { assert.equal(p.status, 'draft'); assert.equal(p.contactVerification, null); });
p = store.applyDeveloper(users[0], p.version);
check('cannot approve unverified contact without explicit manual check', () => assert.throws(() => store.reviewDeveloper(users[0].id, p.version, 'approve', '', false), /contact_verification_required/));
p = store.reviewDeveloper(users[0].id, p.version, 'approve', 'Manual synthetic confirmation', true);
check('manual contact verification explicit and recorded', () => assert.equal(p.contactVerification, 'manual-review'));
const history = store.developerHistory(users[0].id) as any[];
check('review records include actor and immutable reviewed snapshot', () => { assert.equal(history[0].actor, 'admin'); assert.equal(history[0].snapshot.contact, 'unverified@example.invalid'); assert.ok(history.some(h => h.snapshot.contact === users[0].email)); });
r = await own.PUT(req('/api/developers', 'PUT', { profile, expectedVersion: p.version }, 0, { Origin: 'https://evil.example.invalid' })); check('cross-origin settings write refused', () => assert.equal(r.status, 403));
const deletionToken = store.issueSubmissionToken(users[0].id, 'Delete synthetic', 1);
const { markUserDeleted } = await import('@/lib/users'); markUserDeleted(users[0].id, 'Deleted');
check('account deletion erases developer private data and tokens', () => { assert.equal(store.getDeveloper(users[0].id), null); assert.deepEqual(store.developerHistory(users[0].id), []); assert.deepEqual(store.listSubmissionTokens(users[0].id), []); assert.throws(() => store.submissionTokenUser(deletionToken.token)); });
check('stale User cannot recreate private data after account deletion', () => { assert.throws(() => store.saveDeveloper(users[0], profile, 0), /unauthorized/); assert.throws(() => store.applyDeveloper(users[0], 0), /unauthorized/); assert.equal(store.getDeveloper(users[0].id), null); assert.deepEqual(store.developerHistory(users[0].id), []); });
closeDb(); console.log(`Developer checks passed: ${count}`);
