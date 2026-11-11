/**
 * 平台服务网关（P0）验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-gateway.mts
 *
 * 覆盖设计文档 §11 列的官网侧全部用例：
 * - 定价：服务端权威（客户端传的 priceCents 被忽略）、enabled=0 → service_disabled、
 *   缺行 → not_configured、maxUnitsPerCall 超限 → 400
 * - 事后扣：按上游真实计量计价（客户端申报值不参与）、失败不扣、失败退款原批次原额
 * - 预扣三行账：hold → release+settle 同事务、真实计量 2 倍于申报且余额不足 → 扣到 0 + shortfall 审计
 * - hold 超时回收：过期 hold 被释放、余额自动恢复
 * - 幂等：同键连发两次上游只被调一次、只产生一行 service_spend；failed 允许重跑
 * - 文案红线：余额不足信封不含「登录」「未授权」「请先」
 * - 静态护栏：spend.ts 里每个改动余额的导出函数都接了 AI 额度同步钩子
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify([
        {
            id: userId,
            username: 'gw-tester',
            email: 'gw@test.local',
            passwordHash: 'x:y',
            displayName: 'Gateway Tester',
            createdAt: new Date().toISOString(),
        },
    ])
);
// 供应商凭证：让 search adapter 与 asr 都认为自己配好了。
// search 的真实请求由下面的 fetch 桩接管；asr 走的是 ali-oss / 听悟 SDK，
// 两个都不经过 globalThis.fetch，所以另有一个 setAsrUpstream 的注入桩。
fs.writeFileSync(
    path.join(cwd, 'data', 'gateway-config.json'),
    JSON.stringify({
        bochaApiKey: 'test-key',
        aliyunAccessKeyId: 'test-ak',
        aliyunAccessKeySecret: 'test-sk',
        tingwuAppKey: 'test-appkey',
        ossBucket: 'test-bucket',
        ossEndpoint: 'oss-cn-beijing.aliyuncs.com',
        holdThresholdCents: 500,
        holdTtlMinutes: 240,
    })
);

const { getDb, withTransaction } = await import('@/lib/db');
const { grantCredits, getBalance } = await import('@/lib/credits');
const { generateApiKey } = await import('@/lib/api-keys');
const pricing = await import('@/lib/gateway/pricing');
const spend = await import('@/lib/gateway/spend');
const idem = await import('@/lib/gateway/idempotency');
const { GatewayError, assertSafeMessage } = await import('@/lib/gateway/errors');
const { POST: gatewayPOST } = await import('@/app/api/gateway/[service]/[op]/route');
const { GET: pricingGET } = await import('@/app/api/gateway/pricing/route');
const asr = await import('@/lib/gateway/asr');
const { POST: ticketPOST } = await import('@/app/api/gateway/asr/ticket/route');
const { POST: submitPOST } = await import('@/app/api/gateway/asr/submit/route');
const { GET: taskGET } = await import('@/app/api/gateway/asr/task/[id]/route');
const { NextRequest } = await import('next/server');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

const apiKey = generateApiKey(userId).key!.plaintextKey;

function fund(amountCents: number, pool: 'topup' | 'reward' = 'topup') {
    withTransaction((d) =>
        grantCredits(d, { userId, pool, amountCents, ledgerKind: 'recharge' })
    );
}

function ledgerRows(kind?: string) {
    const sql = kind
        ? 'SELECT * FROM wallet_ledger WHERE userId = ? AND kind = ? ORDER BY id'
        : 'SELECT * FROM wallet_ledger WHERE userId = ? ORDER BY id';
    const args = kind ? [userId, kind] : [userId];
    return getDb().prepare(sql).all(...args) as {
        id: number;
        kind: string;
        amountCents: number;
        meta: string | null;
    }[];
}

function auditRows(action: string) {
    return getDb()
        .prepare('SELECT * FROM admin_audit WHERE action = ? ORDER BY id')
        .all(action) as { detail: string }[];
}

// 上游桩：记录被调用次数，可切换成功/失败
let upstreamCalls = 0;
let upstreamMode: 'ok' | 'fail' = 'ok';

/**
 * P4 四家的上游桩，按域名分发。
 *
 * 每家记一次调用次数——「上游到底被打了几次」是幂等与「失败不扣费」两条
 * 断言里唯一说得清的证据，光看余额分不出「没扣」和「扣了又退」。
 */
