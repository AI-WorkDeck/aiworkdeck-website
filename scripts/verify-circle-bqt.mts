// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Circle 联盟所邀请码、后缀、独立计费（0% 加成 + DeepSeek 专用）与
 * 包晴天（BQT）律师扫码登录、晴天币按月发放及换算验证脚本（dev-board#1665）。
 * 必须在隔离空目录执行：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-circle-bqt.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离空目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const circleUser1Id = crypto.randomUUID();
const circleUser2Id = crypto.randomUUID();
const normalUserId = crypto.randomUUID();
const billingUserId = crypto.randomUUID();

fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: billingUserId, username: 'billing-lawyer', email: 'billing@test.local', passwordHash: 'salt:hash', displayName: 'Billing Lawyer', createdAt: new Date().toISOString() },
    {
      id: circleUser1Id,
      username: 'abnr-lawyer',
      email: 'lawyer@abnr.test',
      passwordHash: 'salt:hash',
      displayName: 'Alice Tan',
      createdAt: new Date().toISOString(),
    },
    {
      id: circleUser2Id,
      username: 'kwmsg-lawyer',
      email: 'pilot@kwmsg.test',
      passwordHash: 'salt:hash',
      displayName: 'pilot',
      createdAt: new Date().toISOString(),
    },
    {
      id: normalUserId,
      username: 'normal-lawyer',
      email: 'normal@test.local',
      passwordHash: 'salt:hash',
      displayName: 'Normal Lawyer',
      createdAt: new Date().toISOString(),
    },
  ])
);

const { findUserById, updateProfile, markUserDeleted } = await import('@/lib/users');
const { withTransaction } = await import('@/lib/db');
const {
  getCircleFirm,
  bindCircleFirm,
  getUserCircleFirm,
  getUserMarginMultiplier,
  getCircleDeepseekBalanceCents,
  canCircleUserCallOverseasModel,
  listCircleFirmsAdmin,
  CIRCLE_DEEPSEEK_SOURCE_KIND,
} = await import('@/lib/circle-firms');
const { grantCredits, spendCredits, getBalanceBreakdown } = await import('@/lib/credits');
const { getAiConfig, saveAiConfig } = await import('@/lib/ai-config');
const { reserveCostCny, submitted, settleCostCny, release } = await import('@/lib/platform-ai/billing');
const { isDeepSeekModelId, mapToDeepSeekUpstreamModel } = await import('@/lib/platform-ai/config');
const {
  createBqtScanSession,
  pollBqtScanSession,
  completeBqtScanCallback,
  computeBqtJinduSign,
  verifyBqtJinduSign,
  getBqtQingtianStatus,
  ensureBqtMonthlyQingtianGrant,
} = await import('@/lib/bqt-auth');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}

// 1. 验证 10 家 Circle 联盟所邀请码种子数据完整
const expectedCodes: Array<[string, string]> = [
  ['KW-ABNR-2026', 'ABNR'],
  ['KW-SNT-2026', 'S&T'],
  ['KW-SKR-2026', 'Skrine'],
  ['KW-ZRP-2026', 'ZRP'],
  ['KW-WEC-2026', 'Weerawong'],
  ['KW-CMHM-2026', 'Chandler MHM'],
  ['KW-FRA-2026', 'Frasers'],
  ['KW-VIL-2026', 'VILAF'],
  ['KW-ICO-2026', 'ICONLAW'],
  ['KW-KWMSG-2026', 'KWM SG'],
];
for (const [code, suffix] of expectedCodes) {
  const firm = getCircleFirm(code);
  assert.ok(firm, `应存在邀请码 ${code}`);
  assert.strictEqual(firm.suffix, suffix, `${code} 后缀应为 ${suffix}`);
  assert.strictEqual(firm.marginMultiplier, 1.0, `${code} 加成倍率应为 1.0`);
}
ok('10 家 Circle 联盟所邀请码与后缀种子数据完整');

