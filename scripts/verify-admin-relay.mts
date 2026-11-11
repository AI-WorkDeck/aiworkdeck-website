import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
const { relayAdmin, allowedRelayPath } = await import('@/lib/admin-relay');
const { POST: login } = await import('@/app/api/admin/login/route');
const { SITE_ID, siteConfigOf, siteOrigins } = await import('@/lib/site-config');

async function loginStatus(configured: string | undefined, candidate: string) {
  if (configured === undefined) delete process.env.AWD_ADMIN_TOKEN;
  else process.env.AWD_ADMIN_TOKEN = configured;
  return login(new NextRequest('https://console.example/api/admin/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: candidate }),
  }));
}
for (const configured of [undefined, '', 'short-key!!']) {
  assert.equal((await loginStatus(configured, configured ?? '')).status, 503);
}
for (const configured of ['test-key-12!', 'local-synthetic-admin-token']) {
  const accepted = await loginStatus(configured, configured);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.cookies.get('awd_admin')?.value, configured);
  assert.equal((await loginStatus(configured, configured.slice(0, -1) + '?')).status, 401);
  assert.equal((await loginStatus(configured, '')).status, 401);
}
process.env.AWD_ADMIN_TOKEN = 'test-key-12!';
process.env.AWD_ADMIN_RELAY_TOKEN = 'remote-synthetic-admin-token';
const remote = SITE_ID === 'cn' ? 'intl' : 'cn';
let calls = 0;
let response = () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'x-awd-admin-site': remote, 'set-cookie': 'secret=hidden', 'authorization': 'hidden' } });
let checkRequest = (_url: URL, _init: RequestInit) => {};
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: URL, init: RequestInit) => { calls++; checkRequest(url, init); return response(); }) as typeof fetch;
function request(method = 'GET', headers: Record<string, string> = {}, body?: string) {
  return new NextRequest('https://console.example/api/admin/sites/intl/admin/overview?q=one', {
    method, headers: { cookie: 'awd_admin=test-key-12!; unrelated=private', origin: 'https://console.example', ...headers }, body,
  });
}
async function status(req: NextRequest, site: string, path: string[], expected: number) {
  const res = await relayAdmin(req, site, path);
  assert.equal(res.status, expected); return res;
}
try {
  await status(request('GET', { cookie: '' }), remote, ['admin', 'overview'], 401);
  for (const parts of [['admin','login'], ['admin','sites','cn','admin','overview'], ['..','admin','overview'], ['admin','%2e%2e','overview'], ['admin','..'], ['community','posts','foo/bar'], ['account','me']]) {
    await status(request(), remote, parts, 400);
  }
  await status(request(), SITE_ID, ['admin', 'overview'], 400);
  await status(request(), 'arbitrary', ['admin', 'overview'], 400);
  await status(request('POST', { origin: 'https://evil.example' }), remote, ['admin', 'pricing'], 403);
  await status(request('POST', { origin: '' }), remote, ['admin', 'pricing'], 403);
  delete process.env.AWD_ADMIN_RELAY_TOKEN;
  await status(request(), remote, ['admin','overview'], 503);
  assert.equal(calls, 0);
  process.env.AWD_ADMIN_RELAY_TOKEN = 'remote-synthetic-admin-token';
  checkRequest = (url, init) => {
    assert.equal(url.origin, siteConfigOf(remote).origin);
    assert.equal(url.pathname, '/api/admin/overview');
    assert.equal(url.searchParams.get('q'), 'one');
    assert.equal(url.searchParams.get('site'), remote);
    const h = new Headers(init.headers);
    assert.equal(h.get('cookie'), `awd_admin=remote-synthetic-admin-token; awd_site=${remote}`);
    assert.equal(h.get('authorization'), null);
    assert.equal(h.get('origin'), url.origin);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal);
  };
  const ok = await status(request('GET', { authorization: 'must-not-forward' }), remote, ['admin','overview'], 200);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.equal(ok.headers.get('set-cookie'), null);
  assert.equal(ok.headers.get('authorization'), null);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  checkRequest = () => {};
  for (const code of [301,302,307,308,401,403,500,503]) {
    response = () => new Response('sensitive upstream body', { status: code, headers: { location: 'https://evil.example', 'x-awd-admin-site': remote } });
    const failed = await status(request(), remote, ['admin','overview'], 502);
    assert.equal(await failed.text(), '{"error":"relay_unavailable"}');
    assert.equal(failed.headers.get('location'), null);
  }
  for (const marker of ['', SITE_ID]) {
    response = () => new Response('wrong site', { headers: { 'x-awd-admin-site': marker } });
    await status(request(), remote, ['admin','overview'], 502);
  }
  response = () => { throw new Error('private network info'); };
  await status(request(), remote, ['admin','overview'], 502);
  response = () => new Response('invalid data', { status: 400, headers: { 'x-awd-admin-site': remote } });
  await status(request(), remote, ['admin','pricing'], 400);
  response = () => new Response('part', { status: 206, headers: { 'x-awd-admin-site': remote, 'content-type':'audio/wav', 'content-range':'bytes 0-3/99', 'accept-ranges':'bytes', 'content-disposition':'attachment; filename="sample.wav"' } });
  checkRequest = (_, init) => assert.equal(new Headers(init.headers).get('range'), 'bytes=0-3');
  const attachment = await status(request('GET', { range: 'bytes=0-3' }), remote, ['admin','feedback','1','attachments','2'], 206);
  assert.equal(attachment.headers.get('content-range'), 'bytes 0-3/99');
  assert.equal(await attachment.text(), 'part');
  checkRequest = (_, init) => { assert.equal(init.method, 'PUT'); assert.equal(new TextDecoder().decode(init.body as Uint8Array), '{"value":3}'); };
  response = () => new Response(null, { status: 204, headers: { 'x-awd-admin-site': remote } });
  await status(request('PUT', { 'content-type': 'application/json' }, '{"value":3}'), remote, ['admin','ai'], 204);
  const previousMode = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  checkRequest = () => {};
  await status(request('PUT', { origin: siteOrigins[0] }), remote, ['admin','ai'], 204);
  await status(request('PUT', { origin: siteConfigOf(remote).origin }), remote, ['admin','ai'], 403);
  await status(request('PUT', { origin: 'https://console.example', 'x-forwarded-host': 'console.example' }), remote, ['admin','ai'], 403);
  if (previousMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Object.assign(process.env, { NODE_ENV: previousMode });
  const before = calls;
  await status(request('POST', {}, 'x'.repeat(12 * 1024 * 1024 + 1)), remote, ['admin','pricing'], 413);
  assert.equal(calls, before);
  for (const [path, method] of [
    ['admin/ai','PUT'], ['admin/costs','PUT'], ['admin/transparency','PATCH'], ['admin/transparency','PUT'],
    ['admin/plugins/plugin-id','POST'], ['admin/packs/pack.id','POST'], ['community/posts/post-id','DELETE'],
    ['community/posts/post-id','PATCH'], ['community/chat','DELETE'], ['transparency/receipt/receipt-id','GET'],
    ['admin/telemetry','GET'], ['admin/transparency/export','GET'],
  ]) assert.ok(allowedRelayPath(path.split('/'), method), `${method} ${path}`);
  assert.equal(allowedRelayPath(['community','chat'], 'POST'), false);
  assert.equal(allowedRelayPath(['admin','overview'], 'POST'), false);
  console.log(`Admin relay ${SITE_ID}: authentication, allowlist, origin, isolation, redirect, response identity, upload limit, downloads and writes passed (${calls} synthetic requests).`);
} finally { globalThis.fetch = originalFetch; }
