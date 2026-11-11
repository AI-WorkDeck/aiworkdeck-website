/**
 * 桌面端对接契约自测（PR-W4）。
 *
 * 逐个调用总 Spec §9 列出的端点，断言**字段名与类型**逐字对齐。
 * 缺字段、改名、类型漂移一律失败——目的就是不要等桌面端联调时才发现契约漂了。
 * 契约的人读版本在 doc/desktop-contract.md，两者必须同步改。
 *
 * 必须在一个空目录里执行（data/awd.db 等会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/contract-check.mts
 *
 * 直接调 route handler，不起 next 服务：Next 的 Route Handler 就是普通函数，
 * 起服务只会把 1.8G 内存的服务器构建风险带进验证脚本。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

process.env.AWD_KEY_ENCRYPTION_SECRET = 'contract-check-secret';

// ---------- 0. 隔离数据 ----------
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const creatorId = crypto.randomUUID();
const userId = crypto.randomUUID();
// 会员成长值算术专用账户：流水是手工种的精确数，不与共享账户的余额断言互扰
const memberId = crypto.randomUUID();
const createdAt = new Date().toISOString();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    { id: creatorId, username: 'cc-creator', email: 'ccc@test.local', passwordHash: 'x:y', displayName: 'CC Creator', createdAt },
    { id: userId, username: 'cc-user', email: 'ccu@test.local', passwordHash: 'x:y', displayName: 'CC User', createdAt },
    { id: memberId, username: 'cc-member', email: 'ccm@test.local', passwordHash: 'x:y', displayName: 'CC Member', createdAt },
  ])
);
const baseSkill = {
  description: 'contract', icon: '◆', version: '1.0.0', triggers: ['t'], allowedTools: [],
  prompt: 'p', authorId: creatorId, downloads: 0, createdAt, updatedAt: createdAt,
};
fs.writeFileSync(
  path.join(cwd, 'data', 'skills.json'),
  JSON.stringify([
    { ...baseSkill, id: 'cc-free', name: '免费技能' },
    { ...baseSkill, id: 'cc-paid', name: '付费技能', priceCents: 1290, pricingModel: 'once' },
  ])
);
fs.writeFileSync(
  path.join(cwd, 'data', 'plugins.json'),
  JSON.stringify([
    {
      id: 'cc-paid-plugin', version: '1.0.0', name: '付费插件', description: 'contract', author: 'cc-creator',
      authorId: creatorId, permissions: [], tools: [], files: { 'manifest.json': 'deadbeef' }, size: 1,
      status: 'approved', scan: { needsAttention: false, crossCheck: [] }, signature: 'sig-contract',
      publishedAt: createdAt, downloads: 0, submittedAt: createdAt, updatedAt: createdAt,
      priceCents: 990, pricingModel: 'once',
    },
  ])
);

const { getDb } = await import('@/lib/db');
const { generateApiKey } = await import('@/lib/api-keys');
const { createOrder } = await import('@/lib/orders');
const { settleOrderPaid } = await import('@/lib/wallet');
const { encryptKeyMaterial } = await import('@/lib/openrouter-keys');
const mgmt = await import('@/lib/openrouter-mgmt');
// 即时汇率（dev-board#853）一律打桩成「源不可用」：国内站读汇率会在后台去拉，
// 真去拉的话 CI 上何时落盘不确定，下面按站点默认值派生的断言就会时红时绿。
// 汇率本身的行为由 scripts/verify-fx-rate.mts 单独钉住。
const fxRate = await import('@/lib/fx-rate');
fxRate.__setFxFetchForTests(async () => {
  throw new Error('contract-check: fx offline');
});
const { generateGiftCodes } = await import('@/lib/gift-codes');
const { NextRequest } = await import('next/server');

const { POST: verifyKeyPOST } = await import('@/app/api/license/verify-key/route');
const { GET: meGET } = await import('@/app/api/account/me/route');
const { GET: entitlementsGET } = await import('@/app/api/account/entitlements/route');
const { GET: ledgerGET } = await import('@/app/api/account/ledger/route');
const { GET: membershipGET } = await import('@/app/api/account/membership/route');
const { POST: aiKeyPOST } = await import('@/app/api/account/ai-key/route');
const { GET: aiUsageGET } = await import('@/app/api/account/ai-usage/route');
const { POST: redeemPOST } = await import('@/app/api/account/redeem/route');
const { GET: skillBundleGET } = await import('@/app/api/registry/skills/[id]/bundle/route');
const { GET: pluginBundleGET } = await import('@/app/api/registry/plugins/[id]/bundle/route');

let checked = 0;
function ok(name: string) {
  checked++;
  console.log('  OK  ', name);
}
interface ReqInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}
const req = (url: string, key?: string, init: ReqInit = {}) =>
  new NextRequest(url, {
    ...init,
    headers: { ...init.headers, ...(key ? { authorization: `Bearer ${key}` } : {}) },
  });
const jsonReq = (url: string, key: string | undefined, body: unknown) =>
  req(url, key, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const p = (id: string) => ({ params: Promise.resolve({ id }) });

/** 严格字段集断言：多一个少一个都算漂移。 */
function assertKeys(obj: unknown, keys: string[], label: string) {
  assert.ok(obj && typeof obj === 'object', `${label} 不是对象`);
  assert.deepStrictEqual(
    Object.keys(obj as object).sort(),
    [...keys].sort(),
    `${label} 字段集漂移`
  );
}
function assertType(value: unknown, type: 'string' | 'number' | 'boolean', label: string) {
  assert.strictEqual(typeof value, type, `${label} 类型应为 ${type}，实际 ${typeof value}`);
}

// 账户 Key + 一笔已支付充值（让 plan=paid、ledger 非空）
const awdk = generateApiKey(userId).key!.plaintextKey;
createOrder({
  id: 'CC-RECHARGE-1', outTradeNo: 'CC-RECHARGE-1', description: '充值', amount: 10000,
  status: 'pending', userId, kind: 'recharge',
});
settleOrderPaid('CC-RECHARGE-1', { transactionId: 'wx-cc-1' });
// 一条权益（购买 feature SKU）
createOrder({
  id: 'CC-PURCHASE-1', outTradeNo: 'CC-PURCHASE-1', description: '购买', amount: 1990,
  status: 'pending', userId, kind: 'purchase', skuId: 'feature:clipboard.unlimited',
});
settleOrderPaid('CC-PURCHASE-1', { transactionId: 'wx-cc-2' });

// ---------- 1. POST /api/license/verify-key ----------
console.log('\n[1] POST /api/license/verify-key');
{
  const res = await verifyKeyPOST(jsonReq('http://localhost/api/license/verify-key', undefined, { key: awdk }));
  assert.strictEqual(res.status, 200, '有效 key 必须 200：桌面对 4xx 判 INVALID 会清掉用户授权');
  const body = await res.json();
  assertKeys(body, ['valid', 'plan'], 'verify-key 成功响应');
  assert.strictEqual(body.valid, true);
  assert.ok(['paid', 'free', 'expired'].includes(body.plan), `plan 取值超出契约: ${body.plan}`);
  ok('有效 key → 200 { valid: true, plan }');

  const bad = await verifyKeyPOST(jsonReq('http://localhost/api/license/verify-key', undefined, { key: 'awdk_nope' }));
  assert.strictEqual(bad.status, 200, '无效 key 也必须 200 + valid:false，不能用 4xx 表达');
  assert.deepStrictEqual(await bad.json(), { valid: false });
  ok('无效 key → 200 { valid: false }');

  const empty = await verifyKeyPOST(
    new NextRequest('http://localhost/api/license/verify-key', { method: 'POST', body: 'not-json' })
  );
  assert.strictEqual(empty.status, 200);
  assert.deepStrictEqual(await empty.json(), { valid: false });
  ok('body 非法 → 200 { valid: false }（不泄露差异，且不误判为 4xx）');
}

