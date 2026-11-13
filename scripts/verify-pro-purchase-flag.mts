/**
 * Pro 购买开关（PRO_PURCHASE_ENABLED，默认开 = 生产现状）+ monthly-only 验收脚本。
 *
 * 守的不变式：
 *   - 未设 → 默认值（PRO_PURCHASE_ENABLED_DEFAULT）；false/0/off/no → 关；true/1/on/yes → 开
 *   - 关：建单口对 pro_monthly / pro_yearly / 旧 pro:monthly / pro:yearly 回 403 pro_purchase_disabled，零订单零通道调用；
 *         定价页按钮渲染为禁用「暂未开放」，组件里建单 fetch 在 coming-soon 分支之后
 *   - 开：pro_monthly 与旧 pro:monthly（归一为 subscription / pro_monthly）可建单；年付两种写法 400 not_purchasable
 *   - 定价页 monthly-only：zh/en Pro 卡与 meta 不含 1490 / 298 / 年付价；结账弹窗无年付
 *   - 开关不影响打赏 / 充值
 *
 * 必须在空目录里执行：
 *   cd <空目录> && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-pro-purchase-flag.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';

(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

const require = createRequire(import.meta.url);
const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
delete process.env.PRO_PURCHASE_ENABLED;

process.env.AWD_KEY_ENCRYPTION_SECRET = 'verify-pro-flag-secret';
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: userId, username: 'flag-user', email: 'flag@test.local', passwordHash: 'x:y', displayName: 'Flag', createdAt: new Date().toISOString() },
  ])
);

const { siteConfig } = await import('@/lib/site-config');
const flag = await import('@/lib/pro-purchase-flag');
const { getOrder, createOrder } = await import('@/lib/orders');
const { settleFromChannel } = await import('@/lib/payments/settle');
const { getDb } = await import('@/lib/db');
const { generateApiKey } = await import('@/lib/api-keys');
const { getPaymentAdapter } = await import('@/lib/payments');
const { POST: createPayment } = await import('@/app/api/payment/create/route');
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external.js');
const { NextRequest } = require('next/server');

let checked = 0;
const ok = (name: string) => { checked++; console.log('  OK  ', name); };
const db = getDb();
const orderCount = () => (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE kind = 'subscription'").get() as { n: number }).n;

console.log('\n[1] 开关解析 + 闸门');
{
  const D = flag.PRO_PURCHASE_ENABLED_DEFAULT;
  assert.strictEqual(D, true, '当前默认值 = 开（生产现状）；若改默认请同步本断言与 PR 说明');
  assert.strictEqual(flag.isProPurchaseEnabled({}), D);
  assert.strictEqual(flag.isProPurchaseEnabled({ PRO_PURCHASE_ENABLED: 'garbage' }), D);
  for (const v of ['false', 'FALSE', ' false ', '0', 'off', 'no']) {
    assert.strictEqual(flag.isProPurchaseEnabled({ PRO_PURCHASE_ENABLED: v }), false, `"${v}" 应为关闭`);
  }
  for (const v of ['true', 'TRUE', '1', 'on', 'yes']) {
    assert.strictEqual(flag.isProPurchaseEnabled({ PRO_PURCHASE_ENABLED: v }), true, `"${v}" 应为开启`);
  }
  for (const [sku, plan] of [['pro_monthly', 'monthly'], ['pro_monthly_intro', 'monthly'], ['pro:monthly', 'monthly'], ['pro_yearly', 'yearly'], ['pro:yearly', 'yearly'], ['skill:x', null], [undefined, null]] as const) {
    assert.strictEqual(flag.parseProSkuPlan(sku), plan);
  }
  const off = { PRO_PURCHASE_ENABLED: 'false' }; const on = { PRO_PURCHASE_ENABLED: 'true' };
  for (const sku of ['pro_monthly', 'pro_monthly_intro', 'pro_yearly', 'pro:monthly', 'pro:yearly']) {
    assert.strictEqual(flag.checkProPurchaseGate(sku, off)?.code, 'pro_purchase_disabled', sku);
  }
  assert.strictEqual(flag.checkProPurchaseGate('pro_monthly', on), null);
  assert.strictEqual(flag.checkProPurchaseGate('pro_monthly_intro', on), null);
  assert.strictEqual(flag.checkProPurchaseGate('pro:monthly', on), null);
  assert.strictEqual(flag.checkProPurchaseGate('pro_yearly', on)?.code, 'not_purchasable');
  assert.strictEqual(flag.checkProPurchaseGate('pro:yearly', on)?.code, 'not_purchasable');
  assert.deepStrictEqual(flag.normalizeLegacyProSku('purchase', 'pro:monthly'), { kind: 'subscription', skuId: 'pro_monthly' });
  assert.deepStrictEqual(flag.normalizeLegacyProSku('purchase', 'skill:x'), { kind: 'purchase', skuId: 'skill:x' });
  ok('默认开；显式 false 关；年付恒不可购；旧 pro:monthly 归一');
}

console.log('\n[2] 按钮模式');
{
  assert.strictEqual(flag.proCheckoutMode('wxpay', false), 'coming-soon');
  assert.strictEqual(flag.proCheckoutMode('wxpay', true), 'checkout');
  assert.strictEqual(flag.proCheckoutMode('stripe', false), 'account-link');
  assert.strictEqual(flag.proCheckoutMode('stripe', true), 'account-link');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(repo, 'components/pricing/ProCheckout.tsx'), 'utf8');
  const soon = src.indexOf("mode === 'coming-soon'");
  const fetchCreate = src.indexOf("fetch('/api/payment/create'");
  assert.ok(soon > 0 && fetchCreate > soon, 'coming-soon 分支必须在建单 fetch 之前提前返回');
  assert.match(src, /purchaseEnabled = false/, 'purchaseEnabled 缺省必须为 false');
  assert.match(src.slice(soon, fetchCreate), /disabled/, '即将开放按钮必须 disabled');
  assert.doesNotMatch(src, /planButton\('yearly'/, '结账弹窗不显示年付');
  assert.doesNotMatch(src, /'pro_yearly'/, '前端不建年付单');
  const card = fs.readFileSync(path.join(repo, 'components/pricing/ProCard.tsx'), 'utf8');
  assert.match(card, /purchaseEnabled=\{isProPurchaseEnabled\(\)\}/);
  assert.doesNotMatch(card, /proYearly|\{yearly\}/, 'Pro 卡不渲染年付价');
  for (const lang of ['zh', 'en']) {
    const d = JSON.parse(fs.readFileSync(path.join(repo, `dictionaries/${lang}.json`), 'utf8'));
    assert.ok(d.pricingPage.pro.checkout.comingSoon, `${lang} 缺 comingSoon 文案`);
    // 定价页正文（含 Team 段，Team 价带本身不含这些数字）与 meta 均不得含年付价 / 省 ¥298
    const txt = JSON.stringify(d.pricingPage);
    assert.doesNotMatch(txt, /1490|1,490|298|\{yearly\}/, `${lang} 定价页正文不得含年付价 / 省 ¥298`);
    assert.doesNotMatch(d.pricingPage.metaDescription, /1490|298/, `${lang} meta 不得含 1490 / 298`);
    assert.ok(d.pricingPage.metaDescription.includes('149'), `${lang} meta retains the monthly price`);
    assert.strictEqual(d.pricingPage.pro.price, lang === 'zh' ? '{monthly} / 月' : '{monthly} / mo');
    assert.strictEqual(d.pricingPage.team.title, lang === 'zh' ? '独立部署' : 'Dedicated deployment');
    assert.ok(d.pricingPage.pro.perk1.includes('{monthlyCredits}') && d.pricingPage.pro.perk1.includes('{weeklyCredits}'));
    assert.ok(!('yearly' in d.pricingPage.pro.checkout), `${lang} 结账字典不再有年付项`);
  }
  ok('CN 关 → 暂未开放（不建单）；开 → monthly-only checkout；国际站不变；定价页无 1490/298');
}

console.log('\n[3] 建单口服务端双保险');
const authorization = `Bearer ${generateApiKey(userId).key!.plaintextKey}`;
const create = (body: Record<string, unknown>) =>
  workAsyncStorage.run({ forceStatic: true }, () => createPayment(new NextRequest('https://www.aiworkdeck.com/api/payment/create', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify(body),
  })));
const adapter = getPaymentAdapter();
const configured = adapter.isConfigured;
const createCharge = adapter.createCharge;
let charges = 0;
adapter.isConfigured = () => true;
adapter.createCharge = async () => {
  charges++;
  return adapter.id === 'stripe'
    ? { channel: 'stripe', present: 'redirect', providerRef: 'cs_flag', redirectUrl: 'https://checkout.stripe.com/flag' }
    : { channel: 'wxpay', present: 'qrcode', codeUrl: 'weixin://flag', qrCode: 'flag' };
};
try {
  process.env.PRO_PURCHASE_ENABLED = 'false';
  for (const [skuId, amount, kind] of [
    ['pro_monthly', 14900, 'subscription'], ['pro_yearly', 149000, 'subscription'],
    ['pro:monthly', 14900, 'subscription'], ['pro:yearly', 149000, 'subscription'],
    ['pro:monthly', 14900, 'purchase'], ['pro:yearly', 149000, 'purchase'],
  ] as const) {
    const before = orderCount();
    const res = await create({ amount, kind, skuId, idempotencyKey: `flag-off:${kind}:${skuId}` });
    assert.strictEqual(res.status, 403, `${kind} ${skuId}`);
    const data = await res.json();
    assert.strictEqual(data.code, 'pro_purchase_disabled');
    assert.strictEqual(orderCount(), before, '关闭时不得落订单');
  }
  assert.strictEqual(charges, 0, '关闭时不得调用支付通道');
  ok('关闭：pro_monthly / pro_yearly / 旧 pro:monthly / pro:yearly 均 403，零订单、零通道调用');

  const support = await create({ amount: 100, kind: 'support' });
  assert.strictEqual(support.status, 200);
  const recharge = await create({ amount: 100, kind: 'recharge' });
  assert.strictEqual(recharge.status, 200);
  ok('关闭：打赏 / 充值不受影响');

  process.env.PRO_PURCHASE_ENABLED = 'true';
  const monthlyCases = [
    { kind: 'subscription', skuId: 'pro_monthly', key: 'on:new' },
    { kind: 'purchase', skuId: 'pro:monthly', key: 'on:legacy' }, // #228 旧页面载荷
  ];
  for (const c of monthlyCases) {
    const res = await create({ amount: 14900, kind: c.kind, skuId: c.skuId, idempotencyKey: c.key });
    if (siteConfig.currency === 'CNY') {
      assert.strictEqual(res.status, 200, c.skuId);
      const data = await res.json();
      assert.strictEqual(data.present, 'qrcode');
      const order = getOrder(data.outTradeNo)!;
      assert.strictEqual(order.kind, 'subscription', `${c.skuId} 必须按 subscription 建单`);
      assert.strictEqual(order.skuId, 'pro_monthly', `${c.skuId} 必须归一为 pro_monthly`);
      assert.strictEqual(order.amount, 14900);
      assert.strictEqual(order.userId, userId);
    } else {
      assert.strictEqual(res.status, 400, '国际站开启后仍不可购买 Pro');
    }
  }
  if (siteConfig.currency === 'CNY') {
    const mismatch = await create({ amount: 100, kind: 'subscription', skuId: 'pro_monthly', idempotencyKey: 'on:bad' });
    assert.strictEqual(mismatch.status, 400, '开启后金额校验照旧');
  }
  const before = charges;
  for (const [skuId, kind] of [['pro_yearly', 'subscription'], ['pro:yearly', 'subscription'], ['pro:yearly', 'purchase']] as const) {
    const y = await create({ amount: 149000, kind, skuId, idempotencyKey: `on:${kind}:${skuId}` });
    assert.strictEqual(y.status, 400, skuId);
    assert.strictEqual((await y.json()).code, 'not_purchasable');
  }
  assert.strictEqual(charges, before, '年付不得调用支付通道');
  ok('开：pro_monthly 与旧 pro:monthly 建单（subscription/pro_monthly）；yearly 两种写法 400 not_purchasable');

  if (siteConfig.currency === 'CNY') {
    const now = new Date().toISOString(), expires = new Date(Date.now() + 86400000).toISOString();
    db.prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES (?,'pro.appstore','apple-test',?,?)").run(userId,now,expires);
    const beforeOrders = orderCount(), beforeCharges = charges;
    for (const c of monthlyCases) {
      const result = await create({ amount:14900,kind:c.kind,skuId:c.skuId,idempotencyKey:'apple:'+c.key,lang:'en' });
      assert.equal(result.status,409);
      const body = await result.json();
      assert.equal(body.code,'appstore_subscription_active');
      assert.match(body.error,/Apple subscription settings/);
    }
    assert.equal(orderCount(),beforeOrders);assert.equal(charges,beforeCharges);
    assert.equal((await create({amount:100,kind:'recharge'})).status,200);
    assert.equal((await create({amount:100,kind:'support'})).status,200);
    // An order already presented before Apple activation must still settle normally.
    const pending = db.prepare("SELECT outTradeNo FROM orders WHERE idempotencyKey='on:new'").get() as {outTradeNo:string};
    settleFromChannel({channel:'wxpay',currency:'CNY',outTradeNo:pending.outTradeNo,paid:true,amountMinor:14900});
    assert.equal(getOrder(pending.outTradeNo)!.status,'paid');
    assert.ok(db.prepare("SELECT 1 FROM entitlements WHERE userId=? AND feature='pro.appstore'").get(userId));
    db.prepare("UPDATE entitlements SET expiresAt=? WHERE userId=? AND feature='pro.appstore'").run(new Date(Date.now()-1000).toISOString(),userId);
    assert.equal((await create({amount:14900,kind:'subscription',skuId:'pro_monthly',idempotencyKey:'apple:expired'})).status,200);
    ok('active Apple blocks new/current+legacy Pro sales without charge; recharge/support/paid settlement remain; expired Apple allows purchase');

    // 首 3 月 ¥9.9 (pro_monthly_intro) 建单与满 3 次后 409 intro_quota_exhausted
    const introUid = crypto.randomUUID();
    const usersPath = path.join(cwd, 'data', 'users.json');
    const uList = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    uList.push({ id: introUid, username: 'intro-flag', email: 'intro-flag@test.local', passwordHash: 'x:y', displayName: 'IntroFlag', createdAt: new Date().toISOString() });
    fs.writeFileSync(usersPath, JSON.stringify(uList));
    const introAuth = `Bearer ${generateApiKey(introUid).key!.plaintextKey}`;
    const createAs = (uidAuth: string, body: Record<string, unknown>) =>
      workAsyncStorage.run({ url: { pathname: '/api/payment/create', search: '' }, page: '/api/payment/create', fallbackRouteParams: null, afterCbs: [] }, () =>
        createPayment(new NextRequest('http://localhost/api/payment/create', {
          method: 'POST',
          headers: { authorization: uidAuth, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })));
    for (let i = 1; i <= 3; i++) {
      const r = await createAs(introAuth, { amount: 990, kind: 'subscription', skuId: 'pro_monthly_intro', idempotencyKey: `intro:${i}` });
      assert.equal(r.status, 200);
      const body = await r.json();
      settleFromChannel({ channel: 'wxpay', currency: 'CNY', outTradeNo: body.outTradeNo, paid: true, amountMinor: 990 });
    }
    const r409 = await createAs(introAuth, { amount: 990, kind: 'subscription', skuId: 'pro_monthly_intro', idempotencyKey: 'intro:4' });
    assert.equal(r409.status, 409);
    assert.equal((await r409.json()).code, 'intro_quota_exhausted');
    assert.equal((await createAs(introAuth, { amount: 14900, kind: 'subscription', skuId: 'pro_monthly', idempotencyKey: 'intro:4std' })).status, 200);
    ok('pro_monthly_intro: 3 cycles at 990 fen -> 4th returns 409 intro_quota_exhausted -> pro_monthly 14900 succeeds');
  }

  delete process.env.PRO_PURCHASE_ENABLED;
  const dflt = await create({ amount: 14900, kind: 'subscription', skuId: 'pro_monthly', idempotencyKey: 'default' });
  assert.strictEqual(dflt.status, siteConfig.currency === 'CNY' ? 200 : 400, '未设变量 = 默认开，行为同生产现状');
  ok('未设变量：默认开');
} finally {
  adapter.isConfigured = configured;
  adapter.createCharge = createCharge;
  delete process.env.PRO_PURCHASE_ENABLED;
  }

console.log('\n[4] 只拦建单不拦回调：#228 旧 pending 单（kind=purchase）付款后照常履约');
if (siteConfig.currency === 'CNY') {
  process.env.PRO_PURCHASE_ENABLED = 'false'; // 开关关也不拦 notify/settle
  const legacyUser = crypto.randomUUID();
  const users = JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'users.json'), 'utf8'));
  users.push({ id: legacyUser, username: 'legacy', email: 'legacy@test.local', passwordHash: 'x:y', displayName: 'L', createdAt: new Date().toISOString() });
  fs.writeFileSync(path.join(cwd, 'data', 'users.json'), JSON.stringify(users));
  for (const [skuId, amount, days] of [['pro:yearly', 149000, 365], ['pro:monthly', 14900, 30]] as const) {
    const no = `LEGACY-${skuId.replace(':', '-')}-${crypto.randomUUID().slice(0, 8)}`;
    createOrder({ id: no, outTradeNo: no, description: skuId, amount, status: 'pending', userId: legacyUser,
      kind: 'purchase', skuId, channel: 'wxpay', currency: 'CNY', idempotencyKey: null } as any);
    const before = (db.prepare("SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'").get(legacyUser) as { expiresAt: string } | undefined)?.expiresAt;
    settleFromChannel({ channel: 'wxpay', currency: 'CNY', outTradeNo: no, paid: true, amountMinor: amount });
    assert.strictEqual(getOrder(no)!.status, 'paid', `${skuId} 旧单必须结算为 paid`);
    const pay = db.prepare('SELECT plan FROM pro_payment WHERE outTradeNo = ?').get(no) as { plan: string } | undefined;
    assert.ok(pay, `${skuId} 旧单必须写 pro_payment`);
    const ent = db.prepare("SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'").get(legacyUser) as { expiresAt: string };
    assert.ok(ent?.expiresAt, `${skuId} 旧单必须写权益`);
    const start = before && before > new Date().toISOString() ? new Date(before).getTime() : Date.now();
    const gotDays = (new Date(ent.expiresAt).getTime() - start) / 86400000;
    assert.ok(Math.abs(gotDays - days) < 0.01, `${skuId} 权益顺延 ${days} 天，实得 ${gotDays}`);
    // 重复回调幂等
    settleFromChannel({ channel: 'wxpay', currency: 'CNY', outTradeNo: no, paid: true, amountMinor: amount });
    assert.strictEqual((db.prepare('SELECT COUNT(*) AS n FROM pro_payment WHERE outTradeNo = ?').get(no) as { n: number }).n, 1);
  }
  const wallet = db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger WHERE userId = ?").get(legacyUser) as { n: number };
  assert.strictEqual(wallet.n, 0, '旧 Pro 单不得加钱包');
  delete process.env.PRO_PURCHASE_ENABLED;
  ok('开关关：旧 pro:yearly / pro:monthly pending 单回调照常履约（权益顺延、幂等、不加钱包）');
} else {
  ok('国际站无 Pro 旧单（跳过）');
}

console.log(`\nverify-pro-purchase-flag (${siteConfig.paymentChannel}): ${checked} checks passed`);
