/**
 * 个人 Pro（微信 Native 一次性购买）验收脚本。
 *
 * 守的不变式：
 *   - 价格只来自 lib/saas-pricing.ts（分 = 展示价 × 100）
 *   - 结算走 settleFromChannel：权益顺延 + subscription_paid (+ 账户首笔 first_payment) + 有 trial 行才 converted（无行 skip）同事务
 *   - 按 outTradeNo 幂等：重复回调 / 重复履约零写入
 *   - 过期的限时权益不出现在 listEntitlements / hasEntitlement 里，永久权益不受影响
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-pro-subscription.mts
 */
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

process.env.AWD_KEY_ENCRYPTION_SECRET = 'verify-pro-secret';
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: userId, username: 'pro-user', email: 'pro@test.local', passwordHash: 'x:y', displayName: 'Pro', createdAt: new Date().toISOString() },
  ])
);

const { siteConfig } = await import('@/lib/site-config');
const { SAAS_PRICING, SAAS_PRICE_FEN } = await import('@/lib/saas-pricing');
const { createOrder, getOrder } = await import('@/lib/orders');
const { settleFromChannel } = await import('@/lib/payments/settle');
const { getDb, withTransaction } = await import('@/lib/db');
const { hasEntitlement, listEntitlements } = await import('@/lib/purchases');
const { getPlan } = await import('@/lib/wallet');
const { GET: entitlementsGET } = await import('@/app/api/account/entitlements/route');
const { generateApiKey } = await import('@/lib/api-keys');
const { NextRequest } = await import('next/server');
const pro = await import('@/lib/pro-products');

let checked = 0;
function ok(name: string) {
  checked++;
  console.log('  OK  ', name);
}
const db = getDb();
const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

console.log('\n[1] 价格单一来源');
{
  const yuan = (s: string) => Number(s.replace(/[^\d.]/g, ''));
  assert.strictEqual(SAAS_PRICE_FEN.proMonthly, 14900);
  assert.strictEqual(SAAS_PRICE_FEN.proYearly, 149000);
  assert.strictEqual(SAAS_PRICE_FEN.proMonthly, yuan(SAAS_PRICING.proMonthly) * 100, '月付实扣价必须等于展示价');
  assert.strictEqual(SAAS_PRICE_FEN.proYearly, yuan(SAAS_PRICING.proYearly) * 100, '年付实扣价必须等于展示价');
  assert.strictEqual(pro.getProProduct('pro_monthly')!.priceCents, 14900);
  assert.strictEqual(pro.getProProduct('pro_yearly')!.priceCents, 149000);
  ok('pro_monthly=14900 分 / pro_yearly=149000 分，与 ¥149 / ¥1490 展示价一致');
}

console.log('\n[2] 下单校验');
{
  assert.ok('product' in pro.validateProPurchase('pro_monthly', 14900, 'CNY'));
  assert.deepStrictEqual(pro.validateProPurchase('pro_monthly', 1, 'CNY'), { error: 'amount_mismatch' });
  assert.deepStrictEqual(pro.validateProPurchase('pro_weekly', 14900, 'CNY'), { error: 'invalid_sku' });
  assert.deepStrictEqual(pro.validateProPurchase('pro_yearly', 149000, 'USD'), { error: 'not_purchasable' });
  assert.ok(!pro.isProSku('feature:clipboard.unlimited') && pro.isProSku('pro_yearly'));
  ok('金额不符 / 未知 SKU / 非人民币站 一律拒绝');
}