// ---------- 2. GET /api/account/me ----------
console.log('\n[2] GET /api/account/me');
{
  const res = await meGET(req('http://localhost/api/account/me', awdk));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assertKeys(
    body,
    ['accountId', 'username', 'displayName', 'phone', 'verifiedEmail', 'avatarUpdatedAt', 'displayNameIsDefault',
     'balanceCents', 'plan', 'createdAt', 'subscription', 'billing', 'cloudAccess', 'billingLine', 'bqtMember'],
    'me'
  );
  assert.strictEqual(body.billing.policyVersion, '2026-11-04');
  assert.strictEqual(body.billing.accepted, false, 'existing prepaid users are not silently opted in');
  assert.strictEqual(body.billing.debtCents, 0);
  assert.strictEqual(body.billing.creditLimitCents, 0);
  assert.strictEqual(body.billing.cashCurrency, process.env.NEXT_PUBLIC_AWD_SITE === 'intl' ? 'USD' : 'CNY');
  assert.strictEqual(body.cloudAccess.reason, 'policy_required');
  assert.strictEqual(body.cloudAccess.canWrite, false);
  assert.strictEqual(body.cloudAccess.frozen, false);
  assertType(body.accountId, 'string', 'me.accountId');
  assert.strictEqual(body.accountId, userId, 'me.accountId 必须是账户终身稳定主键（users.json 的 id）');
  assert.ok(body.accountId.length <= 128, 'me.accountId 长度须 <= 128');
  assert.strictEqual(body.verifiedEmail, null, '未验证的历史邮箱不得作为桥接身份证明');
  assertType(body.username, 'string', 'me.username');
  assertType(body.displayName, 'string', 'me.displayName');
  assertType(body.balanceCents, 'number', 'me.balanceCents');
  assertType(body.createdAt, 'string', 'me.createdAt');
  assert.ok(Number.isInteger(body.balanceCents), 'me.balanceCents 必须是整数分');
  assert.ok(['paid', 'free', 'expired'].includes(body.plan), `me.plan 取值超出契约: ${body.plan}`);
  // 10000 充值 + 100 会员赠送：充值 10000 分 → 成长值 1000 → 正式律师档（10‰）→
  // floor(10000 × 10 / 1000) = 100 分 reward。见 [4b] 与 settleOrderPaid。
  assert.strictEqual(body.balanceCents, 10100);
  assert.strictEqual(body.plan, 'paid');
  // phone：绑定过为 11 位裸号字符串，未绑定为 null——绝不能是 undefined（键必须在）
  assert.ok(body.phone === null || (typeof body.phone === 'string' && /^1\d{10}$/.test(body.phone)),
    `me.phone 必须是 11 位裸号或 null: ${body.phone}`);
  // avatarUpdatedAt：没有头像必须是 null 而不是缺键——缺键会让消费方分不清
  // 「这个账户没有头像」与「官网还是旧版本」。
  assert.strictEqual(body.avatarUpdatedAt, null, 'me.avatarUpdatedAt 无头像时必须是 null');
  // displayNameIsDefault：布尔，口径是 lib/users.ts 的 isDefaultDisplayName。
  // cc-user 的展示名是 'CC User'，与 username/打码邮箱都不同 → false。
  assertType(body.displayNameIsDefault, 'boolean', 'me.displayNameIsDefault');
  assert.strictEqual(body.displayNameIsDefault, false, '已改过名的账户 displayNameIsDefault 应为 false');
  ok('{ accountId, username, displayName, phone, avatarUpdatedAt, displayNameIsDefault, balanceCents, plan, createdAt }');

  const anon = await meGET(req('http://localhost/api/account/me'));
  assert.strictEqual(anon.status, 401);
  ok('无 Bearer → 401');
}

// ---------- 3. GET /api/account/entitlements ----------
console.log('\n[3] GET /api/account/entitlements');
{
  const res = await entitlementsGET(req('http://localhost/api/account/entitlements', awdk));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assertKeys(body, ['entitlements'], 'entitlements');
  assert.ok(Array.isArray(body.entitlements) && body.entitlements.length > 0, '测试数据应有权益');
  for (const e of body.entitlements) {
    assertKeys(e, ['feature', 'purchasedAt', 'orderId', 'expiresAt'], 'entitlement 条目');
    assertType(e.feature, 'string', 'entitlement.feature');
    assertType(e.purchasedAt, 'string', 'entitlement.purchasedAt');
    assertType(e.orderId, 'string', 'entitlement.orderId');
    assert.ok(e.expiresAt === null || typeof e.expiresAt === 'string', 'entitlement.expiresAt 应为 string | null');
  }
  ok('{ entitlements: [{ feature, purchasedAt, orderId, expiresAt }] }');

  const anon = await entitlementsGET(req('http://localhost/api/account/entitlements'));
  assert.strictEqual(anon.status, 401);
  ok('无 Bearer → 401');
}

// ---------- 4. GET /api/account/ledger ----------
console.log('\n[4] GET /api/account/ledger?limit=50');
{
  const res = await ledgerGET(req('http://localhost/api/account/ledger?limit=50', awdk));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  // 注意：Spec §9 写「流水数组」，实现落成 { entries: [...] }（W1 已发布）。
  // 以此处断言为准，doc/desktop-contract.md 同步记录。
  assertKeys(body, ['entries'], 'ledger');
  assert.ok(Array.isArray(body.entries) && body.entries.length > 0, '测试数据应有流水');
  // Credits 重构 P1：gift（兑换码/赠送入 reward 批次）与 expire（奖励批次到期作废）
  // 平台服务网关 P0：service_spend（语音转写/OCR/搜索/企业数据…的消费）。
  // **网关只加这一个 kind**，具体是哪项服务在 meta.service 里——kind 每加一个
  // 都要同步改这里、desktop-contract.md 的表、词典的 accountPage.kinds 三处，
  // 而服务会一直加下去。
  const KINDS = [
    'recharge',
    'ai_alloc',
    'purchase',
    'earning',
    'adjust',
    'gift',
    'expire',
    'service_spend',
  ];
  for (const e of body.entries) {
    assertKeys(e, ['ts', 'kind', 'amountCents', 'meta'], 'ledger 条目');
    assertType(e.ts, 'string', 'ledger.ts');
    assertType(e.amountCents, 'number', 'ledger.amountCents');
    assert.ok(KINDS.includes(e.kind), `ledger.kind 取值超出契约: ${e.kind}`);
    assert.ok(e.meta === null || typeof e.meta === 'object', 'ledger.meta 应为对象或 null');
  }
  ok('{ entries: [{ ts, kind, amountCents, meta }] }');

  const anon = await ledgerGET(req('http://localhost/api/account/ledger'));
  assert.strictEqual(anon.status, 401);
  ok('无 Bearer → 401');
}

