/**
 * AI 额度验证脚本：Credits 自动预留模型（无真实 Management key，fetch 打桩）。
 *
 * Credits 重构 P3 起，「用户手动分配额度」已下线，额度由余额自动派生：
 *   limit = 远端已用 + 折算(可用 Credits)，用量事后回抄扣 Credits。
 * 本脚本覆盖新模型 + 旧模型遗留 pending 的对账。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-w2.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
// 只查 package.json 不够：目录里残留上一轮的 data/awd.db 会让本次跑在脏数据上
// （schema_version 已推进、余额非零、ai_allocations 有历史行），
// 断言仍可能"通过"但结论不可信。库文件与 WAL 边车必须一并不存在。
for (const f of ['awd.db', 'awd.db-wal', 'awd.db-shm']) {
  assert.ok(
    !fs.existsSync(path.join(cwd, 'data', f)),
    `隔离目录残留 data/${f}，请换空目录或清空后重跑`
  );
}

// 先清掉环境变量，验证「未配置」分支
delete process.env.OPENROUTER_PROVISIONING_KEY;
delete process.env.AWD_KEY_ENCRYPTION_SECRET;
delete process.env.OPENROUTER_API_KEY;

// 隔离目录里造两个用户（users.ts 读 cwd/data/users.json）
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
const user2Id = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: userId, username: 'w2-tester', email: 'w2@test.local', passwordHash: 'x:y', displayName: 'W2', createdAt: new Date().toISOString() },
    { id: user2Id, username: 'w2-other', email: 'w2b@test.local', passwordHash: 'x:y', displayName: 'W2B', createdAt: new Date().toISOString() },
  ])
);

const mgmt = await import('@/lib/openrouter-mgmt');
// 本脚本的断言按 7.3 写死：即时汇率（dev-board#853）打桩成不可用，计费汇率固定落在站点默认值。
// 不打桩的话读汇率会在后台真去拉中间价，落盘时刻不确定，断言时红时绿。
(await import('@/lib/fx-rate')).__setFxFetchForTests(async () => {
  throw new Error('verify-w2: fx offline');
});
const { reconcileStalePending } = await import('@/lib/ai-alloc');
const { syncAiQuota, reconcileAllQuotas, usdFromCents, centsFromUsd } = await import('@/lib/ai-quota');
const { encryptKeyMaterial, decryptKeyMaterial, getActiveKeyRow } = await import('@/lib/openrouter-keys');
const { getBalance, listLedger, grantCredits, spendCredits } = await import('@/lib/wallet');
const { withTransaction, getDb } = await import('@/lib/db');
const { generateApiKey } = await import('@/lib/api-keys');
const { POST: aiKeyPOST } = await import('@/app/api/account/ai-key/route');
const { GET: aiUsageGET } = await import('@/app/api/account/ai-usage/route');
const { NextRequest } = await import('next/server');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}

const bearerReq = (key: string, url: string, method = 'GET') =>
  new NextRequest(url, { method, headers: { authorization: `Bearer ${key}` } });

// ---------- 1. 未配置分支：明确报错，不半残运行 ----------
console.log('\n[1] 未配置');
const awdk1 = generateApiKey(userId).key!;
const notCfgRes = await aiKeyPOST(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-key', 'POST'));
assert.strictEqual(notCfgRes.status, 503);
assert.strictEqual((await notCfgRes.json()).error, 'not_configured');
ok('未配置加密密钥时 ai-key 端点 503');

// ---------- 2. 配置环境 + fetch 打桩 ----------
const MGMT_KEY = 'mgmt-test-secret-do-not-log';
process.env.OPENROUTER_PROVISIONING_KEY = MGMT_KEY;
process.env.AWD_KEY_ENCRYPTION_SECRET = 'w2-encryption-secret';

interface FakeKey { name: string; limit: number; usage: number; disabled: boolean; key: string }
const orKeys = new Map<string, FakeKey>();
let keySeq = 0;
const failNext = {
  create: false,
  patch: false,
  get: false,
  /** OpenRouter 侧已应用 PATCH，但响应在回程丢失（超时/连接中断）—— over-grant 的成因 */
  patchAfterApply: false,
  /** 配合 patchAfterApply：连随后的实查 getKey 也失败，制造"结果不可知" */
  getFailsAfterLostPatch: false,
};

