// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Real routes + SQLite + signing + entitlement delivery; only the payment provider is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import AdmZip from 'adm-zip';

assert.ok(!fs.existsSync('package.json') && !fs.existsSync('data'), 'Run in a new isolated directory');
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;
process.env.AWD_KEY_ENCRYPTION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.AWD_PLUGIN_SIGNING_KEY = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const { NextRequest } = await import('next/server');
const { createUser } = await import('@/lib/users');
const { generateApiKey } = await import('@/lib/api-keys');
const { canonicalPayload } = await import('@/lib/plugin-signing');
const { submitPlugin, approvePlugin } = await import('@/lib/plugins-store');
const { withTransaction } = await import('@/lib/db');
const { getBalance, grantCredits } = await import('@/lib/credits');
const { hasEntitlement } = await import('@/lib/purchases');
const { getPaymentAdapter, settleFromChannel } = await import('@/lib/payments');
const { getOrder } = await import('@/lib/orders');
const create = await import('@/app/api/payment/create/route');
const query = await import('@/app/api/payment/query/route');
const entitlement = await import('@/app/api/account/entitlements/route');
const purchase = await import('@/app/api/account/purchase/route');
const bundle = await import('@/app/api/registry/plugins/[id]/bundle/route');
const file = await import('@/app/api/registry/plugins/[id]/file/route');
// Prevent unrelated background FX refreshes in this isolated billing test.
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/fx-rate.json', JSON.stringify({ lastAttemptAt: new Date().toISOString() }));