// ---------- 4b. GET /api/account/membership ----------
console.log('\n[4b] GET /api/account/membership');
{
  // 成长值算术夹具：给专用账户手工种精确流水（computeGrowth 只读 wallet_ledger，
  // 不碰批次，所以裸 INSERT 即可，且不干扰共享账户的余额断言）。
  //   recharge  +2995                      → floor(2995 / 10) = 299
  //   ai_alloc  −1000（无 phase）
  //   service_spend −500（phase='settle'）
  //   purchase  −105（无 phase）           → spend 1605 → floor(1605 / 20) = 80
  //   service_spend −700（phase='hold'）   → 未结算预扣，必须排除（算进去会多 35 点）
  const insertLedger = getDb().prepare(
    `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta)
     VALUES (?, ?, ?, ?, 0, NULL, ?)`
  );
  insertLedger.run(memberId, createdAt, 'recharge', 2995, null);
  insertLedger.run(memberId, createdAt, 'ai_alloc', -1000, null);
  insertLedger.run(memberId, createdAt, 'service_spend', -500, JSON.stringify({ service: 'search', phase: 'settle' }));
  insertLedger.run(memberId, createdAt, 'service_spend', -700, JSON.stringify({ service: 'asr', phase: 'hold' }));
  insertLedger.run(memberId, createdAt, 'purchase', -105, null);

  const memberKey = generateApiKey(memberId).key!.plaintextKey;
  const res = await membershipGET(req('http://localhost/api/account/membership', memberKey));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assertKeys(body, ['growthPoints', 'topupCents', 'spendCents', 'tier', 'nextTier', 'tiers'], 'membership');
  assert.strictEqual(body.topupCents, 2995);
  assert.strictEqual(body.spendCents, 1605, "phase='hold' 的预扣行必须被排除");
  assert.strictEqual(body.growthPoints, 379, 'growthPoints = floor(2995/10) + floor(1605/20)');
  assertKeys(body.tier, ['key', 'level', 'nameZh', 'nameEn', 'bonusPermille'], 'membership.tier');
  assert.strictEqual(body.tier.key, 'associate');
  assert.strictEqual(body.tier.level, 2);
  assert.strictEqual(body.tier.bonusPermille, 10);
  assertKeys(
    body.nextTier,
    ['key', 'level', 'nameZh', 'nameEn', 'threshold', 'remainingPoints'],
    'membership.nextTier'
  );
  assert.strictEqual(body.nextTier.key, 'lead');
  assert.strictEqual(body.nextTier.threshold, 1500);
  assert.strictEqual(body.nextTier.remainingPoints, 1500 - 379);
  assert.ok(Array.isArray(body.tiers) && body.tiers.length === 7, '等级表必须是七档全集');
  for (const t of body.tiers) {
    assertKeys(t, ['key', 'level', 'nameZh', 'nameEn', 'threshold', 'bonusPermille'], 'membership.tiers 条目');
  }
  assert.strictEqual(body.tiers[0].key, 'paralegal');
  assert.strictEqual(body.tiers[0].threshold, 0);
  assert.strictEqual(body.tiers[6].key, 'managing-partner');
  assert.strictEqual(body.tiers[6].threshold, 150000);
  assert.strictEqual(body.tiers[6].bonusPermille, 100);
  ok('{ growthPoints, topupCents, spendCents, tier, nextTier, tiers } 且预扣 hold 行不计成长值');

  // 档位边界与顶档：tierFor 是「达到下限即入档」，顶档没有下一档
  const { tierFor, nextTierFor } = await import('@/lib/membership');
  assert.strictEqual(tierFor(299).key, 'paralegal');
  assert.strictEqual(tierFor(300).key, 'associate');
  assert.strictEqual(tierFor(150000).key, 'managing-partner');
  assert.strictEqual(nextTierFor(150000), null, '顶档 nextTier 必须是 null');
  ok('档位边界（299/300）与顶档 nextTier=null');

  // 充值赠送的硬实现（settleOrderPaid）：共享账户的 10000 分充值 → 成长值 1000 →
  // 正式律师档 10‰ → 已在 [2] 里以余额 10100 断言过入账；这里守住批次红线：
  // 赠送必须是 reward（带有效期、不可退现），绝不能做成 topup。
  const shared = await membershipGET(req('http://localhost/api/account/membership', awdk));
  const sharedBody = await shared.json();
  assert.strictEqual(sharedBody.topupCents, 10000);
  assert.strictEqual(sharedBody.growthPoints, 1000);
  assert.strictEqual(sharedBody.tier.key, 'associate');
  const bonusLot = getDb()
    .prepare("SELECT pool, expiresAt FROM credit_lots WHERE userId = ? AND sourceKind = 'membership_bonus'")
    .get(userId) as { pool: string; expiresAt: string | null } | undefined;
  assert.ok(bonusLot, '充值赠送批次（sourceKind=membership_bonus）应存在');
  assert.strictEqual(bonusLot!.pool, 'reward', '赠送必须入 reward 批次（topup 可退现，红线）');
  assert.ok(bonusLot!.expiresAt, 'reward 批次必须带有效期');
  ok('充值赠送落 reward 批次（带有效期），sourceKind=membership_bonus');

  // 无 Bearer 的 401 在本脚本里测不了：membership 是「Bearer 或 Cookie」二选一，
  // 原因同第 7 节末尾的说明（getSessionUser 脱离 Next 请求作用域会抛）。
}

// ---------- 5. POST /api/account/ai-key ----------
console.log('\n[5] POST /api/account/ai-key');
if ((await import('@/lib/site-config')).SITE_ID === 'intl') {
  getDb()
    .prepare(
      'INSERT INTO openrouter_keys (userId, orKeyHash, limitUsd, createdAt, encKey) VALUES (?, ?, ?, ?, ?)'
    )
    .run(userId, 'hash-cc', 11.42, createdAt, encryptKeyMaterial('sk-or-v1-contract-check'));
  process.env.OPENROUTER_PROVISIONING_KEY = 'mgmt-contract-check';
  mgmt.__setFetchForTests(async () => Response.json({data:{hash:'hash-cc',limit:11.42,usage:2.5,disabled:false}}));
  const res = await aiKeyPOST(jsonReq('http://localhost/api/account/ai-key', awdk, {}));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assertKeys(body, ['openrouterKey', 'limitUsd', 'provider', 'baseUrl'], 'ai-key');
  assertType(body.openrouterKey, 'string', 'ai-key.openrouterKey');
  assertType(body.limitUsd, 'number', 'ai-key.limitUsd');
  assert.strictEqual(body.openrouterKey, 'sk-or-v1-contract-check');
  assert.strictEqual(body.limitUsd, (getDb().prepare('SELECT limitUsd FROM openrouter_keys WHERE userId=?').get(userId) as {limitUsd:number}).limitUsd);
  ok('{ openrouterKey, limitUsd }');

  // 幂等：再调一次返回同一把 key，不新建
  const again = await aiKeyPOST(jsonReq('http://localhost/api/account/ai-key', awdk, {}));
  assert.strictEqual((await again.json()).openrouterKey, 'sk-or-v1-contract-check');
  ok('幂等：重复调用返回现有 key');
  mgmt.__setFetchForTests(async () => Response.json({error:{message:'offline'}},{status:503}));
  const failedSync = await aiKeyPOST(jsonReq('http://localhost/api/account/ai-key', awdk, {}));
  assert.strictEqual(failedSync.status,502);
  assert.strictEqual((await failedSync.json()).error,'upstream_failed');
  ok('已有 key 也等待额度同步；上游失败不回旧限额');
  mgmt.__setFetchForTests(null);
  delete process.env.OPENROUTER_PROVISIONING_KEY;

}

