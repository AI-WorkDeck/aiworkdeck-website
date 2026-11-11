/** Synthetic, isolated contract regression. No real account, delivery or credentials. */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
assert.notEqual(process.cwd(), repo, 'Run in a fresh temporary directory');
assert.ok(!fs.existsSync('package.json'));
const { NextRequest } = await import('next/server');
const { getDb } = await import('../lib/db');
const users = await import('../lib/users');
const flow = await import('../lib/password-flow');
if (process.argv[2] === 'worker') {
  try { await flow.completeSetup({ setupToken: process.argv[3], password: 'Synthetic worker password' }); console.log('accepted'); }
  catch { console.log('rejected'); }
  process.exit(0);
}
const site = process.env.NEXT_PUBLIC_AWD_SITE || 'cn';
const phone = site === 'cn';
const account = phone ? '13800007101' : 'synthetic-password@example.invalid';
const contact = phone ? { phone: account } : { email: account };
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/users.json', '[]');
let count = 0;
const ok = (label: string) => { count++; console.log(`ok ${count} - ${label}`); };
const db = getDb();
const exchange = (await import('../app/api/auth/exchange-key/route')).POST;
const verify = (await import(phone ? '../app/api/auth/sms-login/verify/route' : '../app/api/auth/mail-login/verify/route')).POST;
const setup = (await import('../app/api/auth/password/setup/route')).POST;
const reset = (await import('../app/api/auth/password/reset/route')).POST;
const login = (await import('../app/api/auth/login/route')).POST;
const registration = (await import('../app/api/auth/register/route')).POST;
const send = (await import(phone ? '../app/api/auth/sms-login/send-code/route' : '../app/api/auth/mail-login/send-code/route')).POST;
const sendReset = (await import('../app/api/auth/password/reset/send-code/route')).POST;
const keys = await import('../lib/api-keys');
const sessions = await import('../lib/sessions');
async function call(handler: (r: any) => Promise<any>, body: object) {
  const response = await handler(new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '192.0.2.81' }, body: JSON.stringify(body) }));
  return { response, data: await response.json() };
}
function seed(scene = 'signin', value = '123456', identity = account, expiry = Date.now() + 60_000) {
  const table = phone ? 'sms_code' : 'mail_code', field = phone ? 'phone' : 'email';
  db.prepare(`INSERT OR REPLACE INTO ${table}(scene,${field},codeHash,expiresAt,attempts) VALUES(?,?,?,?,0)`).run(scene, identity, crypto.createHash('sha256').update(`${identity}:${value}`).digest('hex'), expiry);
}
seed();
const first = await call(verify, { ...contact, code: '123456', ref: 'u-synthetic-referral' });
assert.equal(first.response.status, 200); assert.equal(first.data.passwordSetupRequired, true);
assert.equal(first.data.account, account); assert.equal(first.data.key, undefined); assert.equal(first.data.user, undefined);
assert.equal(first.response.headers.get('set-cookie'), null);
assert.equal((db.prepare('SELECT COUNT(*) AS n FROM api_keys').get() as {n:number}).n, 0);
assert.ok(!fs.existsSync('data/sessions.json'));
ok('first OTP returns a limited setup challenge, no session or API key');
const referral = JSON.parse(fs.readFileSync('data/wx-phone.jsonl','utf8').trim());
assert.equal(referral.ref,'u-synthetic-referral'); assert.equal(referral.created,true);
assert.equal(JSON.stringify(referral).includes(account),false); assert.equal(JSON.stringify(referral).includes(first.data.setupToken),false);
ok('verified first-contact retains referral attribution without contact or credential leakage');
const user = users.findUserByAccount(account)!; assert.ok(user); const originalId = user.id;
const ticketRow = db.prepare('SELECT tokenHash FROM password_setup_ticket').get() as {tokenHash:string};
assert.notEqual(ticketRow.tokenHash, first.data.setupToken);
assert.equal(JSON.stringify(ticketRow).includes(first.data.setupToken), false);
ok('setup ticket persisted only as SHA-256');
assert.equal((await call(exchange, { ...contact, code: '123456' })).response.status, 401);
assert.equal((await call(setup, { setupToken: first.data.setupToken, password: 'short' })).data.error, 'invalid_password');
ok('OTP replay and weak password rejected');
const password = ' Synthetic first password ';
const result = await call(setup, { setupToken: first.data.setupToken, password });
assert.equal(result.data.ok, true); assert.equal(result.response.headers.get('set-cookie'), null);
assert.equal((await call(setup, { setupToken: first.data.setupToken, password: 'Different password' })).response.status, 401);
assert.equal(users.findUserByAccount(account)?.id, originalId);
assert.equal(await users.verifyPassword(password, users.findUserByAccount(account)!.passwordHash), true);
assert.equal(await users.verifyPassword(password.trim(), users.findUserByAccount(account)!.passwordHash), false);
ok('setup preserves identity and password whitespace; ticket single-use');
const signedIn = await call(login, { account: phone ? '+86 138-0000-7101' : account.toUpperCase(), password });
assert.equal(signedIn.response.status, 200); assert.ok(signedIn.response.headers.get('set-cookie'));
const keyLogin = await call(exchange, { account, password }); assert.equal(keyLogin.response.status, 200); assert.ok(keys.findUserByApiKey(keyLogin.data.key));
ok('normalized phone/email password login returns existing identity and key');
const accountMe = (await import('../app/api/account/me/route')).GET;
const identityResponse = await accountMe(new NextRequest('http://localhost/api/account/me', {headers:{authorization:`Bearer ${keyLogin.data.key}`}}));
const identity = await identityResponse.json();
assert.equal(identity.accountId,originalId); assert.equal(identity.verifiedEmail,phone ? null : account);
ok('account bridge exposes only verified email while preserving the stable account id');
seed(); const oldOtp = await call(exchange, { ...contact, code: '123456' });
assert.equal(oldOtp.response.status, 409); assert.equal(oldOtp.data.error, 'password_login_required'); assert.equal(oldOtp.data.key, undefined);
ok('password accounts cannot use OTP as a routine login');
// All network delivery is intercepted in-memory with dummy service configuration.
Object.assign(process.env, { AWD_SMS_ACCESS_KEY_ID: 'synthetic', AWD_SMS_ACCESS_KEY_SECRET: 'synthetic', AWD_SMS_SIGN_NAME: 'synthetic', AWD_SMS_TEMPLATE_CODE: 'synthetic', AWD_MAIL_RESEND_KEY: 'synthetic', AWD_MAIL_FROM: 'test@example.invalid' });
let deliveries = 0;
globalThis.fetch = (async () => { deliveries++; return new Response(JSON.stringify({ Code: 'OK' }), { status: 200 }); }) as typeof fetch;
const existingSend = await call(send, contact); assert.equal(existingSend.response.status, 409); assert.equal(deliveries, 0);
assert.equal((await call(sendReset, contact)).response.status, 200); assert.equal(deliveries, 1);
assert.equal((await call(sendReset, contact)).response.status, 400); assert.equal(deliveries, 1);
ok('daily OTP send blocked, reset uses delivery service with cooldown');
const session = sessions.createSession(originalId); assert.ok(sessions.getUserByToken(session.token));
seed('signin', '222222');
assert.equal((await call(reset, { ...contact, code: '222222', password: 'New synthetic password' })).response.status, 401);
seed('password_reset', '333333');
for (let i = 0; i < 5; i++) assert.equal((await call(reset, { ...contact, code: '999999', password: 'New synthetic password' })).response.status, 401);
assert.equal((await call(reset, { ...contact, code: '333333', password: 'New synthetic password' })).response.status, 401);
ok('signin code cannot reset password; wrong reset attempts persist and exhaust');
seed('password_reset', '444444');
const resetResult = await call(reset, { ...contact, code: '444444', password: 'New synthetic password' }); assert.equal(resetResult.response.status, 200);
assert.equal(sessions.getUserByToken(session.token), undefined); assert.equal(keys.findUserByApiKey(keyLogin.data.key), undefined);
assert.equal((await call(login, { account, password })).response.status, 401);
assert.equal((await call(login, { account, password: 'New synthetic password' })).response.status, 200);
assert.equal((await call(reset, { ...contact, code: '444444', password: 'Another password' })).response.status, 401);
assert.equal(users.findUserByAccount(account)?.id, originalId);
ok('reset revokes old web sessions/keys, preserves identity, consumes code');
const other = phone ? '13800007102' : 'other-password@example.invalid';
seed('signin','555555',other); const second = await call(exchange, { ...(phone ? {phone:other} : {email:other}), code:'555555' });
function worker() { return new Promise<string>((resolve, reject) => {
  const child = spawn(process.execPath, ['--import', path.join(repo, 'node_modules/tsx/dist/loader.mjs'), fileURLToPath(import.meta.url), 'worker', second.data.setupToken], { cwd: process.cwd(), env: { ...process.env, TSX_TSCONFIG_PATH: path.join(repo, 'tsconfig.json') } });
  let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b); child.on('error', reject); child.on('exit', c => c ? reject(new Error(output)) : resolve(output.trim()));
}); }
const race = await Promise.all([worker(), worker()]); assert.deepEqual(race.sort(), ['accepted','rejected']);
ok('two independent Node processes racing the same setup ticket yield exactly one success');
const third = phone ? '13800007103' : 'expired-password@example.invalid';
seed('signin','555555',third); const expired = await call(exchange, { ...(phone ? {phone:third} : {email:third}), code:'555555' });
db.prepare('UPDATE password_setup_ticket SET expiresAt = 0').run();
assert.equal((await call(setup,{setupToken:expired.data.setupToken,password:'Synthetic password'})).response.status,401);
ok('expired setup ticket cannot change credentials');
// Legacy passwords still work until changed; SQLite overlay then overrides even stale JSON.
const legacy = await users.createUser({ username:'legacy-synthetic',email:'legacy@example.invalid',displayName:'Synthetic',password:'Legacy password' }); assert.ok(legacy.user);
if(phone) users.bindPhone(legacy.user!.id,'13800007104');
const legacyContact = phone ? '13800007104' : 'legacy@example.invalid';
assert.equal((await call(login,{account:legacyContact,password:'Legacy password'})).response.status,200);
seed('password_reset','666666',legacyContact);
assert.equal((await call(reset,{...(phone ? {phone:legacyContact}:{email:legacyContact}),code:'666666',password:'Migrated password'})).response.status,200);
assert.equal(await users.verifyPassword('Legacy password',users.findUserByAccount(legacyContact)!.passwordHash),false);
assert.equal(await users.verifyPassword('Migrated password',users.findUserByAccount(legacyContact)!.passwordHash),true);
users.markUserDeleted(legacy.user!.id,'Deleted'); assert.equal(users.findUserByAccount(legacyContact),undefined);
assert.equal(db.prepare('SELECT 1 FROM password_credential WHERE userId = ?').get(legacy.user!.id),undefined);
ok('legacy JSON password migration/overlay and deletion preserve a single credential authority');
assert.equal((await registration()).status,400);
ok('old unverified registration cannot bypass mandatory first-contact verification');
// Review compatibility is exact-config only; the same fixed code cannot reset passwords.
const reviewAccount = phone ? '13800007105' : 'review-fixture@example.invalid';
process.env.AUTH_REVIEW_ACCOUNT_IDENTITY = reviewAccount;
process.env.AUTH_REVIEW_ACCOUNT_CODE = '817263';
const reviewContact = phone ? {phone:reviewAccount} : {email:reviewAccount};
assert.equal((await call(exchange, {...reviewContact,code:'817263'})).response.status,200);
const reviewWeb = await call(verify, {...reviewContact,code:'817263'});
assert.equal(reviewWeb.response.status,200); assert.ok(reviewWeb.response.headers.get('set-cookie'));
assert.equal((await call(exchange, {...reviewContact,code:'000000'})).response.status,401);
assert.equal((await call(exchange, {...contact,code:'817263'})).response.status,401);
assert.equal((await call(reset, {...reviewContact,code:'817263',password:'Review reset attempt'})).response.status,401);
ok('review exact identity + code retains legacy web/key login; wrong identity/code/reset cannot bypass');
// Even with a configured review identity, an ordinary delivered OTP cannot log in after password setup.
seed('password_reset','111111',reviewAccount);
assert.equal((await call(reset, {...reviewContact,code:'111111',password:'Review synthetic password'})).response.status,200);
seed('signin','222222',reviewAccount);
assert.equal((await call(exchange, {...reviewContact,code:'222222'})).response.status,409);
assert.equal((await call(exchange, {...reviewContact,code:'817263'})).response.status,200);
delete process.env.AUTH_REVIEW_ACCOUNT_IDENTITY; delete process.env.AUTH_REVIEW_ACCOUNT_CODE;
ok('review exception is fixed-code only, never all OTPs for a configured identity');
Object.assign(process.env, { NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY:'synthetic', AWD_TURNSTILE_SECRET:'synthetic', NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID:'synthetic', NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX:'synthetic', AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID:'synthetic', AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET:'synthetic' });
const deliveryCount = deliveries;
assert.equal((await call(sendReset,contact)).response.status,403);
assert.equal(deliveries,deliveryCount);
ok('reset enforces the existing regional captcha before any delivery request');
const deleted = users.findUserById(legacy.user!.id)!;
assert.equal(deleted.passwordVersion,undefined); assert.equal(deleted.passwordHash,'');
ok('deleted JSON tombstone retains neither hash nor password version');
// A legacy numeric username may equal another user's verified phone. Never merge or select by row order.
const collisionPhone = '13800007201';
const numericLegacy = await users.createUser({username:collisionPhone,email:'numeric-legacy@example.invalid',displayName:'Legacy numeric',password:'Legacy numeric password'});
assert.ok(numericLegacy.user);
users.bindPhone(numericLegacy.user!.id,'13800007202');
users.findOrCreateByEmail('numeric-legacy@example.invalid');
const phoneOwner = users.findOrCreateByPhone(collisionPhone).user;
assert.notEqual(phoneOwner.id,numericLegacy.user!.id);
const collisionSetup = flow.setupForVerifiedUser(phoneOwner,collisionPhone);
await flow.completeSetup({setupToken:collisionSetup.setupToken,password:'Phone owner password'});
assert.equal(users.findUserByAccount(collisionPhone)?.id,phoneOwner.id);
const collisionLogin = await call(exchange,{account:collisionPhone,password:'Phone owner password'});
assert.equal(collisionLogin.response.status,200); assert.equal(collisionLogin.data.user.id,phoneOwner.id);
assert.equal((await call(exchange,{account:collisionPhone,password:'Legacy numeric password'})).response.status,401);
const numericLegacyLogin = await call(exchange,{account:'numeric-legacy@example.invalid',password:'Legacy numeric password'});
assert.equal(numericLegacyLogin.response.status,200); assert.equal(numericLegacyLogin.data.user.id,numericLegacy.user!.id);
if(phone) {
  seed('password_reset','707070',collisionPhone);
  assert.equal((await call(reset,{phone:collisionPhone,code:'707070',password:'Changed phone owner password'})).response.status,200);
  const changed = await call(exchange,{account:collisionPhone,password:'Changed phone owner password'});
  assert.equal(changed.data.user.id,phoneOwner.id);
  assert.equal(await users.verifyPassword('Legacy numeric password',users.findUserById(numericLegacy.user!.id)!.passwordHash),true);
}
ok('phone identity wins over numeric username; reset keeps its id and legacy owner retains verified-email login');
console.log(`PASS ${site}: ${count} password-flow contract groups`);
