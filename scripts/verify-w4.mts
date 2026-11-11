/**
 * PR-W4 动态验证脚本：兑换码（gift code）体系。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 等会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-w4.mts
 *
 * 覆盖：
 * - 码格式与批量生成（200 枚上限、无重码、面额/权益校验）
 * - 归一化（大小写/空格/缺连字符）与试用码前缀不混淆
 * - recharge 兑换：入账金额、余额派生一致、gift_codes 核销字段
 * - entitlement 兑换：发权益、已拥有时不消耗码、换人可兑
 * - 撤销后不可兑换；已核销的码不可撤销
 * - **多进程并发兑换同一码只成功一次**（真起子进程，不是同进程串行）
 * - 派发失败整体回滚，码不被白吃
 * - admin 路由鉴权与生成/列表/撤销闭环
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const selfPath = fileURLToPath(import.meta.url);

// ---------- 子进程模式：并发兑换的一个参与者 ----------
if (process.argv[2] === '--redeem-worker') {
  const [, , , code, workerUserId] = process.argv;
  const { redeemGiftCode } = await import('@/lib/gift-codes');
  const result = redeemGiftCode(workerUserId, code);
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

// ---------- 0. 隔离数据 ----------
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const aliceId = crypto.randomUUID();
const bobId = crypto.randomUUID();
const authorId = crypto.randomUUID();
const now = new Date().toISOString();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: aliceId, username: 'w4-alice', email: 'a@test.local', passwordHash: 'x:y', displayName: 'Alice', createdAt: now },
    { id: bobId, username: 'w4-bob', email: 'b@test.local', passwordHash: 'x:y', displayName: 'Bob', createdAt: now },
    { id: authorId, username: 'w4-author', email: 'c@test.local', passwordHash: 'x:y', displayName: 'Author', createdAt: now },
  ])
);
fs.writeFileSync(
  path.join(cwd, 'data', 'skills.json'),
  JSON.stringify([
    {
      id: 'w4-paid-skill', name: '付费技能', description: 'test', icon: '◆', version: '1.0.0',
      triggers: ['t'], allowedTools: [], prompt: 'p', authorId, downloads: 0,
      createdAt: now, updatedAt: now, priceCents: 1290, pricingModel: 'once',
    },
  ])
);

process.env.AWD_ADMIN_TOKEN = 'w4-admin-token-0123456789';

const {
  generateGiftCodes, redeemGiftCode, revokeGiftCode, listGiftCodes,
  normalizeCode, isGrantableFeature, MAX_BATCH,
} = await import('@/lib/gift-codes');
const { getDb } = await import('@/lib/db');
const { getBalance } = await import('@/lib/wallet');
const { generateApiKey } = await import('@/lib/api-keys');
const { NextRequest } = await import('next/server');
const {
  GET: adminGiftGET, POST: adminGiftPOST, PATCH: adminGiftPATCH,
} = await import('@/app/api/admin/gift-codes/route');
const { POST: redeemPOST } = await import('@/app/api/account/redeem/route');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}
const CODE_RE = /^AWDG-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/;
const count = (sql: string, ...args: unknown[]) =>
  (getDb().prepare(sql).get(...args) as { c: number }).c;
const codeRow = (code: string) =>
  getDb().prepare('SELECT * FROM gift_codes WHERE code = ?').get(code) as any;
const adminReq = (body?: unknown, method = 'GET') =>
  new NextRequest('http://localhost/api/admin/gift-codes', {
    method,
    headers: { cookie: `awd_admin=${process.env.AWD_ADMIN_TOKEN}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

// ---------- 1. 迁移与码格式 ----------
console.log('\n[1] 迁移与码格式');
assert.strictEqual(
  count("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='gift_codes'"),
  1,
  'gift_codes 表已建'
);
assert.strictEqual(
  count('SELECT MAX(version) AS c FROM schema_version'),
  5,
  '迁移已推进到 version 5'
);
ok('迁移 version 5：gift_codes 表建成');

const batch = generateGiftCodes({
  count: MAX_BATCH, kind: 'recharge', amountCents: 5000, note: '批量测试', createdBy: 'admin',
});
assert.ok('codes' in batch);
assert.strictEqual(batch.codes.length, 200);
for (const c of batch.codes) assert.ok(CODE_RE.test(c), `码格式不符: ${c}`);
assert.strictEqual(new Set(batch.codes).size, 200, '批量生成无重码');
assert.strictEqual(count('SELECT COUNT(DISTINCT code) AS c FROM gift_codes'), 200, '入库也无重码');
ok(`批量生成 ${MAX_BATCH} 枚：格式 AWDG-XXXX-XXXX-XXXX、无重码`);

assert.deepStrictEqual(
  generateGiftCodes({ count: 201, kind: 'recharge', amountCents: 100, createdBy: 'admin' }),
  { error: 'invalid_count' }
);
assert.deepStrictEqual(
  generateGiftCodes({ count: 0, kind: 'recharge', amountCents: 100, createdBy: 'admin' }),
  { error: 'invalid_count' }
);
assert.deepStrictEqual(
  generateGiftCodes({ count: 1, kind: 'recharge', amountCents: 0, createdBy: 'admin' }),
  { error: 'invalid_amount' }
);
assert.deepStrictEqual(
  generateGiftCodes({ count: 1, kind: 'recharge', amountCents: 1000001, createdBy: 'admin' }),
  { error: 'invalid_amount' }
);
assert.deepStrictEqual(
  generateGiftCodes({ count: 1, kind: 'entitlement', feature: 'made.up', createdBy: 'admin' }),
  { error: 'invalid_feature' }
);
assert.strictEqual(count('SELECT COUNT(*) AS c FROM gift_codes'), 200, '被拒的批次一枚都没落库');
ok('非法数量/面额/权益一律拒绝，且不留半截数据');

assert.ok(isGrantableFeature('clipboard.unlimited'));
assert.ok(isGrantableFeature('skill:w4-paid-skill'));
assert.ok(!isGrantableFeature('skill:not-exist'));
assert.ok(!isGrantableFeature('plan.pro'));
ok('可赠送权益白名单：功能 SKU 与存在的 Skill 放行，臆造的一律挡下');

// ---------- 2. 归一化 ----------
console.log('\n[2] 归一化');
const sample = batch.codes[0];
const compact = sample.replace(/-/g, '');
assert.strictEqual(normalizeCode(sample), sample);
assert.strictEqual(normalizeCode(sample.toLowerCase()), sample);
assert.strictEqual(normalizeCode(`  ${sample}  `), sample);
assert.strictEqual(normalizeCode(compact), sample, '无连字符也认');
assert.strictEqual(normalizeCode(`AWD${compact.slice(4)}`), null, '前缀必须是 AWDG');
assert.strictEqual(normalizeCode('AWD-T-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'), null, '试用码不被当成兑换码');
assert.strictEqual(normalizeCode('AWDG-0000-1111-8888'), null, 'base32 不含 0/1/8/9');
assert.strictEqual(normalizeCode(null), null);
ok('大小写/空格/缺连字符归一，试用码与非法字符挡下');

// ---------- 3. recharge 兑换：入账与余额派生 ----------
console.log('\n[3] recharge 兑换');
const rechargeCode = batch.codes[1];
assert.strictEqual(getBalance(aliceId), 0);
const r1 = redeemGiftCode(aliceId, rechargeCode.toLowerCase());
assert.ok('ok' in r1);
assert.strictEqual(r1.kind, 'recharge');
assert.strictEqual(r1.amountCents, 5000);
assert.strictEqual(r1.balanceCents, 5000);
assert.strictEqual(getBalance(aliceId), 5000, '余额派生与返回值一致');
const ledgerRow = getDb()
  .prepare('SELECT * FROM wallet_ledger WHERE userId = ? ORDER BY id DESC LIMIT 1')
  .get(aliceId) as any;
assert.strictEqual(ledgerRow.kind, 'recharge');
assert.strictEqual(ledgerRow.amountCents, 5000);
assert.strictEqual(ledgerRow.balanceAfterCents, 5000);
assert.strictEqual(ledgerRow.refOrderId, null, '兑换码不挂订单号');
assert.strictEqual(JSON.parse(ledgerRow.meta).giftCode, rechargeCode, 'meta 留码号可追溯');
const redeemedRow = codeRow(rechargeCode);
assert.strictEqual(redeemedRow.redeemedByUserId, aliceId);
assert.ok(redeemedRow.redeemedAt);
ok('入账金额正确、余额派生一致、核销字段与 meta 追溯齐全');

// 第二枚码继续累加，balanceAfterCents 是 running balance
const r2 = redeemGiftCode(aliceId, batch.codes[2]);
assert.ok('ok' in r2);
assert.strictEqual(r2.balanceCents, 10000);
assert.strictEqual(getBalance(aliceId), 10000);
assert.strictEqual(count('SELECT COUNT(*) AS c FROM wallet_ledger WHERE userId = ?', aliceId), 2);
ok('连续兑换：running balance 逐笔累加，无双账本');

// 重复兑换同一码
assert.deepStrictEqual(redeemGiftCode(aliceId, rechargeCode), { error: 'already_redeemed' });
assert.deepStrictEqual(redeemGiftCode(bobId, rechargeCode), { error: 'already_redeemed' });
assert.strictEqual(count('SELECT COUNT(*) AS c FROM wallet_ledger WHERE userId = ?', aliceId), 2);
assert.strictEqual(getBalance(bobId), 0);
ok('已核销码：本人与他人再兑均 already_redeemed，不产生任何入账');

assert.deepStrictEqual(redeemGiftCode(aliceId, 'AWDG-AAAA-AAAA-AAAA'), { error: 'not_found' });
assert.deepStrictEqual(redeemGiftCode(aliceId, 'garbage'), { error: 'invalid_code' });
ok('不存在 → not_found；格式错 → invalid_code');

// ---------- 4. 撤销 ----------
console.log('\n[4] 撤销');
const revokeTarget = batch.codes[3];
assert.strictEqual(revokeGiftCode(revokeTarget, 'admin'), true);
assert.ok(codeRow(revokeTarget).revokedAt);
assert.deepStrictEqual(redeemGiftCode(bobId, revokeTarget), { error: 'revoked' });
assert.strictEqual(getBalance(bobId), 0, '撤销码兑换不入账');
assert.strictEqual(revokeGiftCode(revokeTarget, 'admin'), false, '重复撤销无效');
assert.strictEqual(revokeGiftCode(rechargeCode, 'admin'), false, '已核销的码不可撤销');
assert.strictEqual(codeRow(rechargeCode).revokedAt, null, '已核销码不会被打上撤销标记');
ok('撤销后不可兑换；已核销/已撤销的码不可再撤销');

// ---------- 5. entitlement 兑换 ----------
console.log('\n[5] entitlement 兑换');
const entBatch = generateGiftCodes({
  count: 2, kind: 'entitlement', feature: 'clipboard.unlimited', note: '权益码', createdBy: 'admin',
});
assert.ok('codes' in entBatch);
const [entCode, entSpare] = entBatch.codes;
const e1 = redeemGiftCode(aliceId, entCode);
assert.ok('ok' in e1);
assert.strictEqual(e1.kind, 'entitlement');
assert.strictEqual(e1.feature, 'clipboard.unlimited');
const entRow = getDb()
  .prepare('SELECT * FROM entitlements WHERE userId = ? AND feature = ?')
  .get(aliceId, 'clipboard.unlimited') as any;
assert.ok(entRow, 'entitlements 行已写');
assert.strictEqual(entRow.orderId, `gift:${entCode}`, '权益挂回兑换码，来源可追');
assert.strictEqual(count('SELECT COUNT(*) AS c FROM wallet_ledger WHERE userId = ?', aliceId), 2, '权益码不动钱包');
ok('权益码：写 entitlements 行、orderId 记 gift:<code>、不动钱包');

// 幂等：同一 feature 的第二枚码不重复发权益，且不消耗该码
assert.deepStrictEqual(redeemGiftCode(aliceId, entSpare), { error: 'already_owned' });
assert.strictEqual(
  count("SELECT COUNT(*) AS c FROM entitlements WHERE userId = ? AND feature = 'clipboard.unlimited'", aliceId),
  1,
  '权益不重复'
);
assert.strictEqual(codeRow(entSpare).redeemedByUserId, null, '已拥有时码不被消耗，可转赠他人');
ok('已拥有该权益：幂等不重复发放，且备用码未被吃掉');

// 换个人可以兑
const e2 = redeemGiftCode(bobId, entSpare);
assert.ok('ok' in e2);
assert.strictEqual(codeRow(entSpare).redeemedByUserId, bobId);
assert.strictEqual(count('SELECT COUNT(*) AS c FROM entitlements'), 2);
ok('同一枚备用码由他人兑换成功');

// Skill 权益码
const skillBatch = generateGiftCodes({
  count: 1, kind: 'entitlement', feature: 'skill:w4-paid-skill', createdBy: 'admin',
});
assert.ok('codes' in skillBatch);
const skillResult = redeemGiftCode(bobId, skillBatch.codes[0]);
assert.ok('ok' in skillResult);
assert.ok(
  getDb().prepare('SELECT 1 AS x FROM entitlements WHERE userId = ? AND feature = ?').get(bobId, 'skill:w4-paid-skill')
);
ok('赠送付费 Skill：权益名 skill:<id>，与购买链路同口径');

// ---------- 6. 派发失败整体回滚 ----------
console.log('\n[6] 派发失败回滚');
const brokenCode = batch.codes[4];
getDb().prepare('UPDATE gift_codes SET payloadJson = ? WHERE code = ?').run('{not json', brokenCode);
const balanceBefore = getBalance(bobId);
assert.throws(() => redeemGiftCode(bobId, brokenCode));
assert.strictEqual(codeRow(brokenCode).redeemedByUserId, null, '核销标记随事务回滚');
assert.strictEqual(getBalance(bobId), balanceBefore, '余额不变');
ok('派发抛错：核销与入账整体回滚，码不被白吃');

// 上面那条坏在 JSON.parse，发生在抢占**之前**——回滚是白送的。
// 真正的考点是抢占**之后**的派发失败：核销标记已经写下，只有抛错才能连带回滚。
// 权益分支曾用 INSERT OR IGNORE，把 feature 为 NULL 的 NOT NULL 冲突静默降级成
// changes=0：码被吃掉、权益没发、接口还回 ok:true。这里把它钉死。
const postClaimCases: Array<[string, string, 'recharge' | 'entitlement']> = [
  ['权益 payload 缺 feature', JSON.stringify({}), 'entitlement'],
  ['权益 feature 为 null', JSON.stringify({ feature: null }), 'entitlement'],
  ['充值 payload 缺 amountCents', JSON.stringify({}), 'recharge'],
  ['充值面额为负', JSON.stringify({ amountCents: -500 }), 'recharge'],
];
for (const [label, payloadJson, kind] of postClaimCases) {
  const batch = generateGiftCodes(
    kind === 'recharge'
      ? { count: 1, kind, amountCents: 100, createdBy: 'admin' }
      : { count: 1, kind, feature: 'skill:w4-paid-skill', createdBy: 'admin' }
  );
  assert.ok('codes' in batch);
  const code = batch.codes[0];
  getDb().prepare('UPDATE gift_codes SET payloadJson = ? WHERE code = ?').run(payloadJson, code);
  const entBefore = count('SELECT COUNT(*) AS c FROM entitlements WHERE userId = ?', aliceId);
  const balBefore = getBalance(aliceId);
  assert.throws(() => redeemGiftCode(aliceId, code), `${label}：必须抛错而不是静默返回 ok`);
  assert.strictEqual(codeRow(code).redeemedByUserId, null, `${label}：码不得被吃掉`);
  assert.strictEqual(
    count('SELECT COUNT(*) AS c FROM entitlements WHERE userId = ?', aliceId),
    entBefore,
    `${label}：不得留下半条权益`
  );
  assert.strictEqual(getBalance(aliceId), balBefore, `${label}：余额不变`);
}
ok(`抢占后派发失败（${postClaimCases.length} 种坏 payload）：一律抛错回滚，码全部保留`);

// ---------- 7. 多进程并发兑换同一码 ----------
console.log('\n[7] 多进程并发');
const raceCode = batch.codes[5];
const WORKERS = 6;
const results = await Promise.all(
  Array.from({ length: WORKERS }, () =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [...process.execArgv, selfPath, '--redeem-worker', raceCode, bobId],
        { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let out = '';
      let err = '';
      child.stdout.on('data', d => (out += d));
      child.stderr.on('data', d => (err += d));
      child.on('error', reject);
      child.on('close', code =>
        code === 0 ? resolve(out) : reject(new Error(`worker 退出码 ${code}: ${err}`))
      );
    })
  )
);
const parsed = results.map(r => JSON.parse(r));
const winners = parsed.filter(r => r.ok === true);
assert.strictEqual(winners.length, 1, `并发兑换只能成功一次，实际 ${winners.length} 次`);
for (const loser of parsed.filter(r => !r.ok)) {
  assert.strictEqual(loser.error, 'already_redeemed', `败者应为 already_redeemed，实际 ${loser.error}`);
}
assert.strictEqual(
  count('SELECT COUNT(*) AS c FROM wallet_ledger WHERE userId = ? AND meta LIKE ?', bobId, `%${raceCode}%`),
  1,
  '只入账一次'
);
assert.strictEqual(getBalance(bobId), balanceBefore + 5000, '余额只加一次面额');
assert.strictEqual(codeRow(raceCode).redeemedByUserId, bobId);
ok(`${WORKERS} 个子进程同时兑换同一码：恰好 1 次成功、1 行入账、余额只加一次`);

// ---------- 8. 账户端点与 admin 路由 ----------
console.log('\n[8] 路由层');
const awdk = generateApiKey(aliceId).key!.plaintextKey;
const routeReq = (body: unknown, key?: string) =>
  new NextRequest('http://localhost/api/account/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
const routeOk = await redeemPOST(routeReq({ code: batch.codes[6] }, awdk));
assert.strictEqual(routeOk.status, 200);
assert.strictEqual((await routeOk.json()).amountCents, 5000);
const routeDup = await redeemPOST(routeReq({ code: batch.codes[6] }, awdk));
assert.strictEqual(routeDup.status, 409);
assert.strictEqual((await routeDup.json()).message, '该兑换码已被使用');
ok('POST /api/account/redeem：Bearer 兑换成功、重复 409「该兑换码已被使用」');

const adminAnon = await adminGiftGET(new NextRequest('http://localhost/api/admin/gift-codes'));
assert.strictEqual(adminAnon.status, 401);
const adminList = await adminGiftGET(adminReq());
assert.strictEqual(adminList.status, 200);
const listBody = await adminList.json();
assert.strictEqual(listBody.stats.total, count('SELECT COUNT(*) AS c FROM gift_codes'));
assert.strictEqual(
  listBody.stats.redeemed,
  count('SELECT COUNT(*) AS c FROM gift_codes WHERE redeemedByUserId IS NOT NULL')
);
assert.ok(listBody.codes.some((c: any) => c.redeemedBy === 'w4-alice'), '列表带核销人用户名');
assert.ok(listBody.codes.every((c: any) => ['available', 'redeemed', 'revoked'].includes(c.status)));
ok('GET /api/admin/gift-codes：无 cookie 401，有 cookie 返回列表 + 核销状态与核销人');

const adminGen = await adminGiftPOST(
  adminReq({ count: 3, kind: 'recharge', amountCents: 800, note: '路由生成' }, 'POST')
);
assert.strictEqual(adminGen.status, 200);
const genBody = await adminGen.json();
assert.strictEqual(genBody.codes.length, 3);
for (const c of genBody.codes) assert.ok(CODE_RE.test(c));
const adminBad = await adminGiftPOST(adminReq({ count: 500, kind: 'recharge', amountCents: 800 }, 'POST'));
assert.strictEqual(adminBad.status, 400);
assert.strictEqual((await adminBad.json()).error, 'invalid_count');
ok('POST /api/admin/gift-codes：批量生成，超过 200 枚被拒');

const adminRevoke = await adminGiftPATCH(adminReq({ code: genBody.codes[0].toLowerCase() }, 'PATCH'));
assert.strictEqual(adminRevoke.status, 200);
assert.ok(codeRow(genBody.codes[0]).revokedAt, '路由撤销对小写输入同样生效');
const adminRevokeAgain = await adminGiftPATCH(adminReq({ code: genBody.codes[0] }, 'PATCH'));
assert.strictEqual(adminRevokeAgain.status, 409);
ok('PATCH /api/admin/gift-codes：撤销生效（大小写不敏感），重复撤销 409');

// 导出未核销码必须走全量端点：列表有 LIMIT，按当页过滤会漏发剩下的码，
// 而表头「未核销 N」是全表口径，两个数字对不上且没有任何提示。
const adminExport = await adminGiftGET(
  new NextRequest('http://localhost/api/admin/gift-codes?export=available', {
    headers: { cookie: `awd_admin=${process.env.AWD_ADMIN_TOKEN}` },
  })
);
assert.strictEqual(adminExport.status, 200);
const exported: string[] = (await adminExport.json()).codes;
const availableTotal = count(
  'SELECT COUNT(*) AS c FROM gift_codes WHERE redeemedByUserId IS NULL AND revokedAt IS NULL'
);
assert.strictEqual(exported.length, availableTotal, '导出条数必须等于全表未核销数');
assert.strictEqual(new Set(exported).size, exported.length, '导出无重复');
assert.ok(exported.every(c => CODE_RE.test(c)));
assert.strictEqual(
  await adminGiftGET(new NextRequest('http://localhost/api/admin/gift-codes?export=available')).then(r => r.status),
  401,
  '导出端点同样要鉴权'
);
ok(`GET ?export=available：全量导出 ${exported.length} 枚未核销码，与全表口径一致且要鉴权`);

// 兑换码充值/发权益都不产生订单，只看 orders 的 plan 判定会把这类用户误报 free
const { getPlan } = await import('@/lib/wallet');
assert.strictEqual(
  count('SELECT COUNT(*) AS c FROM orders WHERE userId = ?', bobId), 0,
  'bob 全程没有任何订单'
);
assert.ok(getBalance(bobId) > 0, 'bob 靠兑换码有余额');
assert.strictEqual(getPlan(bobId), 'paid', '兑换码充值到有余额的账户不能报 free');
assert.strictEqual(getPlan(authorId), 'free', '零充值零权益仍为 free');
ok('getPlan：兑换码充值/权益计入 paid，纯白户仍为 free');

const audits = getDb()
  .prepare("SELECT action, COUNT(*) AS c FROM admin_audit GROUP BY action")
  .all() as Array<{ action: string; c: number }>;
const auditMap = Object.fromEntries(audits.map(a => [a.action, a.c]));
assert.ok(auditMap.gift_codes_generate >= 1, '生成留痕');
assert.ok(auditMap.gift_code_revoke >= 1, '撤销留痕');
ok('admin_audit：生成与撤销均留痕');

console.log(`\n全部通过：${passed} 项`);