// ---------- 5b. GET /api/account/ai-usage ----------
console.log('\n[5b] GET /api/account/ai-usage');
if ((await import('@/lib/site-config')).SITE_ID === 'intl') {
  // 上游打桩沿用 verify-w2 的现成机制：openrouter-mgmt 的 __setFetchForTests。
  // 先确保 Management key 未配置（外层 shell 可能带着真实 env），验证 503 分支。
  delete process.env.OPENROUTER_PROVISIONING_KEY;
  // Credits 重构：未配置不再回 503。configured 是恒出现的状态字段，用它表达即可；
  // 用 5xx 表达「功能没开」会让桌面端把它与「官网挂了」混为一谈。
  const notCfg = await aiUsageGET(req('http://localhost/api/account/ai-usage', awdk));
  assert.strictEqual(notCfg.status, 200);
  const notCfgBody = await notCfg.json();
  assert.strictEqual(notCfgBody.configured, false);
  assert.strictEqual(notCfgBody.hasKey, true, '未配置也要如实上报已有 key');
  assertType(notCfgBody.creditsCents, 'number', 'ai-usage.creditsCents');
  ok('未配置 Management key → 200 { configured:false }，仍如实上报 hasKey');

  // 无 key 分支不访问上游：未配置也返回 200，三个金额字段恒为 0
  const noKeyUser = generateApiKey(creatorId).key!.plaintextKey;
  const noKey = await aiUsageGET(req('http://localhost/api/account/ai-usage', noKeyUser));
  assert.strictEqual(noKey.status, 200);
  const noKeyBody = await noKey.json();
  assertKeys(
    noKeyBody,
    ['provider', 'configured', 'exchangeRate', 'marginMultiplier', 'currency', 'exchangeRateSource', 'exchangeRateUpdatedAt', 'usageAvailable', 'creditsCents', 'walletBalanceCents', 'subscription', 'hasKey', 'limitUsd', 'usageUsd', 'remainingUsd', 'billingLine', 'bqtMember'],
    'ai-usage 无 key 响应'
  );
  assert.strictEqual(noKeyBody.configured, false);
  assert.strictEqual(noKeyBody.hasKey, false);
  assert.strictEqual(noKeyBody.limitUsd, 0);
  assert.strictEqual(noKeyBody.usageUsd, 0);
  assert.strictEqual(noKeyBody.remainingUsd, 0);
  // 汇率默认值**随站点**：国内站 7.3（人民币 → 美元），国际站 1（本币已是美元）。
  // 断言取 site-config 而不是写死 7.3，否则这条在国际站上必红，
  // 而红的原因是断言过时、不是实现有问题。毛利乘数两站相同。
  assert.strictEqual(noKeyBody.exchangeRate, (await import('@/lib/site-config')).siteConfig.usdExchangeRate);
  assert.strictEqual(noKeyBody.marginMultiplier, 1.2);
  // dev-board#853 追加的三个字段：桌面端模型选择器据此把美元单价换成本币实付价。
  // 汇率源打桩成不可用、也没有手动值 → 来源是站点默认值，没有更新时间。
  assert.strictEqual(noKeyBody.currency, (await import('@/lib/site-config')).siteConfig.currency);
  assert.ok(['CNY', 'USD'].includes(noKeyBody.currency), 'ai-usage.currency 只能是 CNY / USD');
  assert.strictEqual(noKeyBody.exchangeRateSource, 'default');
  assert.strictEqual(noKeyBody.exchangeRateUpdatedAt, null);
  ok('无 key → 200 { configured:false, hasKey:false, limitUsd/usageUsd/remainingUsd = 0 }');

  // 配置 + 打桩上游，验证成功形状（disabled/keyMasked 仅 hasKey=true 出现）
  process.env.OPENROUTER_PROVISIONING_KEY = 'mgmt-contract-check';
  let upstreamStatus = 200;
  mgmt.__setFetchForTests(async () =>
    new Response(
      JSON.stringify({
        data: { hash: 'hash-cc', name: 'cc', limit: 11.42, usage: 2.5, limit_remaining: 8.92, disabled: false },
      }),
      { status: upstreamStatus, headers: { 'content-type': 'application/json' } }
    )
  );
  try {
    const res = await aiUsageGET(req('http://localhost/api/account/ai-usage', awdk));
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assertKeys(
      body,
      ['provider', 'configured', 'exchangeRate', 'marginMultiplier', 'currency', 'exchangeRateSource', 'exchangeRateUpdatedAt', 'usageAvailable', 'creditsCents', 'walletBalanceCents', 'subscription', 'hasKey', 'limitUsd', 'usageUsd', 'remainingUsd', 'disabled', 'keyMasked', 'billingLine', 'bqtMember'],
      'ai-usage 成功响应'
    );
    assert.strictEqual(body.configured, true);
    assert.strictEqual(body.usageAvailable, true);
    assert.strictEqual(body.hasKey, true);
    assert.strictEqual(body.usageUsd, 2.5);
    assert.strictEqual(body.disabled, false);
    // Credits 重构：limit 不再是「当初分配的累计值」，而是每次读取时派生的
    //   已用 + 折算(可用 Credits)。写死 11.42 会在余额一变就红。
    // 折算用的汇率取本站默认值（cn 7.3 / intl 1），写死会让这条在国际站上必红，
    // 而红的原因是断言过时、不是实现有问题。
    const rate = (await import('@/lib/site-config')).siteConfig.usdExchangeRate;
    const derived = Math.round((2.5 + Math.floor(body.creditsCents / (rate * 1.2)) / 100) * 100) / 100;
    assert.strictEqual(body.limitUsd, derived, 'limitUsd 必须由余额派生');
    assert.strictEqual(body.remainingUsd, Math.round((derived - 2.5) * 100) / 100);
    // 前 6 + … + 后 4，来自 section 5 落库的明文 sk-or-v1-contract-check
    assert.strictEqual(body.keyMasked, 'sk-or-…heck');
    ok('有 key → 200 { …, creditsCents, usageAvailable, limitUsd 由余额派生 }');

    // 上游失败 → **仍然 200** + usageAvailable:false。
    // 绝不能回 4xx/5xx：桌面端把 4xx 判为凭据失效会清空已购权益缓存，
    // 而 Credits 余额是本地事实，一次上游抖动不该让它一起不可见。
    upstreamStatus = 500;
    const bad = await aiUsageGET(req('http://localhost/api/account/ai-usage', awdk));
    assert.strictEqual(bad.status, 200, '上游故障不得降级成 4xx/5xx');
    const badBody = await bad.json();
    assert.strictEqual(badBody.usageAvailable, false);
    assertType(badBody.creditsCents, 'number', 'ai-usage.creditsCents');
    // 降级分支同样带汇率三字段：桌面端算本币单价不该因为上游抖动而断掉
    assertType(badBody.currency, 'string', 'ai-usage.currency（降级）');
    assertType(badBody.exchangeRateSource, 'string', 'ai-usage.exchangeRateSource（降级）');
    assert.ok('exchangeRateUpdatedAt' in badBody, '降级分支也要带 exchangeRateUpdatedAt');
    ok('上游失败 → 200 + usageAvailable:false，Credits 照常返回');
  } finally {
    mgmt.__setFetchForTests(null);
    delete process.env.OPENROUTER_PROVISIONING_KEY;
  }
  // 无 Bearer 的 401 在本脚本里测不了：原因同第 7 节末尾对「Bearer 或 Cookie」端点的说明。
}

