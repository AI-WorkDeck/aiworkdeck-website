/**
 * PR-W3 动态验证脚本：插件/Skill/feature 付费闭环。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 等会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-w3.mts
 *
 * 覆盖：
 * - 购买闭环事务原子性（paid + purchases + entitlements + creator_earnings 四写一体）
 * - 重复回调不重复发权益
 * - 402 闸门矩阵（免费匿名 / 付费无 Key / 付费有 Key 无权益 / 付费已购）
 * - 分成金额取整（70% 向下取整给创作者、余数归平台、二者之和恒等于总价）
 * - 试用码对拍（gen-trial-code.mjs 产物与既有码同格式、同私钥可验签）
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

// ---------- 0. 隔离数据：两个用户 + 免费/付费 Skill + 付费插件 ----------
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const creatorId = crypto.randomUUID();
const buyerId = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: creatorId, username: 'w3-creator', email: 'w3c@test.local', passwordHash: 'x:y', displayName: 'W3 Creator', createdAt: new Date().toISOString() },
    { id: buyerId, username: 'w3-buyer', email: 'w3b@test.local', passwordHash: 'x:y', displayName: 'W3 Buyer', createdAt: new Date().toISOString() },
  ])
);
const now = new Date().toISOString();
const baseSkill = {
  description: 'test', icon: '◆', version: '1.0.0', triggers: ['t'], allowedTools: [],
  prompt: 'p', authorId: creatorId, downloads: 0, createdAt: now, updatedAt: now,
};
fs.writeFileSync(
  path.join(cwd, 'data', 'skills.json'),
  JSON.stringify([
    { ...baseSkill, id: 'free-skill', name: '免费技能' },
    { ...baseSkill, id: 'paid-skill', name: '付费技能', priceCents: 1290, pricingModel: 'once' },
  ])
);
fs.writeFileSync(
  path.join(cwd, 'data', 'plugins.json'),
  JSON.stringify([
    {
      id: 'paid-plugin', version: '1.0.0', name: '付费插件', description: 'test', author: 'w3-creator',
      authorId: creatorId, permissions: [], tools: [], files: { 'manifest.json': 'deadbeef' }, size: 1,
      status: 'approved', scan: { needsAttention: false, crossCheck: [] }, signature: 'sig-test',
      publishedAt: now, downloads: 0, submittedAt: now, updatedAt: now, priceCents: 990, pricingModel: 'once',
    },
  ])
);

const { createOrder, getOrder } = await import('@/lib/orders');
const { settleOrderPaid, getBalance, getBalanceBreakdown, getRefundableCents } = await import('@/lib/wallet');
const {
  resolveSku, validatePurchaseSku, computeSplit, hasEntitlement, listEntitlements,
} = await import('@/lib/purchases');
const { getDb } = await import('@/lib/db');
const { generateApiKey } = await import('@/lib/api-keys');
const { GET: skillsRegistryGET } = await import('@/app/api/registry/skills/route');
const { GET: pluginsRegistryGET } = await import('@/app/api/registry/plugins/route');
const { GET: skillBundleGET } = await import('@/app/api/registry/skills/[id]/bundle/route');
const { GET: pluginBundleGET } = await import('@/app/api/registry/plugins/[id]/bundle/route');
const { GET: pluginFileGET } = await import('@/app/api/registry/plugins/[id]/file/route');
const { GET: entitlementsGET } = await import('@/app/api/account/entitlements/route');
const { GET: skillDetailGET } = await import('@/app/api/skills/[id]/route');
const { NextRequest } = await import('next/server');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}
const req = (url: string, key?: string) =>
  new NextRequest(url, { headers: key ? { authorization: `Bearer ${key}` } : {} });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const count = (sql: string, ...args: unknown[]) =>
  (getDb().prepare(sql).get(...args) as { c: number }).c;

// ---------- 1. SKU 解析与下单校验矩阵 ----------
console.log('\n[1] SKU 解析与 create 校验');
assert.strictEqual(resolveSku('garbage'), null);
assert.strictEqual(resolveSku('skill:not-exist'), null);
assert.strictEqual(resolveSku('feature:not-a-product'), null);
const paidSkillSku = resolveSku('skill:paid-skill')!;
assert.strictEqual(paidSkillSku.priceCents, 1290);
assert.strictEqual(paidSkillSku.feature, 'skill:paid-skill');
assert.strictEqual(paidSkillSku.creatorUserId, creatorId);
const clipSku = resolveSku('feature:clipboard.unlimited')!;
assert.strictEqual(clipSku.priceCents, 1990, '未配置覆盖时用默认价 1990');
assert.strictEqual(clipSku.feature, 'clipboard.unlimited');
assert.strictEqual(clipSku.creatorUserId, null);
ok('resolveSku：skill/feature/非法各归其位，feature 默认价 1990');

assert.deepStrictEqual(validatePurchaseSku(buyerId, 'skill:not-exist', 100), { error: 'invalid_sku' });
assert.deepStrictEqual(validatePurchaseSku(buyerId, 'skill:free-skill', 100), { error: 'not_purchasable' });
assert.deepStrictEqual(validatePurchaseSku(buyerId, 'skill:paid-skill', 1289), { error: 'amount_mismatch' });
assert.ok('sku' in validatePurchaseSku(buyerId, 'skill:paid-skill', 1290));
ok('validatePurchaseSku：不存在/免费/金额不符/正常四分支');

// ---------- 2. 402 闸门矩阵（购买前） ----------
console.log('\n[2] 402 闸门矩阵');
const awdk = generateApiKey(buyerId).key!;

// 免费条目：匿名可下载，计数照常
const dl0 = JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'skills.json'), 'utf-8'))
  .find((s: any) => s.id === 'free-skill').downloads;
const freeRes = await skillBundleGET(req('http://localhost/api/registry/skills/free-skill/bundle'), p('free-skill'));
assert.strictEqual(freeRes.status, 200);
assert.ok((await freeRes.json()).files['skill.yml']);
const dl1 = JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'skills.json'), 'utf-8'))
  .find((s: any) => s.id === 'free-skill').downloads;
assert.strictEqual(dl1, dl0 + 1, '免费条目匿名下载计数不变形');
ok('免费条目：匿名 200 + 下载计数 +1');

// 付费条目：无 Key 402
const noKeyRes = await skillBundleGET(req('http://localhost/api/registry/skills/paid-skill/bundle'), p('paid-skill'));
assert.strictEqual(noKeyRes.status, 402);
assert.deepStrictEqual(await noKeyRes.json(), { code: 'payment_required', priceCents: 1290, itemName: '付费技能' });
ok('付费条目无 Key：402 { code, priceCents, itemName }');

// 付费条目：有 Key 无权益 402
const noEntRes = await skillBundleGET(req('http://localhost/api/registry/skills/paid-skill/bundle', awdk.plaintextKey), p('paid-skill'));
assert.strictEqual(noEntRes.status, 402);
ok('付费条目有 Key 无权益：402');

// 插件两端点同口径
const plgBundle402 = await pluginBundleGET(req('http://localhost/api/registry/plugins/paid-plugin/bundle'), p('paid-plugin'));
assert.strictEqual(plgBundle402.status, 402);
assert.strictEqual((await plgBundle402.json()).priceCents, 990);
const plgFile402 = await pluginFileGET(
  req('http://localhost/api/registry/plugins/paid-plugin/file?path=manifest.json', awdk.plaintextKey),
  p('paid-plugin')
);
assert.strictEqual(plgFile402.status, 402);
ok('插件 bundle/file 端点：未购一律 402');

// 付费 Skill 的 prompt 不能从 detail API 白拿（bundle 闸门的旁路）
const detailAnon = await skillDetailGET(req('http://localhost/api/skills/paid-skill'), p('paid-skill'));
assert.strictEqual(detailAnon.status, 200);
const detailAnonBody = await detailAnon.json();
assert.strictEqual(detailAnonBody.skill.prompt, undefined, '匿名不可见付费 prompt');
assert.strictEqual(detailAnonBody.skill.promptLocked, true);
const detailFree = await skillDetailGET(req('http://localhost/api/skills/free-skill'), p('free-skill'));
assert.ok((await detailFree.json()).skill.prompt, '免费条目 prompt 照常返回');
ok('detail API：付费条目匿名遮 prompt，免费条目不变');

// ---------- 3. 购买闭环：四写一体 ----------
console.log('\n[3] 购买闭环事务');
const orderNo = 'PURCHASE-W3-SKILL-1';
createOrder({
  id: orderNo, outTradeNo: orderNo, description: '购买 付费技能', amount: 1290,
  status: 'pending', userId: buyerId, kind: 'purchase', skuId: 'skill:paid-skill',
});
const settle1 = settleOrderPaid(orderNo, { transactionId: 'wx-txn-1' })!;
assert.strictEqual(settle1.alreadyPaid, false);
assert.strictEqual(getOrder(orderNo)!.status, 'paid');
const purchaseRow = getDb().prepare('SELECT * FROM purchases WHERE orderId = ?').get(orderNo) as any;
assert.ok(purchaseRow, 'purchases 行存在');
assert.strictEqual(purchaseRow.userId, buyerId);
assert.strictEqual(purchaseRow.itemType, 'skill');
assert.strictEqual(purchaseRow.itemId, 'paid-skill');
assert.strictEqual(purchaseRow.priceCents, 1290);
assert.strictEqual(purchaseRow.creatorUserId, creatorId);
assert.strictEqual(purchaseRow.creatorShareCents, 903, '1290 * 0.7 = 903（整除）');
assert.strictEqual(purchaseRow.platformShareCents, 387);
assert.ok(hasEntitlement(buyerId, 'skill:paid-skill'), 'entitlement 已发');
const earningRow = getDb()
  .prepare('SELECT * FROM creator_earnings WHERE purchaseId = ?')
  .get(purchaseRow.id) as any;
assert.strictEqual(earningRow.creatorUserId, creatorId);
assert.strictEqual(earningRow.amountCents, 903);
// Credits 重构 P2：分成在履约事务里即时入账，不再挂「待人工打款」
assert.ok(earningRow.settledAt, '分成即时结算，settledAt 不再为空');
assert.match(earningRow.settleNote, /^auto:credits#\d+$/, '结算说明指向入账流水行');
ok('分成即时结算并标注入账流水');

// 创作者拿到的必须是 reward 批次（不可提现、24 个月有效），且买方分文未动
assert.strictEqual(getBalance(creatorId), 903, '创作者 Credits 到账 903');
const creatorBd = getBalanceBreakdown(creatorId);
assert.strictEqual(creatorBd.rewardCents, 903, '分成必须入 reward 批次');
assert.strictEqual(creatorBd.topupCents, 0);
assert.ok(creatorBd.nextExpiry, '奖励批次必须带到期日');
assert.strictEqual(getRefundableCents(creatorId), 0, '分成不得计入可退现金额');
ok('分成入 reward 批次：不可提现、带 24 个月有效期');

// 买方走微信直付，Credits 一分未扣
assert.strictEqual(getBalance(buyerId), 0, '买方 Credits 未被扣');
assert.strictEqual(
  count("SELECT COUNT(*) AS c FROM wallet_ledger WHERE userId = ?", buyerId),
  0,
  '买方无流水（微信直付）'
);
ok('paid + purchases + entitlements + 分成入账四写一体，买方走直付不动 Credits');

// ---------- 4. 重复回调幂等 ----------
console.log('\n[4] 重复回调');
const settle2 = settleOrderPaid(orderNo, { transactionId: 'wx-txn-1-dup' })!;
assert.strictEqual(settle2.alreadyPaid, true);
assert.strictEqual(count('SELECT COUNT(*) AS c FROM purchases WHERE orderId = ?', orderNo), 1);
assert.strictEqual(count("SELECT COUNT(*) AS c FROM entitlements WHERE userId = ? AND feature = 'skill:paid-skill'", buyerId), 1);
assert.strictEqual(count('SELECT COUNT(*) AS c FROM creator_earnings'), 1);
ok('重复回调：alreadyPaid=true，不重复发权益/分成');

// 已拥有再下单：create 校验直接拒绝
assert.deepStrictEqual(validatePurchaseSku(buyerId, 'skill:paid-skill', 1290), { error: 'already_owned' });
ok('重复购买同一 SKU：already_owned（路由映射 409）');

// 并发重复购买：第一单支付前已挂出的第二个 pending 订单也被支付。
// 期望：purchases 行保留（钱已收待退款）、创作者不重复拿分成、全额暂记平台、写 duplicate_purchase audit。
const dupOrderNo = 'PURCHASE-W3-SKILL-1-DUP';
createOrder({
  id: dupOrderNo, outTradeNo: dupOrderNo, description: '购买 付费技能', amount: 1290,
  status: 'pending', userId: buyerId, kind: 'purchase', skuId: 'skill:paid-skill',
});
const settleDup = settleOrderPaid(dupOrderNo, { transactionId: 'wx-txn-1-race' })!;
assert.strictEqual(settleDup.alreadyPaid, false);
const dupRow = getDb().prepare('SELECT * FROM purchases WHERE orderId = ?').get(dupOrderNo) as any;
assert.ok(dupRow, '重复付款的 purchases 行保留');
assert.strictEqual(dupRow.creatorShareCents, 0, '重复付款创作者分成为 0');
assert.strictEqual(dupRow.platformShareCents, 1290, '全额暂记平台（待退款）');
assert.strictEqual(count('SELECT COUNT(*) AS c FROM creator_earnings'), 1, '创作者不重复拿分成');
assert.strictEqual(count("SELECT COUNT(*) AS c FROM entitlements WHERE userId = ? AND feature = 'skill:paid-skill'", buyerId), 1);
const dupAudit = getDb()
  .prepare("SELECT * FROM admin_audit WHERE action = 'duplicate_purchase'")
  .all() as any[];
assert.strictEqual(dupAudit.length, 1);
assert.ok(dupAudit[0].detail.includes(dupOrderNo), 'audit 记录含订单号');
ok('并发重复购买：分成不重复、全额暂记平台、audit 留痕待退款');

// ---------- 5. 已购后闸门放行 ----------
console.log('\n[5] 已购放行');
const ownedRes = await skillBundleGET(req('http://localhost/api/registry/skills/paid-skill/bundle', awdk.plaintextKey), p('paid-skill'));
assert.strictEqual(ownedRes.status, 200);
const ownedBody = await ownedRes.json();
assert.ok(ownedBody.files['skill.yml'].includes('"paid-skill"'));
ok('付费已购 + Bearer Key：200 发 bundle');

// 插件购买 → 插件端点放行
const plgOrderNo = 'PURCHASE-W3-PLUGIN-1';
createOrder({
  id: plgOrderNo, outTradeNo: plgOrderNo, description: '购买 付费插件', amount: 990,
  status: 'pending', userId: buyerId, kind: 'purchase', skuId: 'plugin:paid-plugin',
});
settleOrderPaid(plgOrderNo, { transactionId: 'wx-txn-2' });
assert.ok(hasEntitlement(buyerId, 'plugin:paid-plugin'));
const plgOk = await pluginBundleGET(req('http://localhost/api/registry/plugins/paid-plugin/bundle', awdk.plaintextKey), p('paid-plugin'));
assert.strictEqual(plgOk.status, 200);
assert.strictEqual((await plgOk.json()).signature, 'sig-test');
// 插件分成：990 * 0.7 = 693
const plgPurchase = getDb().prepare('SELECT * FROM purchases WHERE orderId = ?').get(plgOrderNo) as any;
assert.strictEqual(plgPurchase.creatorShareCents, 693);
assert.strictEqual(plgPurchase.platformShareCents, 297);
ok('插件购买闭环 + bundle 放行（693/297 分成）');

// ---------- 6. feature SKU：平台 100%，无创作者分成 ----------
console.log('\n[6] feature SKU');
const featOrderNo = 'PURCHASE-W3-FEATURE-1';
createOrder({
  id: featOrderNo, outTradeNo: featOrderNo, description: '购买 无线剪贴板无限版', amount: 1990,
  status: 'pending', userId: buyerId, kind: 'purchase', skuId: 'feature:clipboard.unlimited',
});
settleOrderPaid(featOrderNo, { transactionId: 'wx-txn-3' });
assert.ok(hasEntitlement(buyerId, 'clipboard.unlimited'), 'feature 权益值不带前缀');
const featPurchase = getDb().prepare('SELECT * FROM purchases WHERE orderId = ?').get(featOrderNo) as any;
assert.strictEqual(featPurchase.itemType, 'feature');
assert.strictEqual(featPurchase.creatorUserId, null);
assert.strictEqual(featPurchase.creatorShareCents, 0);
assert.strictEqual(featPurchase.platformShareCents, 1990);
assert.strictEqual(count('SELECT COUNT(*) AS c FROM creator_earnings'), 2, '不产生 earnings 行');
assert.deepStrictEqual(validatePurchaseSku(buyerId, 'feature:clipboard.unlimited', 1990), { error: 'already_owned' });
ok('feature 购买：平台 100%，无 earnings，重复购买被拒');

// ---------- 7. 履约失败回滚：坏 skuId 的订单不半残 ----------
console.log('\n[7] 事务回滚');
const badOrderNo = 'PURCHASE-W3-BAD-1';
createOrder({
  id: badOrderNo, outTradeNo: badOrderNo, description: '购买 坏商品', amount: 100,
  status: 'pending', userId: buyerId, kind: 'purchase', skuId: 'not-a-sku',
});
const purchasesBefore = count('SELECT COUNT(*) AS c FROM purchases');
assert.throws(() => settleOrderPaid(badOrderNo, { transactionId: 'wx-txn-bad' }));
assert.strictEqual(getOrder(badOrderNo)!.status, 'pending', '订单保持 pending 等待人工介入');
assert.strictEqual(count('SELECT COUNT(*) AS c FROM purchases'), purchasesBefore, '无半截写入');
ok('skuId 解析失败：整个事务回滚，paid 与履约要么全有要么全无');

// ---------- 8. 分成取整性质：70% 向下取整，余数归平台，和恒等于总价 ----------
console.log('\n[8] 分成取整');
for (let amount = 1; amount <= 2000; amount++) {
  const { creatorShareCents, platformShareCents } = computeSplit(amount, true);
  assert.strictEqual(creatorShareCents, Math.floor((amount * 7) / 10));
  assert.ok(creatorShareCents <= (amount * 7) / 10, '创作者份额绝不向上取整');
  assert.strictEqual(creatorShareCents + platformShareCents, amount, '之和恒等于总价');
}
assert.deepStrictEqual(computeSplit(999, true), { creatorShareCents: 699, platformShareCents: 300 });
assert.deepStrictEqual(computeSplit(1, true), { creatorShareCents: 0, platformShareCents: 1 });
assert.deepStrictEqual(computeSplit(199900, false), { creatorShareCents: 0, platformShareCents: 199900 });
ok('1..2000 分全量扫：floor(70%) + 余数归平台 + 总和不变式');

// ---------- 9. 契约端点 ----------
console.log('\n[9] 契约端点');
const entRes = await entitlementsGET(req('http://localhost/api/account/entitlements', awdk.plaintextKey));
assert.strictEqual(entRes.status, 200);
const entBody = await entRes.json();
const features = entBody.entitlements.map((e: any) => e.feature).sort();
assert.deepStrictEqual(features, ['clipboard.unlimited', 'plugin:paid-plugin', 'skill:paid-skill']);
for (const e of entBody.entitlements) {
  assert.deepStrictEqual(Object.keys(e).sort(), ['feature', 'orderId', 'purchasedAt'], 'Spec §9 字段逐字对齐');
}
const entAnon = await entitlementsGET(req('http://localhost/api/account/entitlements'));
assert.strictEqual(entAnon.status, 401);
assert.strictEqual(listEntitlements(buyerId).length, 3);
ok('GET /api/account/entitlements：{feature, purchasedAt, orderId}，无 Key 401');

const regSkills = await (await skillsRegistryGET()).json();
const regPaid = regSkills.find((s: any) => s.id === 'paid-skill');
const regFree = regSkills.find((s: any) => s.id === 'free-skill');
assert.strictEqual(regPaid.priceCents, 1290);
assert.strictEqual(regPaid.pricingModel, 'once');
assert.strictEqual(regFree.priceCents, 0);
assert.ok(regFree.name && regFree.triggers && regFree.version, '旧字段原样保留');
const regPlugins = await (await pluginsRegistryGET()).json();
assert.strictEqual(regPlugins[0].priceCents, 990);
assert.strictEqual(regPlugins[0].pricingModel, 'once');
ok('registry 两个列表端点：priceCents/pricingModel 只增，旧字段不动');

// ---------- 10. 试用码对拍 ----------
console.log('\n[10] 试用码对拍');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = BASE32.indexOf(ch);
    assert.ok(idx >= 0, `非法 base32 字符: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function decodeTrialCode(code: string): { payload: Buffer; signature: Buffer } {
  assert.ok(code.startsWith('AWD-T-'), '前缀 AWD-T-');
  const body = code.slice('AWD-T-'.length);
  assert.ok(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){27}$/.test(body), '112 字符 base32，每 4 字符一组连字符');
  const raw = base32Decode(body.replace(/-/g, ''));
  assert.strictEqual(raw.length, 70, 'payload 6 + 签名 64');
  return { payload: raw.subarray(0, 6), signature: raw.subarray(6) };
}
const generated = execFileSync('node', [path.join(repoRoot, 'scripts', 'gen-trial-code.mjs')], { encoding: 'utf-8' }).trim();
const existing = fs.readFileSync(path.join(repoRoot, 'secrets', 'trial-code-v1.txt'), 'utf-8').trim();
const gen = decodeTrialCode(generated);
const old = decodeTrialCode(existing);
for (const [label, c] of [['新签', gen], ['既有', old]] as const) {
  assert.strictEqual(c.payload[0], 0x01, `${label}码 版本字节`);
  assert.strictEqual(c.payload[1], 0x01, `${label}码 type=trial`);
  const iat = c.payload.readUInt32BE(2);
  assert.ok(iat > 1700000000 && iat < 2000000000, `${label}码 iat 合理`);
}
const publicKey = crypto.createPublicKey(
  crypto.createPrivateKey(fs.readFileSync(path.join(repoRoot, 'secrets', 'awd-trial-signing.pem')))
);
assert.ok(crypto.verify(null, gen.payload, publicKey, gen.signature), '新签码验签通过');
assert.ok(crypto.verify(null, old.payload, publicKey, old.signature), '既有码同一公钥验签通过');
const tampered = Buffer.from(gen.payload);
tampered[5] ^= 0xff;
assert.ok(!crypto.verify(null, tampered, publicKey, gen.signature), '篡改 payload 验签失败');
ok('gen-trial-code.mjs 与既有码同格式同私钥，解码验签双向通过');


// ---------- 11. 用 Credits 直接购买（Credits 重构 P4） ----------
console.log('\n[11] Credits 购买');
const { purchaseWithCredits } = await import('@/lib/purchases');
const { grantCredits: grant, getBalanceBreakdown: bdOf } = await import('@/lib/credits');
const { withTransaction: tx } = await import('@/lib/db');

const creditBuyerId = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    ...JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'users.json'), 'utf-8')),
    { id: creditBuyerId, username: 'w3-credit-buyer', email: 'w3cb@test.local', passwordHash: 'x:y', displayName: 'W3 CreditBuyer', createdAt: new Date().toISOString() },
  ])
);

// 余额不足：不扣钱、不发权益
assert.deepStrictEqual(purchaseWithCredits(creditBuyerId, 'skill:paid-skill'), { error: 'insufficient_credits' });
assert.strictEqual(hasEntitlement(creditBuyerId, 'skill:paid-skill'), false);
ok('Credits 不足 → insufficient_credits，不发权益');

// 充 20 元后买 12.90 元的技能
tx(db => grant(db, { userId: creditBuyerId, pool: 'topup', amountCents: 2000, ledgerKind: 'recharge' }));
const creatorBefore = getBalance(creatorId);
const bought = purchaseWithCredits(creditBuyerId, 'skill:paid-skill');
assert.ok('ok' in bought && bought.ok, '购买应成功');
assert.strictEqual(getBalance(creditBuyerId), 2000 - 1290, '买方 Credits 按标价扣减');
assert.strictEqual(hasEntitlement(creditBuyerId, 'skill:paid-skill'), true, '权益已发');
assert.strictEqual(getBalance(creatorId), creatorBefore + 903, '创作者同一事务里拿到 70%');
assert.strictEqual(bdOf(creatorId).rewardCents, creatorBefore + 903, '分成仍入 reward 批次');
ok('Credits 购买：扣减 + 发权益 + 创作者分成，同一事务');

// 价格服务端自查，不采信调用方
const purchaseRow2 = getDb().prepare('SELECT * FROM purchases WHERE userId = ?').get(creditBuyerId) as any;
assert.strictEqual(purchaseRow2.priceCents, 1290);
assert.strictEqual(purchaseRow2.creatorShareCents, 903);
assert.strictEqual(purchaseRow2.platformShareCents, 387);
ok('价格与分成由服务端标价决定，与两条支付路径口径一致');

// 重复购买：拦下且不扣钱
const balBefore = getBalance(creditBuyerId);
assert.deepStrictEqual(purchaseWithCredits(creditBuyerId, 'skill:paid-skill'), { error: 'already_owned' });
assert.strictEqual(getBalance(creditBuyerId), balBefore, '重复购买不扣 Credits（钱没离开账本，直接回滚）');
ok('重复购买 → already_owned，Credits 分文不动');

// 免费条目 / 不存在的 SKU
assert.deepStrictEqual(purchaseWithCredits(creditBuyerId, 'skill:free-skill'), { error: 'not_purchasable' });
assert.deepStrictEqual(purchaseWithCredits(creditBuyerId, 'skill:nope'), { error: 'invalid_sku' });
ok('免费条目 not_purchasable，不存在 invalid_sku');

console.log(`\n全部通过：${passed} 项`);