// 2. 绑定 KW-ABNR-2026 后自动追加用户名后缀并保持改名不丢失
const bind1 = bindCircleFirm(circleUser1Id, 'kw-abnr-2026');
assert.strictEqual(bind1.ok, true, '绑定 KW-ABNR-2026 应成功');
assert.strictEqual(bind1.displayName, 'Alice Tan (ABNR)');
assert.strictEqual(findUserById(circleUser1Id)?.displayName, 'Alice Tan (ABNR)');
assert.strictEqual(bind1.amountCents, 2000, '默认赠送 2000 cents DeepSeek 专项额度');
ok('绑定 KW-ABNR-2026 自动追加 (ABNR) 后缀并发放 DeepSeek 专项赠金');

// 重复绑定同一码返回 already_bound_same，换绑其他所返回 already_bound_other
const bindSame = bindCircleFirm(circleUser1Id, 'KW-ABNR-2026');
assert.strictEqual(bindSame.ok, false);
assert.strictEqual(bindSame.error, 'already_bound_same');
const bindOther = bindCircleFirm(circleUser1Id, 'KW-SKR-2026');
assert.strictEqual(bindOther.ok, false);
assert.strictEqual(bindOther.error, 'already_bound_other');
ok('同一码重复绑定与跨所换绑拦截正确');

// 用户修改昵称时自动保留 (ABNR) 后缀，且 24 字符上限按基础名计算
const updated1 = updateProfile(circleUser1Id, { displayName: 'Alice Wijaya' });
assert.strictEqual(updated1.error, undefined);
assert.strictEqual(updated1.user?.displayName, 'Alice Wijaya (ABNR)');
const longBase = 'A'.repeat(24);
const updatedLong = updateProfile(circleUser1Id, { displayName: longBase });
assert.strictEqual(updatedLong.error, undefined);
assert.strictEqual(updatedLong.user?.displayName, `${longBase} (ABNR)`);
ok('修改昵称自动保留律所后缀且 24 字符上限按基础姓名校验');

// 绑定 KW-KWMSG-2026（默认邮箱前缀用户名也在绑定时带上后缀）
const bind2 = bindCircleFirm(circleUser2Id, 'KW-KWMSG-2026');
assert.strictEqual(bind2.ok, true);
assert.strictEqual(bind2.displayName, 'pilot (KWM SG)');
ok('KW-KWMSG-2026 绑定自动追加 (KWM SG) 后缀');

// 3. Circle 所独立计费规则：0% 加成 + DeepSeek 专项额度与海外模型付费门槛
assert.strictEqual(getUserMarginMultiplier(circleUser1Id), 1.0, 'Circle 所用户 marginMultiplier 应为 1.0');
assert.strictEqual(getUserMarginMultiplier(normalUserId), 1.2, '普通用户 marginMultiplier 应保持 1.2');
assert.strictEqual(getCircleDeepseekBalanceCents(circleUser1Id), 2000);
assert.strictEqual(canCircleUserCallOverseasModel(circleUser1Id), false, '仅含赠送额度时不可调用海外非 DeepSeek 模型');
ok('Circle 所 0% 加成倍率与未充值海外模型拦截生效');

// 充值付费 Credit 后可调用海外模型，且排除 circle_deepseek_grant 扣费时不动用 DeepSeek 专项赠金
withTransaction((db) => {
  grantCredits(db, {
    userId: circleUser1Id,
    amountCents: 500,
    pool: 'topup',
    ledgerKind: 'recharge',
    sourceKind: 'stripe_topup',
    refOrderId: 'pi_test_circle_topup_1',
  });
});
assert.strictEqual(canCircleUserCallOverseasModel(circleUser1Id), true, '充值 topup 后可调用海外模型');

withTransaction((db) => {
  spendCredits(db, {
    userId: circleUser1Id,
    amountCents: 200,
    ledgerKind: 'ai_alloc',
    refOrderId: 'call_gpt4o_1',
    excludeSourceKinds: [CIRCLE_DEEPSEEK_SOURCE_KIND],
  });
});
assert.strictEqual(getCircleDeepseekBalanceCents(circleUser1Id), 2000, '海外模型扣费不应消耗 DeepSeek 专项赠金');
assert.strictEqual(getBalanceBreakdown(circleUser1Id).topupCents, 300, '海外模型扣费应从付费 topup 扣除');
ok('充值后可调用海外模型且扣费严格隔离 DeepSeek 专项赠金');