if ((await import('@/lib/site-config')).SITE_ID === 'cn') {
  const response=await aiKeyPOST(jsonReq('http://localhost/api/account/ai-key',awdk,{}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,'client_upgrade_required');
  const usage=await aiUsageGET(req('http://localhost/api/account/ai-usage',awdk));assert.equal(usage.status,200);
  const body=await usage.json();assert.equal(body.provider,'bailian');assert.equal(body.keyMasked,undefined);
  assertType(body.creditsCents,'number','Bailian credits');assertType(body.usageUsd,'number','Bailian usage');
  ok('Domestic legacy keys refuse migration; account usage uses local Bailian ledger (gateway details: verify-platform-ai)');
}

// ---------- 6. registry bundle 402 ----------
console.log('\n[6] registry bundle 付费闸门');
{
  const paid = await skillBundleGET(req('http://localhost/api/registry/skills/cc-paid/bundle'), p('cc-paid'));
  assert.strictEqual(paid.status, 402);
  const body = await paid.json();
  assertKeys(body, ['code', 'priceCents', 'itemName'], '402 响应');
  assert.strictEqual(body.code, 'payment_required');
  assertType(body.priceCents, 'number', '402.priceCents');
  assertType(body.itemName, 'string', '402.itemName');
  ok('未购付费 Skill → 402 { code: "payment_required", priceCents, itemName }');

  const plugin = await pluginBundleGET(
    req('http://localhost/api/registry/plugins/cc-paid-plugin/bundle', awdk),
    p('cc-paid-plugin')
  );
  assert.strictEqual(plugin.status, 402);
  assert.strictEqual((await plugin.json()).code, 'payment_required');
  ok('未购付费插件（带 Key）→ 402 同口径');

  const free = await skillBundleGET(req('http://localhost/api/registry/skills/cc-free/bundle'), p('cc-free'));
  assert.strictEqual(free.status, 200);
  const freeBody = await free.json();
  assertKeys(freeBody, ['id', 'version', 'files'], 'bundle 成功响应');
  assert.deepStrictEqual(Object.keys(freeBody.files).sort(), ['prompt.md', 'skill.yml']);
  ok('免费 Skill 匿名 → 200 { id, version, files{skill.yml, prompt.md} }');
}

// ---------- 7. POST /api/account/redeem ----------
console.log('\n[7] POST /api/account/redeem');
{
  const batch = generateGiftCodes({ count: 2, kind: 'recharge', amountCents: 500, createdBy: 'contract-check' });
  assert.ok('codes' in batch);
  const [code, spare] = batch.codes;

  const res = await redeemPOST(jsonReq('http://localhost/api/account/redeem', awdk, { code }));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assertKeys(body, ['ok', 'kind', 'amountCents', 'balanceCents'], 'redeem recharge 成功响应');
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.kind, 'recharge');
  assert.strictEqual(body.amountCents, 500);
  // 10000 充值 + 100 会员充值赠送（见 [2]/[4b]）+ 本次兑换 500
  assert.strictEqual(body.balanceCents, 10100 + 500);
  ok('recharge 码 → 200 { ok, kind, amountCents, balanceCents }');

  const dup = await redeemPOST(jsonReq('http://localhost/api/account/redeem', awdk, { code }));
  assert.strictEqual(dup.status, 409);
  const dupBody = await dup.json();
  assertKeys(dupBody, ['error', 'message'], 'redeem 失败响应');
  assert.strictEqual(dupBody.error, 'already_redeemed');
  assert.strictEqual(dupBody.message, '该兑换码已被使用');
  ok('重复兑换 → 409 { error: "already_redeemed", message }');

  const bad = await redeemPOST(jsonReq('http://localhost/api/account/redeem', awdk, { code: 'nonsense' }));
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await bad.json()).error, 'invalid_code');
  const missing = await redeemPOST(
    jsonReq('http://localhost/api/account/redeem', awdk, { code: 'AWDG-AAAA-AAAA-AAAA' })
  );
  assert.strictEqual(missing.status, 404);
  ok('格式错 → 400；不存在 → 404');

  // 备用码仍可用（失败路径不该顺手吃掉别的码）
  const spareRes = await redeemPOST(jsonReq('http://localhost/api/account/redeem', awdk, { code: spare }));
  assert.strictEqual(spareRes.status, 200);
  ok('同批次备用码不受影响');

  // 权益码成功形状：与 recharge 是两套字段，必须各自断言。
  // 只测 recharge 会漏掉「entitlement 分支返回 200 但 feature 丢了」这类漂移。
  const entBatch = generateGiftCodes({
    count: 2, kind: 'entitlement', feature: 'skill:cc-paid', createdBy: 'contract-check',
  });
  assert.ok('codes' in entBatch);
  const [entCode, entSpare] = entBatch.codes;

  const entRes = await redeemPOST(jsonReq('http://localhost/api/account/redeem', awdk, { code: entCode }));
  assert.strictEqual(entRes.status, 200);
  const entBody = await entRes.json();
  assertKeys(entBody, ['ok', 'kind', 'feature'], 'redeem entitlement 成功响应');
  assert.strictEqual(entBody.ok, true);
  assert.strictEqual(entBody.kind, 'entitlement');
  assert.strictEqual(entBody.feature, 'skill:cc-paid');
  ok('entitlement 码 → 200 { ok, kind, feature }');

  // 权益发放后付费 Skill 立即可下载（兑换与购买同一道闸门）
  const gifted = await skillBundleGET(req('http://localhost/api/registry/skills/cc-paid/bundle', awdk), p('cc-paid'));
  assert.strictEqual(gifted.status, 200, '兑换来的权益必须打开下载闸门');
  ok('兑换权益后付费 Skill bundle → 200');

  const owned = await redeemPOST(jsonReq('http://localhost/api/account/redeem', awdk, { code: entSpare }));
  assert.strictEqual(owned.status, 409);
  const ownedBody = await owned.json();
  assertKeys(ownedBody, ['error', 'message'], 'already_owned 响应');
  assert.strictEqual(ownedBody.error, 'already_owned');
  assert.strictEqual(ownedBody.message, '你已拥有该权益，兑换码未被消耗');
  ok('已拥有权益 → 409 { error: "already_owned", message }');

  // 契约写明「码未被消耗」：换个账户必须还能兑
  const otherKey = generateApiKey(creatorId).key!.plaintextKey;
  const byOther = await redeemPOST(jsonReq('http://localhost/api/account/redeem', otherKey, { code: entSpare }));
  assert.strictEqual(byOther.status, 200, 'already_owned 不得消耗码');
  assert.strictEqual((await byOther.json()).feature, 'skill:cc-paid');
  ok('already_owned 的码未被消耗，他人仍可兑换');

  // 无 Bearer 的 401 在本脚本里测不了：redeem 与 ai-key 是「Bearer 或 Cookie」二选一，
  // 无 Bearer 时会落到 getSessionUser()，而它调 next/headers 的 cookies()，
  // 脱离 Next 请求作用域直接抛错。me/entitlements/ledger 是纯 Bearer 端点，所以能测。
  // 不为此伪造请求作用域：那等于在验证脚本里重实现半个 Next 运行时。
  // 该分支由 verify-w4 的路由层用例与真机联调覆盖。
}

// ---------- 8. 站点（双主站） ----------
//
// 本节守住那条最容易被无声推翻的不变式：**两站的契约形状逐字相同，只有值不同**。
// 桌面端「切一个 base-url 就能换站」全靠它成立；一旦某个端点在国际站多回一个字段，
// 桌面端就会在一个站上正常、在另一个站上莫名其妙地失败，而没有任何护栏会响。
//
// 本脚本按 NEXT_PUBLIC_AWD_SITE 跑在**某一个**站点下。完整验收要跑两遍：
//   NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/contract-check.mts
//   NEXT_PUBLIC_AWD_SITE=intl NEXT_PUBLIC_AWD_INTL_ENTITY_NAME_EN=X \
//     NEXT_PUBLIC_AWD_INTL_ENTITY_CR_NO=Y npx tsx ... scripts/contract-check.mts
// 两遍打印的 OK 行必须逐条对应（项数与文案相同），差异只出现在下面几条断言的取值上。
{
  console.log('\n[8] 站点（双主站）');
  const { siteConfig, siteConfigOf, SITE_ID } = await import('@/lib/site-config');

  // 两套配置都必须完整。国际站的缔约主体缺失时 site-config 在导入期直接抛，
  // 所以能走到这里就说明**当前**站点的配置是齐的；另一站只查结构。
  for (const id of ['cn', 'intl'] as const) {
    const c = siteConfigOf(id);
    assert.ok(c.origin.startsWith('https://'), `${id} origin 必须是 https`);
    assert.ok(['CNY', 'USD'].includes(c.currency), `${id} 币种取值非法`);
    assert.ok(['wxpay', 'stripe'].includes(c.paymentChannel), `${id} 支付通道取值非法`);
    assert.ok(c.otherSite.id !== id, `${id} 的 otherSite 不能指向自己`);
  }
  ok('两站配置结构完整，互指对方');

  // 备案义务由**服务器与域名的备案主体**决定，不是页面语种。
  // 国际站落新加坡且 .ai 不在可备案顶级域名单里，渲染备案号就是虚假标注。
  assert.ok(siteConfigOf('cn').icpFiling.length > 0, '国内站必须有 ICP 备案号');
  assert.strictEqual(siteConfigOf('intl').icpFiling, '', '国际站不得有 ICP 备案号');
  assert.strictEqual(siteConfigOf('intl').showChineseEntityName, false);
  ok('ICP 备案：cn 有、intl 无（gate 是站点不是语种）');

  // 币种、通道、适用法必须成套分叉，缺一套就会出现「美元定价走微信支付」这种组合
  assert.notStrictEqual(siteConfigOf('cn').currency, siteConfigOf('intl').currency);
  assert.notStrictEqual(siteConfigOf('cn').paymentChannel, siteConfigOf('intl').paymentChannel);
  assert.notStrictEqual(
    siteConfigOf('cn').legalEntity.forum.en,
    siteConfigOf('intl').legalEntity.forum.en,
    '两站的争议解决机构必须不同，否则法律文本是错的'
  );
  ok('币种 / 支付通道 / 争议解决机构三者成套分叉');

  // 订单必须把当时的站点口径落库。靠部署环境反推币种，将来对账时无从复原。
  const { getOrder } = await import('@/lib/orders');
  const settled = getOrder('CC-RECHARGE-1');
  assert.ok(settled, '充值订单应存在');
  assert.strictEqual(settled!.currency, siteConfig.currency, '订单币种必须落本站币种');
  assert.strictEqual(settled!.channel, siteConfig.paymentChannel, '订单通道必须落本站通道');
  ok('订单落库带 currency 与 channel，与本站配置一致');

  // ai-usage 的 exchangeRate 是「本币 → 美元」：国内站默认 7.3，国际站恒 1。
  // **字段永远在，只有值随站点变**——桌面端已经把它当服务端下发的值读。
  const usageForSite = await aiUsageGET(req('http://localhost/api/account/ai-usage', awdk));
  const usageSiteBody = await usageForSite.json();
  assertType(usageSiteBody.exchangeRate, 'number', 'ai-usage.exchangeRate');
  assert.strictEqual(
    siteConfigOf('intl').usdExchangeRate, 1,
    '国际站本币已是美元，折算汇率必须是 1'
  );
  // 真正要守的是**下发值**跟着站点走，而不只是配置表里写对了。
  // 国际站沿用 7.3 会让用户充 $100 只拿到约 $11 的 AI 额度，
  // 而且余额、账单、扣费全都自洽，界面上一点看不出来。
  assert.strictEqual(
    usageSiteBody.exchangeRate, siteConfig.usdExchangeRate,
    `ai-usage 下发的汇率必须是本站默认值（${siteConfig.usdExchangeRate}）`
  );
  ok(`ai-usage.exchangeRate 随站点取值（当前 ${SITE_ID} = ${usageSiteBody.exchangeRate}）`);

  // 金额字段一律是**本站币种的最小单位**，响应里刻意不带 currency：
  // 同一个部署里不会出现第二种币种，带上只会诱导消费方去写多币种分支。
  const meForSite = await meGET(req('http://localhost/api/account/me', awdk));
  const meSiteBody = await meForSite.json();
  assert.ok(!('currency' in meSiteBody), '/api/account/me 不得新增 currency 字段');
  assertType(meSiteBody.balanceCents, 'number', 'me.balanceCents');
  ok('金额字段是本站币种的最小单位，响应不带 currency');
}

