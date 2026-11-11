// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Run in an empty temporary cwd. Every outbound request is intercepted; no real SMS.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
const intl = process.env.NEXT_PUBLIC_AWD_SITE === 'intl';
const identityField = intl ? 'email' : 'phone';
process.env.AWD_MAIL_RESEND_KEY = 'test-only';
process.env.AWD_MAIL_FROM = 'test@example.invalid';
process.env.NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY = 'test';
process.env.AWD_TURNSTILE_SECRET = 'test';
process.env.AWD_SMS_ACCESS_KEY_ID = 'test-only';
process.env.AWD_SMS_ACCESS_KEY_SECRET = 'test-only';
process.env.AWD_SMS_SIGN_NAME = 'test';
process.env.AWD_SMS_TEMPLATE_CODE = 'test';
process.env.NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID = 'test';
process.env.NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX = 'test';
process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID = 'test';
process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET = 'test';
assert.ok(!fs.existsSync('package.json') && !fs.existsSync('data'), 'Run in a fresh empty temporary directory');
const { getDb } = await import('@/lib/db');
const { issueChallenge, consumeChallenge } = await import('@/lib/captcha-challenge');
const { POST: issue } = await import('@/app/api/auth/captcha-challenge/route');
const { POST: send } = await (intl ? import('@/app/api/auth/mail-login/send-code/route') : import('@/app/api/auth/sms-login/send-code/route'));
const { POST: reset } = await import('@/app/api/auth/password/reset/send-code/route');
let sent = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request) => {
  assert.equal(String(url), intl ? 'https://api.resend.com/emails' : 'https://dysmsapi.aliyuncs.com/', 'no unmocked outbound requests');
  sent++;
  return new Response(JSON.stringify(intl ? {id:'mocked'} : { Code: 'OK' }), { status: 200 });
}) as typeof fetch;
const originalRandom = crypto.randomInt;
// Only deterministic fixture entropy. Production has no answer override or test env escape.
crypto.randomInt = ((min: number, max?: number) => max === undefined ? 0 : min) as typeof crypto.randomInt;
const request = (body: object, ip = '198.51.100.1') => new NextRequest('https://test.invalid/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const token = (id: string, answer = '222222') => `local:${id}:${answer}`;
let serial = 0;
const fixture = async (purpose: 'login' | 'reset' = 'login') => {
  serial++;
  const phone = intl ? `test${serial}@example.invalid` : `1380013${String(serial).padStart(4,'0')}`;
  const ip = `198.51.100.${serial}`;
  const res = await issue(request({[identityField]:phone,purpose}, ip));
  assert.equal(res.status,200);
  const data = await res.json();
  assert.deepEqual(Object.keys(data).sort(), ['expiresAt','id','image']);
  assert.match(data.image,/^data:image\/png;base64,iVBOR/);
  if (process.env.CHALLENGE_TEST_IMAGE) fs.writeFileSync(process.env.CHALLENGE_TEST_IMAGE, Buffer.from(data.image.split(',')[1], 'base64'));
  assert.equal(Buffer.from(data.image.split(',')[1],'base64').includes(Buffer.from('222222')),false);
  return {phone,ip,data};
};
try {
  const invalid = await issue(request({[identityField]:'invalid',purpose:'login'}));
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).error, intl ? 'invalid_email' : 'invalid_phone');
  let f = await fixture();
  assert.equal((await send(request({[identityField]:f.phone,captchaToken:token(f.data.id)},f.ip))).status,200);
  assert.equal(sent,1,'valid challenge sends once');
  assert.equal((await send(request({[identityField]:f.phone,captchaToken:token(f.data.id)},f.ip))).status,403);
  assert.equal(sent,1,'replay cannot send');
  const again = await issueChallenge({account:f.phone,purpose:'login'},f.ip);
  const cooldown = await send(request({[identityField]:f.phone,captchaToken:token(again.id)},f.ip));
  assert.equal(cooldown.status,400);
  assert.match((await cooldown.json()).message, /秒后|new code in/);
  assert.equal(sent,1,'cooldown retains actionable message and does not deliver');
  for (const mutation of ['wrong','expired','account','ip','purpose']) {
    f=await fixture();
    if(mutation==='expired') getDb().prepare('UPDATE captcha_challenge SET expiresAt=0 WHERE id=?').run(f.data.id);
    const body={[identityField]:mutation==='account'?(intl?'other@example.invalid':'13999999999'):f.phone,captchaToken:token(f.data.id,mutation==='wrong'?'ABCDEF':'222222')};
    const res=await (mutation==='purpose'?reset:send)(request(body,mutation==='ip'?'203.0.113.9':f.ip));
    assert.equal(res.status,403,mutation);
    assert.equal(sent,1,`${mutation} cannot send`);
    assert.equal(consumeChallenge(token(f.data.id),{account:f.phone,purpose:'login'},f.ip),false,'failed attempt consumes challenge');
  }
  f=await fixture('reset');
  assert.equal((await reset(request({[identityField]:f.phone,captchaToken:token(f.data.id)},f.ip))).status,200);
  assert.equal(sent,2,'reset purpose can send');
  f=await fixture();
  const responses=await Promise.all([send(request({[identityField]:f.phone,captchaToken:token(f.data.id)},f.ip)),send(request({[identityField]:f.phone,captchaToken:token(f.data.id)},f.ip))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);
  assert.equal(sent,3,'concurrent replay sends once');
  assert.equal((await issue(request({phone:'13800138000',purpose:'other'}))).status,400);
  const context={account:'13900139000',purpose:'login' as const};
  for(let i=0;i<10;i++) await issueChallenge(context,'203.0.113.15');
  await assert.rejects(()=>issueChallenge(context,'203.0.113.15'),/Too many/);
  // Disabling third-party configuration never skips validation of a claimed local proof.
  delete process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID;
  delete process.env.AWD_TURNSTILE_SECRET;
  f=await fixture();
  assert.equal((await send(request({[identityField]:f.phone,captchaToken:token(f.data.id,'ABCDEF')},f.ip))).status,403);
  assert.equal(sent,3);
  console.log('PASS: PNG-only payload, login/reset, wrong/expired/replay/binding rejection, concurrent consumption, issuance limits, disabled-provider enforcement; 3 mocked deliveries, 0 real requests.');
} finally { globalThis.fetch=originalFetch; crypto.randomInt=originalRandom; }
