// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Verifies plugin period subscriptions (CNY/wxpay + USD/stripe) and HMAC-signed awdpa1 assertions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';

assert.ok(!fs.existsSync('package.json') && !fs.existsSync('data'), 'Run in a new isolated directory');
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;
process.env.AWD_KEY_ENCRYPTION_SECRET = crypto.randomBytes(32).toString('hex');
delete process.env.AIFIRM_PLUGIN_ASSERTION_SECRET;

const { NextRequest } = await import('next/server');
const { createUser } = await import('@/lib/users');
const { generateApiKey } = await import('@/lib/api-keys');
const { siteConfig } = await import('@/lib/site-config');
const { getDb } = await import('@/lib/db');
const { hasEntitlement } = await import('@/lib/purchases');
const { getPaymentAdapter, settleFromChannel } = await import('@/lib/payments');
const { getOrder } = await import('@/lib/orders');
const createRoute = await import('@/app/api/payment/create/route');
const queryRoute = await import('@/app/api/payment/query/route');
const entitlementRoute = await import('@/app/api/account/entitlements/route');
const plansRoute = await import('@/app/api/account/plugin-subscriptions/route');
const assertionRoute = await import('@/app/api/account/plugin-assertion/route');

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/fx-rate.json', JSON.stringify({ lastAttemptAt: new Date().toISOString() }));

const createdUser = await createUser({
  username: 'plugin-sub-lawyer',
  email: 'lawyer-sub@example.invalid',
  password: crypto.randomBytes(24).toString('hex'),
  displayName: 'Lawyer Lin',
});
assert.ok(createdUser.user);
const user = createdUser.user;
const keyRes = generateApiKey(user.id);
assert.ok(keyRes.key);
const apiKey = keyRes.key.plaintextKey;

const adapter = getPaymentAdapter();
let providerPaid = false;
let creates = 0;
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/create') {
    creates++;
    res.end(
      JSON.stringify(
        adapter.id === 'stripe'
          ? { channel: 'stripe', present: 'redirect', redirectUrl: 'https://payment.example.invalid/checkout', providerRef: 'sub-session-' + creates }
          : { channel: 'wxpay', present: 'qrcode', codeUrl: 'weixin://sub-fixture-' + creates, qrCode: 'data:image/png;base64,subfixture' }
      )
    );
  } else {
    const id = new URL(req.url!, 'http://fixture').searchParams.get('id')!;
    const order = getOrder(id)!;
    res.end(
      JSON.stringify({
        outTradeNo: id,
        paid: providerPaid,
        channel: order.channel,
        currency: order.currency,
        amountMinor: order.amount,
        transactionId: 'fixture-' + id,
      })
    );
  }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: any, options: any) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  assert.equal(url.origin, origin, 'No external provider HTTP allowed in isolated test');
  return originalFetch(input, options);
}) as typeof fetch;

adapter.isConfigured = () => true;
adapter.createCharge = async () => (await fetch(origin + '/create')).json();
adapter.queryCharge = async id => (await fetch(origin + '/query?id=' + encodeURIComponent(id))).json();