// ---------- 平台服务网关（P0）----------
// 桌面端把 4xx 判为凭据失效（401/403 会清空已购权益缓存），并用「登录/未授权/请先」
// 三个子串判掉线清会话。网关是一整族新端点，这两条一漏就是「用一次搜索把用户踢下线」。
console.log('\n[网关] /api/gateway/*');
{
  const { GET: gatewayPricingGET } = await import('@/app/api/gateway/pricing/route');
  const { POST: gatewayPOST } = await import('@/app/api/gateway/[service]/[op]/route');
  const { upsertPricing } = await import('@/lib/gateway/pricing');
  const { GatewayError } = await import('@/lib/gateway/errors');

  const anon = await gatewayPricingGET(req('http://localhost/api/gateway/pricing'));
  assert.strictEqual(anon.status, 401, '无 Bearer → 401');
  ok('GET /api/gateway/pricing 无 Bearer → 401');

  upsertPricing({
    service: 'search', op: 'web', unit: 'call',
    costCentsPerUnit: 10, marginMultiplier: 1.5, maxUnitsPerCall: 5, enabled: true,
  });
  const priced = await gatewayPricingGET(req('http://localhost/api/gateway/pricing', awdk));
  assert.strictEqual(priced.status, 200);
  const pricingBody = await priced.json();
  assertKeys(pricingBody, ['pricing', 'balanceCents', 'pendingHoldCents', 'billingLine', 'bqtMember'], 'gateway/pricing');
  assert.ok(Array.isArray(pricingBody.pricing) && pricingBody.pricing.length > 0);
  assertKeys(
    pricingBody.pricing[0],
    ['service', 'op', 'unit', 'creditsPerUnit', 'maxUnitsPerCall', 'enabled'],
    'gateway/pricing 条目'
  );
  assert.ok(
    !JSON.stringify(pricingBody).includes('costCentsPerUnit'),
    'pricing 展示端点不得泄露采购成本'
  );
  ok('{ pricing: [{ service, op, unit, creditsPerUnit, maxUnitsPerCall, enabled }], balanceCents, pendingHoldCents }');

  // 用量与单价刻意是两个端点：单价挂 10 分钟 TTL 缓存，用量花一笔就得变，
  // 合成一个端点两种保鲜要求必然互相迁就。
  const { GET: gatewayUsageGET } = await import('@/app/api/gateway/usage/route');
  const usageAnon = await gatewayUsageGET(req('http://localhost/api/gateway/usage'));
  assert.strictEqual(usageAnon.status, 401, '无 Bearer → 401');
  // 先造一笔真实消费再查：services 为空数组的话，条目字段名怎么漂都验不出来，
  // 而桌面端「平台服务」面板读的正是条目里的 service / cents。
  // 字段名一改，桌面端**静默**退回显示「—」（fail-safe 但无声），没人会发现。
  {
    const { withTransaction: tx } = await import('@/lib/db');
    const { grantCredits } = await import('@/lib/credits');
    const { chargeAfterSuccess } = await import('@/lib/gateway/spend');
    const { requireEnabledPricing } = await import('@/lib/gateway/pricing');
    upsertPricing({
      service: 'search', op: 'web', unit: 'call',
      costCentsPerUnit: 10, marginMultiplier: 1.5, maxUnitsPerCall: 5, enabled: true,
    });
    tx((d) => grantCredits(d, { userId, pool: 'topup', amountCents: 500, ledgerKind: 'recharge' }));
    chargeAfterSuccess({ userId, pricing: requireEnabledPricing('search', 'web'), actualUnits: 1 });
  }

  const usageRes = await gatewayUsageGET(req('http://localhost/api/gateway/usage', awdk));
  assert.strictEqual(usageRes.status, 200);
  const usageBody = await usageRes.json();
  assertKeys(
    usageBody,
    ['month', 'from', 'to', 'services', 'totalCents', 'balanceCents', 'pendingHoldCents', 'billingLine', 'bqtMember'],
    'gateway/usage'
  );
  assertType(usageBody.month, 'string', 'gateway/usage.month');
  assertType(usageBody.from, 'string', 'gateway/usage.from');
  assertType(usageBody.to, 'string', 'gateway/usage.to');
  assertType(usageBody.totalCents, 'number', 'gateway/usage.totalCents');
  assertType(usageBody.balanceCents, 'number', 'gateway/usage.balanceCents');
  assertType(usageBody.pendingHoldCents, 'number', 'gateway/usage.pendingHoldCents');
  assert.ok(Array.isArray(usageBody.services), 'gateway/usage.services 必须是数组');
  assert.ok(usageBody.services.length > 0, '刚花过钱，services 不该是空的（空数组验不出字段名漂移）');
  assertKeys(usageBody.services[0], ['service', 'cents', 'calls'], 'gateway/usage 条目');
  assertType(usageBody.services[0].service, 'string', 'gateway/usage 条目 .service');
  assertType(usageBody.services[0].cents, 'number', 'gateway/usage 条目 .cents');
  assertType(usageBody.services[0].calls, 'number', 'gateway/usage 条目 .calls');
  assert.strictEqual(
    usageBody.totalCents,
    usageBody.services.reduce((sum: number, x: { cents: number }) => sum + x.cents, 0),
    '分项之和必须等于总额'
  );
  assert.ok(
    !JSON.stringify(usageBody).includes('costCentsPerUnit'),
    'usage 端点同样不得泄露采购成本'
  );
  ok('GET /api/gateway/usage → { month, from, to, services:[{service,cents,calls}], totalCents, balanceCents, pendingHoldCents }');

  // 业务错误一律走 409/400/502/503，绝不 401/403。
  const gwParams = (service: string, op: string) => ({ params: Promise.resolve({ service, op }) });
  const gwPost = (service: string, op: string, key: string | undefined, idemKey?: string) =>
    gatewayPOST(
      new NextRequest(`http://localhost/api/gateway/${service}/${op}`, {
        method: 'POST',
        headers: {
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...(idemKey ? { 'idempotency-key': idemKey } : {}),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: 'contract' }),
      }),
      gwParams(service, op)
    );

  const noKey = await gwPost('search', 'web', awdk);
  assert.strictEqual(noKey.status, 400, '缺 Idempotency-Key → 400');
  assert.strictEqual((await noKey.json()).error, 'bad_request');
  ok('会扣费的 POST 缺 Idempotency-Key → 400 bad_request');

  upsertPricing({
    service: 'search', op: 'web', unit: 'call',
    costCentsPerUnit: 10, marginMultiplier: 1.5, maxUnitsPerCall: 5, enabled: false,
  });
  const disabled = await gwPost('search', 'web', awdk, 'contract-check-idem-key-1');
  assert.strictEqual(disabled.status, 409, '未开放的服务 → 409，绝不 401/403');
  const disabledBody = await disabled.json();
  assert.strictEqual(disabledBody.error, 'service_disabled');
  for (const s of ['登录', '未授权', '请先']) {
    assert.ok(!String(disabledBody.message).includes(s), `网关文案不得含「${s}」`);
  }
  ok('service_disabled → 409（不是 401/403），文案不含三个掉线判定子串');

  // 构造器自身是护栏：命中子串直接抛，不靠人记得
  assert.throws(() => new GatewayError('no_credits', '余额不足请先充值'), /掉线判定子串/);
  ok('GatewayError 构造器拦住踩线文案');
}