if (siteConfig.currency !== 'CNY') {
  // 国际站（USD / Stripe）不卖 Pro：就算有人直接落一张 pro_ 订单，履约也必须抛错回滚
  console.log('\n[3] 非人民币站：Pro 订单履约拒绝');
  createOrder({ id: 'PRO-INTL', outTradeNo: 'PRO-INTL', description: 'Pro', amount: 14900, status: 'pending', userId, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  assert.throws(() => settleFromChannel({ outTradeNo: 'PRO-INTL', paid: true, amountMinor: 14900, currency: siteConfig.currency, channel: siteConfig.paymentChannel, transactionId: 'tx' } as any));
  assert.strictEqual(getOrder('PRO-INTL')!.status, 'pending');
  ok(`${siteConfig.currency} 站 Pro 履约抛错，订单保持 pending`);
  console.log(`\n全部通过：${checked} 项`);
  process.exit(0);
}

// 预置：一条进行中的试用 + 一条永久 feature 权益
const t0 = new Date().toISOString();
db.prepare(
  `INSERT INTO trial_balance (accountId, status, callsUsed, trialStartedAt, trialEndsAt, region, updatedAt)
   VALUES (?, 'active', 19, ?, ?, 'cn', ?)`
).run(userId, t0, t0, t0);
db.prepare(`INSERT INTO entitlements (userId, feature, orderId, createdAt) VALUES (?, 'clipboard.unlimited', 'GIFT', ?)`).run(userId, t0);

const mkOrder = (id: string, skuId: string, amount: number) =>
  createOrder({ id, outTradeNo: id, description: 'Pro', amount, status: 'pending', userId, kind: 'subscription', skuId, channel: siteConfig.paymentChannel, currency: siteConfig.currency });
const settle = (id: string, amount: number) =>
  settleFromChannel({ outTradeNo: id, paid: true, amountMinor: amount, currency: siteConfig.currency, channel: siteConfig.paymentChannel, transactionId: `tx-${id}` } as any);

console.log('\n[3] 月付结算：权益 + 事件 + 试用转付费');
let firstEnd: string;
{
  mkOrder('PRO-M-1', 'pro_monthly', 14900);
  const r = settle('PRO-M-1', 14900);
  assert.deepStrictEqual(r, { ok: true, alreadyPaid: false });
  assert.strictEqual(getOrder('PRO-M-1')!.status, 'paid');
  const ent = db.prepare(`SELECT * FROM entitlements WHERE userId = ? AND feature = 'pro'`).get(userId) as any;
  assert.ok(ent && ent.expiresAt > new Date().toISOString(), 'Pro 权益必须带未来的到期时间');
  firstEnd = ent.expiresAt;
  const days = (Date.parse(firstEnd) - Date.now()) / 86400000;
  assert.ok(days > 29.5 && days < 30.5, `月付应顺延 30 天，实际 ${days} 天`);
  assert.ok(hasEntitlement(userId, 'pro'));
  ok(`entitlements(pro) 到期 ${firstEnd}`);

  const ev = db.prepare(`SELECT * FROM billing_event WHERE outTradeNo = 'PRO-M-1' ORDER BY eventName`).all() as any[];
  assert.strictEqual(ev.length, 2, '首笔应同时记 subscription_paid + first_payment');
  const names = ev.map((e) => e.eventName).sort();
  assert.deepStrictEqual(names, ['first_payment', 'subscription_paid']);
  assert.strictEqual(JSON.parse(ev.find((e) => e.eventName === 'subscription_paid').attrs).plan, 'monthly');
  assert.strictEqual(JSON.parse(ev.find((e) => e.eventName === 'subscription_paid').attrs).sku_id, 'pro_monthly');
  assert.strictEqual(JSON.parse(ev.find((e) => e.eventName === 'first_payment').attrs).is_first_payment, true);
  ok('billing_event 记 subscription_paid + first_payment（首笔）');

  const tb = db.prepare(`SELECT * FROM trial_balance WHERE accountId = ?`).get(userId) as any;
  assert.strictEqual(tb.status, 'converted');
  assert.strictEqual(tb.convertedOrderNo, 'PRO-M-1');
  assert.strictEqual(tb.callsUsed, 19, '转付费不改历史计次');
  ok('trial_balance active → converted');
}

console.log('\n[4] 幂等：重复回调 / 重复履约');
{
  const snapshot = () => [
    count('SELECT COUNT(*) AS n FROM pro_payment'),
    count('SELECT COUNT(*) AS n FROM billing_event'),
    (db.prepare(`SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'`).get(userId) as any).expiresAt,
  ];
  const before = snapshot();
  assert.deepStrictEqual(settle('PRO-M-1', 14900), { ok: true, alreadyPaid: true });
  assert.deepStrictEqual(snapshot(), before, '重复回调必须零写入');
  ok('重复回调 → alreadyPaid，零写入');

  const dup = withTransaction((d) => pro.fulfillProPayment(d, getOrder('PRO-M-1')!));
  assert.strictEqual(dup.duplicate, true);
  assert.deepStrictEqual(snapshot(), before, '同一 outTradeNo 再履约必须零写入');
  ok('同一 outTradeNo 直接再履约 → duplicate，零写入');

  assert.throws(() =>
    db.prepare(`INSERT INTO pro_payment (outTradeNo, userId, plan, amountCents, periodStart, periodEnd, createdAt) VALUES ('PRO-M-1', ?, 'monthly', 14900, 'a', 'b', 'c')`).run(userId)
  );
  ok('pro_payment.outTradeNo 唯一约束生效');
}

console.log('\n[5] 年付续购从原到期日顺延');
{
  mkOrder('PRO-Y-1', 'pro_yearly', 149000);
  assert.deepStrictEqual(settle('PRO-Y-1', 149000), { ok: true, alreadyPaid: false });
  const ent = db.prepare(`SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'`).get(userId) as any;
  assert.strictEqual(ent.expiresAt, pro.addDays(firstEnd, 365));
  const pp = db.prepare(`SELECT periodStart FROM pro_payment WHERE outTradeNo = 'PRO-Y-1'`).get() as any;
  assert.strictEqual(pp.periodStart, firstEnd);
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM billing_event WHERE eventName = 'subscription_paid'`), 2);
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM billing_event WHERE eventName = 'first_payment'`), 1, '续购不再发 first_payment');
  ok('年付 periodStart = 月付到期日，到期 +365 天；first_payment 仅首笔');
}