const vendorCalls: Record<string, number> = {};
const vendorHandlers: Record<string, (url: string, init?: RequestInit) => Response> = {};
function countVendor(name: string) {
    vendorCalls[name] = (vendorCalls[name] ?? 0) + 1;
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('bochaai.com')) {
        upstreamCalls++;
        if (upstreamMode === 'fail') {
            return new Response('boom', { status: 500 });
        }
        return new Response(JSON.stringify({ data: { webPages: { value: [{ name: 'x' }] } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }
    for (const [host, handler] of Object.entries(vendorHandlers)) {
        if (url.includes(host)) return handler(url, init);
    }
    return realFetch(input as RequestInfo, init);
}) as typeof fetch;

const gwReq = (service: string, op: string, body: unknown, key: string | null, idemKey?: string) =>
    new NextRequest(`https://test.local/api/gateway/${service}/${op}`, {
        method: 'POST',
        headers: {
            ...(key ? { authorization: `Bearer ${key}` } : {}),
            ...(idemKey ? { 'idempotency-key': idemKey } : {}),
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
const gwParams = (service: string, op: string) => ({ params: Promise.resolve({ service, op }) });

// ===========================================================================
console.log('\n[1] 定价：服务端权威与三种缺失状态');
// ===========================================================================
{
    // 没建行 → not_configured。
    // **必须用一个永远不会被播种的服务名**：迁移 13 起所有真实服务都自带定价行了，
    // 拿 search 来验「缺行」会随播种表的增删而时对时错——那种护栏比没有还糟。
    let err: unknown;
    try {
        pricing.requireEnabledPricing('never-seeded-service', 'noop');
    } catch (e) {
        err = e;
    }
    assert.ok(err instanceof GatewayError && err.code === 'not_configured', '缺定价行应为 not_configured');
    ok('定价行不存在 → not_configured（我们漏建行，不是产品未开放）');

    // 建行但关着 → service_disabled。
    // 关的是**精确 op 行**：迁移 13 已经给 search/web 播了一条 enabled=1 的精确行，
    // 只关通配行的话精确行照样命中，这条断言会静默失效。
    pricing.upsertPricing({
        service: 'search',
        op: 'web',
        unit: 'call',
        costCentsPerUnit: 10,
        marginMultiplier: 1.5,
        maxUnitsPerCall: 5,
        enabled: false,
    });
    err = undefined;
    try {
        pricing.requireEnabledPricing('search', 'web');
    } catch (e) {
        err = e;
    }
    assert.ok(err instanceof GatewayError && err.code === 'service_disabled');
    assert.strictEqual((err as InstanceType<typeof GatewayError>).status, 409, '不得用 401/403');
    ok('enabled=0 → service_disabled 且状态码不是 401/403');

    // 打开，校验 creditsPerUnit 由成本 × 加价率算出
    const row = pricing.upsertPricing({
        service: 'search',
        op: '*',
        unit: 'call',
        costCentsPerUnit: 10,
        marginMultiplier: 1.5,
        maxUnitsPerCall: 5,
        enabled: true,
    });
    assert.strictEqual(row.creditsPerUnit, 15, '10 分成本 × 1.5 加价率 = 15 分');
    ok('creditsPerUnit = 成本 × 按服务分档的加价率');

    // 派生单价**恒 ≥ 成本**。这条护栏防的是把取整改回 Math.round：
    // 成本 2 分 × 1.2 = 2.4，四舍五入回 2 分就是零毛利，而语音正是最高频的一项。
    // 少收的那半分钱没有任何地方能补回来，取整方向必须站在「不低于成本」这一侧。
    const zeroMargin = pricing.upsertPricing({
        service: 'guard-rounding', op: 'ceil', unit: 'call',
        costCentsPerUnit: 2, marginMultiplier: 1.2, maxUnitsPerCall: 1, enabled: true,
    });
    assert.strictEqual(zeroMargin.creditsPerUnit, 3, '2 × 1.2 = 2.4，必须进位到 3 而不是回落到 2');
    for (const [cost, margin] of [
        [2, 1.2], [1.5, 1.2], [0.1, 1.2], [8.25, 1.2], [3.6, 1.2], [100, 1.2], [0, 1.2], [7, 1],
    ] as [number, number][]) {
        assert.ok(
            pricing.deriveCreditsPerUnit(cost, margin) >= cost,
            `派生单价 ${pricing.deriveCreditsPerUnit(cost, margin)} 低于成本 ${cost}——每一次调用都在亏`
        );
    }
    // 库里现有的每一行也得满足（迁移里写死的取整值同样受这条约束）
    for (const r of pricing.listPricing()) {
        assert.ok(
            r.creditsPerUnit >= r.costCentsPerUnit,
            `${r.service}/${r.op} 的单价 ${r.creditsPerUnit} 低于成本 ${r.costCentsPerUnit}`
        );
    }
    ok('派生单价恒 ≥ 成本（向上取整，不是四舍五入）');

    // 精确 op 覆盖通配行
    pricing.upsertPricing({
        service: 'search',
        op: 'web',
        unit: 'call',
        costCentsPerUnit: 20,
        marginMultiplier: 1.5,
        maxUnitsPerCall: 5,
        enabled: true,
    });
    assert.strictEqual(pricing.requireEnabledPricing('search', 'web').creditsPerUnit, 30);
    assert.strictEqual(pricing.requireEnabledPricing('search', 'other').creditsPerUnit, 15);
    ok('op 精确行优先于 * 通配行');

    // 计量上限
    let capErr: unknown;
    try {
        pricing.assertUnitsWithinCap(pricing.requireEnabledPricing('search', 'web'), 99);
    } catch (e) {
        capErr = e;
    }
    assert.ok(capErr instanceof GatewayError && capErr.code === 'bad_request');
    assert.strictEqual((capErr as InstanceType<typeof GatewayError>).status, 400);
    ok('申报计量超 maxUnitsPerCall → 400，不放行了再兜底');
}

// ===========================================================================
console.log('\n[2] 文案红线：三个掉线判定子串一个都不许出现');
// ===========================================================================
{
    fund(0 + 1); // 1 分，肯定不够
    let err: unknown;
    try {
        spend.assertBalanceFor(userId, 100000);
    } catch (e) {
        err = e;
    }
    assert.ok(err instanceof GatewayError && err.code === 'no_credits');
    assert.strictEqual((err as InstanceType<typeof GatewayError>).status, 409, '余额不足绝不用 401/403');
    for (const s of ['登录', '未授权', '请先']) {
        assert.ok(!(err as Error).message.includes(s), `余额不足文案不得含「${s}」`);
    }
    ok('余额不足 → 409 no_credits，文案不含三个掉线子串');

    // 构造器自身就是护栏：命中子串直接抛
    assert.throws(() => new GatewayError('no_credits', '余额不足请先充值'), /掉线判定子串/);
    assert.doesNotThrow(() => assertSafeMessage('Credits 余额不足，到官网充值后即可继续'));
    ok('GatewayError 构造器拦住踩线文案（不靠人记得）');
}

// ===========================================================================
console.log('\n[3] 事后扣：按上游真实计量计价，客户端申报值不参与');
// ===========================================================================
{
    fund(10_000);
    const before = getBalance(userId);
    const p = pricing.requireEnabledPricing('search', 'web'); // 30 分/次

    // 客户端说 1 次，上游返回 3 次的计量 → 按 3 计价
    const r = spend.chargeAfterSuccess({ userId, pricing: p, actualUnits: 3 });
    assert.strictEqual(r.chargedCents, 90, '3 × 30 = 90');
    assert.strictEqual(r.shortfallCents, 0);
    assert.strictEqual(getBalance(userId), before - 90);

    const rows = ledgerRows('service_spend');
    const last = rows[rows.length - 1];
    const meta = JSON.parse(last.meta!);
    assert.strictEqual(meta.service, 'search');
    assert.strictEqual(meta.units, 3);
    assert.strictEqual(meta.unit, 'call');
    ok('计价用上游真实计量；service 进 meta 而不是新开一个 ledger kind');

    // 失败退款：原批次原额
    const refundTarget = spend.chargeAfterSuccess({ userId, pricing: p, actualUnits: 1 });
    const afterCharge = getBalance(userId);
    spend.refundCharge(userId, refundTarget.ledgerId!);
    assert.strictEqual(getBalance(userId), afterCharge + 30, '退款金额与扣款相等');
    const adjusts = ledgerRows('adjust');
    assert.ok(adjusts.length >= 1 && adjusts[adjusts.length - 1].amountCents === 30);
    const rmeta = JSON.parse(adjusts[adjusts.length - 1].meta!);
    assert.ok(Array.isArray(rmeta.lots) && rmeta.lots.length > 0, '退款必须带原批次明细');
    ok('失败退款走 refundSpend，带原批次明细（绝不「再发一笔」）');
}

// ===========================================================================
console.log('\n[4] 事后扣：余额不足时扣到 0 + 写 shortfall，绝不扣成负数');
// ===========================================================================
{
    // 把余额压到 10 分，然后扣一笔 90 分的
    const balance = getBalance(userId);
    if (balance > 10) {
        withTransaction((d) => {
            d.prepare('UPDATE credit_lots SET remainingCents = 0 WHERE userId = ?').run(userId);
        });
        fund(10);
    }
    const p = pricing.requireEnabledPricing('search', 'web');
    const r = spend.chargeAfterSuccess({ userId, pricing: p, actualUnits: 3 });
    assert.strictEqual(r.chargedCents, 10, '只扣得到 10 分');
    assert.strictEqual(r.shortfallCents, 80);
    assert.strictEqual(getBalance(userId), 0, '余额扣到 0，绝不为负');
    const audits = auditRows('gateway_spend_shortfall');
    assert.ok(audits.length === 1);
    assert.strictEqual(JSON.parse(audits[0].detail).shortfallCents, 80);
    ok('扣到 0 + 一条 shortfall 审计，差额平台吃掉但留痕');
}

// ===========================================================================
console.log('\n[5] 预扣三行账');
// ===========================================================================
{
    fund(100_000);
    // 语音这一段的 10 分/分钟是**测试夹具，不是真实单价**：这些用例验的是三行账的机制，
    // 不是价格对不对。所以把精确行也一起写死——只写通配行的话，迁移里那条精确的
    // asr/transcribe 会盖过它（精确优先），断言就跟着真实价格一起漂。
    for (const op of ['*', 'transcribe']) {
        pricing.upsertPricing({
            service: 'asr',
            op,
            unit: 'minute',
            costCentsPerUnit: 8,
            marginMultiplier: 1.25,
            maxUnitsPerCall: 240,
            enabled: true,
        });
    }
    const p = pricing.requireEnabledPricing('asr', 'transcribe'); // 10 分/分钟

    const beforeHold = getBalance(userId);
    const taskId = 'task-' + crypto.randomUUID();
    const held = spend.openHold({
        userId,
        taskId,
        pricing: p,
        estimatedUnits: 60,
        nowMs: Date.now(),
    });
    assert.strictEqual(held.heldCents, 600);
    assert.strictEqual(getBalance(userId), beforeHold - 600, 'hold 立刻压低余额');
    assert.strictEqual(spend.pendingHoldCents(userId), 600, '账户页能解释这 600 去哪了');
    ok('① hold：占住估算额并落一行服务端状态');

    // 真实 42 分钟 → 结算 420
    const settle = spend.settleHold(taskId, 42, p);
    assert.strictEqual(settle.chargedCents, 420);
    assert.strictEqual(settle.shortfallCents, 0);
    assert.strictEqual(getBalance(userId), beforeHold - 420, '按真实时长结算');
    assert.strictEqual(spend.pendingHoldCents(userId), 0);
    assert.strictEqual(spend.findHold(taskId)!.status, 'settled');

    const phases = ledgerRows()
        .filter((r) => r.meta && JSON.parse(r.meta).taskId === taskId)
        .map((r) => JSON.parse(r.meta!).phase);
    assert.deepStrictEqual(phases, ['hold', 'hold_release', 'settle'], '三行账齐全且顺序正确');
    ok('②③ 同事务：释放预扣 + 按真实计量重扣，账面留三行');

    // 幂等：重复结算不再改变余额
    const afterSettle = getBalance(userId);
    spend.settleHold(taskId, 42, p);
    assert.strictEqual(getBalance(userId), afterSettle, '重复结算是零变更');
    ok('重复结算幂等（已 settled 的 hold 不再动账）');
}

// ===========================================================================
console.log('\n[6] 预扣：真实计量超估算且余额不足 → 扣到 0 + shortfall，不回滚整笔');
// ===========================================================================
{
    withTransaction((d) => {
        d.prepare('UPDATE credit_lots SET remainingCents = 0 WHERE userId = ?').run(userId);
    });
    fund(600);
    const p = pricing.requireEnabledPricing('asr', 'transcribe');
    const taskId = 'task-' + crypto.randomUUID();
    spend.openHold({ userId, taskId, pricing: p, estimatedUnits: 60, nowMs: Date.now() });
    assert.strictEqual(getBalance(userId), 0, '预扣把余额占光');

    // 真实 120 分钟 = 1200 分，可用只有释放回来的 600
    const before = auditRows('gateway_spend_shortfall').length;
    const settle = spend.settleHold(taskId, 120, p);
    assert.strictEqual(settle.chargedCents, 600, '扣到 0 为止');
    assert.strictEqual(settle.shortfallCents, 600);
    assert.strictEqual(getBalance(userId), 0, '绝不扣成负数');
    assert.strictEqual(spend.findHold(taskId)!.status, 'settled', '结算整笔完成，不回滚');
    assert.strictEqual(auditRows('gateway_spend_shortfall').length, before + 1);
    ok('真实计量 2 倍于申报且余额不足：扣到 0 + shortfall 审计 + 结算不回滚');
}

// ===========================================================================
console.log('\n[7] hold 超时回收：余额自动恢复，不靠客户端轮询');
// ===========================================================================
{
    fund(10_000);
    const p = pricing.requireEnabledPricing('asr', 'transcribe');
    const taskId = 'task-' + crypto.randomUUID();
    const before = getBalance(userId);
    // 用一个「4 小时前」的 now 造出已过期的 hold
    spend.openHold({
        userId,
        taskId,
        pricing: p,
        estimatedUnits: 30,
        nowMs: Date.now() - 5 * 60 * 60 * 1000,
    });
    assert.strictEqual(getBalance(userId), before - 300);

    const res = spend.reclaimExpiredHolds();
    assert.ok(res.released >= 1);
    assert.strictEqual(getBalance(userId), before, '过期预扣被释放，余额自动恢复');
    assert.strictEqual(spend.findHold(taskId)!.status, 'released');
    ok('过期 hold 由服务端回收（用户合盖笔记本不会把钱永久冻结）');

    // 再跑一次不重复释放
    const again = getBalance(userId);
    spend.reclaimExpiredHolds();
    assert.strictEqual(getBalance(userId), again);
    ok('回收幂等，重复执行不重复退款');
}

// ===========================================================================
console.log('\n[8] 幂等：同键连发两次，上游只调一次、只扣一次');
// ===========================================================================
{
    fund(10_000);
    upstreamCalls = 0;
    upstreamMode = 'ok';
    const key = 'idem-' + crypto.randomUUID().replace(/-/g, '');
    const spendBefore = ledgerRows('service_spend').length;
    const balanceBefore = getBalance(userId);

    const r1 = await gatewayPOST(gwReq('search', 'web', { query: 'a' }, apiKey, key), gwParams('search', 'web'));
    assert.strictEqual(r1.status, 200);
    const b1 = await r1.json();
    assert.strictEqual(b1.billing.chargedCents, 30);

    const r2 = await gatewayPOST(gwReq('search', 'web', { query: 'a' }, apiKey, key), gwParams('search', 'web'));
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.headers.get('x-gateway-replay'), '1');
    const b2 = await r2.json();
    assert.deepStrictEqual(b2, b1, '回放的是原响应');

    assert.strictEqual(upstreamCalls, 1, '上游只被调一次');
    assert.strictEqual(ledgerRows('service_spend').length, spendBefore + 1, '只产生一行扣费');
    assert.strictEqual(getBalance(userId), balanceBefore - 30, '只扣一次');
    ok('同一 Idempotency-Key 连发两次：上游一次、扣费一次、回放原响应');

    // 缺幂等键直接 400
    const r3 = await gatewayPOST(gwReq('search', 'web', { query: 'a' }, apiKey), gwParams('search', 'web'));
    assert.strictEqual(r3.status, 400);
    assert.strictEqual((await r3.json()).error, 'bad_request');
    ok('缺 Idempotency-Key → 400，不给「先跑一次再说」的机会');

    // 未鉴权 → 401（唯一允许 401 的地方）
    const r4 = await gatewayPOST(gwReq('search', 'web', { query: 'a' }, null, 'k'.repeat(12)), gwParams('search', 'web'));
    assert.strictEqual(r4.status, 401);
    ok('无 Bearer → 401（真凭据问题，与业务错误分开）');
}

// ===========================================================================
console.log('\n[9] 上游失败：不扣费，且同键允许重跑');
// ===========================================================================
{
    const key = 'idem-' + crypto.randomUUID().replace(/-/g, '');
    const spendBefore = ledgerRows('service_spend').length;
    const balanceBefore = getBalance(userId);

    upstreamMode = 'fail';
    upstreamCalls = 0;
    const r1 = await gatewayPOST(gwReq('search', 'web', { query: 'b' }, apiKey, key), gwParams('search', 'web'));
    assert.strictEqual(r1.status, 502);
    assert.strictEqual((await r1.json()).error, 'upstream_failed');
    assert.strictEqual(ledgerRows('service_spend').length, spendBefore, '失败不扣费');
    assert.strictEqual(getBalance(userId), balanceBefore);
    assert.strictEqual(idem.findRequest(userId, key)!.status, 'failed');
    ok('上游失败：502 upstream_failed，一分钱不扣');

    upstreamMode = 'ok';
    const r2 = await gatewayPOST(gwReq('search', 'web', { query: 'b' }, apiKey, key), gwParams('search', 'web'));
    assert.strictEqual(r2.status, 200, 'failed 的键允许重跑');
    assert.strictEqual(ledgerRows('service_spend').length, spendBefore + 1);
    ok('失败过的幂等键允许重跑（失败没扣费，重试是用户想要的）');
}

// ===========================================================================
console.log('\n[10] 客户端传价格无效；未开放的服务照旧被拒');
// ===========================================================================
{
    const key = 'idem-' + crypto.randomUUID().replace(/-/g, '');
    const balanceBefore = getBalance(userId);
    const r = await gatewayPOST(
        gwReq('search', 'web', { query: 'c', priceCents: 0, creditsPerUnit: 0 }, apiKey, key),
        gwParams('search', 'web')
    );
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await r.json()).billing.chargedCents, 30, '客户端传的价格被忽略');
    assert.strictEqual(getBalance(userId), balanceBefore - 30);
    ok('客户端传 priceCents/creditsPerUnit 一律忽略，计价只认服务端');

    pricing.upsertPricing({
        service: 'search',
        op: 'web',
        unit: 'call',
        costCentsPerUnit: 20,
        marginMultiplier: 1.5,
        maxUnitsPerCall: 5,
        enabled: false,
    });
    const r2 = await gatewayPOST(
        gwReq('search', 'web', { query: 'd' }, apiKey, 'idem-' + crypto.randomUUID().replace(/-/g, '')),
        gwParams('search', 'web')
    );
    assert.strictEqual(r2.status, 409);
    assert.strictEqual((await r2.json()).error, 'service_disabled');
    ok('enabled=0 时通用入口直接拒，且不是 401/403');
    pricing.upsertPricing({
        service: 'search',
        op: 'web',
        unit: 'call',
        costCentsPerUnit: 20,
        marginMultiplier: 1.5,
        maxUnitsPerCall: 5,
        enabled: true,
    });
}

// ===========================================================================
console.log('\n[11] /api/gateway/pricing：展示用，带余额与占用中的预扣');
// ===========================================================================
{
    const res = await pricingGET(
        new NextRequest('https://test.local/api/gateway/pricing', {
            headers: { authorization: `Bearer ${apiKey}` },
        })
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.pricing) && body.pricing.length >= 2);
    assert.ok(typeof body.balanceCents === 'number');
    assert.ok(typeof body.pendingHoldCents === 'number');
    assert.ok(
        !JSON.stringify(body).includes('costCentsPerUnit'),
        '展示端点不许泄露采购成本'
    );
    ok('pricing 端点回单价 + 余额 + 占用中的预扣，且不泄露采购成本');
}

// ===========================================================================
console.log('\n[12] 静态护栏：每条改动余额的路径都接了 AI 额度同步');
// ===========================================================================
{
    const src = fs.readFileSync(path.join(repoRoot, 'lib', 'gateway', 'spend.ts'), 'utf-8');
    // 这一条防的是「以后有人加了第五条扣费路径却忘了降 AI 额度」——
    // 忘了的后果是同一笔余额被网关和 AI 各花一遍，差额平台吃掉，账面上只留一条审计。
    for (const fn of [
        'chargeAfterSuccess',
        'refundCharge',
        'openHold',
        'settleHold',
        'releaseHold',
        // 跨设备文件传输（dev-board#251）：内部记账口调的两条余额路径，同样不许漏钩子。
        'chargeTransfer',
        'refundTransfer',
    ]) {
        const start = src.indexOf(`export function ${fn}`);
        assert.ok(start > 0, `spend.ts 缺少导出函数 ${fn}`);
        const nextExport = src.indexOf('\nexport ', start + 1);
        const bodySrc = src.slice(start, nextExport === -1 ? undefined : nextExport);
        assert.ok(
            bodySrc.includes('resyncAiQuota'),
            `${fn} 改动了余额却没调 resyncAiQuota——同一笔钱会被网关和 AI 各花一遍`
        );
    }
    ok('spend.ts 的七条余额路径全部接了 AI 额度同步钩子');
}

// ===========================================================================
// 语音转写（P2）：控制面 / 数据面分离的三个端点
// ===========================================================================

/** 阿里云上游桩：记账每一次调用，便于断言「该发生的发生了、不该发生的一次都没有」。 */
class AsrStub {
    presigned: string[] = [];
    deleted: string[] = [];
    created: string[] = [];
    objects = new Map<string, number>();
    upstreamTaskId = 'tingwu-task-1';
    createTaskError: Error | null = null;
    task = {
        status: 'ONGOING',
        errorMessage: null as string | null,
        transcriptionUrl: null as string | null,
        autoChaptersUrl: null as string | null,
        summarizationUrl: null as string | null,
        meetingAssistanceUrl: null as string | null,
    };
    results = new Map<string, string>();

    async presignPut(objectKey: string) {
        this.presigned.push(objectKey);
        return `https://oss.test/${objectKey}?sig=x`;
    }
    async objectSize(objectKey: string) {
        return this.objects.has(objectKey) ? this.objects.get(objectKey)! : null;
    }
    async presignGet(objectKey: string) {
        return `https://oss.test/${objectKey}?get=1`;
    }
    async deleteObject(objectKey: string) {
        this.deleted.push(objectKey);
        this.objects.delete(objectKey);
    }
    async createTask(fileUrl: string) {
        if (this.createTaskError) throw this.createTaskError;
        this.created.push(fileUrl);
        return this.upstreamTaskId;
    }
    async getTask() {
        return this.task;
    }
    async fetchResult(url: string) {
        const body = this.results.get(url);
        if (body === undefined) throw new Error('404');
        return body;
    }
}

const stub = new AsrStub();
asr.setAsrUpstream(stub);

/** 一份「真实 60 分钟」的听悟转写结果：最后一个词的 End 是 3600000 毫秒。 */
const TRANSCRIPTION_60MIN = JSON.stringify({
    Transcription: {
        Paragraphs: [
            { SpeakerId: '1', Words: [{ Start: 0, End: 900, Text: '开始' }] },
            { SpeakerId: '2', Words: [{ Start: 3_599_000, End: 3_600_000, Text: '结束' }] },
        ],
    },
});

const asrReq = (path: string, body: unknown, key: string | null, idemKey?: string) =>
    new NextRequest(`https://test.local${path}`, {
        method: 'POST',
        headers: {
            ...(key ? { authorization: `Bearer ${key}` } : {}),
            ...(idemKey ? { 'idempotency-key': idemKey } : {}),
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
const taskReq = (id: string, key: string | null) =>
    new NextRequest(`https://test.local/api/gateway/asr/task/${id}`, {
        headers: key ? { authorization: `Bearer ${key}` } : {},
    });
const taskParams = (id: string) => ({ params: Promise.resolve({ id }) });
const newIdem = () => 'idem-' + crypto.randomUUID().replace(/-/g, '');

function zeroBalance() {
    withTransaction((d) => {
        d.prepare('UPDATE credit_lots SET remainingCents = 0 WHERE userId = ?').run(userId);
    });
}

// ===========================================================================
console.log('\n[13] asr/ticket：余额闸在上传之前，且被拒时一张凭证都不签');
// ===========================================================================
{
    zeroBalance();
    fund(10); // 远不够 30 分钟（300 分）
    const before = stub.presigned.length;
    const res = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 1800, format: 'mp3' }, apiKey)
    );
    assert.strictEqual(res.status, 409, '余额不足绝不用 401/403');
    const body = await res.json();
    assert.strictEqual(body.error, 'no_credits');
    for (const s of ['登录', '未授权', '请先']) {
        assert.ok(!String(body.message).includes(s), `ticket 文案不得含「${s}」`);
    }
    assert.strictEqual(stub.presigned.length, before, '余额不足时不许签发任何上传凭证');
    ok('余额不足 → 409 no_credits，且一张直传凭证都没签（用户不必白传两小时录音）');
}

// ===========================================================================
console.log('\n[14] asr/ticket：申报时长受 maxUnitsPerCall 约束，参数非法直接拒');
// ===========================================================================
// TTS 下线之后，**语音转写是唯一一个客户端会申报计量的服务**（其余各家的 units
// 都从上游响应里取），所以 maxUnitsPerCall 这条闸只剩这一处能验到。别顺手删。
{
    fund(100_000);
    const before = stub.presigned.length;

    // 定价 maxUnitsPerCall = 240 分钟；申报 300 分钟
    const tooLong = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 300 * 60, format: 'mp3' }, apiKey)
    );
    assert.strictEqual(tooLong.status, 400);
    assert.strictEqual((await tooLong.json()).error, 'bad_request');
    ok('durationSec 超 maxUnitsPerCall → 400');

    const badFormat = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 600, format: '../evil' }, apiKey)
    );
    assert.strictEqual(badFormat.status, 400, '格式白名单外一律拒（objectKey 的后缀来自它）');
    ok('音频格式走白名单，非法值 → 400');

    const badDuration = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: -1, format: 'mp3' }, apiKey)
    );
    assert.strictEqual(badDuration.status, 400);
    ok('durationSec 非正 → 400');

    assert.strictEqual(stub.presigned.length, before, '任何一条拒绝路径都不该签出凭证');

    const anon = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 600, format: 'mp3' }, null)
    );
    assert.strictEqual(anon.status, 401, '无 Bearer → 401（唯一允许 401 的地方）');
    ok('未鉴权 → 401，与业务错误分开');
}

