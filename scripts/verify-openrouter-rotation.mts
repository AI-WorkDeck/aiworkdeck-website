/**
 * OpenRouter 账号轮换验证（无真实 key，fetch 打桩出「旧 / 新」两个账号）。
 * 必须在空目录运行（data/awd.db 建在 cwd）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-openrouter-rotation.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
for (const f of ['awd.db', 'awd.db-wal', 'awd.db-shm']) {
  assert.ok(!fs.existsSync(path.join(cwd, 'data', f)), `隔离目录残留 data/${f}`);
}
process.env.NEXT_PUBLIC_AWD_SITE = 'intl';
delete process.env.OPENROUTER_PROVISIONING_KEY;
delete process.env.OPENROUTER_PROVISIONING_KEY_RETIRED;
delete process.env.OPENROUTER_API_KEY;
process.env.AWD_KEY_ENCRYPTION_SECRET = 'rotation-secret';
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const ids = { A: crypto.randomUUID(), B: crypto.randomUUID(), C: crypto.randomUUID() };
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify(
    Object.entries(ids).map(([n, id]) => ({
      id, username: `rot-${n}`, email: `rot-${n}@test.local`, passwordHash: 'x:y', displayName: n, createdAt: new Date().toISOString(),
    }))
  )
);

const mgmt = await import('@/lib/openrouter-mgmt');
(await import('@/lib/fx-rate')).__setFxFetchForTests(async () => { throw new Error('fx offline'); });
const { syncAiQuota, reconcileAllQuotas, usdFromCents, centsFromUsd } = await import('@/lib/ai-quota');
const { getActiveKeyRow } = await import('@/lib/openrouter-keys');
const { getBalance, grantCredits } = await import('@/lib/wallet');
const { withTransaction, getDb } = await import('@/lib/db');
const rot = await import('@/lib/openrouter-rotation');
const RATE = (await import('@/lib/ai-config')).getExchangeRateInfo().rate;
const MARGIN = (await import('@/lib/circle-firms')).getUserMarginMultiplier(ids.A);

const OLD = 'mgmt-OLD-account-secret';
const NEW = 'mgmt-NEW-account-secret';
const fpOld = mgmt.accountFingerprint(OLD);
const fpNew = mgmt.accountFingerprint(NEW);
assert.ok(!fpOld.includes('OLD') && fpOld.length === 12);

// 每个账号独立的远端 key 表；用错账号的 management key 读到的是 404（真实 OpenRouter 的表现）
interface FakeKey { limit: number; usage: number; disabled: boolean }
const accounts: Record<string, Map<string, FakeKey>> = { [OLD]: new Map(), [NEW]: new Map() };
let seq = 0;
let writes = 0;
let usageOnDisable = 0; // 禁用瞬间旧账号 key 上又冒出的在途用量
mgmt.__setFetchForTests((async (input: any, init?: any) => {
  const auth = String(init?.headers?.Authorization).replace('Bearer ', '');
  const keys = accounts[auth];
  assert.ok(keys, '只允许用 OLD / NEW management key 调用');
  const method = (init?.method || 'GET').toUpperCase();
  const p = String(input).replace('https://openrouter.ai/api/v1', '');
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (p === '/keys' && method === 'POST') {
    writes++;
    const body = JSON.parse(init.body);
    const hash = `${auth === OLD ? 'old' : 'new'}-hash-${++seq}`;
    keys.set(hash, { limit: body.limit, usage: 0, disabled: false });
    return json({ data: { hash, limit: body.limit }, key: `sk-or-v1-${hash}` });
  }
  if (p.startsWith('/keys/')) {
    const hash = decodeURIComponent(p.slice(6));
    const k = keys.get(hash);
    if (!k) return json({ error: 'not found' }, 404);
    if (method === 'GET') return json({ data: { hash, limit: k.limit, usage: k.usage, limit_remaining: k.limit - k.usage, disabled: k.disabled } });
    if (method === 'PATCH') {
      writes++;
      const body = JSON.parse(init.body);
      if (body.limit !== undefined) k.limit = body.limit;
      if (body.disabled !== undefined) { k.disabled = body.disabled; if (body.disabled) k.usage += usageOnDisable; }
      return json({ data: { hash } });
    }
  }
  return json({ error: 'unexpected' }, 400);
}) as typeof fetch);

let passed = 0;
const ok = (n: string) => { passed++; console.log('  PASS', n); };
const grant = (userId: string, cents: number) => withTransaction(db => grantCredits(db, { userId, pool: 'topup', amountCents: cents, ledgerKind: 'recharge' }));
const rowOf = (userId: string) => getDb().prepare('SELECT * FROM openrouter_keys WHERE userId = ? ORDER BY id').all(userId) as any[];

// ---------- 轮换前：只有旧账号，A / B 各有一把 ----------
process.env.OPENROUTER_PROVISIONING_KEY = OLD;
grant(ids.A, 50000); grant(ids.B, 50000);
await syncAiQuota(ids.A); await syncAiQuota(ids.B);
const rowA0 = getActiveKeyRow(ids.A)!;
const rowB0 = getActiveKeyRow(ids.B)!;
assert.strictEqual(rowA0.mgmtAccount, fpOld, '新铸造的行记录铸造账号指纹');
assert.ok(rowA0.orKeyHash.startsWith('old-'));
accounts[OLD].get(rowA0.orKeyHash)!.usage = 2.0; // A 已有未回抄用量
ok('轮换前 key 都由旧账号铸造并带指纹');

// ---------- 换环境：新账号为当前，旧账号为 RETIRED ----------
process.env.OPENROUTER_PROVISIONING_KEY = NEW;
process.env.OPENROUTER_PROVISIONING_KEY_RETIRED = OLD;
// 旧 key 仍按其铸造账号读取（否则会拿 NEW 去读 old-hash 得到 404）
assert.strictEqual((await mgmt.getKey(rowA0.orKeyHash)).usageUsd, 2.0);
ok('读旧 key 自动使用旧账号 management key');
grant(ids.C, 50000);
await syncAiQuota(ids.C);
const rowC = getActiveKeyRow(ids.C)!;
assert.ok(rowC.orKeyHash.startsWith('new-') && rowC.mgmtAccount === fpNew, 'C 在新账号下铸造');
ok('新用户在新账号下铸造');

// ---------- 缺旧 key：明确拒绝 ----------
delete process.env.OPENROUTER_PROVISIONING_KEY_RETIRED;
await assert.rejects(rot.rotateRetiredAccount({ dryRun: false }), (e: any) => e.name === 'RotationError' && e.code === 'retired_key_missing' && /RETIRED/.test(e.message));
assert.strictEqual(rowOf(ids.A).length, 1);
process.env.OPENROUTER_PROVISIONING_KEY_RETIRED = OLD;
ok('未配置旧 key 时拒绝轮换且不改任何东西');

// ---------- dry-run：不写 ----------
const balA0 = getBalance(ids.A);
const w0 = writes;
const dry = await rot.rotateRetiredAccount({ dryRun: true });
assert.strictEqual(dry.dryRun, true);
assert.deepStrictEqual(dry.items.map(i => [i.userId, i.action]).sort(), [[ids.A, 'would_rotate'], [ids.B, 'would_rotate']].sort());
assert.strictEqual(writes, w0, 'dry-run 不发任何写请求');
assert.strictEqual(getBalance(ids.A), balA0, 'dry-run 不扣钱');
assert.strictEqual(rowOf(ids.A)[0].disabledAt, null);
assert.ok(JSON.stringify(dry).indexOf('secret') < 0, '输出不含 key 材料');
ok('dry-run 只读');

// ---------- 轮换：结算 → 禁用 → 退役 ----------
usageOnDisable = 0.5;
const result = await rot.rotateRetiredAccount({ dryRun: false });
assert.deepStrictEqual(result.items.map(i => i.action), ['rotated', 'rotated']);
const oldA = accounts[OLD].get(rowA0.orKeyHash)!;
assert.strictEqual(oldA.disabled, true, '旧账号上的 key 已禁用');
assert.strictEqual(oldA.usage, 2.5);
const owedA = centsFromUsd(2.0, RATE, MARGIN) + centsFromUsd(0.5, RATE, MARGIN);
assert.strictEqual(balA0 - getBalance(ids.A), owedA, '禁用前后两段用量都按真实用量结算');
const rA = rowOf(ids.A)[0];
assert.ok(rA.disabledAt, '行已退役');
assert.strictEqual(rA.settledUsageUsd, 2.5);
assert.ok(getDb().prepare('SELECT 1 FROM openrouter_rotated_key WHERE keyId = ? AND doneAt IS NULL').get(rA.id), '进入回读清单');
assert.strictEqual(getActiveKeyRow(ids.A), undefined, '不急着铸新 key');
assert.strictEqual(accounts[NEW].size, 1, '轮换本身不在新账号铸 key');
assert.strictEqual(accounts[NEW].get(rowC.orKeyHash)!.disabled, false, '当前账号铸造的行不动');
assert.strictEqual(getActiveKeyRow(ids.C)!.id, rowC.id);
ok('结算 -> 禁用 -> 退役，当前账号的行不受影响');

// ---------- 幂等 ----------
const snap = () => JSON.stringify([getDb().prepare('SELECT * FROM openrouter_keys ORDER BY id').all(), getDb().prepare('SELECT * FROM openrouter_rotated_key ORDER BY keyId').all(), getBalance(ids.A), getBalance(ids.B), getBalance(ids.C)]);
const s1 = snap(); const w1 = writes;
const again = await rot.rotateRetiredAccount({ dryRun: false });
assert.strictEqual(again.items.length, 0);
assert.strictEqual(snap(), s1);
assert.strictEqual(writes, w1);
ok('重复执行无任何变化');

// ---------- 下一次同步：新账号铸造，limit = 剩余 ----------
await syncAiQuota(ids.A);
const newA = getActiveKeyRow(ids.A)!;
assert.ok(newA.orKeyHash.startsWith('new-') && newA.mgmtAccount === fpNew);
assert.strictEqual(newA.settledUsageUsd, 0);
const expectLimit = usdFromCents(50000 - owedA, RATE, MARGIN);
assert.strictEqual(accounts[NEW].get(newA.orKeyHash)!.limit, expectLimit, 'limit = 折算(扣过用量的余额)，不重复发放');
assert.ok(expectLimit < usdFromCents(50000, RATE, MARGIN));
ok('下一次 sync 在新账号铸造，limit = 剩余');

// ---------- 迟到用量只扣一次 ----------
oldA.usage = 3.5; // 退役后又到账 1.0
const beforeLate = getBalance(ids.A);
await reconcileAllQuotas();
assert.strictEqual(beforeLate - getBalance(ids.A), centsFromUsd(1.0, RATE, MARGIN), '迟到用量经对账回读，扣一次');
await reconcileAllQuotas(); await rot.settleRotatedKeys();
assert.strictEqual(beforeLate - getBalance(ids.A), centsFromUsd(1.0, RATE, MARGIN), '重复回读不重复扣');
assert.strictEqual(getActiveKeyRow(ids.A)!.id, newA.id, '对账不重复铸 key');
ok('退役 key 的迟到用量精确扣一次');

// ---------- 收口 ----------
const rid = rowOf(ids.A)[0].id;
await rot.settleRotatedKeys(undefined, new Date(Date.now() + 25 * 3600_000));
assert.ok((getDb().prepare('SELECT doneAt FROM openrouter_rotated_key WHERE keyId = ?').get(rid) as any).doneAt, '用量 24h 不变即收口');
const bidRow = rowOf(ids.B)[0];
assert.ok((getDb().prepare('SELECT doneAt FROM openrouter_rotated_key WHERE keyId = ?').get(bidRow.id) as any).doneAt, 'B 零用量同样收口');
const afterDone = getBalance(ids.A); oldA.usage = 9;
await rot.settleRotatedKeys();
assert.strictEqual(getBalance(ids.A), afterDone, '收口后不再回读');
ok('稳定 24h 后收口');

// 宽限期：用量一直在变，7 天后也收口
getDb().prepare("UPDATE openrouter_rotated_key SET doneAt = NULL, retiredAt = ? WHERE keyId = ?").run(new Date(Date.now() - 8 * 86400_000).toISOString(), rid);
await rot.settleRotatedKeys();
assert.ok((getDb().prepare('SELECT doneAt FROM openrouter_rotated_key WHERE keyId = ?').get(rid) as any).doneAt, '超过宽限期收口');
ok('宽限期后收口');

// ---------- 管理页统计 ----------
const ov = rot.accountOverview();
assert.deepStrictEqual(ov.activeKeys.map(k => [k.role, k.count]), [['current', 3]]);
assert.strictEqual(ov.pendingRetiredKeys, 0);
ok('账号统计');

// 迁移回填：存量 NULL 行在配了旧 key 时按旧账号读
getDb().prepare('UPDATE openrouter_keys SET mgmtAccount = NULL WHERE id = ?').run(rid);
assert.strictEqual((await mgmt.getKey(rowA0.orKeyHash)).usageUsd, 9);
ok('未标记的存量行配了旧 key 时走旧账号');

console.log(`\n${passed} 项通过`);