const fakeFetch: typeof fetch = async (input: any, init?: any) => {
  const url = String(input);
  const method = (init?.method || 'GET').toUpperCase();
  assert.strictEqual(init?.headers?.Authorization, `Bearer ${MGMT_KEY}`, '必须带 Management key');
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  const p = url.replace('https://openrouter.ai/api/v1', '');
  if (p === '/keys' && method === 'POST') {
    if (failNext.create) { failNext.create = false; return json({ error: 'boom' }, 500); }
    const body = JSON.parse(init.body);
    const hash = `hash-${++keySeq}`;
    const key = `sk-or-v1-fake-${crypto.randomBytes(8).toString('hex')}`;
    orKeys.set(hash, { name: body.name, limit: body.limit, usage: 0, disabled: false, key });
    return json({ data: { hash, name: body.name, limit: body.limit }, key });
  }
  if (p.startsWith('/keys/')) {
    const hash = decodeURIComponent(p.slice('/keys/'.length));
    const k = orKeys.get(hash);
    if (method === 'GET') {
      if (failNext.get) { failNext.get = false; return json({ error: 'boom' }, 500); }
      if (!k) return json({ error: 'not found' }, 404);
      return json({ data: { hash, name: k.name, limit: k.limit, usage: k.usage, limit_remaining: Math.max(k.limit - k.usage, 0), disabled: k.disabled } });
    }
    if (method === 'PATCH') {
      if (failNext.patch) { failNext.patch = false; return json({ error: 'boom' }, 500); }
      if (!k) return json({ error: 'not found' }, 404);
      const body = JSON.parse(init.body);
      if (body.limit !== undefined) k.limit = body.limit;
      if (body.disabled !== undefined) k.disabled = body.disabled;
      if (failNext.patchAfterApply) {
        // 变更已在"远端"落定，只是调用方拿不到响应。
        failNext.patchAfterApply = false;
        if (failNext.getFailsAfterLostPatch) {
          failNext.getFailsAfterLostPatch = false;
          failNext.get = true; // 让紧随其后的实查 getKey 也失败
        }
        throw new Error('simulated: connection reset after apply');
      }
      return json({ data: { hash, limit: k.limit, disabled: k.disabled } });
    }
  }
  if (p === '/credits' && method === 'GET') {
    return json({ data: { total_credits: 100, total_usage: 12.5 } });
  }
  return json({ error: `unexpected ${method} ${p}` }, 400);
};
mgmt.__setFetchForTests(fakeFetch);


// ---------- 3. 加解密往返与防篡改 ----------
console.log('\n[3] encKey AES-256-GCM');
const secretText = 'sk-or-v1-roundtrip-material';
const enc = encryptKeyMaterial(secretText);
assert.strictEqual(decryptKeyMaterial(enc), secretText);
assert.ok(!enc.includes('roundtrip'), '密文不含明文');
const tampered = enc.split(':');
tampered[3] = Buffer.from('tampered-payload').toString('base64');
assert.throws(() => decryptKeyMaterial(tampered.join(':')), '篡改密文必须解密失败');
ok('加解密往返成功，密文不含明文，篡改即失败');

// ---------- 4. 折算：进向下、出向上（刻意不对称，成本不能少收） ----------
console.log('\n[4] 折算方向');
assert.strictEqual(usdFromCents(2000, 7.3, 1.2), 2.28);   // 20 元 → 2.2831 → 2.28
assert.strictEqual(usdFromCents(876, 7.3, 1.2), 1.0);     // 整除边界
assert.strictEqual(usdFromCents(877, 7.3, 1.2), 1.0);     // 1.0011 不向上
assert.strictEqual(usdFromCents(1, 7.3, 1.2), 0);
assert.strictEqual(centsFromUsd(1, 7.3, 1.2), 876);       // 1 美元用量 → 876 分
assert.strictEqual(centsFromUsd(0.001, 7.3, 1.2), 1);     // 极小用量向上取整到 1 分，不白送
ok('入账折算向下取整、用量折算向上取整');