// ===========================================================================
console.log('\n[15] asr/ticket 成功：对象键带用户前缀，且回估算与余额');
// ===========================================================================
let ticketBody: {
    objectKey: string;
    uploadUrl: string;
    maxUploadBytes: number;
    estimatedCredits: number;
    balanceCents: number;
};
{
    const res = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 1800, format: 'mp3' }, apiKey)
    );
    assert.strictEqual(res.status, 200);
    ticketBody = await res.json();
    assert.ok(ticketBody.objectKey.startsWith(asr.objectKeyPrefix(userId)), '对象键必须落在本用户前缀下');
    assert.ok(ticketBody.uploadUrl.includes(ticketBody.objectKey));
    assert.strictEqual(ticketBody.estimatedCredits, 300, '30 分钟 × 10 分/分钟');
    assert.strictEqual(ticketBody.maxUploadBytes, asr.maxUploadBytesFor(1800));
    assert.strictEqual(typeof ticketBody.balanceCents, 'number');
    ok('签发限对象键/限有效期的直传凭证 + 估算 + 余额');
}

// ===========================================================================
console.log('\n[16] asr/submit：对象键不属于该用户 → 400，且不动账');
// ===========================================================================
{
    const balanceBefore = getBalance(userId);
    const foreignKey = asr.objectKeyPrefix('someone-else') + 'aaaa.mp3';
    const res = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: foreignKey, durationSec: 1800 }, apiKey, newIdem())
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'bad_request');
    assert.strictEqual(getBalance(userId), balanceBefore, '拒绝路径一分钱不动');
    ok('objectKey 不属于当前账户 → 400（不校验就能用自己的余额转别人的录音）');

    const noIdem = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: ticketBody.objectKey, durationSec: 1800 }, apiKey)
    );
    assert.strictEqual(noIdem.status, 400, '会扣费的 POST 缺幂等键 → 400');
    ok('asr/submit 缺 Idempotency-Key → 400');
}

