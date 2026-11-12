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
  assert.equal(m.bqtLinkedLawyer(U), null);
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
{
  assert.deepEqual(m.bqtLinkedLawyer(U), { lawyerId: LAWYER });
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

console.log('\n[3] API 字段：计费线照旧，积分另报');
{
  withTransaction(d => grantCredits(d, { userId: U, pool: 'topup', amountCents: 3000, ledgerKind: 'recharge' }));
  const local = getBalance(U);
  const me = await (await meGET(bearer('/api/account/me'))).json();
  assert.equal(me.billingLine, 'standard', '绑定包晴天不再是单独计费线（老客户端据 bqt 藏充值）');
  assert.deepEqual(Object.keys(me.bqtMember).sort(), ['aiWorkbench', 'cents', 'centsPerPoint', 'expireAt', 'failedCount', 'fetchedAt', 'levelCode', 'outstandingCents', 'points', 'rechargeAllowed', 'status'].sort());
  assert.equal(me.bqtMember.points, '1200.00'); assert.equal(me.bqtMember.cents, 120000);
  assert.equal(me.bqtMember.rechargeAllowed, true); assert.equal(me.bqtMember.levelCode, 'GROWTH');
  assert.equal(me.balanceCents, local, '余额字段报本站钱包');
  assert.equal(me.subscription.active, true);
  assert.equal(me.plan, 'paid');
  const ent = await (await entGET(bearer('/api/account/entitlements'))).json();
  assert.ok(ent.entitlements.some((e: { feature: string }) => e.feature === 'cloud.storage.3gb'));
  const bal = await (await internal({ action: 'balance', accountId: U })).json();
  assert.equal(bal.billingLine, 'standard'); assert.equal(bal.balanceCents, local); assert.equal(bal.bqtMember.cents, 120000);
  const cs = await (await internal({ action: 'cloud-state', accountId: U })).json();
  assert.equal(cs.billing.balanceCents, local);
  assert.equal(cs.cloudAccess.includedStorageBytes, SUBSCRIPTION_LIMITS.cloudStorageBytes);
  assert.equal(subscriptionSnapshot(U).walletFallbackEnabled, true, '包晴天 Pro 没有本站额度，钱包总能用');
  ok('me / entitlements / internal balance / cloud-state：billingLine=standard、余额=钱包、bqtMember 另报积分');
}

console.log('\n[4] 本站照常收款');
{
  const r = await payPOST(bearer('/api/payment/create', { amount: 1000, kind: 'recharge' }));
  assert.notEqual((await r.json()).code, 'bqt_recharge_via_bqt');
  const ir = await internal({ action: 'create-recharge', accountId: U, amountCents: 1000, channel: 'wxpay', idempotencyKey: 'k' });
  assert.notEqual((await ir.json()).error, 'bqt_recharge_via_bqt');
  const code = (generateGiftCodes({ count: 1, kind: 'recharge', amountCents: 100, createdBy: 't' }) as { codes: string[] }).codes[0];
  const before = getBalance(U);
  assert.equal((redeemGiftCode(U, code) as { ok?: boolean }).ok, true);
  assert.equal(getBalance(U), before + 100);
  ok('充值、手机端建单、充值类兑换码都不再拒收');
}

console.log('\n[5] 广场购买走本站钱包');
{
  m.updateBqtSettings({ grantProRights: false }, 'test'); // 让 clipboard 不随 Pro 自带
  const before = getBalance(U), n = consumes().length;
  const r = await buyPOST(bearer('/api/account/purchase', { skuId: 'feature:clipboard.unlimited' }));
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body)); assert.ok(hasEntitlement(U, 'clipboard.unlimited'));
  assert.equal(getBalance(U), before - body.priceCents);
  assert.equal(consumes().length, n, '不扣积分');
  m.updateBqtSettings({ grantProRights: true }, 'test');
  ok('付费条目从钱包扣，积分不动');
}