// ---------- 5. 零 Credits：不开 key，且文案不得像掉线 ----------
console.log('\n[5] 零 Credits');
assert.strictEqual(getBalance(userId), 0);
const noCredit = await aiKeyPOST(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-key', 'POST'));
assert.strictEqual(noCredit.status, 409);
const noCreditBody = await noCredit.json();
assert.strictEqual(noCreditBody.error, 'no_credits');
// 文案红线：桌面端 api.js 对含「登录」「未授权」「请先」的 message 判为掉线并清会话
for (const banned of ['登录', '未授权', '请先']) {
  assert.ok(!String(noCreditBody.message).includes(banned), `错误文案不得含「${banned}」`);
}
assert.strictEqual(getActiveKeyRow(userId), undefined, '零余额不建 key，避免孤儿 key');
ok('零 Credits → 409 no_credits，不建 key，文案不像掉线');

// ---------- 6. 充值后自动开 key，limit 派生自余额 ----------
console.log('\n[6] 自动开 key');
withTransaction(db => grantCredits(db, { userId, pool: 'topup', amountCents: 50000, ledgerKind: 'recharge' }));
const keyRes = await aiKeyPOST(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-key', 'POST'));
assert.strictEqual(keyRes.status, 200);
const keyBody = await keyRes.json();
assert.deepStrictEqual(Object.keys(keyBody).sort(), ['limitUsd', 'openrouterKey']);
const expectLimit0 = usdFromCents(50000, 7.3, 1.2);
assert.strictEqual(keyBody.limitUsd, expectLimit0, 'limit = 折算(余额)，无需任何「分配」动作');
const row0 = getActiveKeyRow(userId)!;
assert.strictEqual(decryptKeyMaterial(row0.encKey!), keyBody.openrouterKey);
assert.strictEqual(getBalance(userId), 50000, '开 key 不扣钱——钱只在用量发生时扣');
ok('有 Credits 即自动开 key，limit 派生自余额，开 key 不扣钱');

// 幂等：反复调恒返回同一把（server 模式 per-user 计费隔离的前提）
const again = await (await aiKeyPOST(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-key', 'POST'))).json();
assert.strictEqual(again.openrouterKey, keyBody.openrouterKey);
assert.strictEqual((getDb().prepare('SELECT COUNT(*) AS c FROM openrouter_keys WHERE userId = ?').get(userId) as { c: number }).c, 1);
ok('ai-key 幂等：同账户恒返回同一把 key');

// ---------- 7. 用量回抄 ----------
console.log('\n[7] 用量回抄扣 Credits');
const usage1 = await (await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'))).json();
assert.strictEqual(usage1.usageAvailable, true);
assert.strictEqual(usage1.hasKey, true);
assert.strictEqual(usage1.creditsCents, 50000);
assert.strictEqual(getBalance(userId), 50000, '零用量不扣钱');
ok('首次同步：建立用量水位，不扣钱');

orKeys.get(row0.orKeyHash)!.usage = 2.0;
const before7 = getBalance(userId);
const usage2 = await (await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'))).json();
const owed = centsFromUsd(2.0, 7.3, 1.2);
assert.strictEqual(getBalance(userId), before7 - owed, '新增用量按实际消耗扣 Credits');
assert.strictEqual(usage2.creditsCents, before7 - owed);
assert.strictEqual(usage2.usageUsd, 2.0);
const led = listLedger(userId).entries[0];
assert.strictEqual(led.kind, 'ai_alloc');
assert.strictEqual(led.amountCents, -owed);
ok('用量增长 → 折成 Credits 扣减并留流水');

// 同一笔用量不得被重复扣
const before7b = getBalance(userId);
await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'));
assert.strictEqual(getBalance(userId), before7b, '水位已推进，重复同步不重复扣');
ok('用量水位幂等：重复同步不二次扣费');

// ---------- 8. limit 跟随余额（降额） ----------
console.log('\n[8] limit 跟随余额');
withTransaction(db => spendCredits(db, { userId, amountCents: 30000, ledgerKind: 'purchase' }));
const afterSpend = await (await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'))).json();
const expectLimit1 = Math.round((2.0 + usdFromCents(getBalance(userId), 7.3, 1.2)) * 100) / 100;
assert.strictEqual(afterSpend.limitUsd, expectLimit1, 'limit = 已用 + 折算(剩余余额)');
assert.strictEqual(orKeys.get(row0.orKeyHash)!.limit, expectLimit1, '远端已降额');
ok('Credits 花在别处后，AI 上限自动下调');

// ---------- 9. 上游故障：200 + usageAvailable=false，绝不 4xx ----------
console.log('\n[9] 上游故障降级');
failNext.get = true;
const degraded = await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'));
assert.strictEqual(degraded.status, 200, '桌面端把 4xx 判为凭据失效并清账户缓存，绝不能回 4xx');
const dBody = await degraded.json();
assert.strictEqual(dBody.usageAvailable, false);
assert.strictEqual(dBody.creditsCents, getBalance(userId), 'Credits 是本地事实，照常返回');
ok('上游不可达 → 200 + usageAvailable=false，Credits 不受影响');

// ---------- 10. patch 失败不是丢钱事故 ----------
console.log('\n[10] patch 失败');
const before10 = getBalance(userId);
failNext.patch = true;
withTransaction(db => grantCredits(db, { userId, pool: 'topup', amountCents: 10000, ledgerKind: 'recharge' }));
await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'));
assert.strictEqual(getBalance(userId), before10 + 10000, 'patch 失败不影响余额（钱只按用量扣）');
// 下一次同步应当自愈
const healed = await (await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'))).json();
const expectLimit2 = Math.round((2.0 + usdFromCents(getBalance(userId), 7.3, 1.2)) * 100) / 100;
assert.strictEqual(healed.limitUsd, expectLimit2, '下次同步自动补上提额');
ok('patch 失败只是阀门没动，钱分文不错，下次同步自愈');

// ---------- 11. 超支保护：余额不足只扣到 0，绝不为负 ----------
console.log('\n[11] 有界超支');
const row11 = getActiveKeyRow(userId)!;
withTransaction(db => spendCredits(db, { userId, amountCents: getBalance(userId), ledgerKind: 'purchase' }));
assert.strictEqual(getBalance(userId), 0);
orKeys.get(row11.orKeyHash)!.usage = 50.0; // 远端超支
await aiUsageGET(bearerReq(awdk1.plaintextKey, 'http://localhost/api/account/ai-usage'));
assert.strictEqual(getBalance(userId), 0, '余额扣到 0 为止，绝不为负');
const shortfall = getDb()
  .prepare("SELECT COUNT(*) AS c FROM admin_audit WHERE action = 'ai_usage_shortfall'")
  .get() as { c: number };
assert.ok(shortfall.c >= 1, '缺口必须留痕给运营');
ok('超支时余额扣到 0 为止并写 admin_audit 留痕');

// ---------- 12. 遗留 pending 对账（旧模型残留） ----------
console.log('\n[12] 遗留 pending 对账');
const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString();
withTransaction(db => grantCredits(db, { userId: user2Id, pool: 'topup', amountCents: 5000, ledgerKind: 'recharge' }));
const spend12 = withTransaction(db =>
  spendCredits(db, { userId: user2Id, amountCents: 1000, ledgerKind: 'ai_alloc', meta: { legacy: true } })
);
getDb()
  .prepare(
    `INSERT INTO ai_allocations (id, userId, amountCents, usdDelta, status, orKeyHash, expectedLimitUsd, createdAt, spendLedgerId)
     VALUES ('legacy-1', ?, 1000, 1.14, 'pending', NULL, NULL, ?, ?)`
  )
  .run(user2Id, staleTs, spend12.id);
await reconcileStalePending();
assert.strictEqual(getBalance(user2Id), 5000, '未走到上游的 pending → 原额退回');
const legacyRow = getDb().prepare("SELECT status FROM ai_allocations WHERE id = 'legacy-1'").get() as { status: string };
assert.strictEqual(legacyRow.status, 'failed');
ok('遗留 pending：未走到上游即中断 → 置 failed 并原批次退款');

// 退款必须回到原批次，而不是凭空造出可提现的 topup
const bd12 = (await import('@/lib/credits')).getBalanceBreakdown(user2Id);
assert.strictEqual(bd12.topupCents, 5000);
assert.strictEqual(bd12.rewardCents, 0);
ok('遗留退款按原批次还原，不产生额外可提现额度');

// ---------- 13. 定时对账扫描 ----------
console.log('\n[13] reconcileAllQuotas');
const scan = await reconcileAllQuotas();
assert.ok(scan.scanned >= 1, '应扫到有 key 的账户');
assert.strictEqual(scan.failed, 0);
ok(`定时对账扫描 ${scan.scanned} 个账户，无失败`);

console.log(`\n全部通过：${passed} 项`);