// DeepSeek 专用模型识别与上游映射
assert.strictEqual(isDeepSeekModelId('deepseek/deepseek-chat'), true);
assert.strictEqual(isDeepSeekModelId('deepseek/deepseek-r1'), true);
assert.strictEqual(isDeepSeekModelId('openai/gpt-4o'), false);
assert.strictEqual(mapToDeepSeekUpstreamModel('deepseek/deepseek-chat'), 'deepseek-chat');
assert.strictEqual(mapToDeepSeekUpstreamModel('deepseek/deepseek-r1'), 'deepseek-reasoner');
ok('DeepSeek 专用模型 ID 识别与上游模型名映射正确');

// Exercise real reserve, refund and settlement against the isolated ledger; no upstream calls.
assert.equal(bindCircleFirm(billingUserId, 'KW-SNT-2026').ok, true);
for (const modelId of ['deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017']) {
  assert.equal(isDeepSeekModelId(modelId), true);
  const before = getCircleDeepseekBalanceCents(billingUserId);
  const id = crypto.randomUUID();
  reserveCostCny(billingUserId, id, { model: modelId }, modelId, 1, {});
  assert.equal(getCircleDeepseekBalanceCents(billingUserId), before - 100);
  submitted(billingUserId, id);
  assert.equal(settleCostCny(billingUserId, id, 0.4, {}).chargedCents, 40);
  assert.equal(getCircleDeepseekBalanceCents(billingUserId), before - 40);
  assert.equal(getBalanceBreakdown(billingUserId).topupCents, 0);
  settleCostCny(billingUserId, id, 0.4, {});
  assert.equal(getCircleDeepseekBalanceCents(billingUserId), before - 40);
  const rejectedId = crypto.randomUUID();
  reserveCostCny(billingUserId, rejectedId, {}, modelId, 1, {});
  release(billingUserId, rejectedId);
  assert.equal(getCircleDeepseekBalanceCents(billingUserId), before - 40);
  ok(modelId + ' gift-only reservation, partial refund, idempotent settlement and release');
}
const giftBefore = getCircleDeepseekBalanceCents(billingUserId);
for (const modelId of ['qwen3.8-plus', 'openai/gpt-4o', 'deepseek-v4-unapproved']) {
  assert.equal(isDeepSeekModelId(modelId), false);
  assert.throws(() => reserveCostCny(billingUserId, crypto.randomUUID(), {}, modelId, 1, {}));
  assert.equal(getCircleDeepseekBalanceCents(billingUserId), giftBefore);
}
ok('Non-DeepSeek and unapproved bare IDs cannot reserve dedicated gifts');
withTransaction(db => grantCredits(db, { userId: billingUserId, amountCents: 500, pool: 'topup', ledgerKind: 'recharge', sourceKind: 'stripe_topup', refOrderId: 'circle_billing_topup' }));
const paidId = crypto.randomUUID();
reserveCostCny(billingUserId, paidId, {}, 'qwen3.8-plus', 1, {});
assert.equal(getBalanceBreakdown(billingUserId).topupCents, 400);
submitted(billingUserId, paidId);
settleCostCny(billingUserId, paidId, 0.4, {});
assert.equal(getBalanceBreakdown(billingUserId).topupCents, 460);
assert.equal(getCircleDeepseekBalanceCents(billingUserId), giftBefore);
ok('Non-DeepSeek settlement refunds paid balance without touching dedicated gifts');

// 4. 包晴天（BQT）扫码登录、SignJinduUtil 验签、律师身份校验与晴天币按月发放
const bqtSession = createBqtScanSession();
assert.strictEqual(pollBqtScanSession(bqtSession.qrid, bqtSession.pollToken).status, 'pending');

const ak = 'test-bqt-ak';
const sk = 'test-only-bqt-secret';
process.env.AWD_BQT_SCAN_AK = ak;
process.env.AWD_BQT_SCAN_SK = sk;
const signParams: Record<string, string | undefined> = {
  ak,
  qrid: bqtSession.qrid,
  timestamp: bqtSession.timestamp,
  userId: 'bqt_lawyer_888',
  userType: 'lawyer',
  userName: '包晴天张律师',
  mobile: '13800138000',
};
signParams.sign = computeBqtJinduSign(signParams, sk);
assert.strictEqual(verifyBqtJinduSign(signParams), true, 'SignJinduUtil 合法签名应通过验证');
assert.strictEqual(
  verifyBqtJinduSign({ ...signParams, sign: 'BADSIGN' }),
  false,
  '伪造签名应被拒绝'
);
ok('包晴天 SignJinduUtil HMAC-SHA256 签名校验正确');