// ===========================================================================
console.log('\n[17] asr/submit：实际体积与申报时长不符 → 拒 + 删对象 + 不预扣');
// ===========================================================================
{
    const balanceBefore = getBalance(userId);
    const deletedBefore = stub.deleted.length;
    // 申报 30 分钟（上限约 61 MB），实际传了 500 MB
    stub.objects.set(ticketBody.objectKey, 500 * 1024 * 1024);

    const res = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: ticketBody.objectKey, durationSec: 1800 }, apiKey, newIdem())
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'bad_request');
    assert.strictEqual(getBalance(userId), balanceBefore);
    assert.strictEqual(stub.deleted.length, deletedBefore + 1, '被拒的上传不该留在 bucket 里');
    ok('预签名 PUT 绑不住请求体大小，闸在服务端复核这一步（拒 + 删对象）');

    const gone = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: ticketBody.objectKey, durationSec: 1800 }, apiKey, newIdem())
    );
    assert.strictEqual(gone.status, 400, '对象不存在 → 400');
    ok('没找到已上传的音频 → 400，不建任务不预扣');
}

// ===========================================================================
console.log('\n[18] asr/submit：建任务失败 → hold 被释放，余额完全恢复');
// ===========================================================================
{
    const balanceBefore = getBalance(userId);
    const key = ticketBody.objectKey;
    stub.objects.set(key, 10 * 1024 * 1024);
    stub.createTaskError = new Error('tingwu 500');

    const res = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: key, durationSec: 1800 }, apiKey, newIdem())
    );
    assert.strictEqual(res.status, 502);
    assert.strictEqual((await res.json()).error, 'upstream_failed');
    assert.strictEqual(getBalance(userId), balanceBefore, '听悟没收到任务 = 我们没付费 = 用户不花一分钱');

    const holds = getDb()
        .prepare("SELECT * FROM gateway_hold WHERE userId = ? AND service = 'asr' ORDER BY rowid DESC LIMIT 1")
        .get(userId) as { status: string } | undefined;
    assert.strictEqual(holds?.status, 'released', '预扣必须被释放，不能挂着等 TTL');
    ok('建任务失败：hold 释放 + 余额完全恢复');
    stub.createTaskError = null;
}

// ===========================================================================
console.log('\n[19] asr/submit：同一幂等键连发两次，听悟只被建一次任务');
// ===========================================================================
let liveTaskId: string;
let objectKeyInFlight: string;
{
    const t = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 1800, format: 'mp3' }, apiKey)
    );
    objectKeyInFlight = (await t.json()).objectKey;
    stub.objects.set(objectKeyInFlight, 10 * 1024 * 1024);

    const key = newIdem();
    const createdBefore = stub.created.length;
    const balanceBefore = getBalance(userId);

    const r1 = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: objectKeyInFlight, durationSec: 1800 }, apiKey, key)
    );
    assert.strictEqual(r1.status, 200);
    const b1 = await r1.json();
    liveTaskId = b1.taskId;
    assert.strictEqual(b1.heldCents, 300, '按申报 30 分钟预扣 300 分');
    assert.strictEqual(getBalance(userId), balanceBefore - 300, 'hold 立刻压低余额');

    const r2 = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey: objectKeyInFlight, durationSec: 1800 }, apiKey, key)
    );
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.headers.get('x-gateway-replay'), '1');
    assert.deepStrictEqual(await r2.json(), b1, '回放原响应，taskId 不变');

    assert.strictEqual(stub.created.length, createdBefore + 1, '听悟只被建一次任务');
    assert.strictEqual(getBalance(userId), balanceBefore - 300, '只预扣一次');
    ok('同一 Idempotency-Key 连发两次：建任务一次、预扣一次、回放原响应');
}

// ===========================================================================
console.log('\n[20] asr/task：轮询节流 + 越权查询与不存在给同一个回答');
// ===========================================================================
{
    stub.task = { ...stub.task, status: 'ONGOING' };
    const first = await taskGET(taskReq(liveTaskId, apiKey), taskParams(liveTaskId));
    assert.strictEqual(first.status, 200);
    assert.strictEqual((await first.json()).status, 'processing');

    const throttled = await taskGET(taskReq(liveTaskId, apiKey), taskParams(liveTaskId));
    assert.strictEqual((await throttled.json()).throttled, true, '10 秒内不重复问听悟');
    ok('poll-on-read 节流窗口与桌面端一致（10 秒）');

    const missing = await taskGET(taskReq('asr_nope', apiKey), taskParams('asr_nope'));
    assert.strictEqual(missing.status, 400);
    assert.strictEqual((await missing.json()).error, 'bad_request');
    ok('查不属于自己的/不存在的任务 → 同一个 400，不提供存在性探测');
}

// ===========================================================================
console.log('\n[21] asr/task 完成：按**听悟返回的真实时长**结算，OSS 对象被删');
// ===========================================================================
{
    // 申报 30 分钟，真实 60 分钟——正好是「客户端申报值不可信」这条红线的用例
    stub.task = {
        status: 'COMPLETED',
        errorMessage: null,
        transcriptionUrl: 'https://tingwu.test/trans',
        autoChaptersUrl: 'https://tingwu.test/chapters',
        summarizationUrl: 'https://tingwu.test/summary',
        meetingAssistanceUrl: 'https://tingwu.test/assist',
    };
    stub.results.set('https://tingwu.test/trans', TRANSCRIPTION_60MIN);
    stub.results.set('https://tingwu.test/chapters', '{"AutoChapters":[]}');
    // summary / assist 刻意不放：增值结果缺失不该拖垮主流程

    // 绕过节流（把 lastPolledAt 推回去），模拟桌面端隔一会儿再来问
    withTransaction((d) => {
        d.prepare('UPDATE gateway_hold SET lastPolledAt = ? WHERE taskId = ?').run(
            new Date(Date.now() - 60_000).toISOString(),
            liveTaskId
        );
    });

    const heldBalance = getBalance(userId);
    const deletedBefore = stub.deleted.length;
    const res = await taskGET(taskReq(liveTaskId, apiKey), taskParams(liveTaskId));
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    assert.strictEqual(body.status, 'completed');
    assert.strictEqual(body.billing.units, 60, '真实时长从转写结果的最后一个 End 时间戳算出');
    assert.strictEqual(body.billing.chargedCents, 600, '60 分钟 × 10 分，不是申报的 30 分钟');
    assert.ok(body.transcription.includes('结束'), '转写正文原样回给桌面端');
    assert.strictEqual(body.summarization, null, '缺失的增值结果回 null，不算失败');

    // hold 300 释放 + settle 600 → 净扣 600，而 heldBalance 已经被 hold 压过 300
    assert.strictEqual(getBalance(userId), heldBalance + 300 - 600, '②③ 同事务：释放预扣再按真实量重扣');
    const phases = ledgerRows()
        .filter((r) => r.meta && JSON.parse(r.meta).taskId === liveTaskId)
        .map((r) => JSON.parse(r.meta!).phase);
    assert.deepStrictEqual(phases, ['hold', 'hold_release', 'settle']);
    assert.strictEqual(spend.findHold(liveTaskId)!.status, 'settled');

    assert.ok(stub.deleted.includes(objectKeyInFlight), '转写完成即删中转音频（代码删是第一道）');
    assert.strictEqual(stub.deleted.length, deletedBefore + 1);
    ok('完成：按上游真实时长结算（申报值的 2 倍）+ 三行账 + 删 OSS 对象');

    // 再查一次：不重复扣费，但结果仍然拿得到（桌面端刚好在这一刻崩了也不丢稿）
    const again = await taskGET(taskReq(liveTaskId, apiKey), taskParams(liveTaskId));
    const againBody = await again.json();
    assert.strictEqual(againBody.status, 'completed');
    assert.strictEqual(againBody.billing.chargedCents, 0, '已结算的任务不再扣费');
    assert.ok(againBody.transcription.includes('结束'), '结果可重取');
    ok('已结算任务重复轮询：零扣费、结果仍可取回');
}

