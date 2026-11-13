// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Google Play Billing 消耗型内购充值验证脚本。
 * 必须在空目录执行（data/awd.db 与 users.json 建在 cwd，与真实数据隔离）：
 *   cd "$(mktemp -d)" && NEXT_PUBLIC_AWD_SITE=intl npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-googleplay.mts
 *   cd "$(mktemp -d)" && NEXT_PUBLIC_AWD_SITE=cn   npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-googleplay.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离空目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const SECRET = 'test-googleplay-internal-secret-012345';
const PKG_NAME = 'com.aiworkdeck.mobile';
const RTDN_TOKEN = 'test-googleplay-rtdn-webhook-token-48hexchars!!';

const { privateKey: testPrivateKey, publicKey: testPublicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const SERVICE_ACCOUNT_OBJ = {
  client_email: 'play-verify@test-project.iam.gserviceaccount.com',
  private_key: testPrivateKey,
  token_uri: 'https://oauth2.test.local/token',
};

process.env.AWD_MOBILE_BILLING_SECRET = SECRET;
process.env.GOOGLEPLAY_PACKAGE_NAME = PKG_NAME;
process.env.GOOGLEPLAY_SERVICE_ACCOUNT_JSON = JSON.stringify(SERVICE_ACCOUNT_OBJ);
process.env.AWD_GOOGLEPLAY_RTDN_TOKEN = RTDN_TOKEN;

const { siteConfig } = await import('@/lib/site-config');
const { getDb } = await import('@/lib/db');
const { createOrder, getOrder } = await import('@/lib/orders');
const {
  GOOGLEPLAY_CATALOG,
  googleplayAdapter,
  googleplayFaceValue,
  setGooglePlayFetchForTests,
  resetGooglePlayCacheForTests,
} = await import('@/lib/payments');
const { getBalance, getBalanceBreakdown, getRefundableCents, settleOrderPaid } = await import(
  '@/lib/wallet'
);
const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/internal/account/route');
const rtdn = await import('@/app/api/payment/googleplay/webhook/route');

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log('  PASS', name);
}

const isIntl = siteConfig.currency === 'USD';
const SKU_SMALL = isIntl ? 'credits.usd.10' : 'credits.cny.50';
const AMT_SMALL = isIntl ? 1000 : 5000;
const SKU_LARGE = isIntl ? 'credits.usd.50' : 'credits.cny.300';
const AMT_LARGE = isIntl ? 5000 : 30000;

interface MockPurchaseEntry {
  orderId: string;
  purchaseState: number;
  consumptionState: number;
  acknowledgementState: number;
  obfuscatedExternalAccountId?: string;
  regionCode: string;
  purchaseTimeMillis: string;
  consumedCount: number;
}

const mockPurchases = new Map<string, MockPurchaseEntry>();
let mockVoidedList: Array<{
  purchaseToken: string;
  orderId: string;
  purchaseTimeMillis: string;
  voidedTimeMillis: string;
}> = [];
let oauthExchangeCount = 0;

