/**
 * Android mainland Pro via WeChat APP pay (lib/mobile-pro.ts, POLISH M3). Harness copied from verify-wxpay-app.mts.
 * 原 wxpay-app 脚本说明：不发任何网络请求、不需要真实凭据：
 * 商户私钥与「微信支付公钥」都是本脚本临时生成的 RSA 密钥对，微信 API 由 axios adapter 打桩。
 *
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-wxpay-app.mts
 * 两个站点各跑一遍（NEXT_PUBLIC_AWD_SITE=cn / intl）；intl 只验签名与「本站不可用」。
 *
 * 覆盖：
 * - 调起支付签名：对 `appid\ntimestamp\nnoncestr\nprepay_id\n` 做 SHA256withRSA，
 *   用对应公钥对独立拼出的待签串验签通过；packageValue / partnerId 取值
 * - 门禁：未配 WXPAY_APP_APPID → 503 channel_unavailable 且不建单；国际站即使配了也不可用
 * - create-recharge(channel=wxpay-app)：下单报文（appid/mchid/金额/notify_url/签名头）、
 *   响应 present=app + PayReq 七字段、订单落 wxpay-app/CNY/recharge；金额校验与默认通道同口径；
 *   幂等重放复用同一单；同一幂等键换通道 409
 * - 回调：/api/payment/notify/app 验签 → 解密 → 入账；重复回调幂等不重复入账；
 *   APP 单被 Native 回调口、Native 单被 APP 回调口结算 → 一律拒绝（channel_mismatch）
 * - query：未付的 APP 单经回查（响应验签）确认到账
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}

// ---- 两对测试密钥：商户私钥（我们签）与微信支付公钥（微信签）----
const gen = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
};
const merchant = gen();
const wechat = gen();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-pro-'));
fs.writeFileSync(path.join(tmpDir, 'apiclient_key.pem'), merchant.priv);
fs.writeFileSync(path.join(tmpDir, 'pub_key.pem'), wechat.pub);

const SECRET = 'test-mobile-pro-secret-0123456789';
const APP_APPID = 'wxapp0000000000test';
const MCHID = '1900000109';
const PUB_KEY_ID = 'PUB_KEY_ID_0111114077852026041700111649000009';
process.env.AWD_MOBILE_BILLING_SECRET = SECRET;
process.env.WXPAY_APPID = 'wxnative000000test';
process.env.WXPAY_MCHID = MCHID;
process.env.WXPAY_APIV3_KEY = 'k'.repeat(32);
process.env.WXPAY_SERIAL_NO = 'SERIAL0001';
process.env.WXPAY_PRIVATE_KEY_PATH = path.join(tmpDir, 'apiclient_key.pem');
process.env.WXPAY_PUBLIC_KEY_PATH = path.join(tmpDir, 'pub_key.pem');
process.env.WXPAY_PUBLIC_KEY_ID = PUB_KEY_ID;
delete process.env.WXPAY_APP_APPID;
process.env.NEXT_PUBLIC_BASE_URL = 'https://www.aiworkdeck.com';

const { siteConfig } = await import('@/lib/site-config');
const { getDb } = await import('@/lib/db');
const { getOrder, createOrder } = await import('@/lib/orders');
const { getBalance } = await import('@/lib/wallet');
const { buildAppPayParams, getWxPayAxios } = await import('@/lib/wxpay');
const { wxpayAppAdapter } = await import('@/lib/payments');
const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/internal/account/route');
const { POST: notifyApp } = await import('@/app/api/payment/notify/app/route');
const { POST: notifyNative } = await import('@/app/api/payment/notify/route');

const orderCount = () => (getDb().prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;

function req(body: Record<string, unknown>) {
  return new NextRequest('https://test.local/api/internal/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
    body: JSON.stringify(body),
  });
}

function verifyAppSign(p: { appId: string; timeStamp: string; nonceStr: string; prepayId: string; sign: string }) {
  const message = `${p.appId}\n${p.timeStamp}\n${p.nonceStr}\n${p.prepayId}\n`;
  return crypto.createVerify('RSA-SHA256').update(message).verify(merchant.pub, p.sign, 'base64');
}


const resolveBody = siteConfig.id === 'intl' ? { email: 'mobile-pro@test.local' } : { phone: '13800138777' };
const accountId = (await (await POST(req({ action: 'resolve', ...resolveBody, create: true }))).json()).accountId as string;
assert.ok(accountId);
const quote = async () => (await POST(req({ action: 'pro-quote', accountId }))).json();

console.log('\n[1] off by default; off when website Pro sales are off; intl never');
{
  delete process.env.MOBILE_WXPAY_PRO_ENABLED;
  process.env.WXPAY_APP_APPID = APP_APPID;
  assert.deepStrictEqual(await quote(), { available: false, reason: 'disabled' });
  const before = orderCount();
  const res = await POST(req({ action: 'create-pro', accountId, skuId: 'pro_monthly_intro', amountCents: 990, idempotencyKey: 'off-1' }));
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).error, 'disabled');
  assert.strictEqual(orderCount(), before);
  process.env.MOBILE_WXPAY_PRO_ENABLED = 'true';
  process.env.PRO_PURCHASE_ENABLED = 'false';
  assert.deepStrictEqual(await quote(), { available: false, reason: 'disabled' });
  delete process.env.PRO_PURCHASE_ENABLED;
  ok('switch off → disabled, no order; website Pro off → disabled too');
}
if (siteConfig.id === 'intl') {
  assert.deepStrictEqual(await quote(), { available: false, reason: 'channel_unavailable' });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  ok('international site: channel_unavailable');
  console.log(`\n全部通过：${passed} 项`);
  process.exit(0);
}
{
  delete process.env.WXPAY_APP_APPID;
  assert.deepStrictEqual(await quote(), { available: false, reason: 'channel_unavailable' });
  process.env.WXPAY_APP_APPID = APP_APPID;
  ok('no WeChat APP AppID → channel_unavailable');
}

type Captured = { method: string; url: string; data: any; auth: string };
const calls: Captured[] = [];
const tradeStates = new Map<string, { trade_state: string; amount: number }>();

function wechatSigned(body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');
  const signature = crypto.createSign('RSA-SHA256').update(`${timestamp}\n${nonce}\n${body}\n`).sign(wechat.priv, 'base64');
  return {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-serial': PUB_KEY_ID,
    'wechatpay-signature': signature,
  };
}

getWxPayAxios().defaults.adapter = (async (config: any) => {
  const url = String(config.url);
  calls.push({
    method: String(config.method).toUpperCase(),
    url,
    data: config.data ? JSON.parse(config.data) : null,
    auth: String(config.headers?.Authorization ?? config.headers?.get?.('Authorization') ?? ''),
  });
  let body: string;
  if (url === '/v3/pay/transactions/app') {
    body = JSON.stringify({ prepay_id: `wx-prepay-${JSON.parse(config.data).out_trade_no}` });
  } else if (url.startsWith('/v3/pay/transactions/out-trade-no/')) {
    const no = url.split('/').pop()!;
    const st = tradeStates.get(no) ?? { trade_state: 'NOTPAY', amount: 0 };
    body = JSON.stringify({
      appid: APP_APPID,
      mchid: MCHID,
      out_trade_no: no,
      transaction_id: st.trade_state === 'SUCCESS' ? `wx-txn-q-${no}` : undefined,
      trade_state: st.trade_state,
      amount: { total: st.amount, currency: 'CNY' },
    });
  } else {
    throw new Error(`未打桩的微信接口: ${url}`);
  }
  return { data: body, status: 200, statusText: 'OK', headers: wechatSigned(body), config, request: {} };
}) as any;


console.log('\n[2] quote: intro first, server is the price authority');
let intro: any;
{
  intro = await quote();
  assert.strictEqual(intro.available, true);
  assert.strictEqual(intro.skuId, 'pro_monthly_intro');
  assert.strictEqual(intro.amountCents, 990);
  assert.strictEqual(intro.standardAmountCents, 14900);
  assert.strictEqual(intro.introEligible, true);
  assert.strictEqual(intro.days, 30);
  const before = orderCount();
  const stale = await POST(req({ action: 'create-pro', accountId, skuId: 'pro_monthly', amountCents: 14900, idempotencyKey: 'stale-1' }));
  assert.strictEqual(stale.status, 400);
  const sj = await stale.json();
  assert.strictEqual(sj.error, 'product_mismatch');
  assert.strictEqual(sj.skuId, 'pro_monthly_intro');
  const cheap = await POST(req({ action: 'create-pro', accountId, skuId: 'pro_monthly_intro', amountCents: 1, idempotencyKey: 'cheap-1' }));
  assert.strictEqual(cheap.status, 400);
  const nokey = await POST(req({ action: 'create-pro', accountId, skuId: 'pro_monthly_intro', amountCents: 990 }));
  assert.strictEqual((await nokey.json()).error, 'idempotency_key_required');
  assert.strictEqual(orderCount(), before);
  assert.strictEqual(calls.length, 0);
  ok('quote = intro ¥9.9; a stale or forged SKU/amount is refused before any order or WeChat call');
}

{
  const fresh = await (await POST(req({ action: 'pro-quote' }))).json();
  assert.strictEqual(fresh.available, true);
  assert.strictEqual(fresh.skuId, 'pro_monthly_intro', 'a user without an account yet sees the new-account intro offer');
  assert.strictEqual(fresh.amountCents, 990);
  ok('quote without an account → intro offer (the account is created on purchase)');
}

console.log('\n[3] create-pro → WeChat APP order; replay reuses it');
let no = '';
{
  const res = await POST(req({ action: 'create-pro', accountId, skuId: intro.skuId, amountCents: intro.amountCents, idempotencyKey: 'pro-1' }));
  assert.strictEqual(res.status, 200);
  const j = await res.json();
  no = j.outTradeNo;
  assert.strictEqual(j.present, 'app');
  assert.strictEqual(j.skuId, 'pro_monthly_intro');
  assert.strictEqual(j.prepayId, `wx-prepay-${no}`);
  const o = getOrder(no)!;
  assert.strictEqual(o.kind, 'subscription');
  assert.strictEqual(o.channel, 'wxpay-app');
  assert.strictEqual(o.currency, 'CNY');
  assert.strictEqual(o.skuId, 'pro_monthly_intro');
  assert.strictEqual(o.amount, 990);
  const order = calls.find((c) => c.url === '/v3/pay/transactions/app')!;
  assert.strictEqual(order.data.amount.total, 990);
  assert.strictEqual(order.data.notify_url, 'https://www.aiworkdeck.com/api/payment/notify/app');
  const again = await (await POST(req({ action: 'create-pro', accountId, skuId: intro.skuId, amountCents: intro.amountCents, idempotencyKey: 'pro-1' }))).json();
  assert.strictEqual(again.outTradeNo, no);
  const orders = calls.filter((c) => c.url === '/v3/pay/transactions/app');
  assert.strictEqual(orders.length, 2, 'the replay asks WeChat for the prepay again');
  assert.deepStrictEqual(orders[1].data, orders[0].data, 'with identical parameters (WeChat returns the same prepay_id)');
  const clash = await POST(req({ action: 'create-recharge', accountId, amountCents: 990, idempotencyKey: 'pro-1', channel: 'wxpay-app' }));
  assert.strictEqual(clash.status, 409);
  ok('subscription order on wxpay-app/CNY with the intro SKU; replay reuses it; the key cannot become a top-up');
}

console.log('\n[4] paid → the same Pro entitlement as the website');
{
  const pending = await (await POST(req({ action: 'query', accountId, outTradeNo: no }))).json();
  assert.strictEqual(pending.paid, false);
  tradeStates.set(no, { trade_state: 'SUCCESS', amount: 990 });
  await new Promise((r) => setTimeout(r, 2100));
  const paid = await (await POST(req({ action: 'query', accountId, outTradeNo: no }))).json();
  assert.deepStrictEqual(paid, { status: 'paid', paid: true, amountCents: 990 });
  const ent = getDb().prepare("SELECT expiresAt FROM entitlements WHERE userId=? AND feature='pro'").get(accountId) as { expiresAt: string };
  assert.ok(ent && ent.expiresAt > new Date(Date.now() + 29 * 86400_000).toISOString(), 'pro entitlement about 30 days out');
  const { subscriptionSnapshot } = await import('@/lib/subscription');
  assert.strictEqual(subscriptionSnapshot(accountId).active, true);
  const replay = await POST(req({ action: 'create-pro', accountId, skuId: intro.skuId, amountCents: intro.amountCents, idempotencyKey: 'pro-1' }));
  assert.strictEqual(replay.status, 409);
  assert.strictEqual((await replay.json()).error, 'order_already_paid');
  const next = await quote();
  assert.strictEqual(next.introRemainingMonths, intro.introRemainingMonths - 1);
  ok('query settles; entitlements(pro) ~30 days; subscription active; paid key → 409; one intro month used');
}

console.log('\n[5] an active Apple subscription blocks a new sale');
{
  getDb().prepare("INSERT INTO entitlements (userId, feature, orderId, createdAt, expiresAt) VALUES (?, 'pro.appstore', 'apple-test', ?, ?)").run(accountId, new Date().toISOString(), new Date(Date.now() + 86400_000).toISOString());
  assert.deepStrictEqual(await quote(), { available: false, reason: 'appstore_subscription_active' });
  const res = await POST(req({ action: 'create-pro', accountId, skuId: 'pro_monthly_intro', amountCents: 990, idempotencyKey: 'apple-1' }));
  assert.strictEqual(res.status, 409);
  ok('pro.appstore active → 409, no order');
}

console.log('\n[6] 1-fen payment test: allowlisted accounts only, even with sales off');
{
  const { isProSku, getProIntroQuote } = await import('@/lib/pro-products');
  const tester = (await (await POST(req({ action: 'resolve', phone: '13800138666', create: true }))).json()).accountId as string;
  const other = (await (await POST(req({ action: 'resolve', phone: '13800138555', create: true }))).json()).accountId as string;
  process.env.MOBILE_WXPAY_PRO_ENABLED = 'false';
  process.env.MOBILE_WXPAY_PRO_TEST_ACCOUNTS = ` ${tester} ,someone-else`;
  const tq = await (await POST(req({ action: 'pro-quote', accountId: tester }))).json();
  assert.deepStrictEqual([tq.available, tq.skuId, tq.amountCents, tq.days], [true, 'pro_test', 1, 1]);
  assert.deepStrictEqual(await (await POST(req({ action: 'pro-quote', accountId: other }))).json(), { available: false, reason: 'disabled' });
  assert.deepStrictEqual(await (await POST(req({ action: 'pro-quote' }))).json(), { available: false, reason: 'disabled' }, 'no account never gets the test product');
  const forged = await POST(req({ action: 'create-pro', accountId: other, skuId: 'pro_test', amountCents: 1, idempotencyKey: 'forged-1' }));
  assert.strictEqual(forged.status, 503, 'a non-listed account cannot order the test product');
  assert.strictEqual(isProSku('pro_test'), false, 'the website checkout (isProSku gate) never sells it');
  const introBefore = getProIntroQuote(getDb(), tester).remainingMonths;
  const o = await (await POST(req({ action: 'create-pro', accountId: tester, skuId: 'pro_test', amountCents: 1, idempotencyKey: 'test-1' }))).json();
  assert.strictEqual(getOrder(o.outTradeNo)!.skuId, 'pro_test');
  tradeStates.set(o.outTradeNo, { trade_state: 'SUCCESS', amount: 1 });
  await new Promise((r) => setTimeout(r, 2100));
  const paid = await (await POST(req({ action: 'query', accountId: tester, outTradeNo: o.outTradeNo }))).json();
  assert.strictEqual(paid.paid, true);
  const ent = getDb().prepare("SELECT expiresAt FROM entitlements WHERE userId=? AND feature='pro'").get(tester) as { expiresAt: string };
  const hours = (Date.parse(ent.expiresAt) - Date.now()) / 3600_000;
  assert.ok(hours > 23 && hours < 25, `one day of Pro, got ${hours}h`);
  assert.strictEqual(getProIntroQuote(getDb(), tester).remainingMonths, introBefore, 'the test does not use an intro month');
  delete process.env.MOBILE_WXPAY_PRO_TEST_ACCOUNTS;
  process.env.MOBILE_WXPAY_PRO_ENABLED = 'true';
  ok('listed account: 1-fen pro_test while sales are off → 1 day of Pro, intro untouched; others, no-account and the website checkout never get it');
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n全部通过：${passed} 项`);