// ===========================================================================
console.log('\n[22] asr/task 失败：hold 被释放、对象被删、用户不花一分钱');
// ===========================================================================
{
    for (const [label, status] of [['FAILED', 'FAILED'], ['INVALID', 'INVALID']] as const) {
        const t = await ticketPOST(
            asrReq('/api/gateway/asr/ticket', { durationSec: 600, format: 'mp3' }, apiKey)
        );
        const objectKey = (await t.json()).objectKey;
        stub.objects.set(objectKey, 5 * 1024 * 1024);
        const s = await submitPOST(
            asrReq('/api/gateway/asr/submit', { objectKey, durationSec: 600 }, apiKey, newIdem())
        );
        const taskId = (await s.json()).taskId;
        const balanceAfterHold = getBalance(userId);

        stub.task = {
            status,
            errorMessage: '音频损坏',
            transcriptionUrl: null,
            autoChaptersUrl: null,
            summarizationUrl: null,
            meetingAssistanceUrl: null,
        };
        withTransaction((d) => {
            d.prepare('UPDATE gateway_hold SET lastPolledAt = NULL WHERE taskId = ?').run(taskId);
        });

        const res = await taskGET(taskReq(taskId, apiKey), taskParams(taskId));
        const body = await res.json();
        assert.strictEqual(body.status, 'failed', `${label} 必须是终态`);
        assert.ok(String(body.message).includes('音频损坏'));
        assert.strictEqual(body.billing.chargedCents, 0);
        assert.strictEqual(getBalance(userId), balanceAfterHold + 100, '预扣原额退回（10 分钟 × 10 分）');
        assert.strictEqual(spend.findHold(taskId)!.status, 'released');
        assert.ok(stub.deleted.includes(objectKey), '失败也要删中转音频');
        ok(`听悟 ${label} → hold 释放 + 删对象 + 零扣费`);
    }
}

// ===========================================================================
console.log('\n[23] 过期 asr 预扣：回收前先删中转音频（不能只靠生命周期规则）');
// ===========================================================================
{
    const t = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 600, format: 'mp3' }, apiKey)
    );
    const objectKey = (await t.json()).objectKey;
    stub.objects.set(objectKey, 5 * 1024 * 1024);
    const s = await submitPOST(
        asrReq('/api/gateway/asr/submit', { objectKey, durationSec: 600 }, apiKey, newIdem())
    );
    const taskId = (await s.json()).taskId;
    const balanceAfterHold = getBalance(userId);

    // 把它推成已过期：用户合盖笔记本走了，没有任何一次轮询会再来
    withTransaction((d) => {
        d.prepare('UPDATE gateway_hold SET holdExpiresAt = ? WHERE taskId = ?').run(
            new Date(Date.now() - 60_000).toISOString(),
            taskId
        );
    });

    const swept = await asr.sweepExpiredAsrObjects();
    assert.ok(swept.deleted >= 1);
    assert.ok(stub.deleted.includes(objectKey), '过期任务的会议录音不能留在 bucket 里等 24 小时');

    spend.reclaimExpiredHolds();
    assert.strictEqual(spend.findHold(taskId)!.status, 'released');
    assert.strictEqual(getBalance(userId), balanceAfterHold + 100, '过期预扣自动退回');
    ok('过期预扣：先删对象再释放（删完才置 released，否则查不到对象键了）');
}

// ===========================================================================
console.log('\n[24] asr 的凭证缺一不可：绝不半残执行');
// ===========================================================================
{
    const configPath = path.join(cwd, 'data', 'gateway-config.json');
    const saved = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(saved);
    delete parsed.ossBucket;
    fs.writeFileSync(configPath, JSON.stringify(parsed));

    const res = await ticketPOST(
        asrReq('/api/gateway/asr/ticket', { durationSec: 600, format: 'mp3' }, apiKey)
    );
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.strictEqual(body.error, 'not_configured');
    assert.ok(Array.isArray(body.missing) && body.missing.includes('ossBucket'));
    for (const s of ['登录', '未授权', '请先']) {
        assert.ok(!String(body.message).includes(s));
    }
    ok('少一项凭证 → not_configured，不去建一个注定拉不到音频的任务');

    fs.writeFileSync(configPath, saved);
}

// ===========================================================================
// 其余四家（P4）：OCR / 企查查 / Tushare / 北大法宝
// （TTS 已整体下线：桌面端只留本机 Kokoro，平台侧的适配器与定价行都已删除）
// ===========================================================================

const adapters = await import('@/lib/gateway/adapters');

/** 每家一次调用的完整参数，供下面几段循环复用。 */
const FOUR: {
    service: string;
    op: string;
    /** 一次成功调用的请求体 */
    body: Record<string, unknown>;
    /** 这家的凭证在 gateway-config.json 里的键（删掉它应回 not_configured） */
    credentialKey: string;
    /** not_configured 的 missing 里报的字段名；缺省 = credentialKey。
     * OCR 用得上：删的是共用 aliyunAccessKeyId，报的是回落后仍缺的 ocrAccessKeyId */
    missingKey?: string;
    /** 迁移跑完之后的 enabled（迁移 14 起企查查与法宝也开着：维护者决定统一采购） */
    seededEnabled: boolean;
}[] = [
    { service: 'ocr', op: 'recognize', body: { imageBase64: Buffer.from('fake-png').toString('base64') }, credentialKey: 'aliyunAccessKeyId', missingKey: 'ocrAccessKeyId', seededEnabled: true },
    { service: 'qichacha', op: 'eci_info', body: { searchKey: '某某有限公司' }, credentialKey: 'qichachaKey', seededEnabled: true },
    { service: 'tushare', op: 'query', body: { apiName: 'stock_basic', params: {}, fields: 'ts_code' }, credentialKey: 'tushareToken', seededEnabled: true },
    { service: 'pkulaw', op: 'search_article', body: { args: { query: '合同法' } }, credentialKey: 'pkulawToken', seededEnabled: true },
];

const configPath = path.join(cwd, 'data', 'gateway-config.json');
function readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
}
function writeConfig(patch: Record<string, unknown>) {
    fs.writeFileSync(configPath, JSON.stringify({ ...readConfig(), ...patch }));
}

// 四家的凭证：让 adapter 都认为自己配好了
writeConfig({
    qichachaKey: 'test-qcc-key',
    qichachaSecret: 'test-qcc-secret',
    tushareToken: 'test-ts-token',
    pkulawToken: 'test-pku-token',
});

// 阿里云 OCR 走 SDK（darabonba 的 httpx），不经过 globalThis.fetch，另有注入桩
let ocrPages: number | null = null;
let ocrCalls = 0;
let ocrLastLayout: boolean | undefined;
adapters.setOcrUpstream({
    async recognize(bytes, _signal, options) {
        ocrCalls++;
        ocrLastLayout = options?.layout;
        return { content: '识别出来的正文', raw: JSON.stringify({ bytes: bytes.length }), pages: ocrPages };
    },
});

let qichachaStatus = '200';
vendorHandlers['api.qichacha.com'] = () => {
    countVendor('qichacha');
    return new Response(
        JSON.stringify(
            qichachaStatus === '200'
                ? { Status: '200', Message: 'ok', Result: { Name: '某某有限公司' } }
                : { Status: qichachaStatus, Message: '未查询到相关企业' }
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
    );
};

let tushareCode = 0;
vendorHandlers['api.tushare.pro'] = () => {
    countVendor('tushare');
    return new Response(
        JSON.stringify(
            tushareCode === 0
                ? { code: 0, msg: null, data: { fields: ['ts_code'], items: [['000001.SZ']] } }
                : { code: tushareCode, msg: '抱歉，您每分钟最多访问该接口 1 次' }
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
    );
};

let pkulawStatus = 200;
let pkulawMode: 'ok' | 'isError' | 'rpcError' | 'sse-isError' | 'suffix' | 'nomatch' = 'ok';
const pkulawSeen: { path: string; method: string; tool: string; args?: Record<string, unknown> }[] = [];
const unknownTool = (name: string) => new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
vendorHandlers['apim-gateway.pkulaw.com'] = (url, init) => {
    countVendor('pkulaw');
    if (pkulawStatus !== 200) return new Response('boom', { status: pkulawStatus });
    const reqBody = JSON.parse(String(init?.body ?? '{}'));
    pkulawSeen.push({ path: new URL(url).pathname, method: reqBody.method, tool: reqBody.params?.name, args: reqBody.params?.arguments });
    const hdr = { 'content-type': 'application/json' };
    if (reqBody.method === 'tools/list') {
        const tools = pkulawMode === 'suffix'
            ? [{ name: 'x_get_law_article' }, { name: 'other' }]
            : [
                { name: 'a', description: 'x'.repeat(150), inputSchema: { type: 'object', properties: { title: { type: 'string' }, n: { type: 'integer' } }, required: ['title'] } },
                { name: 'b' },
                { name: 'c', description: 'desc c', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
            ];
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', result: { tools } }), { status: 200, headers: hdr });
    }
    if (pkulawMode === 'suffix') {
        return reqBody.params?.name === 'x_get_law_article'
            ? new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: '第五百零九条…' }] } }), { status: 200, headers: hdr })
            : unknownTool(reqBody.params?.name);
    }
    if (pkulawMode === 'nomatch') return unknownTool(reqBody.params?.name);
    if (pkulawMode === 'isError') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: 'upstream failed' }], isError: true } }), { status: 200, headers: hdr });
    }
    if (pkulawMode === 'rpcError') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', error: { code: -32601, message: 'nope' } }), { status: 200, headers: hdr });
    }
    if (pkulawMode === 'sse-isError') {
        return new Response('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: 'bad' }], isError: true } }) + '\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: '第五百零九条…' }] } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
    );
};