console.log('\n[6] 云空间：包晴天送的 3GB 先抵，超出走钱包');
{
  const GiB = 1073741824;
  const day = 86400000, t0 = Date.now() - 30 * day;
  acceptPostpaid(U, POSTPAID_VERSION, new Date(t0).toISOString());
  const local = getBalance(U);
  const epoch = postpaidPolicy(U)!.epoch;
  const mid = new Date(t0 + 15 * day).toISOString(), end = new Date(t0 + 30 * day).toISOString();
  recordStorage(U, { eventId: 'st-1', epoch, from: new Date(t0).toISOString(), to: mid, storedBytes: String(3 * GiB) });
  assert.equal(getBalance(U), local, '3GB 以内免费');
  recordStorage(U, { eventId: 'st-2', epoch, from: mid, to: end, storedBytes: String(13 * GiB) });
  assert.equal(getBalance(U), local - 100, '超出 10GiB × 半个月 × 20 分/GiB·月 = 100 分，从钱包扣');
  const res = 'a'.repeat(64);
  reserveEgress(U, { eventId: 'eg-1', epoch, resourceHash: res, bytes: String(2 * GiB) });
  settleEgress(U, 'eg-1', String(2 * GiB), true);
  assert.equal(getBalance(U), local - 100 - 120);
  assert.equal(consumes('cloud_storage').length + consumes('cloud_egress').length, 0);
  ok('存储与流量从钱包扣，不进积分发件箱');
}

console.log('\n[7] 平台网关服务（ASR/OCR 等）走钱包');
{
  const local = getBalance(U);
  const pricing = { service: 'asr', op: 'transcribe', unit: 'minute', creditsPerUnit: 3, maxUnitsPerCall: 600, enabled: 1 } as any;
  const funding = gw.assertBalanceFor(U, 10);
  const c = gw.chargeAfterSuccess({ userId: U, pricing, actualUnits: 4, taskId: 'ocr-1', funding });
  assert.equal(c.chargedCents, 12); assert.ok(c.ledgerId);
  assert.equal(getBalance(U), local - 12);
  assert.equal(consumes().filter(r => r.service === 'asr.transcribe').length, 0);
  gw.chargeTransfer({ userId: U, bytes: 1, credits: 1, refId: 't' });
  assert.equal(getBalance(U), local - 13);
  ok('网关服务与跨设备中转都从钱包扣');
}

console.log('\n[8] 晴天币停发、Circle 互斥');
{
  const nextMonth = new Date(Date.now() + 40 * 86400000);
  assert.equal(ensureBqtMonthlyQingtianGrant(U, nextMonth), null);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM bqt_monthly_grant WHERE userId=?').get(U) as { n: number }).n, 1);
  assert.equal(getBqtQingtianStatus(U), null);
  ok('通道开：晴天币不再按月发放，晴天币一节下线');

  assert.deepEqual(bindCircleFirm(U, 'KW-ABNR-2026'), { ok: false, error: 'bqt_member' });
  const rr = await redeemPOST(bearer('/api/account/redeem', { code: 'KW-ABNR-2026' }));
  assert.equal(rr.status, 409); assert.equal((await rr.json()).error, 'bqt_member');
  ok('包晴天律师不能绑 Circle 邀请码（明确错误码 bqt_member）');
}

console.log('\n[9] 通道关回去：恢复原样');
{
  assert.ok(m.updateBqtSettings({ tunnelEnabled: false }, 'test').ok);
  assert.equal(acct.billingLine(U), 'standard');
  assert.equal(subscriptionSnapshot(U).active, false);
  assert.ok(ensureBqtMonthlyQingtianGrant(U, new Date(Date.now() + 40 * 86400000))?.granted);
  ok('通道关：standard、无包晴天 Pro、晴天币恢复');
}

m.setBqtFetchForTest(null);
console.log(`\nverify-bqt-account: ${checked} checks passed (consume calls: ${consumeCalls})`);
