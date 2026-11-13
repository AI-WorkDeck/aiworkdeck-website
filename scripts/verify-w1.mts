/**
 * PR-W1 动态验证脚本：钱包账本 / 充值幂等 / AWD Key / Bearer 鉴权 / verify-key。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-w1.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

// 隔离目录里造一个用户（users.ts 读 cwd/data/users.json）
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    {
      id: userId,
      username: 'w1-tester',
      email: 'w1@test.local',
      passwordHash: 'x:y',
      displayName: 'W1 Tester',
      createdAt: new Date().toISOString(),
    },
  ])
);

const { createOrder, getOrder } = await import('@/lib/orders');
const { getBalance, listLedger, settleOrderPaid, grantCredits, spendCredits, getPlan } = await import('@/lib/wallet');
const { withTransaction, getDb } = await import('@/lib/db');
const { generateApiKey, listApiKeys, revokeApiKey, MAX_ACTIVE_KEYS } = await import('@/lib/api-keys');
const { resolveKeyUser } = await import('@/lib/account-auth');
const { GET: meGET } = await import('@/app/api/account/me/route');
const { GET: ledgerGET } = await import('@/app/api/account/ledger/route');
const { POST: verifyKeyPOST } = await import('@/app/api/license/verify-key/route');
const { NextRequest } = await import('next/server');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}

// ---------- 1. 充值闭环 + 回调重放幂等 ----------
console.log('\n[1] 充值入账与回调重放');
assert.strictEqual(getPlan(userId), 'free');
const outTradeNo = 'RECHARGE-TEST-001';
createOrder({
  id: outTradeNo,
  outTradeNo,
  description: '钱包充值',
  amount: 10000,
  status: 'pending',
  userId,
  kind: 'recharge',
});
const first = settleOrderPaid(outTradeNo, { transactionId: 'wx-tx-1' });
assert.strictEqual(first?.alreadyPaid, false);
assert.strictEqual(getBalance(userId), 10000);
assert.strictEqual(listLedger(userId).total, 1);
ok('首次回调：paid + 入账一行，余额 10000 分');

const replay = settleOrderPaid(outTradeNo, { transactionId: 'wx-tx-1' });
assert.strictEqual(replay?.alreadyPaid, true);
assert.strictEqual(getBalance(userId), 10000);
assert.strictEqual(listLedger(userId).total, 1);
ok('回调重放：alreadyPaid=true，不重复入账，余额不变');

// support 订单结算不动钱包
const supNo = 'SUPPORT-TEST-001';
createOrder({ id: supNo, outTradeNo: supNo, description: '打赏', amount: 500, status: 'pending', kind: 'support' });
settleOrderPaid(supNo, {});
assert.strictEqual(listLedger(userId).total, 1);
ok('support 订单结算不写钱包账本');

// ---------- 2. Credits 批次记账与约束 ----------
console.log('\n[2] 余额 = 未过期批次之和');
withTransaction(db => {
  spendCredits(db, { userId, amountCents: 3000, ledgerKind: 'purchase' });
});
assert.strictEqual(getBalance(userId), 7000);
const { entries } = listLedger(userId);
assert.strictEqual(entries[0].balanceAfterCents, 7000);
ok('扣 3000 后余额 7000，流水快照一致');

assert.throws(
  () => withTransaction(db => spendCredits(db, { userId, amountCents: 999999, ledgerKind: 'ai_alloc' })),
  /Credits 不足/
);
assert.strictEqual(getBalance(userId), 7000);
ok('透支被拒且事务回滚，余额不变');

assert.throws(() => withTransaction(db => grantCredits(db, { userId, pool: 'topup', amountCents: -100, ledgerKind: 'recharge' })));
assert.throws(() => withTransaction(db => spendCredits(db, { userId, amountCents: -100, ledgerKind: 'ai_alloc' })));
ok('金额必须为正整数（发放与扣减各自校验）');

// 事务原子性：入账后抛错须整体回滚
assert.throws(() =>
  withTransaction(db => {
    grantCredits(db, { userId, pool: 'reward', amountCents: 1234, ledgerKind: 'earning' });
    throw new Error('boom');
  })
);
assert.strictEqual(getBalance(userId), 7000);
ok('事务中途抛错，批次与账本行一并回滚');

// 不变式强制：事务外直接改 Credits 必须抛错
assert.throws(
  () => grantCredits(getDb(), { userId, pool: 'reward', amountCents: 1, ledgerKind: 'earning' }),
  /必须在事务内/
);
assert.strictEqual(getBalance(userId), 7000);
ok('Credits 变更事务外调用被强制拒绝');

// ---------- 3. AWD Key 生命周期 + Bearer 端点 ----------
console.log('\n[3] AWD Key 与 Bearer 鉴权');
const k1 = generateApiKey(userId).key!;
const k2 = generateApiKey(userId).key!;
const k3 = generateApiKey(userId).key!;
for (let i = 3; i < MAX_ACTIVE_KEYS; i++) assert.ok(generateApiKey(userId).key);
assert.strictEqual(generateApiKey(userId).error, 'key_limit_reached');
assert.strictEqual(listApiKeys(userId).length, MAX_ACTIVE_KEYS);
assert.ok(k1.plaintextKey.startsWith('awdk_') && k1.plaintextKey.length === 48);
assert.strictEqual(k1.info.prefix, k1.plaintextKey.slice(0, 12));
ok('生成 3 个 key（awdk_ 前缀、48 字符、前 12 字符前缀），第 4 个被拒');

const bearerReq = (key: string, url = 'http://localhost/api/account/me') =>
  new NextRequest(url, { headers: { authorization: `Bearer ${key}` } });

const meRes = await meGET(bearerReq(k1.plaintextKey));
assert.strictEqual(meRes.status, 200);
const me = await meRes.json();
assert.deepStrictEqual(Object.keys(me).sort(), ['accountId', 'balanceCents', 'createdAt', 'displayName', 'plan', 'username']);
assert.strictEqual(me.username, 'w1-tester');
assert.strictEqual(me.balanceCents, 7000);
assert.strictEqual(me.plan, 'paid');
ok('GET /api/account/me 契约字段逐字对齐，plan=paid（有成功 recharge）');

const ledgerRes = await ledgerGET(bearerReq(k2.plaintextKey, 'http://localhost/api/account/ledger?limit=50'));
assert.strictEqual(ledgerRes.status, 200);
const ledger = await ledgerRes.json();
assert.ok(Array.isArray(ledger.entries) && ledger.entries.length === 2);
assert.deepStrictEqual(Object.keys(ledger.entries[0]).sort(), ['amountCents', 'kind', 'meta', 'ts']);
assert.strictEqual(ledger.entries[1].kind, 'recharge');
assert.strictEqual(ledger.entries[1].meta.outTradeNo, outTradeNo);
ok('GET /api/account/ledger 契约 {entries:[{ts,kind,amountCents,meta}]}');

const noAuthRes = await meGET(new NextRequest('http://localhost/api/account/me'));
assert.strictEqual(noAuthRes.status, 401);
ok('无 Authorization 头 → 401');

// limit 边界：空串/0/负数一律回落默认值（不能被 Number('')===0 钳成 1 条），合法值正常生效
for (const bad of ['limit=', 'limit=0', 'limit=-3', 'limit=abc']) {
  const res = await ledgerGET(bearerReq(k2.plaintextKey, `http://localhost/api/account/ledger?${bad}`));
  const body = await res.json();
  assert.strictEqual(body.entries.length, 2, `${bad} 应回落默认 50 拿到全部 2 条`);
}
const one = await (await ledgerGET(bearerReq(k2.plaintextKey, 'http://localhost/api/account/ledger?limit=1'))).json();
assert.strictEqual(one.entries.length, 1);
ok('limit 空串/0/负数/非数字回落默认值，limit=1 正常截断');

// 吊销后 Bearer 立即失效
assert.strictEqual(revokeApiKey(userId, k3.info.id), true);
assert.strictEqual(resolveKeyUser(bearerReq(k3.plaintextKey)), null);
const revokedRes = await meGET(bearerReq(k3.plaintextKey));
assert.strictEqual(revokedRes.status, 401);
assert.strictEqual(listApiKeys(userId).length, 2);
ok('吊销后同一 key 的 Bearer 请求立即 401');

// 别人的 key 不能被本人 revoke 接口越权吊销（不同 userId）
assert.strictEqual(revokeApiKey('someone-else', k1.info.id), false);
ok('revoke 强制属主校验');

// ---------- 4. verify-key：有效/无效/恒定时间 ----------
console.log('\n[4] POST /api/license/verify-key');
const postVerify = (body: string) =>
  verifyKeyPOST(
    new NextRequest('http://localhost/api/license/verify-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  );

const vOk = await (await postVerify(JSON.stringify({ key: k1.plaintextKey }))).json();
assert.deepStrictEqual(vOk, { valid: true, plan: 'paid' });
const vBad = await (await postVerify(JSON.stringify({ key: 'awdk_' + crypto.randomBytes(32).toString('base64url') }))).json();
assert.deepStrictEqual(vBad, { valid: false });
const vRevoked = await (await postVerify(JSON.stringify({ key: k3.plaintextKey }))).json();
assert.deepStrictEqual(vRevoked, { valid: false });
const vGarbage = await (await postVerify('not-json')).json();
assert.deepStrictEqual(vGarbage, { valid: false });
ok('有效 → {valid:true,plan}；不存在/已吊销/坏 body → 一律 {valid:false}');

// 恒定时间粗测：不存在 vs 已吊销 vs 格式错误 三类 false 路径中位数耗时应同量级
async function median(body: string, n: number): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = process.hrtime.bigint();
    await postVerify(body);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(n / 2)];
}
const N = 300;
const mMissing = await median(JSON.stringify({ key: 'awdk_' + crypto.randomBytes(32).toString('base64url') }), N);
const mRevoked = await median(JSON.stringify({ key: k3.plaintextKey }), N);
const mMalformed = await median(JSON.stringify({ key: 'totally-wrong-format' }), N);
console.log(`  median ms: missing=${mMissing.toFixed(4)} revoked=${mRevoked.toFixed(4)} malformed=${mMalformed.toFixed(4)}`);
const spread = Math.max(mMissing, mRevoked, mMalformed) / Math.min(mMissing, mRevoked, mMalformed);
assert.ok(spread < 2, `false 路径耗时差异过大: x${spread.toFixed(2)}`);
ok(`false 三路径中位耗时同量级（最大/最小 = x${spread.toFixed(2)}）`);

console.log(`\n全部通过：${passed} 项`);