// ===========================================================================
console.log('\n[25] 四家的定价行由迁移建好，派生单价与取整规则一致；tts 已整体删除');
// ===========================================================================
{
    for (const s of FOUR) {
        const row = pricing.findPricing(s.service, s.op);
        assert.ok(row, `迁移应为 ${s.service} 建好定价行（缺行会让「未开放」变成一条像故障的 not_configured）`);
        assert.strictEqual(
            row!.enabled,
            s.seededEnabled,
            `${s.service} 的 enabled 初值不对`
        );
        assert.strictEqual(
            row!.creditsPerUnit,
            pricing.deriveCreditsPerUnit(row!.costCentsPerUnit, row!.marginMultiplier),
            `${s.service} 落库的单价与派生公式对不上——迁移里写死的取整值必须与 deriveCreditsPerUnit 同结果`
        );
    }
    // 迁移 14 起企查查与法宝开着：维护者决定统一采购，不走按量分销授权那条路
    assert.strictEqual(pricing.findPricing('qichacha', 'eci_info')!.enabled, true);
    assert.strictEqual(pricing.findPricing('pkulaw', 'search_article')!.enabled, true);
    ok('四家定价行随迁移建好；企查查与法宝已开放（统一采购）');

    // tts 整体下线：**定价行必须真的没了**，而不是留一行 enabled=0。
    // 留着的话后台定价页会摆出一项「未开放」的服务，读的人会以为它等着开通，
    // 而它是产品里根本不存在的东西。
    assert.strictEqual(pricing.findPricing('tts', 'speech'), null, 'tts 定价行应已被迁移 15 删除');
    assert.strictEqual(pricing.findPricing('tts', 'voices'), null, 'tts/voices 定价行应已被删除');
    assert.ok(
        !pricing.listPricing().some((r) => r.service === 'tts'),
        'service_pricing 里不该再有任何 tts 行'
    );
    assert.ok(!adapters.registeredServices().includes('tts'), 'tts 适配器应已从注册表删除');
    ok('tts 整体下线：适配器与定价行都没了（不是留一行「未开放」）');
}

// ===========================================================================
console.log('\n[26] enabled=0 → service_disabled（409，不是 401/403，也不是故障）');
// ===========================================================================
{
    fund(100_000);
    for (const s of FOUR) {
        const before = pricing.findPricing(s.service, s.op)!;
        pricing.upsertPricing({
            service: before.service, op: before.op, unit: before.unit,
            costCentsPerUnit: before.costCentsPerUnit, marginMultiplier: before.marginMultiplier,
            maxUnitsPerCall: before.maxUnitsPerCall, enabled: false,
        });
        const res = await gatewayPOST(
            gwReq(s.service, s.op, s.body, apiKey, newIdem()),
            gwParams(s.service, s.op)
        );
        assert.strictEqual(res.status, 409, `${s.service} 未开放时应回 409`);
        const body = await res.json();
        assert.strictEqual(body.error, 'service_disabled');
        for (const bad of ['登录', '未授权', '请先']) {
            assert.ok(!String(body.message).includes(bad), `${s.service} 的未开放文案含「${bad}」`);
        }
        // 恢复成迁移给的初值
        pricing.upsertPricing({
            service: before.service, op: before.op, unit: before.unit,
            costCentsPerUnit: before.costCentsPerUnit, marginMultiplier: before.marginMultiplier,
            maxUnitsPerCall: before.maxUnitsPerCall, enabled: true,
        });
    }
    ok('四家 enabled=0 一律 409 service_disabled，文案不含三个掉线子串');
}

// ===========================================================================
console.log('\n[27] 缺凭证 → not_configured，且一次上游都不打');
// ===========================================================================
{
    const saved = fs.readFileSync(configPath, 'utf-8');
    for (const s of FOUR) {
        const parsed = readConfig();
        delete parsed[s.credentialKey];
        fs.writeFileSync(configPath, JSON.stringify(parsed));
        const callsBefore = { ...vendorCalls, ocr: ocrCalls };

        const res = await gatewayPOST(
            gwReq(s.service, s.op, s.body, apiKey, newIdem()),
            gwParams(s.service, s.op)
        );
        assert.strictEqual(res.status, 503, `${s.service} 缺凭证应回 503 not_configured`);
        const body = await res.json();
        assert.strictEqual(body.error, 'not_configured');
        assert.ok(Array.isArray(body.missing) && body.missing.includes(s.missingKey ?? s.credentialKey),
            `${s.service} 应说清缺的是哪一项`);
        assert.deepStrictEqual({ ...vendorCalls, ocr: ocrCalls }, callsBefore,
            `${s.service} 缺凭证时不该发出任何上游请求（半残执行会被归成「供应商挂了」）`);

        fs.writeFileSync(configPath, saved);
    }
    ok('四家缺凭证一律 503 not_configured + missing 明细，绝不半残执行');
}

// ===========================================================================
console.log('\n[28] 计价一律按上游真实计量，客户端申报值不参与');
// ===========================================================================
{
    fund(100_000);

    // OCR：客户端什么计量都没申报，按上游报的页数计价（8.25 分成本 × 1.2 = 10 分/页）
    ocrPages = 3;
    const balBefore = getBalance(userId);
    const r1 = await gatewayPOST(
        gwReq('ocr', 'recognize', { imageBase64: Buffer.from('png').toString('base64') }, apiKey, newIdem()),
        gwParams('ocr', 'recognize')
    );
    assert.strictEqual(r1.status, 200);
    const b1 = await r1.json();
    assert.strictEqual(b1.billing.units, 3);
    assert.strictEqual(b1.billing.unit, 'page');
    assert.strictEqual(b1.billing.chargedCents, 30, '3 页 × 10 分');
    assert.strictEqual(getBalance(userId), balBefore - 30);
    assert.strictEqual(b1.data.content, '识别出来的正文');
    ok('OCR 按上游报的页数计价，结果原样透传（content + raw）');

    // 上游不报页数时按「一次调用 = 一页」，**不拿 subImageCount 顶替**
    ocrPages = null;
    const r2 = await gatewayPOST(
        gwReq('ocr', 'recognize', { imageBase64: Buffer.from('png').toString('base64') }, apiKey, newIdem()),
        gwParams('ocr', 'recognize')
    );
    assert.strictEqual((await r2.json()).billing.units, 1);
    ok('上游不报页数时按一次调用一页计，不虚构页数');
    assert.strictEqual(ocrLastLayout, false, '不传 layout 时上游按旧参数调用（旧版桌面端行为不变）');

    // layout：桌面端要坐标/表格/印章时打开，单价与计费单位不变
    const r3 = await gatewayPOST(
        gwReq('ocr', 'recognize', { imageBase64: Buffer.from('png').toString('base64'), layout: true }, apiKey, newIdem()),
        gwParams('ocr', 'recognize')
    );
    assert.strictEqual(r3.status, 200);
    const b3 = await r3.json();
    assert.strictEqual(ocrLastLayout, true, 'layout:true 应透到上游');
    assert.strictEqual(b3.billing.units, 1);
    assert.strictEqual(b3.billing.chargedCents, 10, '开 layout 仍是一页 10 分');
    ok('layout:true 透到上游，计费不变');

    const callsBefore = ocrCalls;
    const r4 = await gatewayPOST(
        gwReq('ocr', 'recognize', { imageBase64: Buffer.from('png').toString('base64'), layout: 'yes' }, apiKey, newIdem()),
        gwParams('ocr', 'recognize')
    );
    assert.strictEqual(r4.status, 400);
    assert.strictEqual((await r4.json()).error, 'bad_request');
    assert.strictEqual(ocrCalls, callsBefore, 'layout 类型不对时不发上游请求');
    ok('layout 只认布尔值，其它类型回 bad_request 且不调上游');

    // 真实上游的请求构造：layout 映射到坐标/印章/表格/段落四项，未开时一项都不带
    const plain = adapters.buildOcrRequest(Buffer.from('png'), false);
    assert.strictEqual(plain.type, 'Advanced');
    assert.strictEqual(plain.outputCoordinate, undefined);
    assert.strictEqual(plain.advancedConfig, undefined);
    const rich = adapters.buildOcrRequest(Buffer.from('png'), true);
    assert.strictEqual(rich.type, 'Advanced');
    assert.strictEqual(rich.outputCoordinate, 'points');
    assert.strictEqual(rich.outputStamp, true);
    assert.strictEqual(rich.advancedConfig?.outputTable, true);
    assert.strictEqual(rich.advancedConfig?.outputParagraph, true);
    ok('buildOcrRequest：layout 只打开坐标、印章、表格、段落四项');

}

// ===========================================================================
console.log('\n[30] 上游用响应体表达失败的两家：不按 HTTP 状态判成功，失败一分不扣');
// ===========================================================================
{
    // 企查查：HTTP 200 + Status=201（查无此企业）
    qichachaStatus = '201';
    let balBefore = getBalance(userId);
    let spendBefore = ledgerRows('service_spend').length;
    let res = await gatewayPOST(
        gwReq('qichacha', 'eci_info', { searchKey: '不存在公司' }, apiKey, newIdem()),
        gwParams('qichacha', 'eci_info')
    );
    assert.strictEqual(res.status, 502);
    let body = await res.json();
    assert.strictEqual(body.error, 'upstream_failed');
    assert.ok(String(body.message).includes('未查询到'), '把上游的真实原因带回去，别只说「服务不可用」');
    assert.strictEqual(getBalance(userId), balBefore, '查不到就不收钱');
    assert.strictEqual(ledgerRows('service_spend').length, spendBefore);
    ok('企查查 Status≠200（HTTP 仍是 200）判为失败，一分不扣');
    qichachaStatus = '200';

    // Tushare：HTTP 200 + code=40203（积分不足/限频）
    tushareCode = 40203;
    balBefore = getBalance(userId);
    spendBefore = ledgerRows('service_spend').length;
    res = await gatewayPOST(
        gwReq('tushare', 'query', { apiName: 'stock_basic', params: {}, fields: 'ts_code' }, apiKey, newIdem()),
        gwParams('tushare', 'query')
    );
    assert.strictEqual(res.status, 502);
    assert.strictEqual((await res.json()).error, 'upstream_failed');
    assert.strictEqual(getBalance(userId), balBefore);
    assert.strictEqual(ledgerRows('service_spend').length, spendBefore);
    ok('Tushare code≠0（HTTP 仍是 200）判为失败，一分不扣');
    tushareCode = 0;
}

