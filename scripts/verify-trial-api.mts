/**
 * 试用计量 v0.1.1 官网侧验收（TRIAL-API-CONTRACT，doc/desktop-contract.md「试用计量」）。
 *
 * 守的不变式：
 *   - 发放幂等；真付过钱的账户不发放；注册赠额（gift 账本）不影响发放资格
 *   - 14 天或 80 次，先到为准，服务端权威
 *   - 按 (accountId, turnId) 幂等计次；awaiting_input 与 completed 同样算 1 次
 *   - 用尽 / 到期 → ai-usage 与 ai-key 409 trial_exhausted / trial_expired；有 Credits 则放行
 *   - Pro 付款后 status=converted，不再计次
 *   - Bearer awdk_ 鉴权，与其它桌面端点同口径（无 Key 401）
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-trial-api.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

process.env.AWD_KEY_ENCRYPTION_SECRET = 'verify-trial-secret';
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
const [aliceId, bobId, carolId, daveId, payerId, giftId] = ids;
const createdAt = new Date().toISOString();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify(
    ids.map((id, i) => ({ id, username: `trial-${i}`, email: `t${i}@test.local`, passwordHash: 'x:y', displayName: `T${i}`, createdAt }))
  )
);

const { siteConfig } = await import('@/lib/site-config');
const { getDb, withTransaction } = await import('@/lib/db');
const { grantCredits, getBalance } = await import('@/lib/credits');
const gift = (userId: string) =>
  withTransaction((d) => grantCredits(d, { userId, pool: 'reward', amountCents: 500, ledgerKind: 'gift', sourceKind: 'signup_bonus' }));
const { generateApiKey } = await import('@/lib/api-keys');
const { createOrder } = await import('@/lib/orders');
const { settleOrderPaid } = await import('@/lib/wallet');
const trial = await import('@/lib/trial');
const { GET: trialGET } = await import('@/app/api/account/trial/route');
const { POST: turnsPOST } = await import('@/app/api/account/trial/turns/route');
const { GET: aiUsageGET } = await import('@/app/api/account/ai-usage/route');
const { POST: aiKeyPOST } = await import('@/app/api/account/ai-key/route');
const { NextRequest } = await import('next/server');

let checked = 0;
function ok(name: string) {
  checked++;
  console.log('  OK  ', name);
}
const db = getDb();
const keyOf = (userId: string) => {
  const { key } = generateApiKey(userId);
  assert.ok(key, 'Key 生成失败');
  return key.plaintextKey;
};
const req = (url: string, key?: string, init: { method?: string; body?: string } = {}) =>
  new NextRequest(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
  });
const getTrial = async (key?: string) => trialGET(req('http://localhost/api/account/trial', key));
const postTurn = async (key: string | undefined, body: unknown) =>
  turnsPOST(req('http://localhost/api/account/trial/turns', key, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const turn = (outcome = 'completed', turnId: string = crypto.randomUUID()) => ({
  turnId,
  outcome,
  hasAssistantResult: true,
  endedAt: new Date().toISOString(),
});
const BALANCE_KEYS = [
  'granted', 'status', 'policy', 'daysQuota', 'callsQuota', 'callsUsed', 'remainingDays',
  'remainingCalls', 'trialStartedAt', 'trialEndsAt', 'region', 'serverTime',
].sort();

const alice = keyOf(aliceId);
const bob = keyOf(bobId);
const carol = keyOf(carolId);
const dave = keyOf(daveId);

console.log('\n[1] 鉴权与未发放形状');
{
  assert.strictEqual((await getTrial()).status, 401);
  assert.strictEqual((await getTrial('awdk_nope')).status, 401);
  assert.strictEqual((await postTurn(undefined, turn())).status, 401);
  ok('无 / 错 Bearer → 401');

  const res = await getTrial(alice);
  assert.strictEqual(res.status, 200);
  const b = await res.json();
  assert.deepStrictEqual(Object.keys(b).sort(), BALANCE_KEYS, '字段集漂移');
  assert.strictEqual(b.granted, false);
  assert.strictEqual(b.status, 'none');
  assert.strictEqual(b.policy, 'min_of_days_or_calls');
  assert.strictEqual(b.remainingDays, 14);
  assert.strictEqual(b.remainingCalls, 80);
  assert.strictEqual(b.trialStartedAt, null);
  assert.strictEqual(b.trialEndsAt, null);
  assert.strictEqual(b.region, siteConfig.id);
  ok('未发放：granted:false / status:none / 14 天 80 次 / 时间字段 null');

  const r = await (await postTurn(alice, turn())).json();
  assert.strictEqual(r.counted, false);
  assert.strictEqual(r.duplicate, false);
  ok('未发放时上报 → 200 counted:false（不是错误）');
}

console.log('\n[2] 发放幂等');
{
  assert.strictEqual(trial.grantTrial(aliceId), true);
  const first = (await (await getTrial(alice)).json()) as ReturnType<typeof trial.getTrialBalance>;
  assert.strictEqual(trial.grantTrial(aliceId), false, '二次发放必须是空操作');
  const again = (await (await getTrial(alice)).json()) as ReturnType<typeof trial.getTrialBalance>;
  assert.strictEqual(again.trialStartedAt, first.trialStartedAt);
  assert.strictEqual(first.granted, true);
  assert.strictEqual(first.status, 'active');
  assert.strictEqual(first.remainingDays, 14);
  assert.strictEqual(first.remainingCalls, 80);
  assert.strictEqual(Date.parse(first.trialEndsAt!) - Date.parse(first.trialStartedAt!), 14 * 86_400_000);
  ok('发放：active、trialEndsAt = start + 14 天；重复发放不改时间');

  // 注册赠额（gift 账本行）不影响发放资格
  gift(giftId);
  assert.strictEqual(trial.grantTrial(giftId), true, '注册赠额用户也要拿到试用');
  ok('有注册赠额（gift）的新用户照常发放');
}

console.log('\n[3] 计次幂等；awaiting_input 算 1 次');
{
  const id = crypto.randomUUID();
  const r1 = await (await postTurn(alice, turn('completed', id))).json();
  assert.deepStrictEqual([r1.counted, r1.duplicate, r1.balance.callsUsed, r1.balance.remainingCalls], [true, false, 1, 79]);
  const r2 = await (await postTurn(alice, turn('completed', id))).json();
  assert.deepStrictEqual([r2.counted, r2.duplicate, r2.balance.callsUsed], [false, true, 1]);
  ok('同一 turnId 重复上报 → duplicate:true，不重复扣');

  const r3 = await (await postTurn(alice, turn('awaiting_input'))).json();
  assert.strictEqual(r3.counted, true);
  assert.strictEqual(r3.balance.callsUsed, 2);
  ok('awaiting_input 计 1 次');

  const r4 = await (await postTurn(alice, { ...turn(), hasAssistantResult: false })).json();
  assert.strictEqual(r4.counted, false);
  assert.strictEqual(r4.balance.callsUsed, 2);
  ok('无助手正文 → counted:false');

  for (const bad of [
    { ...turn(), turnId: '' },
    { ...turn(), turnId: 'x'.repeat(129) },
    { ...turn(), outcome: 'failed' },
    [],
  ]) {
    const res = await postTurn(alice, bad);
    assert.strictEqual(res.status, 400);
  }
  assert.strictEqual((await postTurn(alice, '{not json')).status, 400);
  ok('非法 turnId / outcome / body → 400 业务码');

  const ledger = (db.prepare('SELECT COUNT(*) AS n FROM ai_turn_ledger WHERE accountId = ?').get(aliceId) as { n: number }).n;
  assert.strictEqual(ledger, 4, '账本：未发放时 1 次 + 两次计费 + 一次无正文（不计费的也落账，防同 turnId 之后误计）');
  assert.throws(() =>
    db.prepare(`INSERT INTO ai_turn_ledger (accountId, turnId, outcome, billable, createdAt) VALUES (?, ?, 'completed', 1, 'x')`).run(aliceId, id)
  );
  ok('ai_turn_ledger (accountId, turnId) 唯一约束生效');
}

console.log('\n[4] 80 次先到 → exhausted_calls，409 trial_exhausted');
{
  trial.grantTrial(bobId);
  db.prepare('UPDATE trial_balance SET callsUsed = 79 WHERE accountId = ?').run(bobId);
  const last = await (await postTurn(bob, turn())).json();
  assert.strictEqual(last.counted, true, '第 80 次照常计');
  assert.strictEqual(last.balance.status, 'exhausted_calls');
  assert.strictEqual(last.balance.remainingCalls, 0);
  assert.strictEqual(last.balance.remainingDays, 0);
  const over = await (await postTurn(bob, turn())).json();
  assert.strictEqual(over.counted, false);
  assert.strictEqual(over.balance.callsUsed, 80, '用尽后不再累加');
  ok('第 80 次计入后 status=exhausted_calls；之后 counted:false');

  for (const res of [
    await aiUsageGET(req('http://localhost/api/account/ai-usage', bob)),
    await aiKeyPOST(req('http://localhost/api/account/ai-key', bob, { method: 'POST' })),
  ]) {
    assert.strictEqual(res.status, 409);
    assert.deepStrictEqual(await res.json(), { error: 'trial_exhausted' });
  }
  ok('ai-usage / ai-key → 409 {"error":"trial_exhausted"}');
}

console.log('\n[5] 14 天先到 → expired_days，409 trial_expired');
{
  trial.grantTrial(carolId);
  const past = new Date(Date.now() - 1000).toISOString();
  db.prepare('UPDATE trial_balance SET callsUsed = 5, trialEndsAt = ? WHERE accountId = ?').run(past, carolId);
  const b = await (await getTrial(carol)).json();
  assert.strictEqual(b.status, 'expired_days');
  assert.strictEqual(b.remainingDays, 0);
  assert.strictEqual(b.remainingCalls, 0);
  const r = await (await postTurn(carol, turn())).json();
  assert.strictEqual(r.counted, false);
  const res = await aiUsageGET(req('http://localhost/api/account/ai-usage', carol));
  assert.strictEqual(res.status, 409);
  assert.deepStrictEqual(await res.json(), { error: 'trial_expired' });
  ok('到期 → expired_days，counted:false，409 trial_expired');

  // 先到为准：到期已落库后，就算把次数改回来也不会复活
  db.prepare('UPDATE trial_balance SET trialEndsAt = ? WHERE accountId = ?').run(new Date(Date.now() + 86_400_000).toISOString(), carolId);
  assert.strictEqual((await (await getTrial(carol)).json()).status, 'expired_days');
  ok('终态一经落库不回退');

  // remainingDays 向上取整
  trial.grantTrial(daveId);
  const soon = new Date(Date.now() + 36 * 3_600_000).toISOString();
  db.prepare('UPDATE trial_balance SET trialEndsAt = ? WHERE accountId = ?').run(soon, daveId);
  assert.strictEqual((await (await getTrial(dave)).json()).remainingDays, 2);
  ok('剩 36 小时 → remainingDays = 2（向上取整）');
}

console.log('\n[6] 有 Credits 的账户不受试用拦截');
{
  assert.strictEqual(trial.trialBlockReason(bobId), 'trial_exhausted');
  gift(bobId);
  assert.ok(getBalance(bobId) > 0);
  assert.strictEqual(trial.trialBlockReason(bobId), null);
  ok('用尽后有 Credits（如注册赠额）→ 放行，走 Credits 计费');
}

if (siteConfig.currency === 'CNY') {
  console.log('\n[7] Pro 付款 → converted，不再计次、不拦截');
  trial.grantTrial(payerId);
  const payer = keyOf(payerId);
  await postTurn(payer, turn());
  createOrder({ id: 'TRIAL-PRO', outTradeNo: 'TRIAL-PRO', description: 'Pro', amount: 14900, status: 'pending', userId: payerId, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  settleOrderPaid('TRIAL-PRO', { transactionId: 'tx-trial-pro' });
  const b = await (await getTrial(payer)).json();
  assert.strictEqual(b.status, 'converted');
  assert.strictEqual(b.granted, true);
  assert.strictEqual(b.callsUsed, 1, '转付费不改历史计次');
  const r = await (await postTurn(payer, turn())).json();
  assert.strictEqual(r.counted, false);
  assert.strictEqual(trial.trialBlockReason(payerId), null);
  assert.strictEqual(trial.grantTrial(payerId), false);
  ok('converted：counted:false、不拦截、不再发放');

  // 没试用过直接付费：无 trial 行（fulfill 跳过 INSERT）；已付费 → grantTrial 拒绝
  const fresh = crypto.randomUUID();
  createOrder({ id: 'TRIAL-PRO-2', outTradeNo: 'TRIAL-PRO-2', description: 'Pro', amount: 14900, status: 'pending', userId: fresh, kind: 'subscription', skuId: 'pro_monthly', channel: siteConfig.paymentChannel, currency: siteConfig.currency });
  settleOrderPaid('TRIAL-PRO-2', { transactionId: 'tx-trial-pro-2' });
  assert.strictEqual(trial.grantTrial(fresh), false);
  const t = trial.getTrialBalance(fresh);
  assert.deepStrictEqual([t.status, t.granted], ['none', false]);
  ok('未试用直接付费 → 无 trial 行（skip）；之后不发放');
}

console.log('\n[8] 真付过钱的账户不发放');
{
  const paid = crypto.randomUUID();
  db.prepare(`INSERT INTO entitlements (userId, feature, orderId, createdAt) VALUES (?, 'clipboard.unlimited', 'GIFT', ?)`).run(paid, createdAt);
  assert.strictEqual(trial.grantTrial(paid), false);
  assert.strictEqual(trial.getTrialBalance(paid).status, 'none');
  ok('有有效权益 → 不发放');
}

console.log(`\n全部通过：${checked} 项`);
