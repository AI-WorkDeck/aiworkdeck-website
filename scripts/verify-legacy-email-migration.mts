/** Synthetic fixtures only; run in a fresh temporary cwd. No real email delivery. */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
assert.notEqual(process.cwd(), repo);
assert.ok(!fs.existsSync('package.json'));
const { NextRequest } = await import('next/server');
const { getDb } = await import('../lib/db');
const users = await import('../lib/users');
const flow = await import('../lib/password-flow');
const sessions = await import('../lib/sessions');
const migration = await import('../lib/legacy-email-migration');
const send = (await import('../app/api/auth/legacy-email/send-code/route')).POST;
const verify = (await import('../app/api/auth/legacy-email/verify/route')).POST;
function request(body: object, token = '', bearer = false) {
  return new NextRequest('http://localhost/api/test', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-real-ip': '192.0.2.91',
    ...(token ? bearer ? { authorization: `Bearer ${token}` } : { cookie: `awd_session=${token}` } : {}),
  }, body: JSON.stringify(body) });
}
if (process.argv[2] === 'worker') {
  const [, , , action, token, email] = process.argv;
  if (action === 'profile') { for (let i = 0; i < 20; i++) users.updateProfile(token, { bio: `synthetic profile ${i}` }); console.log('profile'); }
  else if (action === 'create') { const result = await users.createUser({ username: token, email, password: 'Synthetic legacy password', displayName: 'Synthetic' }); console.log(result.user ? 'created' : 'rejected'); }
  else { const response = await verify(request({ email, code: '123456' }, token)); console.log(response.status === 200 ? 'accepted' : 'rejected'); }
  process.exit(0);
}
const site = process.env.NEXT_PUBLIC_AWD_SITE || 'cn';
fs.mkdirSync('data', { recursive: true }); fs.writeFileSync('data/users.json', '[]');
const db = getDb();
let count = 0;
const ok = (label: string) => console.log(`ok ${++count} - ${label}`);
async function call(handler: (request: InstanceType<typeof NextRequest>) => Promise<Response>, body: object, token = '', bearer = false) {
  const response = await handler(request(body, token, bearer));
  return { response, data: await response.json() };
}
function seed(scene: string, email: string, code = '123456') {
  db.prepare('INSERT OR REPLACE INTO mail_code(scene,email,codeHash,expiresAt,attempts) VALUES(?,?,?,?,0)').run(scene,email,crypto.createHash('sha256').update(`${email}:${code}`).digest('hex'),Date.now()+60_000);
}
const password = 'Synthetic migration password';
async function phoneUser(phone: string) {
  const { user } = users.findOrCreateByPhone(phone);
  const challenge = flow.setupForVerifiedUser(user, phone);
  await flow.completeSetup({ setupToken: challenge.setupToken, password });
  return { user: users.findUserById(user.id)!, token: sessions.createSession(user.id).token };
}
function worker(action: string, token: string, email: string) { return new Promise<string>((resolve,reject) => {
  const child = spawn(process.execPath, ['--import',path.join(repo,'node_modules/tsx/dist/loader.mjs'),fileURLToPath(import.meta.url),'worker',action,token,email], { cwd: process.cwd(), env: {...process.env, TSX_TSCONFIG_PATH:path.join(repo,'tsconfig.json')} });
  let out=''; let err=''; child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d); child.on('error',reject); child.on('exit',c=>c===0?resolve(out.trim()):reject(new Error(err)));
}); }
const first = await phoneUser('13800007301');
if (site === 'intl') {
  for (const handler of [send,verify]) {
    const result = await call(handler,{email:'legacy@example.invalid',code:'123456'},first.token);
    assert.equal(result.response.status,400); assert.equal(result.data.error,'legacy_email_not_supported');
  }
  assert.equal(users.findUserById(first.user.id)?.email,'');
  ok('CN legacy-email binding unavailable on intl, including authenticated accounts');
  console.log(`PASS ${site}: ${count} legacy-email migration groups`); process.exit(0);
}
for (const handler of [send,verify]) {
  assert.equal((await call(handler,{email:'legacy@example.invalid',code:'123456'})).response.status,401);
  assert.equal((await call(handler,{email:'legacy@example.invalid',code:'123456'},first.token,true)).response.status,401);
}
const noPhone = (await users.createUser({username:'legacy-no-phone',email:'no-phone@example.invalid',password,displayName:'Synthetic'})).user!;
const noPassword = users.findOrCreateByPhone('13800007302').user;
for (const user of [noPhone,noPassword]) {
  const token = sessions.createSession(user.id).token;
  for (const handler of [send,verify]) assert.equal((await call(handler,{email:'legacy@example.invalid',code:'123456'},token)).data.error,'phone_password_required');
}
ok('only current website cookie with phone and password can begin migration');
// Sender and CAPTCHA are synthetic; no external request is sent.
Object.assign(process.env,{AWD_MAIL_RESEND_KEY:'synthetic',AWD_MAIL_FROM:'synthetic@example.invalid',NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID:'synthetic',NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX:'synthetic',AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID:'synthetic',AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET:'synthetic'});
let deliveries=0;
globalThis.fetch=(async (url: any) => {
  if(String(url).includes('captcha.')) return new Response(JSON.stringify({Success:true,Result:{VerifyResult:true}}));
  deliveries++; return new Response(JSON.stringify({id:'synthetic'}));
}) as typeof fetch;
assert.equal((await call(send,{email:'send@example.invalid'},first.token)).response.status,403);
assert.equal(deliveries,0);
assert.equal((await call(send,{email:'send@example.invalid',captchaToken:'synthetic'},first.token)).response.status,200);
assert.equal(deliveries,1);
assert.ok(db.prepare('SELECT 1 FROM mail_code WHERE scene=? AND email=?').get(migration.legacyEmailScene(first.user.id),'send@example.invalid'));
assert.equal((await call(send,{email:'send@example.invalid',captchaToken:'synthetic'},first.token)).response.status,400);
assert.equal(deliveries,1);
ok('send requires configured CAPTCHA, uses account-specific purpose and enforces cooldown');
const email = 'legacy@example.invalid';
for (const scene of ['signin','password_reset',migration.legacyEmailScene(noPassword.id)]) {
  seed(scene,email);
  assert.equal((await call(verify,{email,code:'123456'},first.token)).response.status,400);
}
Object.assign(process.env,{AUTH_REVIEW_ACCOUNT_IDENTITY:email,AUTH_REVIEW_ACCOUNT_CODE:'654321'});
assert.equal((await call(verify,{email,code:'654321'},first.token)).response.status,400);
seed(migration.legacyEmailScene(first.user.id),email);
for(let i=0;i<5;i++) assert.equal((await call(verify,{email,code:'999999'},first.token)).response.status,400);
assert.equal((await call(verify,{email,code:'123456'},first.token)).response.status,400);
ok('signin/reset/other-user/review codes cannot bind; wrong-code attempts persist');
// Use a fresh account to keep purpose tests independent of the login throttle.
const second = await phoneUser('13800007303');
const conflicting = users.findOrCreateByEmail('occupied@example.invalid').user;
seed(migration.legacyEmailScene(second.user.id),conflicting.email);
const conflict = await call(verify,{email:conflicting.email,code:'123456'},second.token);
assert.equal(conflict.response.status,409); assert.equal(conflict.data.error,'email_conflict');
assert.equal(users.findUserById(second.user.id)?.email,'');
const unverified = (await users.createUser({username:'unverified-conflict',email:'unverified@example.invalid',password,displayName:'Synthetic'})).user!;
assert.equal((await call(send,{email:unverified.email},second.token)).data.error,'email_conflict');
ok('email owned by another website identity is rejected, including unverified records');
const credentialBefore = {...users.findUserById(second.user.id)!};
seed(migration.legacyEmailScene(second.user.id),email);
const accepted = await call(verify,{email:email.toUpperCase(),code:'123456'},second.token);
assert.equal(accepted.response.status,200); assert.deepEqual(accepted.data,{ok:true}); assert.equal(accepted.response.headers.get('set-cookie'),null);
const after = users.findUserById(second.user.id)!;
assert.equal(after.id,second.user.id); assert.equal(after.phone,second.user.phone); assert.equal(after.passwordHash,credentialBefore.passwordHash); assert.equal(after.passwordVersion,credentialBefore.passwordVersion); assert.ok(after.emailVerifiedAt); assert.equal(after.email,email);
assert.equal(users.findUserByAccount(email)?.id,second.user.id); assert.ok(sessions.getUserByToken(second.token));
const exchange=(await import('../app/api/auth/exchange-key/route')).POST;
const keyResult=await call(exchange,{account:email,password}); assert.equal(keyResult.response.status,200);
const me=(await import('../app/api/account/me/route')).GET;
const identity=await (await me(new NextRequest('http://localhost/api/account/me',{headers:{authorization:`Bearer ${keyResult.data.key}`}}))).json();
assert.equal(identity.accountId,second.user.id); assert.equal(identity.verifiedEmail,email);
assert.equal((await call(verify,{email,code:'123456'},second.token)).response.status,400);
seed(migration.legacyEmailScene(second.user.id),'different@example.invalid');
assert.equal((await call(verify,{email:'different@example.invalid',code:'123456'},second.token)).data.error,'verified_email_conflict');
ok('binding keeps website ID/phone/password, exposes verified email to bridge, no new session, replay/change rejected');
const left=await phoneUser('13800007304'),right=await phoneUser('13800007305');
const raceEmail='race@example.invalid';
seed(migration.legacyEmailScene(left.user.id),raceEmail); seed(migration.legacyEmailScene(right.user.id),raceEmail);
const race=await Promise.all([worker('bind',left.token,raceEmail),worker('bind',right.token,raceEmail)]);
assert.deepEqual(race.sort(),['accepted','rejected']);
const winner=users.findUserByAccount(raceEmail)!;
assert.ok([left.user.id,right.user.id].includes(winner.id));
ok('independent processes cannot bind one email to two identities');
const parallel=await phoneUser('13800007306'); const parallelEmail='parallel@example.invalid';
seed(migration.legacyEmailScene(parallel.user.id),parallelEmail);
const mixed=await Promise.all([worker('bind',parallel.token,parallelEmail),worker('profile',parallel.user.id,''),worker('create','concurrent-new','concurrent-new@example.invalid')]);
assert.ok(mixed.includes('accepted')); assert.ok(mixed.includes('created'));
const retained=users.findUserById(parallel.user.id)!;
assert.equal(retained.email,parallelEmail); assert.ok(retained.emailVerifiedAt); assert.equal(retained.bio,'synthetic profile 19'); assert.ok(users.findUserByAccount('concurrent-new@example.invalid'));
assert.equal(users.markUserDeleted(parallel.user.id,'Deleted'),true);
assert.equal(users.markUserDeleted(parallel.user.id,'Deleted'),false);
assert.equal((await call(verify,{email:parallelEmail,code:'123456'},parallel.token)).response.status,401);
const tombstone=users.findUserById(parallel.user.id)!; assert.equal(tombstone.email,''); assert.equal(tombstone.emailVerifiedAt,undefined); assert.equal(tombstone.passwordHash,''); assert.equal(tombstone.passwordVersion,undefined);
assert.equal(db.prepare('SELECT 1 FROM password_credential WHERE userId=?').get(parallel.user.id),undefined);
ok('profile/create/bind writers preserve concurrent updates; deletion removes both identity proofs and credentials');
const normalMail=(await import('../app/api/auth/mail-login/send-code/route')).POST;
assert.notEqual((await call(normalMail,{email:'general-cn@example.invalid'})).response.status,200);
ok('CN general email registration remains disabled');
console.log(`PASS ${site}: ${count} legacy-email migration groups`);