// ===========================================================================
console.log('\n[31] 企查查 / Tushare / 法宝的成功路径：按次计费，结果形状与 BYOK 路一致');
// ===========================================================================
{
    let balBefore = getBalance(userId);
    let res = await gatewayPOST(
        gwReq('qichacha', 'eci_info', { searchKey: '某某有限公司' }, apiKey, newIdem()),
        gwParams('qichacha', 'eci_info')
    );
    assert.strictEqual(res.status, 200);
    let body = await res.json();
    assert.strictEqual(body.billing.chargedCents, 120, '100 分成本 × 1.2');
    assert.strictEqual(body.data.Result.Name, '某某有限公司', '与桌面端 BYOK 路同一形状（Status/Result）');
    assert.strictEqual(getBalance(userId), balBefore - 120);
    ok('企查查成功：按次 120 分，Status/Result 原样透传');

    balBefore = getBalance(userId);
    res = await gatewayPOST(
        gwReq('tushare', 'query', { apiName: 'stock_basic', params: {}, fields: 'ts_code' }, apiKey, newIdem()),
        gwParams('tushare', 'query')
    );
    body = await res.json();
    assert.strictEqual(body.billing.chargedCents, 3, '2 分成本 × 1.2 = 2.4，向上取整 3');
    assert.strictEqual(body.data.data.items[0][0], '000001.SZ', '与桌面端 BYOK 路同一形状（code/data/items）');
    assert.strictEqual(getBalance(userId), balBefore - 3);
    ok('Tushare 成功：按次 3 分，code/data/items 原样透传');

    // 法宝：JSON-RPC 响应正文原样回，解析留在桌面端（两条档位共用一个解析器）
    balBefore = getBalance(userId);
    res = await gatewayPOST(
        gwReq('pkulaw', 'search_article', { args: { query: '合同法' } }, apiKey, newIdem()),
        gwParams('pkulaw', 'search_article')
    );
    body = await res.json();
    assert.strictEqual(body.billing.chargedCents, 60, '50 分成本 × 1.2');
    assert.ok(String(body.data.raw).includes('第五百零九条'), 'MCP 响应正文原样回给桌面端');
    assert.strictEqual(getBalance(userId), balBefore - 60);
    ok('法宝成功：按次 60 分，JSON-RPC 正文原样透传（不在网关侧解析）');

    // 法宝上游挂 → 不扣费
    pkulawStatus = 500;
    balBefore = getBalance(userId);
    res = await gatewayPOST(
        gwReq('pkulaw', 'law_recognition', { args: { text: '依据合同法' } }, apiKey, newIdem()),
        gwParams('pkulaw', 'law_recognition')
    );
    assert.strictEqual(res.status, 502);
    assert.strictEqual(getBalance(userId), balBefore);
    ok('法宝上游 5xx：502 upstream_failed，一分不扣');
    pkulawStatus = 200;

    // 每个 op 的翻译：端点 + 法宝新工具名 + 入参
    pkulawSeen.length = 0;
    const cases: { op: string; args: Record<string, unknown>; path: string; tool: string; sent: Record<string, unknown> }[] = [
        { op: 'search_article', args: { text: '违约金', lib: 'law', timeliness: '现行有效', size: 5 }, path: '/mcp-law-search-service', tool: 'search_law_articles', sent: { query_text: '违约金', library: 'law', timeliness: '现行有效', size: 5 } },
        { op: 'get_article', args: { title: '民法典', number: '1082' }, path: '/mcp-fatiao', tool: 'get_law_article', sent: { law_title: '民法典', article_number: '1082' } },
        { op: 'get_law_item_content', args: { lawTitle: '民法典', articleNumber: '第一千零八十二条' }, path: '/mcp-fatiao', tool: 'get_law_article', sent: { law_title: '民法典', article_number: '第一千零八十二条' } },
        { op: 'get_law_list', args: { title: '民法典', fulltext: '违约', documentNo: '主席令第45号' }, path: '/mcp-law', tool: 'search_laws_by_keyword', sent: { title: '民法典', fulltext: '违约', document_no: '主席令第45号' } },
        { op: 'get_law_list', args: { documentNo: '主席令第45号' }, path: '/mcp-law', tool: 'search_laws_by_keyword', sent: { document_no: '主席令第45号' } },
        { op: 'get_law_list', args: { fulltext: '违约金' }, path: '/mcp-law', tool: 'search_law_articles_by_keyword', sent: { fulltext: '违约金' } },
        { op: 'law_recognition', args: { text: '依据合同法' }, path: '/law_recognition', tool: 'recognize_law_citations', sent: { text: '依据合同法' } },
        { op: 'search_case', args: { text: '借款', size: 3 }, path: '/mcp-case-search-service', tool: 'search_cases', sent: { text: '借款', size: 3 } },
        { op: 'anhao_recognition', args: { text: '(2020)京01民终1号' }, path: '/case_number_recognition', tool: 'recognize_case_numbers', sent: { text: '(2020)京01民终1号' } },
        { op: 'adjust_provisions', args: { userlaw: '甲法', answerlaw: ['乙法', '丙法'], prompt: 'p' }, path: '/pku_citation_validator', tool: 'verify_law_citations', sent: { user_law: ['甲法'], answer_law: ['乙法', '丙法'], prompt: 'p' } },
    ];
    for (const c of cases) {
        balBefore = getBalance(userId);
        res = await gatewayPOST(
            gwReq('pkulaw', c.op, { args: c.args }, apiKey, newIdem()),
            gwParams('pkulaw', c.op)
        );
        body = await res.json();
        assert.strictEqual(body.billing.chargedCents, 60, `${c.op} 同价 60 分`);
        assert.strictEqual(getBalance(userId), balBefore - 60);
    }
    assert.deepStrictEqual(pkulawSeen.map((c) => c.path), cases.map((c) => c.path));
    assert.deepStrictEqual(pkulawSeen.map((c) => c.tool), cases.map((c) => c.tool));
    assert.deepStrictEqual(pkulawSeen.map((c) => c.args), cases.map((c) => c.sent));
    res = await gatewayPOST(gwReq('pkulaw', 'get_law_list', { args: {} }, apiKey, newIdem()), gwParams('pkulaw', 'get_law_list'));
    assert.strictEqual(res.status, 400, 'get_law_list 无 title/documentNo/fulltext → 400');
    ok('法宝：8 个 op 的端点 / 新工具名 / 入参翻译全部正确（含 get_law_list 分流、引用校验数组包装），同价');

    // Unknown tool 自愈：tools/list（不计费）→ 唯一后缀匹配 → 改名重试一次 → 进程内缓存
    const { clearPkulawToolCache } = await import('../lib/gateway/adapters/pkulaw');
    clearPkulawToolCache();
    pkulawMode = 'suffix';
    pkulawSeen.length = 0;
    balBefore = getBalance(userId);
    res = await gatewayPOST(
        gwReq('pkulaw', 'get_article', { args: { title: '民法典', number: '509' } }, apiKey, newIdem()),
        gwParams('pkulaw', 'get_article')
    );
    body = await res.json();
    assert.ok(String(body.data.raw).includes('第五百零九条'), '改名重试后拿到正文');
    assert.strictEqual(body.billing.chargedCents, 60, '只为最终成功的那一次计费一次');
    assert.strictEqual(getBalance(userId), balBefore - 60);
    assert.deepStrictEqual(pkulawSeen.map((c) => `${c.method}:${c.tool ?? ''}`), ['tools/call:get_law_article', 'tools/list:', 'tools/call:x_get_law_article']);
    pkulawSeen.length = 0;
    res = await gatewayPOST(
        gwReq('pkulaw', 'get_article', { args: { title: '民法典', number: '510' } }, apiKey, newIdem()),
        gwParams('pkulaw', 'get_article')
    );
    body = await res.json();
    assert.deepStrictEqual(pkulawSeen.map((c) => `${c.method}:${c.tool ?? ''}`), ['tools/call:x_get_law_article'], '第二次直接用缓存名，不再 tools/list');
    ok('Unknown tool 后缀改名：tools/list 不单独计费、重试成功只扣一次、第二次走缓存');

    // 无唯一匹配：不计费，错误文本附带可用工具名
    clearPkulawToolCache();
    pkulawMode = 'nomatch';
    balBefore = getBalance(userId);
    res = await gatewayPOST(
        gwReq('pkulaw', 'get_article', { args: { title: '民法典', number: '509' } }, apiKey, newIdem()),
        gwParams('pkulaw', 'get_article')
    );
    body = await res.json();
    assert.strictEqual(body.billing.chargedCents, 0);
    assert.strictEqual(getBalance(userId), balBefore);
    assert.strictEqual(JSON.parse(body.data.raw).result.content[0].text, `Unknown tool: get_law_article. Available on this endpoint: a(title*: string, n: integer) — ${'x'.repeat(100)}, b(), c(q: string) — desc c`);
    assert.ok(!JSON.stringify(body).includes('test-pku-token'));
    pkulawMode = 'ok';
    ok('Unknown tool 无唯一匹配：不计费，错误文本列出可用工具名，不含 token');

    // MCP 层错误（isError / JSON-RPC error / SSE isError）→ 不计费，正文原样回
    for (const mode of ['isError', 'rpcError', 'sse-isError'] as const) {
        pkulawMode = mode;
        balBefore = getBalance(userId);
        res = await gatewayPOST(
            gwReq('pkulaw', 'get_article', { args: { title: '民法典', number: '509' } }, apiKey, newIdem()),
            gwParams('pkulaw', 'get_article')
        );
        body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.billing.chargedCents, 0, `${mode} 不计费`);
        assert.strictEqual(getBalance(userId), balBefore, `${mode} 余额不变`);
        assert.ok(typeof body.data.raw === 'string' && body.data.raw.length > 0, `${mode} 正文原样回`);
    }
    pkulawMode = 'ok';
    ok('法宝 MCP 错误（result.isError / JSON-RPC error / SSE isError）：一分不扣，正文原样回');
}

// ===========================================================================
console.log('\n[32] 注册表：未知服务与未知操作分得开，法宝的端点由服务端定死');
// ===========================================================================
{
    const services = adapters.registeredServices();
    for (const s of ['search', 'ocr', 'qichacha', 'tushare', 'pkulaw']) {
        assert.ok(services.includes(s), `注册表缺 ${s}`);
    }
    // asr 走自己的三个端点，不在通用注册表里
    assert.ok(!services.includes('asr'));
    // tts 已整体下线，注册表里不该再有
    assert.ok(!services.includes('tts'));
    ok('五项同步服务全部注册；语音转写不在通用入口里（异步长任务），语音合成已下线');

    const badOp = await gatewayPOST(
        gwReq('pkulaw', 'delete_everything', { args: {} }, apiKey, newIdem()),
        gwParams('pkulaw', 'delete_everything')
    );
    assert.strictEqual(badOp.status, 400, '未知操作 → 400，不是「未开放」');
    assert.strictEqual((await badOp.json()).error, 'bad_request');
    ok('未注册的 op → 400 bad_request（法宝的三个 MCP 端点写死在服务端，客户端点不了别处）');
}