setGooglePlayFetchForTests((async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();

  if (url === SERVICE_ACCOUNT_OBJ.token_uri) {
    oauthExchangeCount += 1;
    const rawBody = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? '');
    const params = new URLSearchParams(rawBody);
    assert.strictEqual(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = params.get('assertion') ?? '';
    const parts = assertion.split('.');
    assert.strictEqual(parts.length, 3, 'JWT assertion must have 3 parts');
    const verified = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      testPublicKey,
      Buffer.from(parts[2], 'base64url')
    );
    assert.ok(verified, 'OAuth JWT RS256 signature must verify against test public key');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as {
      iss: string;
      scope: string;
      aud: string;
    };
    assert.strictEqual(claims.iss, SERVICE_ACCOUNT_OBJ.client_email);
    assert.strictEqual(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
    assert.strictEqual(claims.aud, SERVICE_ACCOUNT_OBJ.token_uri);
    return new Response(JSON.stringify({ access_token: 'mock-access-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const consumeMatch = url.match(
    /\/applications\/([^/]+)\/purchases\/products\/([^/]+)\/tokens\/([^/:]+):consume$/
  );
  if (consumeMatch && init?.method === 'POST') {
    const pkg = decodeURIComponent(consumeMatch[1]);
    const token = decodeURIComponent(consumeMatch[3]);
    assert.strictEqual(pkg, PKG_NAME);
    assert.strictEqual((init.headers as Record<string, string>)?.Authorization, 'Bearer mock-access-token');
    const entry = mockPurchases.get(token);
    if (!entry) return new Response('{}', { status: 404 });
    entry.consumedCount += 1;
    entry.consumptionState = 1;
    return new Response(null, { status: 204 });
  }

  const getMatch = url.match(
    /\/applications\/([^/]+)\/purchases\/products\/([^/]+)\/tokens\/([^/?]+)$/
  );
  if (getMatch && (!init?.method || init.method === 'GET')) {
    const pkg = decodeURIComponent(getMatch[1]);
    const token = decodeURIComponent(getMatch[3]);
    assert.strictEqual(pkg, PKG_NAME);
    const entry = mockPurchases.get(token);
    if (!entry) {
      return new Response(JSON.stringify({ error: { code: 404, message: 'Purchase not found' } }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(entry), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (url.includes(`/applications/${encodeURIComponent(PKG_NAME)}/purchases/voidedpurchases`)) {
    return new Response(JSON.stringify({ voidedPurchases: mockVoidedList }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  throw new Error(`Unexpected Google Play HTTP call in verify-googleplay: ${url}`);
}) as typeof fetch);

function req(body: Record<string, unknown>, secretHeader: string | null = SECRET) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secretHeader !== null) headers['x-internal-secret'] = secretHeader;
  return new NextRequest('https://test.local/api/internal/account', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function rtdnReq(notification: Record<string, unknown> | null, token: string | null = RTDN_TOKEN) {
  const query = token === null ? '' : `?token=${encodeURIComponent(token)}`;
  const envelope =
    notification === null
      ? {}
      : {
          message: {
            data: Buffer.from(JSON.stringify(notification), 'utf-8').toString('base64'),
            messageId: crypto.randomUUID(),
          },
          subscription: 'projects/default-project-490400/subscriptions/play-rtdn-workdeck-intl',
        };
  return new NextRequest(`https://test.local/api/payment/googleplay/webhook${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope),
  });
}

let seq = 0;
async function newAccount(): Promise<string> {
  seq += 1;
  const identifier =
    siteConfig.id === 'intl'
      ? { email: `gp-${seq}@test.local` }
      : { phone: `1390015${String(8000 + seq).padStart(4, '0')}` };
  const res = await POST(req({ action: 'resolve', ...identifier, create: true }));
  assert.strictEqual(res.status, 200);
  return ((await res.json()) as { accountId: string }).accountId;
}

// ===========================================================================
console.log(`\n[1] 目录表与站点币种 (${siteConfig.id} / ${siteConfig.currency})`);
// ===========================================================================
{
  assert.strictEqual(googleplayAdapter.currency, siteConfig.currency);
  assert.strictEqual(googleplayFaceValue(siteConfig.currency, SKU_SMALL), AMT_SMALL);
  assert.strictEqual(googleplayFaceValue(siteConfig.currency, SKU_LARGE), AMT_LARGE);
  assert.strictEqual(googleplayFaceValue('USD', 'constructor'), null);
  assert.strictEqual(googleplayFaceValue('__proto__', 'credits.usd.10'), null);
  assert.strictEqual(googleplayFaceValue(siteConfig.currency, 'credits.unknown.1'), null);
  assert.ok(GOOGLEPLAY_CATALOG[siteConfig.currency]);
  ok('目录表精确匹配面值并免疫原型链键');
}

// ===========================================================================
console.log('\n[2] create-recharge channel=googleplay 建单与幂等');
// ===========================================================================
const accountA = await newAccount();
const accountB = await newAccount();
let orderNoA = '';
let appTokenA = '';
{
  const badAmt = await POST(
    req({
      action: 'create-recharge',
      accountId: accountA,
      channel: 'googleplay',
      productId: SKU_SMALL,
      amountCents: AMT_SMALL + 1,
      idempotencyKey: 'k-gp-bad-amt',
    })
  );
  assert.strictEqual(badAmt.status, 400);
  assert.strictEqual((await badAmt.json()).error, 'product_mismatch');

  const create1 = await POST(
    req({
      action: 'create-recharge',
      accountId: accountA,
      channel: 'googleplay',
      productId: SKU_SMALL,
      amountCents: AMT_SMALL,
      idempotencyKey: 'k-gp-1',
    })
  );
  assert.strictEqual(create1.status, 200);
  const body1 = (await create1.json()) as {
    present: string;
    outTradeNo: string;
    amountCents: number;
    appAccountToken: string;
  };
  assert.strictEqual(body1.present, 'native');
  assert.strictEqual(body1.amountCents, AMT_SMALL);
  assert.match(body1.appAccountToken, /^[0-9a-f-]{36}$/i);
  orderNoA = body1.outTradeNo;
  appTokenA = body1.appAccountToken;

  const order = getOrder(orderNoA)!;
  assert.strictEqual(order.channel, 'googleplay');
  assert.strictEqual(order.currency, siteConfig.currency);
  assert.strictEqual(order.skuId, SKU_SMALL);
  assert.strictEqual(order.providerRef, appTokenA);

  // 同 idempotencyKey 重放返回原单和原 appAccountToken
  const replay = await POST(
    req({
      action: 'create-recharge',
      accountId: accountA,
      channel: 'googleplay',
      productId: SKU_SMALL,
      amountCents: AMT_SMALL,
      idempotencyKey: 'k-gp-1',
    })
  );
  assert.strictEqual(replay.status, 200);
  assert.deepStrictEqual(await replay.json(), body1);

  // 同 key 换档位 → 409 idempotency_conflict
  const conflict = await POST(
    req({
      action: 'create-recharge',
      accountId: accountA,
      channel: 'googleplay',
      productId: SKU_LARGE,
      amountCents: AMT_LARGE,
      idempotencyKey: 'k-gp-1',
    })
  );
  assert.strictEqual(conflict.status, 409);
  assert.strictEqual((await conflict.json()).error, 'idempotency_conflict');
  ok('create-recharge(googleplay) 建单、幂等重放与同键冲突校验');
}

// ===========================================================================
console.log('\n[3] confirm-googleplay 拒绝分支 (400 / 404 / 503)');
// ===========================================================================
{
  const tokPending = 'tok-pending-001';
  mockPurchases.set(tokPending, {
    orderId: 'GPA.1111-1111-1111-00001',
    purchaseState: 2, // Pending
    consumptionState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId: appTokenA,
    regionCode: 'JP',
    purchaseTimeMillis: String(Date.now()),
    consumedCount: 0,
  });
  const resPending = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: orderNoA,
      productId: SKU_SMALL,
      purchaseToken: tokPending,
    })
  );
  assert.strictEqual(resPending.status, 400);
  assert.strictEqual((await resPending.json()).error, 'transaction_invalid');
  assert.strictEqual(mockPurchases.get(tokPending)!.consumedCount, 0, 'Pending 购买绝不可被 consume');

  const tokValid = 'tok-valid-mismatch';
  mockPurchases.set(tokValid, {
    orderId: 'GPA.1111-1111-1111-00002',
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId: appTokenA,
    regionCode: 'DE',
    purchaseTimeMillis: String(Date.now()),
    consumedCount: 0,
  });
  // 跨账户确认 → 404 order_not_found
  const wrongUser = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountB,
      outTradeNo: orderNoA,
      productId: SKU_SMALL,
      purchaseToken: tokValid,
    })
  );
  assert.strictEqual(wrongUser.status, 404);

  // SKU 与订单不符 → 400 transaction_invalid
  const wrongSku = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: orderNoA,
      productId: SKU_LARGE,
      purchaseToken: tokValid,
    })
  );
  assert.strictEqual(wrongSku.status, 400);
  assert.strictEqual(mockPurchases.get(tokValid)!.consumedCount, 0);

  // obfuscatedExternalAccountId 不符 → 400 transaction_invalid
  mockPurchases.get(tokValid)!.obfuscatedExternalAccountId = crypto.randomUUID();
  const wrongAppToken = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: orderNoA,
      productId: SKU_SMALL,
      purchaseToken: tokValid,
    })
  );
  assert.strictEqual(wrongAppToken.status, 400);

  // 缺服务账号凭据 → 503 payment_channel_unavailable
  const savedSa = process.env.GOOGLEPLAY_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLEPLAY_SERVICE_ACCOUNT_JSON;
  resetGooglePlayCacheForTests();
  const noCreds = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: orderNoA,
      productId: SKU_SMALL,
      purchaseToken: tokValid,
    })
  );
  assert.strictEqual(noCreds.status, 503);
  assert.strictEqual((await noCreds.json()).error, 'payment_channel_unavailable');
  process.env.GOOGLEPLAY_SERVICE_ACCOUNT_JSON = savedSa;
  resetGooglePlayCacheForTests();

  ok('Pending / 跨账户 / SKU 不符 / accountToken 不符 / 缺凭据全数拦截且未触发 consume');
}

// ===========================================================================
console.log('\n[4] confirm-googleplay 正常结算 + RS256 OAuth + consume + 幂等与防重用');
// ===========================================================================
const tokPaidA = 'tok-paid-a-001';
const gpOrderIdA = 'GPA.3333-4444-5555-00001';
{
  const balBefore = getBalance(accountA);
  mockPurchases.set(tokPaidA, {
    orderId: gpOrderIdA,
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId: appTokenA,
    regionCode: 'JP',
    purchaseTimeMillis: String(Date.now()),
    consumedCount: 0,
  });

  const res = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: orderNoA,
      productId: SKU_SMALL,
      purchaseToken: tokPaidA,
    })
  );
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: 'paid', paid: true, amountCents: AMT_SMALL });
  assert.strictEqual(oauthExchangeCount >= 1, true, '必须真实签署 RS256 JWT 并换取 OAuth access_token');
  assert.strictEqual(mockPurchases.get(tokPaidA)!.consumedCount, 1, '落账成功后才执行 :consume');
  assert.strictEqual(getBalance(accountA), balBefore + AMT_SMALL);

  const order = getOrder(orderNoA)!;
  assert.strictEqual(order.status, 'paid');
  assert.strictEqual(order.transactionId, gpOrderIdA);
  const meta = JSON.parse(order.providerMeta!);
  assert.strictEqual(meta.regionCode, 'JP');
  assert.strictEqual(meta.orderId, gpOrderIdA);

  const lots = getDb()
    .prepare('SELECT pool, originalCents, sourceKind, expiresAt FROM credit_lots WHERE refOrderId = ?')
    .all(orderNoA) as Array<{
    pool: string;
    originalCents: number;
    sourceKind: string | null;
    expiresAt: string | null;
  }>;
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].pool, 'topup');
  assert.strictEqual(lots[0].originalCents, AMT_SMALL);
  assert.strictEqual(lots[0].sourceKind, 'googleplay');
  assert.strictEqual(lots[0].expiresAt, null);

  // 同凭据重复确认幂等
  const dup = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: orderNoA,
      productId: SKU_SMALL,
      purchaseToken: tokPaidA,
    })
  );
  assert.strictEqual(dup.status, 200);
  assert.strictEqual(getBalance(accountA), balBefore + AMT_SMALL);

  // 同一 Google orderId 企图结另一张单 → 409 transaction_reused
  const createOther = await POST(
    req({
      action: 'create-recharge',
      accountId: accountA,
      channel: 'googleplay',
      productId: SKU_SMALL,
      amountCents: AMT_SMALL,
      idempotencyKey: 'k-gp-reuse-check',
    })
  );
  assert.strictEqual(createOther.status, 200);
  const other = (await createOther.json()) as { outTradeNo: string; appAccountToken: string };
  const tokReuse = 'tok-reuse-attempt';
  mockPurchases.set(tokReuse, {
    orderId: gpOrderIdA,
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId: other.appAccountToken,
    regionCode: 'US',
    purchaseTimeMillis: String(Date.now()),
    consumedCount: 0,
  });
  const reusedRes = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      outTradeNo: other.outTradeNo,
      productId: SKU_SMALL,
      purchaseToken: tokReuse,
    })
  );
  assert.strictEqual(reusedRes.status, 409);
  assert.strictEqual((await reusedRes.json()).error, 'transaction_reused');

  ok('confirm-googleplay RS256 JWT、入账 topup/googleplay、:consume、幂等与重用拦截');
}

// ===========================================================================
console.log('\n[5] 可退现排除 + 零会员赠送（vs 对照组） + 省缺 outTradeNo 反查');
// ===========================================================================
{
  const created = await POST(
    req({
      action: 'create-recharge',
      accountId: accountA,
      channel: 'googleplay',
      productId: SKU_LARGE,
      amountCents: AMT_LARGE,
      idempotencyKey: 'k-gp-large-orphan',
    })
  );
  assert.strictEqual(created.status, 200);
  const large = (await created.json()) as { outTradeNo: string; appAccountToken: string };

  const tokLarge = 'tok-paid-large-001';
  const orderLarge = 'GPA.3333-4444-5555-00002';
  mockPurchases.set(tokLarge, {
    orderId: orderLarge,
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId: large.appAccountToken,
    regionCode: 'SG',
    purchaseTimeMillis: String(Date.now()),
    consumedCount: 0,
  });

  // 不传 outTradeNo：用 obfuscatedExternalAccountId 反查 providerRef
  const orphanConfirm = await POST(
    req({
      action: 'confirm-googleplay',
      accountId: accountA,
      productId: SKU_LARGE,
      purchaseToken: tokLarge,
    })
  );
  assert.strictEqual(orphanConfirm.status, 200);
  assert.strictEqual(mockPurchases.get(tokLarge)!.consumedCount, 1);

  assert.strictEqual(getBalanceBreakdown(accountA).topupCents, AMT_SMALL + AMT_LARGE);
  assert.strictEqual(getRefundableCents(accountA), 0, 'Google Play 充值绝不计入可退现余额');
  const gifts = getDb()
    .prepare("SELECT COUNT(*) AS c FROM credit_lots WHERE userId = ? AND sourceKind = 'membership_bonus'")
    .get(accountA) as { c: number };
  assert.strictEqual(gifts.c, 0, 'Google Play 内购不发会员充值赠送');

  // 对照组：普通通道充大额既有 membership_bonus 也计入 refundableCents
  const ctrlNo = `RECHARGECTRLGP${Date.now().toString(36).toUpperCase()}`;
  createOrder({
    id: ctrlNo,
    outTradeNo: ctrlNo,
    description: '钱包充值',
    amount: 30000,
    status: 'pending',
    userId: accountB,
    kind: 'recharge',
    channel: siteConfig.paymentChannel,
    currency: siteConfig.currency,
  });
  settleOrderPaid(ctrlNo, { transactionId: 'ctrl-gp-1' });
  const ctrlGift = getDb()
    .prepare("SELECT originalCents FROM credit_lots WHERE userId = ? AND sourceKind = 'membership_bonus'")
    .get(accountB) as { originalCents: number } | undefined;
  assert.strictEqual(ctrlGift?.originalCents, 600);
  assert.strictEqual(getRefundableCents(accountB), 30000);

  ok('可退现排除、零会员赠送（对照成立）及省略 outTradeNo 掉单反查恢复');
}

// ===========================================================================
console.log('\n[6] RTDN Pub/Sub Webhook（鉴权 / testNotification / 自动结算 / Voided 追回）');
// ===========================================================================
{
  // 未带 token / 错 token → 空 404
  assert.strictEqual((await rtdn.POST(rtdnReq({ testNotification: { version: '1.0' } }, null))).status, 404);
  assert.strictEqual((await rtdn.POST(rtdnReq({ testNotification: { version: '1.0' } }, 'wrong-token'))).status, 404);

  // 未配置 AWD_GOOGLEPLAY_RTDN_TOKEN → 404
  const savedRtdn = process.env.AWD_GOOGLEPLAY_RTDN_TOKEN;
  delete process.env.AWD_GOOGLEPLAY_RTDN_TOKEN;
  assert.strictEqual((await rtdn.POST(rtdnReq({ testNotification: { version: '1.0' } }, RTDN_TOKEN))).status, 404);
  process.env.AWD_GOOGLEPLAY_RTDN_TOKEN = savedRtdn;

  // testNotification → 200
  const testRes = await rtdn.POST(
    rtdnReq({ version: '1.0', packageName: PKG_NAME, testNotification: { version: '1.0' } })
  );
  assert.strictEqual(testRes.status, 200);
  assert.deepStrictEqual(await testRes.json(), { ok: true, kind: 'test' });

  // oneTimeProductNotification (PURCHASED = 1) 自动帮客户端掉单结算 + consume + 重投幂等
  const cr = await POST(
    req({
      action: 'create-recharge',
      accountId: accountB,
      channel: 'googleplay',
      productId: SKU_SMALL,
      amountCents: AMT_SMALL,
      idempotencyKey: 'k-gp-rtdn-settle',
    })
  );
  const crBody = (await cr.json()) as { outTradeNo: string; appAccountToken: string };
  const balB0 = getBalance(accountB);
  const tokRtdn = 'tok-rtdn-settle-001';
  const gpOrderRtdn = 'GPA.7777-8888-9999-00001';
  mockPurchases.set(tokRtdn, {
    orderId: gpOrderRtdn,
    purchaseState: 0,
    consumptionState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId: crBody.appAccountToken,
    regionCode: 'GB',
    purchaseTimeMillis: String(Date.now()),
    consumedCount: 0,
  });

  const settleEvt = await rtdn.POST(
    rtdnReq({
      version: '1.0',
      packageName: PKG_NAME,
      oneTimeProductNotification: {
        version: '1.0',
        notificationType: 1,
        purchaseToken: tokRtdn,
        sku: SKU_SMALL,
      },
    })
  );
  assert.strictEqual(settleEvt.status, 200);
  assert.strictEqual((await settleEvt.json()).settled, true);
  assert.strictEqual(getBalance(accountB), balB0 + AMT_SMALL);
  assert.strictEqual(mockPurchases.get(tokRtdn)!.consumedCount, 1);

  const settleEvtDup = await rtdn.POST(
    rtdnReq({
      version: '1.0',
      packageName: PKG_NAME,
      oneTimeProductNotification: {
        version: '1.0',
        notificationType: 1,
        purchaseToken: tokRtdn,
        sku: SKU_SMALL,
      },
    })
  );
  assert.strictEqual(settleEvtDup.status, 200);
  assert.strictEqual(getBalance(accountB), balB0 + AMT_SMALL);

  // voidedPurchaseNotification：先测未出现在 voidedpurchases API 中的伪造通知被拒（不扣余额）
  mockVoidedList = [];
  const forgedVoid = await rtdn.POST(
    rtdnReq({
      version: '1.0',
      packageName: PKG_NAME,
      voidedPurchaseNotification: {
        purchaseToken: tokRtdn,
        orderId: gpOrderRtdn,
        productType: 2,
        refundType: 1,
      },
    })
  );
  assert.strictEqual(forgedVoid.status, 200);
  assert.strictEqual((await forgedVoid.json()).verifiedVoid, false);
  assert.strictEqual(getBalance(accountB), balB0 + AMT_SMALL);

  // 真出现在 voidedpurchases API 后 → 追回全部未消费余额且重投幂等
  mockVoidedList = [
    {
      purchaseToken: tokRtdn,
      orderId: gpOrderRtdn,
      purchaseTimeMillis: String(Date.now() - 10000),
      voidedTimeMillis: String(Date.now()),
    },
  ];
  const realVoid = await rtdn.POST(
    rtdnReq({
      version: '1.0',
      packageName: PKG_NAME,
      voidedPurchaseNotification: {
        purchaseToken: tokRtdn,
        orderId: gpOrderRtdn,
        productType: 2,
        refundType: 1,
      },
    })
  );
  assert.strictEqual(realVoid.status, 200);
  const voidJson = await realVoid.json();
  assert.strictEqual(voidJson.matched, true);
  assert.strictEqual(voidJson.clawedBackCents, AMT_SMALL);
  assert.strictEqual(getBalance(accountB), balB0);

  const dupVoid = await rtdn.POST(
    rtdnReq({
      version: '1.0',
      packageName: PKG_NAME,
      voidedPurchaseNotification: {
        purchaseToken: tokRtdn,
        orderId: gpOrderRtdn,
        productType: 2,
        refundType: 1,
      },
    })
  );
  assert.strictEqual(dupVoid.status, 200);
  assert.strictEqual((await dupVoid.json()).alreadyRefunded, true);
  assert.strictEqual(getBalance(accountB), balB0);

  ok('RTDN 鉴权 404 / testNotification / 自动结算幂等 / voidedpurchases 交叉核验与追回');
}

console.log(`\nGoogle Play Billing 验证全绿 (${siteConfig.id})：${passed} 项`);