// 非律师身份扫码应被拦截
const nonLawyerSession = createBqtScanSession();
const nonLawyerCb = completeBqtScanCallback({
  qrid: nonLawyerSession.qrid,
  bqtUserId: 'bqt_non_lawyer_1',
  mobile: '13900001111',
  userName: '普通当事人',
  userType: 'client',
});
assert.strictEqual(nonLawyerCb.code, 1);
const nonLawyerPolled = pollBqtScanSession(nonLawyerSession.qrid, nonLawyerSession.pollToken);
assert.strictEqual(nonLawyerPolled.status, 'rejected');
if (nonLawyerPolled.status === 'rejected') {
  assert.strictEqual(nonLawyerPolled.error, 'bqt_not_lawyer');
}
ok('非律师身份扫码登录被准确拒绝');

// 律师身份扫码成功并自动发放当月晴天币
const lawyerCb = completeBqtScanCallback({
  qrid: bqtSession.qrid,
  bqtUserId: 'bqt_lawyer_888',
  mobile: '13800138000',
  userName: '包晴天张律师',
  userType: 'lawyer',
});
assert.strictEqual(lawyerCb.code, 0, '律师扫码回调应成功');
assert.ok(lawyerCb.userId, '应生成或绑定用户 ID');

const polled = pollBqtScanSession(bqtSession.qrid, bqtSession.pollToken);
assert.strictEqual(polled.status, 'confirmed');
if (polled.status === 'confirmed') {
  assert.strictEqual(polled.user.id, lawyerCb.userId);
  assert.strictEqual(polled.user.displayName, '包晴天张律师');
  assert.ok(polled.qingtian, '轮询结果应附带晴天币状态');
  assert.strictEqual(polled.qingtian?.monthlyCoins, 1000);
  assert.strictEqual(polled.qingtian?.remainingCoins, 1000);
  assert.strictEqual(polled.qingtian?.centsPerCoin, 10);
}

// 同一月份再次触发不重复发放
const secondGrant = ensureBqtMonthlyQingtianGrant(lawyerCb.userId!);
assert.strictEqual(secondGrant?.granted, false, '同月重复调用不应重复发放晴天币');
ok('包晴天律师扫码登录成功并按月幂等发放晴天币');

// 调整晴天币与 Credit 换算比例配置并验证换算
const currentAiCfg = getAiConfig();
saveAiConfig({
  ...currentAiCfg,
  bqtMonthlyQingtianCoins: 2000,
  centsPerQingtianCoin: 20,
});
const qingtianAfterRatioChange = getBqtQingtianStatus(lawyerCb.userId!);
assert.ok(qingtianAfterRatioChange);
assert.strictEqual(qingtianAfterRatioChange.centsPerCoin, 20);
// 账本里已有 10000 cents，当 centsPerCoin=20 时折合 500 晴天币
assert.strictEqual(qingtianAfterRatioChange.remainingCents, 10000);
assert.strictEqual(qingtianAfterRatioChange.remainingCoins, 500);
ok('晴天币与 Credit 换算比例（centsPerQingtianCoin）动态折算正确');