// ===========================================================================
console.log('\n[33] 注册赠额：reward 批次 + 24 个月到期 + 只发一次 + 窗口外不发');
// ===========================================================================
{
    const { grantSignupBonus, signupGrantStats, signupGrantRef } = await import('@/lib/signup-grant');
    const { rewardExpiryFrom } = await import('@/lib/credits');

    const lotsOf = (uid: string) =>
        getDb()
            .prepare('SELECT * FROM credit_lots WHERE userId = ? ORDER BY id')
            .all(uid) as {
            pool: string;
            originalCents: number;
            expiresAt: string | null;
            sourceKind: string;
            refOrderId: string | null;
        }[];

    // --- 发放：默认 1990 分（19.9 元） ---
    const newbie = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const first = grantSignupBonus(newbie, nowIso);
    assert.strictEqual(first.outcome, 'granted');
    assert.strictEqual(first.amountCents, 1990, '注册赠额 19.9 元 = 1990 分');
    assert.strictEqual(getBalance(newbie), 1990);

    const lots = lotsOf(newbie);
    assert.strictEqual(lots.length, 1);
    // 这三条是合规红线，不是风格：落 topup 就等于「注册即领可退现的现金」
    assert.strictEqual(lots[0].pool, 'reward', '赠额必须落 reward 批次，绝不能是 topup');
    assert.strictEqual(lots[0].expiresAt, rewardExpiryFrom(nowIso), 'reward 批次带 24 个月到期日');
    assert.ok(lots[0].expiresAt !== null, '赠额批次必须有到期日');
    assert.strictEqual(lots[0].sourceKind, 'gift', '流水类别是 gift');
    assert.strictEqual(lots[0].refOrderId, signupGrantRef(newbie), '幂等键落在批次上');
    const gifts = getDb()
        .prepare("SELECT * FROM wallet_ledger WHERE userId = ? AND kind = 'gift'")
        .all(newbie) as { amountCents: number }[];
    assert.strictEqual(gifts.length, 1);
    assert.strictEqual(gifts[0].amountCents, 1990);
    ok('注册赠额 1990 分：reward 批次 + 24 个月到期 + gift 流水');

    // --- 幂等：同一用户再调不重复发 ---
    const second = grantSignupBonus(newbie);
    assert.strictEqual(second.outcome, 'already_granted');
    assert.strictEqual(second.amountCents, 0);
    assert.strictEqual(getBalance(newbie), 1990, '二次调用不重复发');
    assert.strictEqual(lotsOf(newbie).length, 1, '只留一条批次');
    ok('同一用户只发一次（重复注册/重放/补发脚本都走这条路）');

    // --- 后台能看到本次活动发了多少 ---
    const statsBefore = signupGrantStats();
    assert.ok(statsBefore.count >= 1 && statsBefore.totalCents >= 1990);
    const another = crypto.randomUUID();
    grantSignupBonus(another);
    const statsAfter = signupGrantStats();
    assert.strictEqual(statsAfter.count, statsBefore.count + 1);
    assert.strictEqual(statsAfter.totalCents, statsBefore.totalCents + 1990);
    ok('后台统计跟着发放走（笔数 + 金额）');

    // --- 活动窗口之外不发 ---
    const savedCfg = fs.readFileSync(configPath, 'utf-8');
    writeConfig({ signupGrantEndAt: new Date(Date.now() - 86_400_000).toISOString() });
    const late = crypto.randomUUID();
    assert.strictEqual(grantSignupBonus(late).outcome, 'outside_window');
    assert.strictEqual(getBalance(late), 0, '活动已结束，一分不发');

    writeConfig({
        signupGrantStartAt: new Date(Date.now() + 86_400_000).toISOString(),
        signupGrantEndAt: null,
    });
    const early = crypto.randomUUID();
    assert.strictEqual(grantSignupBonus(early).outcome, 'outside_window');
    assert.strictEqual(getBalance(early), 0, '活动还没开始，一分不发');
    ok('活动窗口外（已结束 / 未开始）一律不发');

    // --- 金额配成 0 = 活动没开 ---
    fs.writeFileSync(configPath, savedCfg);
    writeConfig({ signupGrantCents: 0 });
    const off = crypto.randomUUID();
    assert.strictEqual(grantSignupBonus(off).outcome, 'disabled');
    assert.strictEqual(getBalance(off), 0);
    ok('赠额配成 0 = 活动关闭，不发也不报错');
    fs.writeFileSync(configPath, savedCfg);
}

// ===========================================================================
console.log('\n[34] 按服务分组的月度消耗：预扣三行账只算 settle');
// ===========================================================================
{
    const usage = await import('@/lib/gateway/usage');
    const { GET: usageGET } = await import('@/app/api/gateway/usage/route');

    // 自然月区间按**北京时间**算：账本时间戳是 UTC，而「本月」是给国内用户看的。
    // 用 UTC 的月份，每月头八小时的消费会掉进上个月，用户 1 号早上会看到「本月 0 元」。
    const r = usage.monthRange(Date.parse('2026-08-31T20:00:00.000Z'));
    assert.strictEqual(r.month, '2026-09', '北京时间已是 9 月 1 日 04:00');
    assert.strictEqual(r.from, '2026-08-31T16:00:00.000Z', '9 月起点 = 北京 9/1 00:00 = UTC 8/31 16:00');
    assert.strictEqual(r.to, '2026-09-30T16:00:00.000Z');
    ok('自然月区间按北京时间切，换算成 UTC 与账本同口径');

    // 造一个干净的用户：一次事后扣 + 一次预扣结算
    const u = crypto.randomUUID();
    withTransaction((d) =>
        grantCredits(d, { userId: u, pool: 'topup', amountCents: 10_000, ledgerKind: 'recharge' })
    );
    const searchP = pricing.requireEnabledPricing('search', 'web'); // 30 分/次
    spend.chargeAfterSuccess({ userId: u, pricing: searchP, actualUnits: 2 }); // 60
    const asrP = pricing.requireEnabledPricing('asr', 'transcribe'); // 10 分/分钟
    const tid = 'usage-' + crypto.randomUUID();
    spend.openHold({ userId: u, taskId: tid, pricing: asrP, estimatedUnits: 60, nowMs: Date.now() }); // hold 600
    spend.settleHold(tid, 42, asrP); // settle 420
    // 中途失败的任务：hold + release，结算额为 0，不该出现在用量里
    const cancelled = 'usage-cancel-' + crypto.randomUUID();
    spend.openHold({ userId: u, taskId: cancelled, pricing: asrP, estimatedUnits: 30, nowMs: Date.now() });
    spend.releaseHold(cancelled, 'test');

    const m = usage.monthlyUsageByService(u);
    const byService = Object.fromEntries(m.services.map((s) => [s.service, s]));
    assert.strictEqual(byService.search.cents, 60, '2 次搜索 × 30 分');
    assert.strictEqual(byService.search.calls, 1, '一行流水 = 一次计费调用');
    assert.strictEqual(byService.asr.cents, 420, '按真实 42 分钟结算，不是预扣的 600');
    assert.strictEqual(m.totalCents, 480);

    // 这条是整段的重点：直接对 service_spend 求和会把 hold 也算进去
    const naive = (
        getDb()
            .prepare(
                "SELECT COALESCE(SUM(-amountCents), 0) AS n FROM wallet_ledger WHERE userId = ? AND kind = 'service_spend'"
            )
            .get(u) as { n: number }
    ).n;
    assert.strictEqual(naive, 60 + 600 + 420 + 300, '朴素求和把 hold 与 settle 重复计入');
    assert.ok(naive > m.totalCents, '朴素求和必然大于真实消耗——这就是不能那么写的原因');
    ok('hold 已被 release 冲销，只算 phase 为空或 settle 的行（朴素求和会多报一倍）');

    // --- 端点形态 ---
    const res = await usageGET(
        new NextRequest('https://test.local/api/gateway/usage', {
            headers: { authorization: `Bearer ${apiKey}` },
        })
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    for (const k of ['month', 'from', 'to', 'services', 'totalCents', 'balanceCents', 'pendingHoldCents']) {
        assert.ok(k in body, `usage 响应缺字段 ${k}`);
    }
    assert.ok(Array.isArray(body.services));
    assert.strictEqual(
        body.totalCents,
        body.services.reduce((s: number, x: { cents: number }) => s + x.cents, 0),
        '分项之和必须等于总额，否则用户会以为我们少报了消费'
    );
    assert.ok(!JSON.stringify(body).includes('costCentsPerUnit'), '用量端点同样不泄露采购成本');
    ok('GET /api/gateway/usage 回本月分项 + 合计 + 余额 + 占用中的预扣');

    const anon = await usageGET(new NextRequest('https://test.local/api/gateway/usage'));
    assert.strictEqual(anon.status, 401, '无 Bearer → 401（唯一允许 401 的情形）');
    ok('usage 未鉴权 → 401，与业务错误分开');
}

// ===========================================================================
console.log('\n[35] 静态护栏：后台显示的派生单价与服务端同一个取整方向');
// ===========================================================================
{
    // 后台页面是客户端组件，进不了 better-sqlite3，只能抄一份派生公式。
    // 抄的那份一旦漂回 Math.round，后台显示的单价就比实际扣的少一分，
    // 而调价的人只会相信自己屏幕上那个数。
    const panel = fs.readFileSync(
        path.join(repoRoot, 'app', '[lang]', 'admin', 'AdminPanel.tsx'),
        'utf-8'
    );
    const start = panel.indexOf('function derivedCredits(');
    assert.ok(start > 0, 'AdminPanel 缺少 derivedCredits——后台不显示派生单价，调价就成了盲调');
    const body = panel.slice(start, panel.indexOf('}', start));
    assert.ok(body.includes('Math.ceil'), '后台的派生单价必须向上取整，与 deriveCreditsPerUnit 一致');
    assert.ok(!body.includes('Math.round'), '后台派生单价用了四舍五入，会比实际扣费少一分');

    const lib = fs.readFileSync(path.join(repoRoot, 'lib', 'gateway', 'pricing.ts'), 'utf-8');
    const libStart = lib.indexOf('export function deriveCreditsPerUnit');
    const libBody = lib.slice(libStart, lib.indexOf('}', libStart));
    assert.ok(libBody.includes('Math.ceil') && !libBody.includes('Math.round'));
    ok('两处派生公式都是 Math.ceil（后台显示什么价，网关就扣什么价）');
}

console.log(`\n全部通过：${passed} 项`);
