// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Importing the live entry point would launch the full harness. Execute its
// actual helper/guard in a VM instead; every fetch and browser call is synthetic.
const source = fs.readFileSync(new URL('./live-browser.mjs', import.meta.url), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Live harness section missing: ${start}`);
  return source.slice(from, to);
}
const helper = section('async function normalLogout(){', 'async function budgetGate()');
const requestGuard = section("page.on('request',async req=>{", " stage='login_page_load';");
const finalizer = section('  audit.logoutVerified=false;', '  if(stopObserving)');
const expectedUser = 'synthetic-dedicated-user';
const origin = 'https://www.aiworkdeck.com';
const me = user => ({ status: 200, body: { user } });

async function logout(replies) {
  const calls = [];
  const context = vm.createContext({
    expectedUser, AbortController, setTimeout, clearTimeout,
    page: { evaluate: (fn, arg) => fn(arg) },
    fetch: async (path, options) => {
      calls.push({ path, method: options.method || 'GET' });
      assert.equal(options.credentials, 'same-origin');
      assert.ok(options.signal);
      const response = replies.shift();
      assert.ok(response, 'Unexpected fetch');
      if (response instanceof Error) throw response;
      return { status: response.status, json: async () => response.body };
    },
  });
  return { result: await vm.runInContext(helper + 'normalLogout()', context), calls };
}

test('normal logout checks dedicated identity, posts logout, and verifies anonymous readback', async () => {
  const { result, calls } = await logout([me({ id: expectedUser }), { status: 200 }, me(null)]);
  assert.equal(result.verified, true);
  assert.deepEqual(calls, [
    { path: '/api/auth/me', method: 'GET' },
    { path: '/api/auth/logout', method: 'POST' },
    { path: '/api/auth/me', method: 'GET' },
  ]);
});
test('identity mismatch never posts logout for a different account', async () => {
  const { result, calls } = await logout([me({ id: 'another-synthetic-user' })]);
  assert.equal(result.verified, false);
  assert.equal(result.identityMismatch, true);
  assert.equal(calls.length, 1);
});
test('failed logout HTTP status cannot become verified despite anonymous readback', async () => {
  const { result } = await logout([me({ id: expectedUser }), { status: 500 }, me(null)]);
  assert.equal(result.verified, false);
});
test('logout HTTP success requires anonymous readback', async () => {
  const { result } = await logout([me({ id: expectedUser }), { status: 200 }, me({ id: expectedUser })]);
  assert.equal(result.verified, false);
});
test('already anonymous context needs no logout mutation', async () => {
  const { result, calls } = await logout([me(null)]);
  assert.equal(result.verified, true);
  assert.equal(result.alreadyAnonymous, true);
  assert.equal(calls.length, 1);
});
test('network failure cannot be reported as verified logout', async () => {
  await assert.rejects(logout([new Error('synthetic network failure')]), /synthetic network failure/);
});

function guard(cleanupLogout) {
  let handler;
  const context = vm.createContext({
    URL, origin, cleanupLogout, runExpired: true, logoutPosts: 0,
    loginPosts: 0, guardFailure: false,
    page: { on: (event, fn) => { assert.equal(event, 'request'); handler = fn; } },
  });
  vm.runInContext(requestGuard, context);
  return async path => {
    let allowed = false;
    await handler({ url: () => path, method: () => 'POST',
      abort: async () => {}, continue: async () => { allowed = true; } });
    return allowed;
  };
}
for (const [name, path, enabled, allowed] of [
  ['cleanup logout remains allowed after run deadline', origin + '/api/auth/logout', true, true],
  ['logout outside cleanup remains blocked after deadline', origin + '/api/auth/logout', false, false],
  ['AI mutation remains blocked during expired-run cleanup', origin + '/api/web/chat', true, false],
  ['external logout cannot use same-origin cleanup exception', 'https://example.invalid/api/auth/logout', true, false],
]) {
  test(name, async () => assert.equal(await guard(enabled)(path), allowed));
}
test('cleanup permits at most one normal logout POST', async () => {
  const request = guard(true);
  assert.equal(await request(origin + '/api/auth/logout'), true);
  assert.equal(await request(origin + '/api/auth/logout'), false);
});

async function finish(dedicatedAccountVerified, verified) {
  let attempts = 0;
  const audit = { status: 'passed', dedicatedAccountVerified, cleanup: {} };
  const process = { exitCode: 0 };
  const context = vm.createContext({ audit, process, page: {}, cleanupLogout: false, logoutPosts: 0,
    normalLogout: async () => { attempts++; return { verified }; },
    boundedCleanup: async fn => { try { await fn(); return 'completed'; } catch { return 'failed'; } },
  });
  await vm.runInContext('(async()=>{' + finalizer + '})()', context);
  return { audit, process, attempts };
}
test('unverified identity records no logout attempt and never claims session cleanup', async () => {
  const { audit, attempts } = await finish(false, true);
  assert.equal(attempts, 0);
  assert.equal(audit.logoutVerified, false);
  assert.equal(audit.cleanup.logout, 'not_attempted_identity_unverified');
});
test('failed verified-identity logout downgrades acceptance and preserves cleanup requirement', async () => {
  const { audit, process } = await finish(true, false);
  assert.equal(audit.status, 'failed_or_unconfirmed');
  assert.equal(audit.cleanup.logoutRequired, true);
  assert.equal(process.exitCode, 1);
});
