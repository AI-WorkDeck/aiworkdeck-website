/**
 * 支付通道抽象的验收脚本（双主站）。
 *
 * 为什么需要它：`settleFromChannel` 收敛了原先散在 notify 与 query 两处的
 * 「金额一致性校验 + settleOrderPaid」。这条路径**没有单元测试**（本仓库没有测试运行器），
 * 而它是全站唯一「钱变成 Credits 与权益」的入口。改支付相关的任何文件后必须跑一遍。
 *
 * 微信真实回调只能靠商户平台打，所以这里验的是**通道无关的那一层**：
 * 订单落库的 channel/currency、四条拒绝路径、幂等、以及 Stripe webhook 的验签与事件收敛。
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-payments.mts
 * 两个站点各跑一遍：
 *   NEXT_PUBLIC_AWD_SITE=cn   ...
 *   NEXT_PUBLIC_AWD_SITE=intl NEXT_PUBLIC_AWD_INTL_ENTITY_NAME_EN=X \
 *     NEXT_PUBLIC_AWD_INTL_ENTITY_CR_NO=Y ...
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { createRequire } from 'module';
import { AsyncLocalStorage } from 'async_hooks';

(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;
const require = createRequire(import.meta.url);

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

process.env.AWD_KEY_ENCRYPTION_SECRET = 'verify-payments-secret';

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
const createdAt = new Date().toISOString();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: userId, username: 'vp-user', email: 'vp@test.local', passwordHash: 'x:y', displayName: 'VP User', createdAt },
  ])
);

const { siteConfig } = await import('@/lib/site-config');
const { createOrder, getOrder } = await import('@/lib/orders');
const { settleFromChannel } = await import('@/lib/payments/settle');

let checked = 0;
function ok(name: string) {
  checked++;
  console.log('  OK  ', name);
}

const otherCurrency = siteConfig.currency === 'CNY' ? 'USD' : 'CNY';
const otherChannel = siteConfig.paymentChannel === 'wxpay' ? 'stripe' : 'wxpay';

// ---------- 1. 建单落站点口径 ----------
console.log('\n[1] 订单落库带站点口径');
{
  createOrder({
    id: 'VP-1', outTradeNo: 'VP-1', description: '充值', amount: 10000,
    status: 'pending', userId, kind: 'recharge',
  });
  const order = getOrder('VP-1')!;
  assert.strictEqual(order.currency, siteConfig.currency, '订单币种必须落本站币种');
  assert.strictEqual(order.channel, siteConfig.paymentChannel, '订单通道必须落本站通道');
  ok(`建单落 ${order.channel} / ${order.currency}`);
}

// ---------- 2. 四条拒绝路径 ----------
// 这一节是本脚本存在的理由。少任何一条，一笔任意金额/任意币种的支付都能结算一张订单。
console.log('\n[2] settleFromChannel 的拒绝路径');
{
  const base = {
    outTradeNo: 'VP-1', paid: true,
    amountMinor: 10000, currency: siteConfig.currency,
    transactionId: 'vp-tx-1',
  } as const;

  const notFound = settleFromChannel({ ...base, outTradeNo: 'VP-NOPE', channel: siteConfig.paymentChannel } as any);
  assert.strictEqual(notFound.ok, false);
  assert.strictEqual((notFound as any).reason, 'not_found');
  ok('订单不存在 → not_found');

  const wrongChannel = settleFromChannel({ ...base, channel: otherChannel } as any);
  assert.strictEqual(wrongChannel.ok, false);
  assert.strictEqual((wrongChannel as any).reason, 'channel_mismatch');
  ok('通道不符 → channel_mismatch');

  // USD $100.00 与 ¥100.00 的 minor units 都是 10000。不比 currency，
  // 一笔 100 美元的支付就能结掉一张 100 元的订单
  const wrongCurrency = settleFromChannel({ ...base, channel: siteConfig.paymentChannel, currency: otherCurrency } as any);
  assert.strictEqual(wrongCurrency.ok, false);
  assert.strictEqual((wrongCurrency as any).reason, 'currency_mismatch');
  ok('币种不符 → currency_mismatch（数值相等也必须挡住）');

  const wrongAmount = settleFromChannel({ ...base, channel: siteConfig.paymentChannel, amountMinor: 1 } as any);
  assert.strictEqual(wrongAmount.ok, false);
  assert.strictEqual((wrongAmount as any).reason, 'amount_mismatch');
  ok('金额不符 → amount_mismatch');

  // 四次拒绝之后订单必须仍是 pending：拒绝路径绝不能有副作用
  assert.strictEqual(getOrder('VP-1')!.status, 'pending', '被拒的结算不得改动订单');
  ok('四次拒绝后订单仍为 pending（无副作用）');
}

// ---------- 3. 成功与幂等 ----------
console.log('\n[3] 结算与幂等');
{
  const first = settleFromChannel({
    outTradeNo: 'VP-1', paid: true, amountMinor: 10000,
    currency: siteConfig.currency, channel: siteConfig.paymentChannel,
    transactionId: 'vp-tx-1',
  } as any);
  assert.strictEqual(first.ok, true);
  assert.strictEqual((first as any).alreadyPaid, false);
  assert.strictEqual(getOrder('VP-1')!.status, 'paid');
  ok('金额与币种相符 → 结算，订单置 paid');

  // 支付方会重投（Stripe 最长 3 天、微信也会重试）。第二次必须零写入，
  // 否则同一笔支付会重复发 Credits
  const again = settleFromChannel({
    outTradeNo: 'VP-1', paid: true, amountMinor: 10000,
    currency: siteConfig.currency, channel: siteConfig.paymentChannel,
    transactionId: 'vp-tx-1',
  } as any);
  assert.strictEqual(again.ok, true);
  assert.strictEqual((again as any).alreadyPaid, true, '重投必须命中 alreadyPaid 且零写入');
  ok('重复投递 → alreadyPaid，不重复入账');
}

// ---------- 4. Stripe webhook 的 fail closed ----------
console.log('\n[4] Stripe webhook');
{
  const { stripeAdapter } = await import('@/lib/payments/stripe-adapter');

  const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  let threw = false;
  try {
    await stripeAdapter.parseWebhook(new Headers({ 'stripe-signature': 'whatever' }), '{}');
  } catch {
    threw = true;
  }
  assert.ok(threw, 'STRIPE_WEBHOOK_SECRET 未配置时必须拒绝，绝不能跳过验签');
  ok('未配置 webhook secret → 拒绝（无「没配就放行」的分支）');

  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_verify_payments';
  const forged = await stripeAdapter
    .parseWebhook(new Headers({ 'stripe-signature': 't=1,v1=deadbeef' }), '{"id":"evt_1"}')
    .then(() => 'accepted')
    .catch(() => 'rejected');
  assert.strictEqual(forged, 'rejected', '伪造签名必须被拒');
  ok('伪造签名 → 拒绝');
  if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
}

// ---------- 5. 微信 v3 签名必须覆盖 query string ----------
// 2026-08-08 真机抓到：queryOrder 把 mchid 放在 axios params 里，而签名拦截器读 config.url，
// axios 是在拦截器**之后**才拼 params 的 —— 签的是不含 ?mchid= 的路径，微信一律回 401。
// 表现极不对称：POST 下单（无 query）一直正常，只有带参数的 GET 回查在挂，
// 于是「主动回查」这条兜底路径长期是死的，全靠 notify 扛着，没人发现。
console.log('\n[5] 微信 v3 签名覆盖 query string');
{
  // 直接验拼接规则本身：拦截器需要私钥才能跑完签名，而本节要守的不变式
  // 只是「params 有没有被拼进待签名 URL」，不必为此在验收脚本里造一把私钥。
  const build = (url: string, params?: Record<string, unknown>) => {
    let u = url.replace('https://api.mch.weixin.qq.com', '');
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString();
      if (qs) u += (u.includes('?') ? '&' : '?') + qs;
    }
    return u;
  };
  assert.strictEqual(
    build('/v3/pay/transactions/out-trade-no/CC-1', { mchid: '1900000000' }),
    '/v3/pay/transactions/out-trade-no/CC-1?mchid=1900000000',
    '待签名 URL 必须含 query string，否则微信回 401'
  );
  assert.strictEqual(build('/v3/pay/transactions/native'), '/v3/pay/transactions/native');
  ok('带 params 的 GET：待签名 URL 含 ?mchid=（不含则微信 401）');
  ok('无 params 的 POST：待签名 URL 不变');
}

// ---------- 6. 匿名支持与 Checkout 回跳 ----------
console.log('\n[6] 支持订单不会充值，Stripe 回跳和异步到账');
{
  const Stripe = require('stripe');
  const { stripeAdapter } = await import('@/lib/payments/stripe-adapter');
  const { listLedger } = await import('@/lib/wallet');
  process.env.STRIPE_SECRET_KEY = 'sk_test_verify_only';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_verify_only';
  const ledgerBefore = listLedger(userId).total;
  for (const [id, owner] of [['VP-SUPPORT-ANON', null], ['VP-SUPPORT-USER', userId]] as const) {
    createOrder({ id, outTradeNo: id, description: 'Donation', amount: 500, status: 'pending', userId: owner, kind: 'support', channel: 'stripe', currency: 'USD' });
    const event = (type: string, paymentStatus: string) => JSON.stringify({
      id: `evt_${type}`, type, data: { object: {
        id: 'cs_test_fixture', client_reference_id: id, payment_status: paymentStatus,
        amount_total: 500, currency: 'usd', payment_intent: 'pi_test_fixture',
      } },
    });
    const parse = async (type: string, status: string) => {
      const payload = event(type, status);
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_verify_only' });
      return stripeAdapter.parseWebhook(new Headers({ 'stripe-signature': signature }), payload);
    };
    assert.strictEqual(await parse('checkout.session.completed', 'unpaid'), null);
    assert.strictEqual(await parse('charge.succeeded', 'paid'), null);
    const asyncPaid = await parse('checkout.session.async_payment_succeeded', 'paid');
    assert.ok(asyncPaid?.paid);
    assert.deepStrictEqual(settleFromChannel(asyncPaid!), { ok: true, alreadyPaid: false });
    const completed = await parse('checkout.session.completed', 'paid');
    assert.deepStrictEqual(settleFromChannel(completed!), { ok: true, alreadyPaid: true });
  }
  assert.strictEqual(listLedger(userId).total, ledgerBefore);
  ok('匿名 / 登录支持仅标记 paid；异步到账、重复事件不发 Credits');

  // 截住 SDK 的出站边界，不访问 Stripe，不创建真实 Checkout Session。
  const proto = Stripe.StripeResource.prototype as any;
  const originalRequest = proto._makeRequest;
  let checkout: any;
  proto._makeRequest = async (method: string, endpoint: string, params: unknown) => {
    assert.strictEqual(method, 'POST');
    assert.strictEqual(endpoint, '/v1/checkout/sessions');
    checkout = params;
    return { id: 'cs_test_fixture', url: 'https://checkout.stripe.com/test-fixture' };
  };
  try {
    for (const id of ['VP-SUPPORT-ANON', 'VP-1']) {
      await stripeAdapter.createCharge({ outTradeNo: id, description: 'Verification', amountMinor: 500, baseUrl: 'https://www.aiworkdeck.us' });
      for (const result of ['success', 'cancel']) {
        const url = new URL(checkout[`${result}_url`]);
        assert.strictEqual(url.origin, 'https://www.aiworkdeck.us');
        assert.strictEqual(url.pathname, `/${siteConfig.defaultLocale}${id === 'VP-1' ? '/account' : ''}`);
        assert.strictEqual(url.searchParams.get(id === 'VP-1' ? 'checkout' : 'donation'), result);
        assert.strictEqual(url.searchParams.get('order'), id);
        assert.strictEqual(url.searchParams.get('site'), id === 'VP-1' ? null : 'intl');
      }
    }
    ok('支持 success/cancel 回首页 donation；充值仍回 account checkout');

    const { POST: createPayment } = await import('@/app/api/payment/create/route');
    const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external.js');
    const { NextRequest } = require('next/server');
    const { GET: queryPayment } = await import('@/app/api/payment/query/route');
    const query = (id: string) => workAsyncStorage.run({ forceStatic: true }, () =>
      queryPayment(new NextRequest(`https://www.workdeck.ai/api/payment/query?outTradeNo=${id}`)));
    const anonymousQuery = await query('VP-SUPPORT-ANON');
    assert.strictEqual(anonymousQuery.status, 200);
    const anonymousOrder = (await anonymousQuery.json()).order;
    assert.strictEqual(anonymousOrder.status, 'paid');
    assert.deepStrictEqual(Object.keys(anonymousOrder).sort(), ['amount', 'kind', 'outTradeNo', 'status']);
    assert.strictEqual((await query('VP-SUPPORT-USER')).status, 404);
    ok('匿名支持可查询付款状态且不泄露资料；登录支持仍校验属主');

    const create = (amount: number, host = 'www.aiworkdeck.us', kind = 'support', extra: Record<string, unknown> = {}, authorization = '') =>
      workAsyncStorage.run({ forceStatic: true }, () => createPayment(new NextRequest(`https://${host}/api/payment/create`, {
        method: 'POST', headers: { 'content-type': 'application/json', host, authorization },
        body: JSON.stringify({ amount, kind, description: 'Verification donation', ...extra }),
      })));
    assert.strictEqual((await create(Number.MAX_SAFE_INTEGER + 1)).status, 400);
    const overLimit = await create(50001);
    assert.strictEqual(overLimit.status, 400);
    assert.match((await overLimit.json()).error, siteConfig.currency === 'USD' ? /USD \$500/ : /¥500/);
    assert.strictEqual((await create(100, 'www.aiworkdeck.us', 'recharge')).status, 401);
    ok('金额安全整数、匿名限额币种正确、充值仍要求登录');

    const { generateApiKey } = await import('@/lib/api-keys');
    const authorization = `Bearer ${generateApiKey(userId).key!.plaintextKey}`;
    const { getPaymentAdapter } = await import('@/lib/payments');
    const adapter = getPaymentAdapter();
    const configured = adapter.isConfigured;
    const createCharge = adapter.createCharge;
    adapter.isConfigured = () => true;
    adapter.createCharge = async () => adapter.id === 'stripe'
      ? { channel: 'stripe', present: 'redirect', providerRef: 'cs_test_anon', redirectUrl: 'https://checkout.stripe.com/test-fixture' }
      : { channel: 'wxpay', present: 'qrcode', codeUrl: 'weixin://fixture', qrCode: 'fixture' };
    try {
      const explicitAnon = await create(100, 'www.aiworkdeck.us', 'support', { anonymous: true }, authorization);
      assert.strictEqual(explicitAnon.status, 200);
      const anonId = (await explicitAnon.json()).outTradeNo;
      assert.strictEqual(getOrder(anonId)?.userId, siteConfig.paymentChannel === 'stripe' ? null : userId);
      // 标记为已付，随后模拟扫码手机（无任何登录凭据）查询。
      settleFromChannel({ channel: siteConfig.paymentChannel, currency: siteConfig.currency, outTradeNo: anonId, paid: true, amountMinor: 100 });
      assert.strictEqual((await query(anonId)).status, siteConfig.paymentChannel === 'stripe' ? 200 : 404);
      const defaultLogged = await create(50001, 'www.aiworkdeck.us', 'support', {}, authorization);
      assert.strictEqual(defaultLogged.status, 200);
      assert.strictEqual(getOrder((await defaultLogged.json()).outTradeNo)?.userId, userId);
      const explicitOverLimit = await create(50001, 'www.aiworkdeck.us', 'support', { anonymous: true }, authorization);
      assert.strictEqual(explicitOverLimit.status, siteConfig.paymentChannel === 'stripe' ? 400 : 200);
      if (siteConfig.paymentChannel === 'stripe') assert.doesNotMatch((await explicitOverLimit.json()).error, /Sign in/);
      const recharge = await create(100, 'www.aiworkdeck.us', 'recharge', { anonymous: true }, authorization);
      assert.strictEqual(recharge.status, 200);
      assert.strictEqual(getOrder((await recharge.json()).outTradeNo)?.userId, userId);
      assert.strictEqual((await create(100, 'www.aiworkdeck.us', 'recharge', { anonymous: true })).status, 401);
      ok('显式匿名仅作用于国际支持；手机可查，限额有效；旧登录支持 / 大陆 / 充值规则不变');
    } finally {
      adapter.isConfigured = configured;
      adapter.createCharge = createCharge;
    }

    if (siteConfig.paymentChannel === 'stripe') {
      assert.strictEqual((await create(99)).status, 400);
      for (const host of ['www.workdeck.ai', 'www.aiworkdeck.us', 'workdeck.ai', 'aiworkdeck.us', 'www.aiworkdeck.us.evil.test']) {
        const response = await create(100, host);
        assert.strictEqual(response.status, 200);
        const body = await response.json();
        assert.strictEqual(body.present, 'redirect');
        assert.strictEqual(getOrder(body.outTradeNo)?.userId, null);
        assert.strictEqual(getOrder(body.outTradeNo)?.kind, 'support');
        const expectedOrigin = host.endsWith('.evil.test') ? (process.env.NEXT_PUBLIC_BASE_URL || siteConfig.origin) : `https://${host}`;
        assert.strictEqual(new URL(checkout.success_url).origin, expectedOrigin);
      }
      ok('匿名 Stripe 建单可用；双国际域保持原域；伪造相似域不得成为回跳目标');
    }

  } finally {
    proto._makeRequest = originalRequest;
  }
}

console.log(`\n支付链路全绿：${checked} 项`);