const req = (path: string, { auth = true, body }: { auth?: boolean; body?: unknown } = {}) =>
  new NextRequest('https://site.example.invalid' + path, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {
      ...(auth ? { Authorization: 'Bearer ' + apiKey } : {}),
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

let checks = 0;
const ok = (name: string) => {
  checks++;
  console.log('PASS', name);
};

try {
  // 1. Catalog query works anonymously and returns site currency + prepaid plans
  const anonCatalogRes = await plansRoute.GET(req('/api/account/plugin-subscriptions?pluginId=aifirm-partner', { auth: false }));
  assert.equal(anonCatalogRes.status, 200);
  const anonCatalog = await anonCatalogRes.json();
  assert.equal(anonCatalog.currency, siteConfig.currency);
  assert.equal(anonCatalog.autoRenew, false);
  assert.equal(anonCatalog.subscription, null);
  assert.equal(anonCatalog.plans.length, 2);
  const monthly = anonCatalog.plans.find((p: any) => p.period === 'monthly');
  const quarterly = anonCatalog.plans.find((p: any) => p.period === 'quarterly');
  assert.equal(monthly.amountCents, siteConfig.currency === 'USD' ? 2900 : 19900);
  assert.equal(quarterly.amountCents, siteConfig.currency === 'USD' ? 7900 : 52900);
  ok('anonymous catalog returns prepaid monthly & quarterly plans in site currency');

  const badPlugin = await plansRoute.GET(req('/api/account/plugin-subscriptions?pluginId=other-plugin', { auth: false }));
  assert.equal(badPlugin.status, 400);
  ok('unsupported plugin rejected on subscription catalog');

  // 2. Fail-closed plugin-assertion when unauthenticated or secret missing
  const unauthAssert = await assertionRoute.POST(req('/api/account/plugin-assertion', { auth: false, body: { pluginId: 'aifirm-partner' } }));
  assert.equal(unauthAssert.status, 401);
  const noSecretAssert = await assertionRoute.POST(req('/api/account/plugin-assertion', { body: { pluginId: 'aifirm-partner' } }));
  assert.equal(noSecretAssert.status, 503);
  assert.equal((await noSecretAssert.json()).error, 'assertion_not_configured');
  ok('plugin-assertion fails closed without authentication or secret');

  // 3. Provision test secret & check unsubscribed assertion (active: false)
  const secret = crypto.randomBytes(32).toString('hex');
  process.env.AIFIRM_PLUGIN_ASSERTION_SECRET = secret;
  const inactiveAssertRes = await assertionRoute.POST(req('/api/account/plugin-assertion', { body: { pluginId: 'aifirm-partner' } }));
  assert.equal(inactiveAssertRes.status, 200);
  const inactiveAssert = await inactiveAssertRes.json();
  assert.equal(inactiveAssert.active, false);
  assert.equal(inactiveAssert.expiresAt, null);
  assert.ok(inactiveAssert.token.startsWith('awdpa1.'));
  const [, rawPayloadB64, rawSigB64] = inactiveAssert.token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update('awdpa1.' + rawPayloadB64, 'utf8').digest('base64url');
  assert.equal(rawSigB64, expectedSig);
  const decodedPayload = JSON.parse(Buffer.from(rawPayloadB64, 'base64url').toString('utf8'));
  assert.equal(decodedPayload.sub, user.id);
  assert.equal(decodedPayload.active, false);
  assert.equal(decodedPayload.pluginId, 'aifirm-partner');
  ok('signed awdpa1 assertion reports inactive before purchase');

  // 4. Reject wrong amount before creating provider charge
  const badAmt = await createRoute.POST(
    req('/api/payment/create', { body: { kind: 'subscription', skuId: monthly.skuId, amount: monthly.amountCents - 1, idempotencyKey: 'bad-amt' } })
  );
  assert.equal(badAmt.status, 400);
  assert.equal(creates, 0);
  ok('mismatched plugin subscription price rejected before provider call');

  // 5. Create monthly order -> pending -> query after paid -> entitlement active for 30 days
  const createMonthly = await createRoute.POST(
    req('/api/payment/create', { body: { kind: 'subscription', skuId: monthly.skuId, amount: monthly.amountCents, idempotencyKey: 'sub-m1' } })
  );
  assert.equal(createMonthly.status, 200);
  const monthlyOrder = await createMonthly.json();
  assert.equal(monthlyOrder.present, adapter.id === 'stripe' ? 'redirect' : 'qrcode');
  assert.equal(hasEntitlement(user.id, 'plugin:aifirm-partner'), false);

  providerPaid = true;
  const q1 = await queryRoute.GET(req('/api/payment/query?outTradeNo=' + monthlyOrder.outTradeNo));
  assert.equal(q1.status, 200);
  const q1Json = await q1.json();
  assert.equal(q1Json.order.status, 'paid');
  assert.ok(q1Json.order.expiresAt);
  assert.equal(hasEntitlement(user.id, 'plugin:aifirm-partner'), true);

  const entRes = await entitlementRoute.GET(req('/api/account/entitlements'));
  const entJson = await entRes.json();
  const entRow = entJson.entitlements.find((e: any) => e.feature === 'plugin:aifirm-partner');
  assert.ok(entRow && entRow.expiresAt === q1Json.order.expiresAt);
  ok('monthly plugin subscription settles via query and exposes expiresAt on entitlements');

  // 6. Active assertion reflects subscribed state and expiresAt
  const activeAssertRes = await assertionRoute.POST(req('/api/account/plugin-assertion', { body: { pluginId: 'aifirm-partner' } }));
  assert.equal(activeAssertRes.status, 200);
  const activeAssert = await activeAssertRes.json();
  assert.equal(activeAssert.active, true);
  assert.equal(activeAssert.expiresAt, q1Json.order.expiresAt);
  ok('awdpa1 assertion updates to active=true with entitlement expiresAt');

  // 7. Buying quarterly pass extends existing expiresAt by +90 days; duplicate settlement is a no-op
  const firstExpiryMs = Date.parse(q1Json.order.expiresAt);
  const createQuarterly = await createRoute.POST(
    req('/api/payment/create', { body: { kind: 'subscription', skuId: quarterly.skuId, amount: quarterly.amountCents, idempotencyKey: 'sub-q1' } })
  );
  assert.equal(createQuarterly.status, 200);
  const quarterlyOrder = await createQuarterly.json();
  const settle2 = settleFromChannel({
    outTradeNo: quarterlyOrder.outTradeNo,
    paid: true,
    channel: adapter.id,
    currency: adapter.currency,
    amountMinor: quarterly.amountCents,
    transactionId: 'fixture-' + quarterlyOrder.outTradeNo,
  });
  assert.equal(settle2.ok, true);

  const authCatalogRes = await plansRoute.GET(req('/api/account/plugin-subscriptions?pluginId=aifirm-partner'));
  const authCatalog = await authCatalogRes.json();
  assert.equal(authCatalog.subscription.active, true);
  const extendedExpiryMs = Date.parse(authCatalog.subscription.expiresAt);
  const deltaDays = Math.round((extendedExpiryMs - firstExpiryMs) / 86400_000);
  assert.equal(deltaDays, 90);

  const dupSettle = settleFromChannel({
    outTradeNo: quarterlyOrder.outTradeNo,
    paid: true,
    channel: adapter.id,
    currency: adapter.currency,
    amountMinor: quarterly.amountCents,
    transactionId: 'fixture-' + quarterlyOrder.outTradeNo,
  });
  assert.equal(dupSettle.ok, true);
  assert.equal(dupSettle.alreadyPaid, true);
  const paymentCount = (getDb().prepare('SELECT COUNT(*) AS n FROM plugin_subscription_payment WHERE userId = ?').get(user.id) as { n: number }).n;
  assert.equal(paymentCount, 2);
  ok('renewal extends active expiresAt by 90 days and duplicate settlement is idempotent');

  console.log(`Plugin subscription checks passed: ${checks} (${siteConfig.id}/${adapter.id}/${siteConfig.currency})`);
} finally {
  globalThis.fetch = originalFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
}