// ---------- 语音转写三端点（P2）----------
// 这条链路是**异步长任务**：提交与出结果之间隔着几十分钟，中间任何一次响应字段漂了，
// 桌面端要么收不到结果、要么把「还在跑」当成「失败了」——而钱已经被预扣占着。
console.log('\n[网关] /api/gateway/asr/*');
{
  const { POST: asrTicketPOST } = await import('@/app/api/gateway/asr/ticket/route');
  const { POST: asrSubmitPOST } = await import('@/app/api/gateway/asr/submit/route');
  const { GET: asrTaskGET } = await import('@/app/api/gateway/asr/task/[id]/route');
  const { upsertPricing } = await import('@/lib/gateway/pricing');
  const asr = await import('@/lib/gateway/asr');

  fs.writeFileSync(
    path.join(cwd, 'data', 'gateway-config.json'),
    JSON.stringify({
      aliyunAccessKeyId: 'cc-ak', aliyunAccessKeySecret: 'cc-sk', tingwuAppKey: 'cc-app',
      ossBucket: 'cc-bucket', ossEndpoint: 'oss-cn-beijing.aliyuncs.com',
    })
  );

  // 上游桩：ali-oss 走 urllib、听悟 SDK 走 darabonba，两个都不经过 globalThis.fetch
  const objects = new Map<string, number>();
  let taskStatus = 'ONGOING';
  asr.setAsrUpstream({
    presignPut: async (k) => `https://oss.test/${k}`,
    objectSize: async (k) => objects.get(k) ?? null,
    presignGet: async (k) => `https://oss.test/${k}?get=1`,
    deleteObject: async (k) => { objects.delete(k); },
    createTask: async () => 'cc-tingwu-1',
    getTask: async () => ({
      status: taskStatus, errorMessage: taskStatus === 'FAILED' ? '音频损坏' : null,
      transcriptionUrl: taskStatus === 'COMPLETED' ? 'https://tingwu.test/t' : null,
      autoChaptersUrl: null, summarizationUrl: null, meetingAssistanceUrl: null,
    }),
    fetchResult: async () => JSON.stringify({
      Transcription: { Paragraphs: [{ SpeakerId: '1', Words: [{ Start: 0, End: 600_000, Text: '喂' }] }] },
    }),
  });

  upsertPricing({
    service: 'asr', op: 'transcribe', unit: 'minute',
    costCentsPerUnit: 8, marginMultiplier: 1.25, maxUnitsPerCall: 240, enabled: true,
  });

  const asrPost = (p: string, body: unknown, key?: string, idemKey?: string) =>
    new NextRequest(`http://localhost${p}`, {
      method: 'POST',
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(idemKey ? { 'idempotency-key': idemKey } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const anonTicket = await asrTicketPOST(asrPost('/api/gateway/asr/ticket', { durationSec: 60, format: 'mp3' }));
  assert.strictEqual(anonTicket.status, 401, '无 Bearer → 401');
  ok('POST /api/gateway/asr/ticket 无 Bearer → 401');

  const ticket = await asrTicketPOST(
    asrPost('/api/gateway/asr/ticket', { durationSec: 600, format: 'mp3' }, awdk)
  );
  assert.strictEqual(ticket.status, 200);
  const ticketBody = await ticket.json();
  assertKeys(
    ticketBody,
    ['objectKey', 'uploadUrl', 'uploadMethod', 'contentType', 'expiresInSec',
      'maxUploadBytes', 'estimatedCredits', 'unit', 'balanceCents', 'needsConfirm'],
    'asr/ticket'
  );
  assert.strictEqual(ticketBody.uploadMethod, 'PUT');
  assertType(ticketBody.estimatedCredits, 'number', 'ticket.estimatedCredits');
  assertType(ticketBody.maxUploadBytes, 'number', 'ticket.maxUploadBytes');
  assertType(ticketBody.needsConfirm, 'boolean', 'ticket.needsConfirm');
  ok('{ objectKey, uploadUrl, uploadMethod, contentType, expiresInSec, maxUploadBytes, estimatedCredits, unit, balanceCents, needsConfirm }');

  // 余额闸必须在**签发凭证之前**：临时把单价抬到余额之上，观察信封
  upsertPricing({
    service: 'asr', op: 'transcribe', unit: 'minute',
    costCentsPerUnit: 100_000, marginMultiplier: 1, maxUnitsPerCall: 240, enabled: true,
  });
  const poor = await asrTicketPOST(
    asrPost('/api/gateway/asr/ticket', { durationSec: 600, format: 'mp3' }, awdk)
  );
  assert.strictEqual(poor.status, 409, '余额不足 → 409，绝不 401/403');
  const poorBody = await poor.json();
  assert.strictEqual(poorBody.error, 'no_credits');
  for (const s of ['登录', '未授权', '请先']) {
    assert.ok(!String(poorBody.message).includes(s), `no_credits 文案不得含「${s}」`);
  }
  ok('asr/ticket 余额不足 → 409 no_credits，文案不含三个掉线判定子串');
  upsertPricing({
    service: 'asr', op: 'transcribe', unit: 'minute',
    costCentsPerUnit: 8, marginMultiplier: 1.25, maxUnitsPerCall: 240, enabled: true,
  });

  const capped = await asrTicketPOST(
    asrPost('/api/gateway/asr/ticket', { durationSec: 300 * 60, format: 'mp3' }, awdk)
  );
  assert.strictEqual(capped.status, 400, '申报计量超 maxUnitsPerCall → 400');
  assert.strictEqual((await capped.json()).error, 'bad_request');
  ok('asr/ticket 申报时长超 maxUnitsPerCall → 400 bad_request');

  const noIdem = await asrSubmitPOST(
    asrPost('/api/gateway/asr/submit', { objectKey: ticketBody.objectKey, durationSec: 600 }, awdk)
  );
  assert.strictEqual(noIdem.status, 400, '会扣费的 POST 缺 Idempotency-Key → 400');
  ok('POST /api/gateway/asr/submit 缺 Idempotency-Key → 400 bad_request');

  const foreign = await asrSubmitPOST(
    asrPost('/api/gateway/asr/submit',
      { objectKey: 'asr/0000000000000000/x.mp3', durationSec: 600 }, awdk, 'cc-asr-foreign-key')
  );
  assert.strictEqual(foreign.status, 400, '对象键不属于当前账户 → 400');
  assert.strictEqual((await foreign.json()).error, 'bad_request');
  ok('asr/submit 对象键不属于当前账户 → 400 bad_request');

  objects.set(ticketBody.objectKey, 4 * 1024 * 1024);
  const submitted = await asrSubmitPOST(
    asrPost('/api/gateway/asr/submit',
      { objectKey: ticketBody.objectKey, durationSec: 600 }, awdk, 'cc-asr-submit-key-1')
  );
  assert.strictEqual(submitted.status, 200);
  const submitBody = await submitted.json();
  assertKeys(submitBody, ['taskId', 'heldCents', 'estimatedUnits', 'unit', 'pollAfterSec'], 'asr/submit');
  assertType(submitBody.taskId, 'string', 'submit.taskId');
  assertType(submitBody.heldCents, 'number', 'submit.heldCents');
  ok('{ taskId, heldCents, estimatedUnits, unit, pollAfterSec }');

  const replay = await asrSubmitPOST(
    asrPost('/api/gateway/asr/submit',
      { objectKey: ticketBody.objectKey, durationSec: 600 }, awdk, 'cc-asr-submit-key-1')
  );
  assert.strictEqual(replay.headers.get('x-gateway-replay'), '1', '同键重发回放原响应');
  ok('asr/submit 同一 Idempotency-Key 回放并带 x-gateway-replay: 1');

  const taskP = (id: string) => ({ params: Promise.resolve({ id }) });
  const taskReq = (id: string, key?: string) =>
    new NextRequest(`http://localhost/api/gateway/asr/task/${id}`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });

  assert.strictEqual(
    (await asrTaskGET(taskReq(submitBody.taskId), taskP(submitBody.taskId))).status, 401);
  ok('GET /api/gateway/asr/task/{id} 无 Bearer → 401');

  const running = await asrTaskGET(taskReq(submitBody.taskId, awdk), taskP(submitBody.taskId));
  assert.strictEqual(running.status, 200);
  assertKeys(await running.json(), ['status', 'taskId'], 'asr/task 进行中');
  ok('进行中 { status: "processing", taskId }');

  const unknown = await asrTaskGET(taskReq('asr_nonexistent', awdk), taskP('asr_nonexistent'));
  assert.strictEqual(unknown.status, 400, '查不到的任务 → 400（与越权查询同一个回答）');
  assertKeys(await unknown.json(), ['error', 'message'], 'asr/task 未知任务');
  ok('未知/非本人的任务 → 400 bad_request，信封是 { error, message }');

  taskStatus = 'COMPLETED';
  const { withTransaction } = await import('@/lib/db');
  withTransaction((d) =>
    d.prepare('UPDATE gateway_hold SET lastPolledAt = NULL WHERE taskId = ?').run(submitBody.taskId));
  const done = await asrTaskGET(taskReq(submitBody.taskId, awdk), taskP(submitBody.taskId));
  assert.strictEqual(done.status, 200);
  const doneBody = await done.json();
  assertKeys(
    doneBody,
    ['status', 'taskId', 'transcription', 'autoChapters', 'summarization', 'meetingAssistance', 'billing'],
    'asr/task 完成'
  );
  assertKeys(doneBody.billing, ['service', 'op', 'units', 'unit', 'chargedCents'], 'asr/task billing');
  assert.strictEqual(doneBody.status, 'completed');
  assert.strictEqual(doneBody.billing.units, 10, '计价用听悟返回的真实时长（600000ms = 10 分钟）');
  ok('完成 { status, taskId, transcription, autoChapters, summarization, meetingAssistance, billing:{ service, op, units, unit, chargedCents } }');

  asr.setAsrUpstream(null);
}

// ---------- 其余四家服务（P4）----------
// 这一段守的是**桌面端按什么形状读结果**：网关是唯一出口，四家的响应形状要么
// 与 BYOK 路一致（企查查的 Status/Result、Tushare 的 code/data）、要么是约定好的
// 新形状（OCR 的 content/raw）。漂一个字段名，platform 档
// 就会静默退化成「查得到但读不出来」，而 BYOK 档一切正常，排查方向全错。
console.log('\n[网关] 四家同步服务的响应形状与开关初值');
{
  const { POST: gatewayPOST } = await import('@/app/api/gateway/[service]/[op]/route');
  const { findPricing, upsertPricing } = await import('@/lib/gateway/pricing');
  const adapters = await import('@/lib/gateway/adapters');

  // 企查查与法宝在迁移 13 里是关着的（机构订阅制，按量分销需单独授权），
  // 迁移 14 起由维护者决定统一采购、开关翻到 1。这里守的不再是「必须关着」，
  // 而是**开着的服务必须真的能被调到**：定价行缺失会让「未开放」变成一条像故障的
  // not_configured，两者给用户的下一步完全不同。
  for (const [service, op] of [
    ['qichacha', 'eci_info'],
    ['pkulaw', 'search_article'],
  ] as const) {
    const row = findPricing(service, op);
    assert.ok(row, `${service} 的定价行不存在`);
    assert.strictEqual(row!.enabled, true, `${service} 的 enabled 应为 1（统一采购）`);
    assert.ok(row!.creditsPerUnit > 0, `${service} 开放了却没有单价`);
  }
  ok('企查查 / 北大法宝已开放且有单价（统一采购，迁移 14）');

  // 语音合成整体下线（桌面仓 #386：只留本机 Kokoro）。定价行必须**真的没了**，
  // 而不是留一行 enabled=0——后者是「合同没谈成」这个有定义的产品状态，
  // 拿来表示「这个服务不存在」会让桌面端显示一个等着开通的幽灵服务。
  assert.strictEqual(findPricing('tts', 'speech'), null, 'tts 定价行应已删除');
  assert.strictEqual(findPricing('tts', 'voices'), null, 'tts/voices 定价行应已删除');
  assert.ok(!adapters.registeredServices().includes('tts'), 'tts 适配器应已从注册表删除');
  ok('tts 已整体下线：适配器与定价行都不存在');

  for (const [service, op, unit] of [
    ['ocr', 'recognize', 'page'],
    ['tushare', 'query', 'call'],
  ] as const) {
    const row = findPricing(service, op)!;
    assert.strictEqual(row.unit, unit, `${service}/${op} 的计量单位漂了`);
  }
  ok('计量单位：ocr=page、qichacha/tushare/pkulaw=call');

  // OCR 的上游走 SDK（darabonba httpx），不经过 globalThis.fetch，用注入桩
  adapters.setOcrUpstream({
    async recognize() {
      return { content: '识别正文', raw: '{"content":"识别正文"}', pages: 2 };
    },
  });
  fs.writeFileSync(
    path.join(cwd, 'data', 'gateway-config.json'),
    JSON.stringify({ aliyunAccessKeyId: 'cc-ak', aliyunAccessKeySecret: 'cc-sk' })
  );
  upsertPricing({
    service: 'ocr', op: 'recognize', unit: 'page',
    costCentsPerUnit: 2, marginMultiplier: 1.5, maxUnitsPerCall: 50, enabled: true,
  });

  const ocrRes = await gatewayPOST(
    new NextRequest('http://localhost/api/gateway/ocr/recognize', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${awdk}`,
        'idempotency-key': 'contract-check-ocr-1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ imageBase64: Buffer.from('png').toString('base64') }),
    }),
    { params: Promise.resolve({ service: 'ocr', op: 'recognize' }) }
  );
  assert.strictEqual(ocrRes.status, 200);
  const ocrBody = await ocrRes.json();
  assertKeys(ocrBody, ['ok', 'data', 'billing'], 'gateway 同步入口');
  assertKeys(ocrBody.billing, ['service', 'op', 'units', 'unit', 'chargedCents'], 'gateway billing');
  assertKeys(ocrBody.data, ['content', 'raw'], 'ocr/recognize data');
  assert.strictEqual(ocrBody.billing.units, 2, '计价用上游报的页数，不是客户端申报值');
  ok('ocr/recognize → { ok, data:{ content, raw }, billing:{ service, op, units, unit, chargedCents } }');

  adapters.setOcrUpstream(null);
}

console.log(`\n契约全绿：${checked} 项`);