const users = await Promise.all(['author', 'buyer', 'other'].map(async name => {
  const result = await createUser({ username: `billing-${name}`, email: `${name}@example.invalid`, password: crypto.randomBytes(24).toString('hex'), displayName: name });
  assert.ok(result.user); return result.user;
}));
const keys = users.map(user => { const result = generateApiKey(user.id); assert.ok(result.key); return result.key.plaintextKey; });
const adapter = getPaymentAdapter();
let creates = 0;
let providerPaid = false;
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/create') {
    creates++;
    res.end(JSON.stringify(adapter.id === 'stripe'
      ? { channel: 'stripe', present: 'redirect', redirectUrl: 'https://payment.example.invalid/checkout', providerRef: 'fixture-session' }
      : { channel: 'wxpay', present: 'qrcode', codeUrl: 'weixin://fixture', qrCode: 'data:image/png;base64,fixture' }));
  } else {
    const id = new URL(req.url!, 'http://fixture').searchParams.get('id')!;
    const order = getOrder(id)!;
    res.end(JSON.stringify({ outTradeNo: id, paid: providerPaid, channel: order.channel, currency: order.currency,
      amountMinor: order.amount, transactionId: 'fixture-' + id }));
  }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: any, options: any) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  assert.equal(url.origin, origin, 'No real provider requests are allowed');
  return originalFetch(input, options);
}) as typeof fetch;
adapter.isConfigured = () => true;
adapter.createCharge = async () => (await fetch(origin + '/create')).json();
adapter.queryCharge = async id => (await fetch(origin + '/query?id=' + encodeURIComponent(id))).json();
const request = (path: string, user = 1, body?: unknown) => new NextRequest('https://site.example.invalid' + path, {
  method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + keys[user], 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
let checks = 0;
function ok(name: string) { checks++; console.log('PASS', name); }
function publish(id: string, priceCents = 100) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ id, name: id, version: '1.0.0', permissions: [], frontendEntry: 'web/index.html' })));
  zip.addFile('web/index.html', Buffer.from('<!doctype html><title>Billing fixture</title>'));
  assert.ok(submitPlugin(zip.toBuffer(), users[0], { priceCents }).plugin);
  assert.equal(approvePlugin(id, '1.0.0').ok, true);
}
try {
  publish('paid-services-demo');
  publish('credits-services-demo');
  publish('free-services-demo', 0);
  const freeFile = await file.GET(request('/api/registry/plugins/free-services-demo/file?path=web/index.html', 2), { params: Promise.resolve({ id: 'free-services-demo' }) });
  assert.equal(freeFile.status, 200);
  assert.equal(freeFile.headers.get('cache-control'), 'public, max-age=86400, immutable');
  assert.equal(freeFile.headers.get('vary'), null); ok('free plugin files retain public caching');
  const skuId = 'plugin:paid-services-demo';
  const body = { amount: 100, kind: 'purchase', skuId, idempotencyKey: 'fixture-purchase' };
  const bundleRequest = (user = 1) => bundle.GET(request('/api/registry/plugins/paid-services-demo/bundle', user), { params: Promise.resolve({ id: 'paid-services-demo' }) });
  assert.equal((await bundleRequest()).status, 402); ok('unpaid user cannot download paid plugin');
  assert.equal((await create.POST(request('/api/payment/create', 1, { ...body, amount: 1 }))).status, 400);
  assert.equal(creates, 0); ok('wrong price rejected before provider request');
  const response = await create.POST(request('/api/payment/create', 1, body));
  assert.equal(response.status, 200);
  const created = await response.json();
  assert.equal(created.success, true);
  assert.equal(created.present, adapter.id === 'stripe' ? 'redirect' : 'qrcode');
  assert.equal(hasEntitlement(users[1].id, skuId), false); ok('checkout creation is not payment or entitlement');
  const repeated = await (await create.POST(request('/api/payment/create', 1, body))).json();
  assert.equal(repeated.outTradeNo, created.outTradeNo); ok('retry reuses the same pending order');
  const path = '/api/payment/query?outTradeNo=' + created.outTradeNo;
  assert.equal((await query.GET(request(path, 2))).status, 404); ok('another account cannot inspect the payment');
  const wrong = settleFromChannel({ outTradeNo: created.outTradeNo, paid: true, channel: adapter.id,
    currency: adapter.currency, amountMinor: 1, transactionId: 'fixture-wrong' });
  assert.equal(wrong.ok, false); assert.equal(hasEntitlement(users[1].id, skuId), false); ok('mismatched settlement cannot grant entitlement');
  const pending = await (await query.GET(request(path))).json();
  assert.equal(pending.order.status, 'pending');
  assert.equal(hasEntitlement(users[1].id, skuId), false); ok('unpaid provider query cannot grant entitlement');
  await new Promise(resolve => setTimeout(resolve, 2050)); // Real route query throttle.
  providerPaid = true;
  const paid = await (await query.GET(request(path))).json();
  assert.equal(paid.order.status, 'paid');
  assert.equal(hasEntitlement(users[1].id, skuId), true); ok('real query route settles payment and grants plugin entitlement');
  const manifestResponse = await bundleRequest();
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(crypto.verify(null, Buffer.from(canonicalPayload(manifest)), crypto.createPublicKey(process.env.AWD_PLUGIN_SIGNING_KEY!), Buffer.from(manifest.signature, 'base64')), true);
  for (const [relPath, digest] of Object.entries(manifest.files)) {
    const filePath = '/api/registry/plugins/paid-services-demo/file?path=' + encodeURIComponent(relPath);
    const params = { params: Promise.resolve({ id: 'paid-services-demo' }) };
    const download = await file.GET(request(filePath), params);
    assert.equal(download.status, 200);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'), digest);
    assert.equal(download.headers.get('cache-control'), 'private, no-store');
    assert.equal(download.headers.get('vary'), 'Authorization');
    assert.equal((await file.GET(request(filePath, 2), params)).status, 402);
  }
  ok('paid files verify against signed manifest and cannot enter shared caches');
  assert.equal((await bundleRequest(2)).status, 402); ok('bundle becomes available only to the purchasing account');
  const owned = await (await entitlement.GET(request('/api/account/entitlements'))).json();
  assert.ok(owned.entitlements.some((item: any) => item.feature === skuId)); ok('host synchronization sees the purchased plugin');
  const before = getBalance(users[0].id);
  const order = getOrder(created.outTradeNo)!;
  const duplicate = settleFromChannel({ outTradeNo: order.outTradeNo, paid: true, channel: adapter.id,
    currency: adapter.currency, amountMinor: order.amount, transactionId: 'fixture-' + order.outTradeNo });
  assert.equal(duplicate.ok, true); assert.equal(getBalance(users[0].id), before);
  assert.equal(before, 70); ok('duplicate settlement cannot pay the creator twice');
  assert.equal((await create.POST(request('/api/payment/create', 1, body))).status, 409); ok('already-owned plugin cannot be purchased again');
  const creditsBody = { skuId: 'plugin:credits-services-demo' };
  const poor = await purchase.POST(request('/api/account/purchase', 2, creditsBody));
  assert.equal(poor.status, 409); assert.equal((await poor.json()).error, 'insufficient_credits');
  assert.equal(hasEntitlement(users[2].id, creditsBody.skuId), false); ok('insufficient credits do not grant entitlement');
  withTransaction(db => grantCredits(db, { userId: users[2].id, amountCents: 150, pool: 'reward', ledgerKind: 'gift', meta: { test: 'plugin-billing' } }));
  const creditPaid = await purchase.POST(request('/api/account/purchase', 2, creditsBody));
  assert.equal(creditPaid.status, 200); assert.equal(getBalance(users[2].id), 50);
  assert.equal(hasEntitlement(users[2].id, creditsBody.skuId), true); ok('credits purchase atomically debits and delivers entitlement');
  const creditAgain = await purchase.POST(request('/api/account/purchase', 2, creditsBody));
  assert.equal(creditAgain.status, 409); assert.equal(getBalance(users[2].id), 50); ok('credits retry does not charge twice');
  console.log(`Plugin billing checks passed: ${checks} (${adapter.id}/${adapter.currency}; synthetic provider, no real charge)`);
} finally {
  globalThis.fetch = originalFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
}