console.log('\n[6] 拒绝路径无副作用');
{
  mkOrder('PRO-BAD-AMT', 'pro_monthly', 14900);
  const r = settle('PRO-BAD-AMT', 100);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(getOrder('PRO-BAD-AMT')!.status, 'pending');
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM pro_payment WHERE outTradeNo = 'PRO-BAD-AMT'`), 0);
  ok('通道金额不符 → 拒绝、订单 pending、无履约');

  // 绕过建单口、以错误金额落库的订单：履约抛错 → 整个事务回滚
  mkOrder('PRO-FORGED', 'pro_yearly', 100);
  assert.throws(() => settle('PRO-FORGED', 100));
  assert.strictEqual(getOrder('PRO-FORGED')!.status, 'pending', '履约失败必须回滚 paid');
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM billing_event WHERE outTradeNo = 'PRO-FORGED'`), 0);
  ok('订单金额 ≠ 标价 → 履约抛错，事务回滚');
}

console.log('\n[7] 过期限时权益不再生效，永久权益不受影响');
{
  const other = crypto.randomUUID();
  db.prepare(`INSERT INTO entitlements (userId, feature, orderId, createdAt, expiresAt) VALUES (?, 'pro', 'OLD', ?, ?)`)
    .run(other, '2020-01-01T00:00:00.000Z', '2020-02-01T00:00:00.000Z');
  assert.ok(!hasEntitlement(other, 'pro'));
  assert.deepStrictEqual(listEntitlements(other), []);
  const mine = listEntitlements(userId).map((e) => e.feature).sort();
  assert.deepStrictEqual(mine, ['clipboard.unlimited', 'cloud.storage.3gb', 'plan.pro', 'pro', 'stage.unlimited']);
  ok('过期 Pro 不列出；永久 feature 权益照常列出');

  // 过期后再买：从现在起算，而不是从过去的到期日
  createOrder({ id: 'PRO-RENEW', outTradeNo: 'PRO-RENEW', description: 'Pro', amount: 14900, status: 'pending', userId: other, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  assert.deepStrictEqual(settle('PRO-RENEW', 14900), { ok: true, alreadyPaid: false });
  const pp = db.prepare(`SELECT periodStart FROM pro_payment WHERE outTradeNo = 'PRO-RENEW'`).get() as any;
  assert.ok(pp.periodStart > '2026-01-01', '过期后续购从当前时刻起算');
  assert.ok(hasEntitlement(other, 'pro'));
  const tb = db.prepare(`SELECT status FROM trial_balance WHERE accountId = ?`).get(other) as any;
  assert.strictEqual(tb, undefined, '无试用行时不得 INSERT converted');
  assert.strictEqual(
    count(`SELECT COUNT(*) AS n FROM billing_event WHERE eventName = 'first_payment' AND userId = ?`, other),
    1,
    '无试用行的账户首笔仍发 first_payment'
  );
  ok('过期后续购从现在起算；无试用行 → skip（不 INSERT）；首笔仍记 first_payment');
}

console.log('\n[7b] first_payment 账户级幂等 + 有 trial 才 converted');
{
  // 另一白户：先有 trial 行，付费后 converted；再付一次不重复 first_payment
  const u = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO trial_balance (accountId, status, callsUsed, trialStartedAt, trialEndsAt, region, updatedAt)
     VALUES (?, 'active', 3, ?, ?, 'cn', ?)`
  ).run(u, now, now, now);
  createOrder({ id: 'PRO-FP-1', outTradeNo: 'PRO-FP-1', description: 'Pro', amount: 14900, status: 'pending', userId: u, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  assert.deepStrictEqual(settle('PRO-FP-1', 14900), { ok: true, alreadyPaid: false });
  const tb1 = db.prepare(`SELECT status, convertedOrderNo, callsUsed FROM trial_balance WHERE accountId = ?`).get(u) as any;
  assert.strictEqual(tb1.status, 'converted');
  assert.strictEqual(tb1.convertedOrderNo, 'PRO-FP-1');
  assert.strictEqual(tb1.callsUsed, 3);
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM billing_event WHERE eventName = 'first_payment' AND userId = ?`, u), 1);
  ok('有 trial 行 → converted；首笔 first_payment ×1');

  createOrder({ id: 'PRO-FP-2', outTradeNo: 'PRO-FP-2', description: 'Pro', amount: 14900, status: 'pending', userId: u, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  assert.deepStrictEqual(settle('PRO-FP-2', 14900), { ok: true, alreadyPaid: false });
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM billing_event WHERE eventName = 'first_payment' AND userId = ?`, u), 1, '同用户续购不得再发 first_payment');
  assert.strictEqual(count(`SELECT COUNT(*) AS n FROM billing_event WHERE eventName = 'subscription_paid' AND userId = ?`, u), 2);
  const tb2 = db.prepare(`SELECT convertedOrderNo FROM trial_balance WHERE accountId = ?`).get(u) as any;
  assert.strictEqual(tb2.convertedOrderNo, 'PRO-FP-1', 'convertedOrderNo 保持首转订单（COALESCE）');
  ok('续购只加 subscription_paid；trial convertedOrderNo 不改写');
}

console.log('\n[8] getPlan：到期的 Pro 不是 paid');
{
  // 只买过 Pro、Pro 已到期 → expired（Pro 订单本身不算 paid）
  const lapsed = crypto.randomUUID();
  createOrder({ id: 'PRO-LAPSED', outTradeNo: 'PRO-LAPSED', description: 'Pro', amount: 14900, status: 'pending', userId: lapsed, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  assert.deepStrictEqual(settle('PRO-LAPSED', 14900), { ok: true, alreadyPaid: false });
  assert.strictEqual(getPlan(lapsed), 'paid', '有效期内的 Pro → paid');
  const end = (db.prepare(`SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'`).get(lapsed) as any).expiresAt;
  const after = new Date(Date.parse(end) + 1000).toISOString();
  assert.strictEqual(getPlan(lapsed, after), 'expired', '到期后 → expired');
  db.prepare(`UPDATE entitlements SET expiresAt = '2020-02-01T00:00:00.000Z' WHERE userId = ? AND feature = 'pro'`).run(lapsed);
  assert.strictEqual(getPlan(lapsed), 'expired');
  ok('仅 Pro 且到期 → expired；有效期内 → paid');

  // 到期 Pro + 另有永久权益 → 仍是 paid（永久权益恒有效）
  db.prepare(`INSERT INTO entitlements (userId, feature, orderId, createdAt) VALUES (?, 'clipboard.unlimited', 'GIFT2', ?)`).run(lapsed, t0);
  assert.strictEqual(getPlan(lapsed), 'paid');
  ok('到期 Pro + 永久权益 → paid');

  // 从未付费 → free
  assert.strictEqual(getPlan(crypto.randomUUID()), 'free');
  ok('白户 → free');
}

console.log('\n[9] /api/account/entitlements 追加 expiresAt（只加不改）');
{
  const { key } = generateApiKey(userId);
  assert.ok(key);
  const res = await entitlementsGET(new NextRequest('http://localhost/api/account/entitlements', { headers: { authorization: `Bearer ${key!.plaintextKey}` } }));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  const byFeature = Object.fromEntries(body.entitlements.map((e: any) => [e.feature, e]));
  assert.deepStrictEqual(Object.keys(byFeature.pro).sort(), ['expiresAt', 'feature', 'orderId', 'purchasedAt']);
  assert.ok(typeof byFeature.pro.expiresAt === 'string' && byFeature.pro.expiresAt > new Date().toISOString());
  assert.strictEqual(byFeature['clipboard.unlimited'].expiresAt, null, '永久权益 expiresAt = null');
  ok('Pro 条目带到期时间；永久权益 expiresAt=null；旧字段齐全');
}

console.log('\n[10] 成功页到期日：支付成功起算 +30/+365 + 词典 {date}');
{
  const paidAt = '2026-10-10T06:54:00.000Z';
  assert.strictEqual(pro.formatProExpiresDate(pro.addDays(paidAt, 30)), '2026-11-09');
  assert.strictEqual(pro.formatProExpiresDate(pro.addDays(paidAt, 365)), '2027-10-10');
  assert.strictEqual(pro.formatProExpiresDate(pro.resolveProExpiresAt('pro_monthly', paidAt)!), '2026-11-09');
  assert.strictEqual(pro.formatProExpiresDate(pro.resolveProExpiresAt('pro_yearly', paidAt)!), '2027-10-10');
  assert.strictEqual(
    pro.resolveProExpiresAt('pro_monthly', paidAt, '2026-12-01T00:00:00.000Z'),
    '2026-12-01T00:00:00.000Z'
  );
  const pp = db.prepare(`SELECT periodEnd FROM pro_payment WHERE outTradeNo = 'PRO-M-1'`).get() as { periodEnd: string };
  assert.strictEqual(pp.periodEnd, firstEnd);
  assert.strictEqual(pro.resolveProExpiresAt('pro_monthly', paidAt, pp.periodEnd), firstEnd);
  ok('月付 +30 → 2026-11-09；年付 +365 → 2027-10-10；履约 periodEnd 优先');

  const { GET: paymentQueryGET } = await import('@/app/api/payment/query/route');
  const qk = generateApiKey(userId).key!;
  const qres = await paymentQueryGET(new NextRequest('http://localhost/api/payment/query?outTradeNo=PRO-M-1', { headers: { authorization: `Bearer ${qk.plaintextKey}` } }));
  assert.strictEqual(qres.status, 200);
  const qbody = await qres.json();
  const entNow = (db.prepare(`SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'`).get(userId) as any).expiresAt;
  assert.strictEqual(qbody.order.expiresAt, entNow, '查询 expiresAt 必须等于服务端 entitlements.expiresAt');
  assert.ok(!('userId' in qbody.order));
  ok('GET /api/payment/query 回服务端 entitlements.expiresAt（不前端自算）');

  // 仓根：优先 REPO（npm script）；否则从本脚本路径推（CI 直接 tsx 且未 export REPO）
  const dictRoot =
    process.env.REPO ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.ok(fs.existsSync(path.join(dictRoot, 'dictionaries/zh.json')), '找不到 dictionaries/zh.json @ ' + dictRoot);
  const zhBody = JSON.parse(fs.readFileSync(path.join(dictRoot, 'dictionaries/zh.json'), 'utf8'))
    .pricingPage.pro.checkout.successBody as string;
  const enBody = JSON.parse(fs.readFileSync(path.join(dictRoot, 'dictionaries/en.json'), 'utf8'))
    .pricingPage.pro.checkout.successBody as string;
  assert.ok(zhBody.includes('{date}') && zhBody.includes('有效期至'), zhBody);
  assert.ok(!zhBody.includes('见账户页'), zhBody);
  assert.ok(enBody.includes('{date}') && enBody.includes('through {date}'), enBody);
  assert.ok(!/see your account for the end date/i.test(enBody), enBody);
  const zhPending = JSON.parse(fs.readFileSync(path.join(dictRoot, 'dictionaries/zh.json'), 'utf8'))
    .pricingPage.pro.checkout.successBodyPending as string;
  const enPending = JSON.parse(fs.readFileSync(path.join(dictRoot, 'dictionaries/en.json'), 'utf8'))
    .pricingPage.pro.checkout.successBodyPending as string;
  assert.ok(zhPending.includes('见账户页') && !zhPending.includes('{date}'), zhPending);
  assert.ok(/see your account for the end date/i.test(enPending) && !enPending.includes('{date}'), enPending);
  const zhAccount = JSON.parse(fs.readFileSync(path.join(dictRoot, 'dictionaries/zh.json'), 'utf8'))
    .pricingPage.pro.checkout.successAccount as string;
  const enAccount = JSON.parse(fs.readFileSync(path.join(dictRoot, 'dictionaries/en.json'), 'utf8'))
    .pricingPage.pro.checkout.successAccount as string;
  assert.strictEqual(zhAccount, '查看 Pro 权益');
  assert.strictEqual(enAccount, 'View Pro plan');
  const demo = zhBody.replace('{date}', pro.formatProExpiresDate(pp.periodEnd));
  assert.ok(demo.includes('有效期至 ') && !demo.includes('{date}'), demo);
  ok('zh/en successBody/{date}；pending 兜底无空日期；successAccount=Pro 权益/plan');
}

console.log(`\n全部通过：${checked} 项`);