// Security regressions: QR data is public; only the initiating device can redeem it.
const privateSession = createBqtScanSession();
assert(!privateSession.qrContent.includes(privateSession.pollToken));
assert.equal(pollBqtScanSession(privateSession.qrid, '').status, 'expired');
assert.equal(pollBqtScanSession(privateSession.qrid, '0'.repeat(64)).status, 'expired');
assert.equal(pollBqtScanSession(privateSession.qrid, privateSession.pollToken).status, 'pending');
const oldParams: Record<string, string | undefined> = { ...signParams, timestamp: String(Date.now() - 600_000) };
oldParams.sign = computeBqtJinduSign(oldParams, sk);
assert.equal(verifyBqtJinduSign(oldParams), false);
assert.equal(verifyBqtJinduSign({ ...signParams, ak: 'unregistered' }), false);
ok('QR redemption requires a separate proof; stale or unknown signer callbacks are rejected');
const noPhoneA = createBqtScanSession(), noPhoneB = createBqtScanSession();
const identityA = completeBqtScanCallback({ qrid: noPhoneA.qrid, bqtUserId: 'provider-A-12345678', userType: 'lawyer' });
const identityB = completeBqtScanCallback({ qrid: noPhoneB.qrid, bqtUserId: 'provider-B-12345678', userType: 'lawyer' });
assert.equal(identityA.code, 0); assert.equal(identityB.code, 0);
assert.notEqual(identityA.userId, identityB.userId);
assert.equal(findUserById(identityA.userId!)?.phone, undefined);
const conflictSession = createBqtScanSession();
assert.equal(completeBqtScanCallback({ qrid: conflictSession.qrid, bqtUserId: 'different-provider', userType: 'lawyer', mobile: '13800138000' }).code, 1);
ok('Distinct provider identities never collide through synthetic phone numbers or overwrite bindings');

const { NextRequest } = await import('next/server');
const createRoute = await import('@/app/api/auth/bqt-scan/create/route');
const callbackRoute = await import('@/app/api/auth/bqt-scan/callback/route');
const statusRoute = await import('@/app/api/auth/bqt-scan/status/route');
process.env.AWD_BQT_SCAN_ENABLED = 'false';
assert.equal((await createRoute.POST(new NextRequest('https://test.local/api/auth/bqt-scan/create', { method: 'POST' }))).status, 503);
process.env.AWD_BQT_SCAN_ENABLED = 'true';
if (process.env.NEXT_PUBLIC_AWD_SITE === 'cn') {
  const response = await createRoute.POST(new NextRequest('https://test.local/api/auth/bqt-scan/create', { method: 'POST' }));
  assert.equal(response.status, 200);
  const qr = await response.json();
  const callbackParams: Record<string, string> = { ak, qrid: qr.qrid, timestamp: qr.timestamp, userId: 'http-fixture-user', userType: 'lawyer' };
  callbackParams.sign = computeBqtJinduSign(callbackParams, sk);
  assert.equal((await (await callbackRoute.GET(new NextRequest('https://test.local/api/auth/bqt-scan/callback?' + new URLSearchParams(callbackParams)))).json()).code, 0);
  assert.equal((await (await statusRoute.GET(new NextRequest('https://test.local/api/auth/bqt-scan/status?qrid=' + qr.qrid))).json()).status, 'expired');
  const redeemed = await statusRoute.GET(new NextRequest('https://test.local/api/auth/bqt-scan/status?qrid=' + qr.qrid, { headers: { 'X-Bqt-Poll-Token': qr.pollToken } }));
  assert.equal((await redeemed.json()).status, 'confirmed');
  assert.equal((await (await statusRoute.GET(new NextRequest('https://test.local/api/auth/bqt-scan/status?qrid=' + qr.qrid, { headers: { Authorization: 'Bearer ' + qr.pollToken } }))).json()).status, 'expired');
  assert.equal((await callbackRoute.POST(new NextRequest('https://test.local/api/auth/bqt-scan/callback', { method: 'POST', body: JSON.stringify({ userId: 'forged', qrCodeId: qr.qrid }), headers: { 'X-Timestamp': qr.timestamp, 'X-Sign': 'forged' } }))).status, 401);
} else {
  assert.equal((await createRoute.POST(new NextRequest('https://test.local/api/auth/bqt-scan/create', { method: 'POST' }))).status, 400);
}
delete process.env.AWD_BQT_SCAN_ENABLED;
ok('HTTP rollout, region, signed callback and single-device redemption boundaries');

// 5. 管理端汇总与用户注销清理
const adminFirms = listCircleFirmsAdmin();
assert.strictEqual(adminFirms.length, 10);
assert.strictEqual(adminFirms.find((f) => f.code === 'KW-ABNR-2026')?.boundUsersCount, 1);
markUserDeleted(circleUser1Id, 'Deleted User');
assert.strictEqual(getUserCircleFirm(circleUser1Id), null, '注销用户后 Circle 绑定应清理');
ok('管理端统计与用户注销绑定清理正确');

console.log(`\nALL ${passed} CHECKS PASSED`);
