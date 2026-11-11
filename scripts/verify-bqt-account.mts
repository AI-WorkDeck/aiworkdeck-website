// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 包晴天律师账户侧验收：Pro 权益、拒收直付、非 AI 扣费走发件箱、晴天币停发、Circle 互斥、API 字段。
 * 假包晴天（setBqtFetchForTest），绝不碰真实 consume。必须在空目录运行：npm run test:bqt-account
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const now0 = new Date().toISOString();
const U = 'bqt-a', PLAIN = 'plain-b';
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), JSON.stringify([
  { id: U, username: 'bqt-a', displayName: 'Lawyer', passwordHash: 'x:y', createdAt: now0 },
  { id: PLAIN, username: 'plain-b', displayName: 'Plain', passwordHash: 'x:y', createdAt: now0 },
]));
process.env.AWD_BQT_MEMBER_BASE_URL = 'https://bqt.fake';
process.env.AWD_BQT_MEMBER_APP_ID = 'APPID';
process.env.AWD_BQT_MEMBER_APP_SECRET = 'SECRET';
process.env.AWD_MOBILE_BILLING_SECRET = 'synthetic-internal';
process.env.AWD_POSTPAID_ENABLED = 'true';
process.env.AWD_KEY_ENCRYPTION_SECRET = 'verify-bqt-account';

const LAWYER = '1958374765023690754'; // 19 位，超 JS 安全整数，必须按字符串走
const m = await import('@/lib/bqt-member');
const acct = await import('@/lib/bqt-account');
const { getDb, withTransaction } = await import('@/lib/db');
const { subscriptionSnapshot, SUBSCRIPTION_LIMITS } = await import('@/lib/subscription');
const { listEntitlements, hasEntitlement } = await import('@/lib/purchases');
const { getPlan } = await import('@/lib/wallet');
const { getBalance, grantCredits } = await import('@/lib/credits');
const { ensureBqtMonthlyQingtianGrant, getBqtQingtianStatus } = await import('@/lib/bqt-auth');
const { bindCircleFirm } = await import('@/lib/circle-firms');
const { generateGiftCodes, redeemGiftCode } = await import('@/lib/gift-codes');
const { acceptPostpaid, postpaidPolicy, POSTPAID_VERSION, cloudState } = await import('@/lib/postpaid');
const { recordStorage } = await import('@/lib/postpaid-meter');
const { reserveEgress, settleEgress } = await import('@/lib/postpaid-egress');
const gw = await import('@/lib/gateway/spend');
const { generateApiKey } = await import('@/lib/api-keys');
const { NextRequest } = await import('next/server');
const { GET: meGET } = await import('@/app/api/account/me/route');
const { GET: entGET } = await import('@/app/api/account/entitlements/route');
const { POST: payPOST } = await import('@/app/api/payment/create/route');
const { POST: buyPOST } = await import('@/app/api/account/purchase/route');
const { POST: redeemPOST } = await import('@/app/api/account/redeem/route');
const { POST: internalPOST } = await import('@/app/api/internal/account/route');

