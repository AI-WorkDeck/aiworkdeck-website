/**
 * 微信支付 APP 支付（安卓，dev-board#428）验证脚本。不发任何网络请求、不需要真实凭据：
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxpay-app-'));
fs.writeFileSync(path.join(tmpDir, 'apiclient_key.pem'), merchant.priv);
fs.writeFileSync(path.join(tmpDir, 'pub_key.pem'), wechat.pub);

const SECRET = 'test-wxpay-app-secret-0123456789';
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

// ===========================================================================
console.log('\n[1] 调起支付签名（APIv3 APP 调起支付）');
// ===========================================================================
{
  process.env.WXPAY_APP_APPID = APP_APPID;
  const p = buildAppPayParams('wx201410272009395522657a690389285100', {
    nonceStr: '5K8264ILTKCH16CQ2502SI8ZNMTM67VS',
    timeStamp: '1414561699',
  });
  assert.strictEqual(p.appId, APP_APPID);
  assert.strictEqual(p.partnerId, MCHID, 'partnerId 必须是商户号');
  assert.strictEqual(p.packageValue, 'Sign=WXPay');
  assert.ok(verifyAppSign(p), '签名必须是对 appid\\ntimestamp\\nnoncestr\\nprepay_id\\n 的 SHA256withRSA');
  // PKCS#1 v1.5 是确定性签名：固定输入 + 固定密钥 → 固定输出
  const expected = crypto
    .createSign('RSA-SHA256')
    .update(`${APP_APPID}\n1414561699\n5K8264ILTKCH16CQ2502SI8ZNMTM67VS\nwx201410272009395522657a690389285100\n`)
    .sign(merchant.priv, 'base64');
  assert.strictEqual(p.sign, expected);
  // 少一个结尾 \n 就是另一个签名
  assert.ok(
    !crypto
      .createVerify('RSA-SHA256')
      .update(`${APP_APPID}\n1414561699\n5K8264ILTKCH16CQ2502SI8ZNMTM67VS\nwx201410272009395522657a690389285100`)
      .verify(merchant.pub, p.sign, 'base64')
  );
  const q = buildAppPayParams('prepay-x');
  assert.ok(/^\d{10}$/.test(q.timeStamp) && q.nonceStr.length === 32 && verifyAppSign(q));
  ok('签名、partnerId、packageValue 与规范一致；默认 nonce/timestamp 形状正确');
  delete process.env.WXPAY_APP_APPID;
}

// ===========================================================================
console.log('\n[2] 门禁：未配置 WXPAY_APP_APPID → channel_unavailable，不建单');
// ===========================================================================
const resolveBody =
  siteConfig.id === 'intl' ? { email: 'wxpay-app@test.local' } : { phone: '13800138999' };
const accountId = (await (await POST(req({ action: 'resolve', ...resolveBody, create: true }))).json())
  .accountId as string;
assert.ok(accountId);
{
  assert.strictEqual(wxpayAppAdapter.isConfigured(), false);
  const before = orderCount();
  const res = await POST(
    req({ action: 'create-recharge', accountId, amountCents: 5000, idempotencyKey: 'gate-1', channel: 'wxpay-app' })
  );
  assert.strictEqual(res.status, 503);
  assert.deepStrictEqual(await res.json(), { error: 'channel_unavailable' });
  assert.strictEqual(orderCount(), before, '门禁关着不许建单');
  ok('未配 WXPAY_APP_APPID → 503 channel_unavailable，库里不多一行');
}

if (siteConfig.id === 'intl') {
  process.env.WXPAY_APP_APPID = APP_APPID;
  assert.strictEqual(wxpayAppAdapter.isConfigured(), false, '国际站（USD）不得开放人民币 APP 支付');
  const res = await POST(
    req({ action: 'create-recharge', accountId, amountCents: 5000, idempotencyKey: 'gate-2', channel: 'wxpay-app' })
  );
  assert.strictEqual(res.status, 503);
  ok('国际站即使配了 WXPAY_APP_APPID 也是 channel_unavailable');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n全部通过：${passed} 项`);
  process.exit(0);
}

// ---- 以下只在人民币站跑：打桩微信 API ----
process.env.WXPAY_APP_APPID = APP_APPID;
assert.strictEqual(wxpayAppAdapter.isConfigured(), true);

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

// ===========================================================================
console.log('\n[3] create-recharge(channel=wxpay-app)');
// ===========================================================================
let appTradeNo = '';
{
  const bad = async (amountCents: unknown, idempotencyKey: unknown, error: string) => {
    const res = await POST(req({ action: 'create-recharge', accountId, amountCents, idempotencyKey, channel: 'wxpay-app' }));
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, error);
  };
  const before = orderCount();
  await bad(0, 'v-1', 'invalid_amount');
  await bad(12.5, 'v-2', 'invalid_amount');
  await bad('5000', 'v-3', 'invalid_amount');
  await bad(100_000_000, 'v-4', 'amount_too_large');
  await bad(5000, undefined, 'idempotency_key_required');
  assert.strictEqual(orderCount(), before);
  assert.strictEqual(calls.length, 0, '校验不过不许调微信');
  ok('金额/幂等键校验与默认通道同口径，不过关不建单、不调微信');

  const res = await POST(
    req({ action: 'create-recharge', accountId, amountCents: 5000, idempotencyKey: 'app-1', channel: 'wxpay-app' })
  );
  assert.strictEqual(res.status, 200);
  const j = await res.json();
  appTradeNo = j.outTradeNo;
  assert.strictEqual(j.present, 'app');
  assert.strictEqual(j.amountCents, 5000);
  assert.deepStrictEqual(
    Object.keys(j).sort(),
    ['amountCents', 'appId', 'nonceStr', 'outTradeNo', 'packageValue', 'partnerId', 'prepayId', 'present', 'sign', 'timeStamp'].sort()
  );
  assert.strictEqual(j.appId, APP_APPID);
  assert.strictEqual(j.partnerId, MCHID);
  assert.strictEqual(j.prepayId, `wx-prepay-${appTradeNo}`);
  assert.ok(verifyAppSign(j), '响应里的 sign 必须能用商户公钥验过');
  ok('响应 present=app + PayReq 七字段，sign 可验');

  const call = calls.at(-1)!;
  assert.strictEqual(call.method, 'POST');
  assert.strictEqual(call.url, '/v3/pay/transactions/app');
  assert.deepStrictEqual(call.data, {
    appid: APP_APPID,
    mchid: MCHID,
    description: '钱包充值',
    out_trade_no: appTradeNo,
    notify_url: 'https://www.aiworkdeck.com/api/payment/notify/app',
    amount: { total: 5000, currency: 'CNY' },
  });
  assert.ok(call.auth.startsWith(`WECHATPAY2-SHA256-RSA2048 mchid="${MCHID}"`), '请求必须带 v3 签名头');
  ok('下单报文：移动应用 appid、商户号、服务端描述、APP 回调地址、人民币分');

  const order = getOrder(appTradeNo)!;
  assert.strictEqual(order.channel, 'wxpay-app');
  assert.strictEqual(order.currency, 'CNY');
  assert.strictEqual(order.kind, 'recharge');
  assert.strictEqual(order.userId, accountId);
  assert.strictEqual(order.status, 'pending');
  ok('订单落 wxpay-app / CNY / recharge / pending');

  const n = orderCount();
  const replay = await (
    await POST(req({ action: 'create-recharge', accountId, amountCents: 5000, idempotencyKey: 'app-1', channel: 'wxpay-app' }))
  ).json();
  assert.strictEqual(replay.outTradeNo, appTradeNo);
  assert.strictEqual(replay.prepayId, j.prepayId);
  assert.strictEqual(orderCount(), n);
  ok('同幂等键重放：同一订单、同一 prepay_id，不多建单');

  const conflict = await POST(req({ action: 'create-recharge', accountId, amountCents: 6000, idempotencyKey: 'app-1', channel: 'wxpay-app' }));
  assert.strictEqual(conflict.status, 409);
  // 同一把键先建了 Native 单、再来换 APP 通道
  createOrder({
    id: 'RECHARGE-NATIVE-1', outTradeNo: 'RECHARGE-NATIVE-1', description: '钱包充值', amount: 5000,
    status: 'pending', userId: accountId, kind: 'recharge', channel: 'wxpay', currency: 'CNY', idempotencyKey: 'native-1',
  });
  const switched = await POST(req({ action: 'create-recharge', accountId, amountCents: 5000, idempotencyKey: 'native-1', channel: 'wxpay-app' }));
  assert.strictEqual(switched.status, 409);
  assert.strictEqual((await switched.json()).error, 'idempotency_conflict');
  ok('同幂等键换金额 / 换通道 → 409 idempotency_conflict');
}

// ===========================================================================
console.log('\n[4] 回调入账与幂等');
// ===========================================================================
function notifyRequest(target: string, payload: unknown) {
  const aesNonce = crypto.randomBytes(6).toString('hex');
  const aad = 'transaction';
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(process.env.WXPAY_APIV3_KEY!, 'utf-8'), Buffer.from(aesNonce, 'utf-8'));
  cipher.setAAD(Buffer.from(aad, 'utf-8'));
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf-8'), cipher.final()]);
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction', nonce: aesNonce, associated_data: aad,
      ciphertext: Buffer.concat([enc, cipher.getAuthTag()]).toString('base64'),
    },
  });
  const h = wechatSigned(body);
  return new NextRequest(`https://www.aiworkdeck.com${target}`, {
    method: 'POST',
    body,
    headers: {
      'Wechatpay-Timestamp': h['wechatpay-timestamp'],
      'Wechatpay-Nonce': h['wechatpay-nonce'],
      'Wechatpay-Serial': h['wechatpay-serial'],
      'Wechatpay-Signature': h['wechatpay-signature'],
    },
  });
}
const paidPayload = (no: string, total: number) => ({
  appid: APP_APPID, mchid: MCHID, out_trade_no: no, transaction_id: `wx-txn-${no}`, trade_type: 'APP',
  trade_state: 'SUCCESS', amount: { total, payer_total: total, currency: 'CNY' }, payer: { openid: 'o-app-openid' },
});
{
  const balance0 = getBalance(accountId);

  // APP 单打到 Native 回调口：通道不符，拒绝
  const wrong = await notifyNative(notifyRequest('/api/payment/notify', paidPayload(appTradeNo, 5000)));
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual(getOrder(appTradeNo)!.status, 'pending');
  ok('APP 单被 Native 回调口拒绝（channel_mismatch），订单不动');

  // 金额不符：拒绝
  const short = await notifyApp(notifyRequest('/api/payment/notify/app', paidPayload(appTradeNo, 1)));
  assert.strictEqual(short.status, 400);
  assert.strictEqual(getOrder(appTradeNo)!.status, 'pending');
  ok('回调金额与订单不符 → 拒绝');

  // 伪造签名：401
  const forged = notifyRequest('/api/payment/notify/app', paidPayload(appTradeNo, 5000));
  forged.headers.set('Wechatpay-Signature', Buffer.from('forged').toString('base64'));
  assert.strictEqual((await notifyApp(forged)).status, 401);
  assert.strictEqual(getOrder(appTradeNo)!.status, 'pending');
  ok('验签失败 → 401，订单不动');

  const good = await notifyApp(notifyRequest('/api/payment/notify/app', paidPayload(appTradeNo, 5000)));
  assert.strictEqual(good.status, 200);
  assert.deepStrictEqual(await good.json(), { code: 'SUCCESS', message: '成功' });
  const settled = getOrder(appTradeNo)!;
  assert.strictEqual(settled.status, 'paid');
  assert.strictEqual(settled.transactionId, `wx-txn-${appTradeNo}`);
  const balance1 = getBalance(accountId);
  assert.ok(balance1 - balance0 >= 5000, '充值额必须到账（另有会员赠送时会更多）');
  ok('APP 回调：验签 → 解密 → 置 paid → Credits 到账');

  const dup = await notifyApp(notifyRequest('/api/payment/notify/app', paidPayload(appTradeNo, 5000)));
  assert.strictEqual(dup.status, 200);
  assert.strictEqual(getBalance(accountId), balance1, '重复回调不许重复入账');
  ok('重复回调幂等：200 且余额不变');

  // Native 单打到 APP 回调口：同样拒绝
  const nativeToApp = await notifyApp(notifyRequest('/api/payment/notify/app', { ...paidPayload('RECHARGE-NATIVE-1', 5000) }));
  assert.strictEqual(nativeToApp.status, 400);
  assert.strictEqual(getOrder('RECHARGE-NATIVE-1')!.status, 'pending');
  ok('Native 单被 APP 回调口拒绝，订单不动');

  // 已付单重放建单：409 order_already_paid（不再给一组能再付一次的参数）
  const again = await POST(req({ action: 'create-recharge', accountId, amountCents: 5000, idempotencyKey: 'app-1', channel: 'wxpay-app' }));
  assert.strictEqual(again.status, 409);
  assert.strictEqual((await again.json()).error, 'order_already_paid');
  ok('已付单同幂等键重放 → 409 order_already_paid');
}

// ===========================================================================
console.log('\n[5] query：SDK 回调不作数，以回查为准');
// ===========================================================================
{
  const created = await (
    await POST(req({ action: 'create-recharge', accountId, amountCents: 1000, idempotencyKey: 'app-2', channel: 'wxpay-app' }))
  ).json();
  const no = created.outTradeNo as string;

  const pending = await (await POST(req({ action: 'query', accountId, outTradeNo: no }))).json();
  assert.deepStrictEqual(pending, { status: 'pending', paid: false, amountCents: 1000 });

  tradeStates.set(no, { trade_state: 'SUCCESS', amount: 1000 });
  await new Promise((r) => setTimeout(r, 2100)); // 出站回查限频 2 秒
  const before = getBalance(accountId);
  const paid = await (await POST(req({ action: 'query', accountId, outTradeNo: no }))).json();
  assert.deepStrictEqual(paid, { status: 'paid', paid: true, amountCents: 1000 });
  assert.strictEqual(getOrder(no)!.channel, 'wxpay-app');
  assert.ok(getBalance(accountId) - before >= 1000);
  assert.ok(calls.some((c) => c.method === 'GET' && c.url === `/v3/pay/transactions/out-trade-no/${no}`));
  ok('query：未付 → pending；微信回查（验签）SUCCESS → 结算并回 paid');

  // 回调后到：已 paid，幂等
  const late = await notifyApp(notifyRequest('/api/payment/notify/app', paidPayload(no, 1000)));
  assert.strictEqual(late.status, 200);
  ok('回查结算后回调再到：200 幂等');
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n全部通过：${passed} 项`);