const db = getDb();
let checked = 0;
const ok = (name: string) => { checked++; console.log('  OK  ', name); };
const key = generateApiKey(U).key!.plaintextKey;
const bearer = (url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'Content-Type': 'application/json', authorization: `Bearer ${key}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const internal = (body: unknown) => internalPOST(new NextRequest('http://localhost/api/internal/account', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'synthetic-internal' }, body: JSON.stringify(body),
}));
const consumes = (service?: string) => db.prepare(`SELECT * FROM bqt_consume WHERE userId=? ${service ? 'AND service=?' : ''} ORDER BY createdAt`)
  .all(...(service ? [U, service] : [U])) as Array<{ requestNo: string; state: string; cents: number; service: string }>;
/** 把 fire-and-forget 的发送等完 */
const settle = async () => {
  for (const r of db.prepare("SELECT requestNo FROM bqt_consume WHERE state IN ('pending','sending')").all() as Array<{ requestNo: string }>) await m.dispatchConsume(r.requestNo);
};

// ── 假包晴天 ──
let points = 1200_00;
const member = { status: 'ACTIVE', aiWorkbench: true };
const ledger = new Map<string, number>();
const script: Array<'busy' | 'insufficient'> = [];
let consumeCalls = 0;
m.setBqtFetchForTest(async (url, init) => {
  const reply = (o: unknown) => ({ status: 200, text: async () => JSON.stringify(o) });
  if (url.includes('/entitlement?')) {
    assert.ok(url.endsWith(`lawyerId=${LAWYER}`), 'lawyerId 原样拼进 query');
    return reply({ code: 0, data: { lawyerId: LAWYER, levelCode: 'GROWTH', status: member.status, expireTime: '2027-10-13T23:59:59', aiWorkbench: member.aiWorkbench, usablePoints: points / 100 } });
  }
  consumeCalls++;
  assert.ok(init.body!.startsWith(`{"lawyerId":${LAWYER},`), 'lawyerId 按数字字面量原样发送');
  const b = JSON.parse(init.body!.replace(/"lawyerId":\d+/, '"lawyerId":0'));
  const want = Math.round(b.points * 100);
  const res = (resultCode: string, code: number, extra: object = {}) => reply({ code, data: { code, resultCode, requestNo: b.requestNo, consumedPoints: 0, usablePoints: points / 100, idempotent: false, ...extra } });
  const step = script.shift();
  if (step === 'busy') return res('SYSTEM_BUSY', 46106);
  if (ledger.has(b.requestNo)) return res('SUCCESS', 0, { consumedPoints: want / 100, idempotent: true });
  if (step === 'insufficient' || points < want) return res('INSUFFICIENT_POINTS', 46102);
  if (member.status !== 'ACTIVE') return res('MEMBER_INVALID', 46101);
  points -= want; ledger.set(b.requestNo, want);
  return res('SUCCESS', 0, { consumedPoints: want / 100, usablePoints: points / 100 });
});

db.prepare(`INSERT INTO bqt_user_binding (userId, bqtUserId, mobile, userName, userType, boundAt, updatedAt) VALUES (?, ?, NULL, 'L', 'lawyer', ?, ?)`)
  .run(U, LAWYER, now0, now0);

console.log('\n[1] 通道关闭：一切照旧');
{
  assert.equal(m.bqtChargeTarget(U), null);
  assert.equal(acct.billingLine(U), 'standard');
  assert.equal(acct.bqtMemberView(U), null);
  assert.equal(subscriptionSnapshot(U).active, false);
  assert.ok(!hasEntitlement(U, 'pro'));
  const g = ensureBqtMonthlyQingtianGrant(U);
  assert.ok(g?.granted, '通道关时晴天币照发');
  assert.ok(getBqtQingtianStatus(U));
  const me = await (await meGET(bearer('/api/account/me'))).json();
  assert.equal(me.billingLine, 'standard'); assert.equal(me.bqtMember, null);
  assert.ok(me.bqtQingtian, '旧晴天币字段照旧');
  ok('通道关：standard、无 Pro、晴天币照发');
}

console.log('\n[2] 通道开：Pro 权益随有效会员');
assert.ok(m.updateBqtSettings({ centsPerPoint: 100, tunnelEnabled: true }, 'test').ok);
const localBefore = getBalance(U);
{
  assert.deepEqual(m.bqtChargeTarget(U), { lawyerId: LAWYER });
  await acct.refreshBqtSnapshot(U);
  const sub = subscriptionSnapshot(U);
  assert.equal(sub.active, true); assert.equal(sub.source, 'bqt');
  assert.equal(sub.cloudStorageBytes, SUBSCRIPTION_LIMITS.cloudStorageBytes);
  assert.equal(sub.monthlyLimitCents, 0, '不送本站月度额度');
  const ents = listEntitlements(U);
  for (const f of ['pro', 'cloud.storage.3gb', 'clipboard.unlimited', 'stage.unlimited']) {
    assert.equal(ents.find(e => e.feature === f)?.expiresAt, new Date('2027-10-13T23:59:59+08:00').toISOString(), f);
  }
  assert.equal(getPlan(U), 'paid');
  assert.equal(cloudState(U).cloudAccess.includedStorageBytes, SUBSCRIPTION_LIMITS.cloudStorageBytes);
  ok('ACTIVE + aiWorkbench → Pro 功能 + 3GB，到期 = 包晴天 expireTime');

  member.status = 'EXPIRED'; await m.fetchBqtEntitlement(LAWYER);
  assert.equal(subscriptionSnapshot(U).active, false); assert.ok(!hasEntitlement(U, 'cloud.storage.3gb'));
  member.status = 'ACTIVE'; member.aiWorkbench = false; await m.fetchBqtEntitlement(LAWYER);
  assert.equal(subscriptionSnapshot(U).active, false); assert.ok(!hasEntitlement(U, 'pro'));
  member.aiWorkbench = true; await m.fetchBqtEntitlement(LAWYER);
  m.updateBqtSettings({ grantProRights: false }, 'test');
  assert.equal(subscriptionSnapshot(U).active, false);
  m.updateBqtSettings({ grantProRights: true }, 'test');
  assert.equal(subscriptionSnapshot(U).active, true);
  assert.equal(subscriptionSnapshot(PLAIN).active, false);
  ok('EXPIRED / aiWorkbench=false / 后台关 Pro → 无 Pro；非包晴天用户不受影响');
}

console.log('\n[3] API 字段');
{
  const me = await (await meGET(bearer('/api/account/me'))).json();
  assert.equal(me.billingLine, 'bqt');
  assert.deepEqual(Object.keys(me.bqtMember).sort(), ['aiWorkbench', 'cents', 'centsPerPoint', 'expireAt', 'failedCount', 'fetchedAt', 'levelCode', 'outstandingCents', 'points', 'rechargeAllowed', 'status'].sort());
  assert.equal(me.bqtMember.points, '1200.00'); assert.equal(me.bqtMember.cents, 120000);
  assert.equal(me.bqtMember.rechargeAllowed, false); assert.equal(me.bqtMember.levelCode, 'GROWTH');
  assert.equal(me.balanceCents, 120000, '旧余额字段报折算值');
  assert.equal(me.subscription.active, true);
  assert.equal(me.bqtQingtian, undefined, '通道开时不再报晴天币');
  assert.equal(me.plan, 'paid');
  const ent = await (await entGET(bearer('/api/account/entitlements'))).json();
  assert.ok(ent.entitlements.some((e: { feature: string }) => e.feature === 'cloud.storage.3gb'));
  const bal = await (await internal({ action: 'balance', accountId: U })).json();
  assert.equal(bal.billingLine, 'bqt'); assert.equal(bal.balanceCents, 120000); assert.equal(bal.bqtMember.cents, 120000);
  const cs = await (await internal({ action: 'cloud-state', accountId: U })).json();
  assert.equal(cs.billingLine, 'bqt'); assert.equal(cs.billing.balanceCents, 120000);
  assert.equal(cs.cloudAccess.includedStorageBytes, SUBSCRIPTION_LIMITS.cloudStorageBytes);
  ok('/api/account/me、entitlements、internal balance/cloud-state 带 billingLine/bqtMember，余额报折算值');
}

console.log('\n[4] 拒收直付');
{
  for (const body of [{ amount: 1000, kind: 'recharge' }, { amount: 14900, kind: 'subscription', skuId: 'pro_monthly' }, { amount: 990, kind: 'purchase', skuId: 'feature:clipboard.unlimited' }]) {
    const r = await payPOST(bearer('/api/payment/create', body));
    assert.equal(r.status, 409, body.kind); assert.equal((await r.json()).code, 'bqt_recharge_via_bqt');
  }
  const r = await internal({ action: 'create-recharge', accountId: U, amountCents: 1000, channel: 'wxpay', idempotencyKey: 'k' });
  assert.equal(r.status, 409); assert.equal((await r.json()).error, 'bqt_recharge_via_bqt');
  const sub = await internal({ action: 'prepare-appstore-subscription', accountId: U });
  assert.equal((await sub.json()).error, 'bqt_recharge_via_bqt');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM orders').get() as { n: number }).n, 0);
  ok('payment/create（充值/Pro/直付购买）与手机端建单一律 409 bqt_recharge_via_bqt，不建单');
}

console.log('\n[5] 广场购买：扣成才交付');
{
  m.updateBqtSettings({ grantProRights: false }, 'test'); // 让 clipboard/stage 不随 Pro 自带
  const buy = async (skuId: string) => { const r = await buyPOST(bearer('/api/account/purchase', { skuId })); return { status: r.status, body: await r.json() }; };
  const sku = 'feature:clipboard.unlimited';
  // 预检不足
  const saved = points; points = 1; await m.fetchBqtEntitlement(LAWYER);
  let r = await buy(sku);
  assert.equal(r.body.error, 'bqt_insufficient_points'); assert.ok(!hasEntitlement(U, 'clipboard.unlimited'));
  points = saved; await m.fetchBqtEntitlement(LAWYER);
  // 预检过但包晴天回 INSUFFICIENT_POINTS → 不交付、不挂账
  script.push('insufficient');
  r = await buy(sku);
  assert.equal(r.body.error, 'bqt_consume_failed'); assert.ok(!hasEntitlement(U, 'clipboard.unlimited'));
  assert.equal(consumes('purchase')[0].state, 'waived', '没交付的失败扣减直接放弃，不算欠账');
  assert.equal(m.bqtOutstandingCents(U).failed, 0);
  // 超时/繁忙 → 不交付；再点一次复用原单号，只扣一次
  script.push('busy');
  r = await buy(sku);
  assert.equal(r.status, 202); assert.equal(r.body.error, 'bqt_consume_pending'); assert.ok(!hasEntitlement(U, 'clipboard.unlimited'));
  const before = points;
  r = await buy(sku);
  assert.equal(r.status, 200); assert.equal(r.body.paidWith, 'bqt'); assert.ok(hasEntitlement(U, 'clipboard.unlimited'));
  const rows = consumes('purchase');
  assert.equal(rows.length, 2); assert.equal(rows[1].state, 'succeeded');
  assert.equal(before - points, rows[1].cents, '1 积分 = 100 分，只扣一次');
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(r.body.orderId) as { status: string; channel: string; amountCents: number };
  assert.equal(order.status, 'paid'); assert.equal(order.channel, 'bqt');
  assert.equal((await buy(sku)).body.error, 'already_owned');
  assert.equal(getBalance(U), localBefore, '本站钱包一分未动');
  m.updateBqtSettings({ grantProRights: true }, 'test');
  ok('预检不足/扣减被拒 → 不交付；pending → 不交付且重试不重扣；成功 → 交付并记 bqt 订单');
}

console.log('\n[6] 云空间计量走发件箱，3GB 先抵扣');
{
  const GiB = 1073741824;
  const day = 86400000, t0 = Date.now() - 30 * day;
  acceptPostpaid(U, POSTPAID_VERSION, new Date(t0).toISOString());
  // 本站留一笔余额：不许被花
  withTransaction(d => grantCredits(d, { userId: U, pool: 'reward', amountCents: 5000, ledgerKind: 'gift' }));
  const local = getBalance(U);
  const epoch = postpaidPolicy(U)!.epoch;
  const mid = new Date(t0 + 15 * day).toISOString(), end = new Date(t0 + 30 * day).toISOString();
  recordStorage(U, { eventId: 'st-1', epoch, from: new Date(t0).toISOString(), to: mid, storedBytes: String(3 * GiB) });
  await settle();
  assert.equal(consumes('cloud_storage').length, 0, '3GB 以内免费');
  recordStorage(U, { eventId: 'st-2', epoch, from: mid, to: end, storedBytes: String(13 * GiB) });
  await settle();
  const st = consumes('cloud_storage');
  assert.equal(st.length, 1); assert.equal(st[0].state, 'succeeded');
  assert.equal(st[0].cents, 100, '超出 10GiB × 半个月 × 20 分/GiB·月 = 100 分');
  assert.equal(getBalance(U), local, '本站钱包未扣');
  assert.equal((db.prepare("SELECT COUNT(*) n FROM wallet_ledger WHERE userId=? AND kind='service_spend'").get(U) as { n: number }).n, 0);
  ok('存储计量：免费额度先抵扣，超出部分整笔进发件箱并扣成，本站钱包不动');

  const res = 'a'.repeat(64);
  const resv = reserveEgress(U, { eventId: 'eg-1', epoch, resourceHash: res, bytes: String(2 * GiB) });
  assert.equal(resv.freeExport, false);
  assert.equal(getBalance(U), local, '包晴天不预扣');
  settleEgress(U, 'eg-1', String(2 * GiB), true);
  await settle();
  const eg = consumes('cloud_egress');
  assert.equal(eg.length, 1); assert.equal(eg[0].cents, 120); assert.equal(eg[0].state, 'succeeded');
  assert.equal(getBalance(U), local);
  ok('流量：不预扣，结算整笔进发件箱');
}

console.log('\n[7] 平台网关服务（ASR/OCR 等）');
{
  const local = getBalance(U);
  const pricing = { service: 'asr', op: 'transcribe', unit: 'minute', creditsPerUnit: 3, maxUnitsPerCall: 600, enabled: 1 } as any;
  await acct.refreshBqtSnapshot(U, 0);
  gw.assertBalanceFor(U, 10);
  const c = gw.chargeAfterSuccess({ userId: U, pricing, actualUnits: 4, taskId: 'ocr-1' });
  assert.deepEqual(c, { ledgerId: null, chargedCents: 12, shortfallCents: 0 });
  const held = gw.openHold({ userId: U, taskId: 'asr-1', pricing, estimatedUnits: 10, nowMs: Date.now() });
  assert.equal(held.holdLedgerId, 0); assert.equal(gw.pendingHoldCents(U), 0);
  assert.deepEqual(gw.settleHold('asr-1', 7, pricing), { chargedCents: 21, shortfallCents: 0 });
  assert.deepEqual(gw.settleHold('asr-1', 7, pricing), { chargedCents: 0, shortfallCents: 0 }, '幂等');
  gw.openHold({ userId: U, taskId: 'asr-2', pricing, estimatedUnits: 10, nowMs: Date.now() });
  gw.releaseHold('asr-2', 'test');
  await settle();
  const g = consumes().filter(r => r.service === 'asr.transcribe');
  assert.deepEqual(g.map(r => [r.cents, r.state]), [[12, 'succeeded'], [21, 'succeeded']], '释放的 hold 不扣');
  assert.equal(getBalance(U), local, '本站钱包未扣');
  assert.throws(() => gw.chargeTransfer({ userId: U, bytes: 1, credits: 1, refId: 't' }), /跨设备中转/);
  db.prepare("UPDATE bqt_entitlement_snapshot SET fetchedAt='2000-01-01T00:00:00Z' WHERE lawyerId=?").run(LAWYER);
  assert.throws(() => gw.assertBalanceFor(U, 1), (e: any) => e.code === 'upstream_failed', '旧快照不做花钱判断');
  await m.fetchBqtEntitlement(LAWYER);
  ok('网关：事前按实时权益放行、事后整笔进发件箱、ASR 不预扣、跨设备中转暂拒');
}

console.log('\n[8] 晴天币停发、Circle 互斥、兑换码');
{
  const nextMonth = new Date(Date.now() + 40 * 86400000);
  assert.equal(ensureBqtMonthlyQingtianGrant(U, nextMonth), null);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM bqt_monthly_grant WHERE userId=?').get(U) as { n: number }).n, 1);
  assert.equal(getBqtQingtianStatus(U), null);
  ok('通道开：晴天币不再按月发放，晴天币一节下线');

  assert.deepEqual(bindCircleFirm(U, 'KW-ABNR-2026'), { ok: false, error: 'bqt_member' });
  const rr = await redeemPOST(bearer('/api/account/redeem', { code: 'KW-ABNR-2026' }));
  assert.equal(rr.status, 409); assert.equal((await rr.json()).error, 'bqt_member');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM user_circle_binding WHERE userId=?').get(U) as { n: number }).n, 0);
  ok('包晴天律师不能绑 Circle 邀请码（明确错误码 bqt_member）');

  const batch = generateGiftCodes({ count: 1, kind: 'recharge', amountCents: 100, createdBy: 't' }) as { codes: string[] };
  const code = batch.codes[0];
  assert.deepEqual(redeemGiftCode(U, code), { error: 'bqt_recharge_via_bqt' });
  assert.equal((db.prepare('SELECT redeemedByUserId FROM gift_codes WHERE code=?').get(code) as { redeemedByUserId: string | null }).redeemedByUserId, null, '码未被消耗');
  const fcode = (generateGiftCodes({ count: 1, kind: 'entitlement', feature: 'stage.unlimited', createdBy: 't' }) as { codes: string[] }).codes[0];
  m.updateBqtSettings({ grantProRights: false }, 'test');
  assert.equal((redeemGiftCode(U, fcode) as { ok?: boolean }).ok, true, '权益类码照常');
  m.updateBqtSettings({ grantProRights: true }, 'test');
  ok('充值类兑换码拒收且不消耗；权益类兑换码照常');
}

console.log('\n[9] 通道关回去：恢复原样');
{
  assert.ok(m.updateBqtSettings({ tunnelEnabled: false }, 'test').ok);
  assert.equal(acct.billingLine(U), 'standard');
  assert.equal(subscriptionSnapshot(U).active, false);
  const r = await payPOST(bearer('/api/payment/create', { amount: 1000, kind: 'recharge' }));
  assert.notEqual((await r.json()).code, 'bqt_recharge_via_bqt');
  assert.ok(ensureBqtMonthlyQingtianGrant(U, new Date(Date.now() + 40 * 86400000))?.granted);
  ok('通道关：standard、无包晴天 Pro、可充值、晴天币恢复');
}

m.setBqtFetchForTest(null);
console.log(`\nverify-bqt-account: ${checked} checks passed (consume calls: ${consumeCalls})`);
