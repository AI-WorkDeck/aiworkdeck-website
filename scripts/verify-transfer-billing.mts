/**
 * 跨设备文件传输内部记账口（dev-board#251，设计 §2.4）验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-transfer-billing.mts
 *
 * 覆盖：
 * - env 未设 AWD_TRANSFER_BILLING_SECRET → 404（与路由不存在无法区分）
 * - secret 错 → 404；secret 对但 accountId 查无 → 同样 404（不泄露哪一半错了）
 * - quote：10MB → 1 credit、1GB → 60 credits（service_pricing transfer/relay 的种子行）
 * - charge：同 idempotencyKey 重放只扣一次、只产生一行 service_spend
 * - charge：余额不足 → 409 no_credits，带 availableCents/requiredCents
 * - refund：原批次原额退回；重复调用同一 ledgerId 幂等，不二次退款
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify([
        {
            id: userId,
            username: 'xfer-tester',
            email: 'xfer@test.local',
            passwordHash: 'x:y',
            displayName: 'Transfer Tester',
            createdAt: new Date().toISOString(),
        },
    ])
);

const SECRET = 'test-internal-secret-0123456789';
// 先不设环境变量：第一批用例要验证「未配置 = 404」，之后的用例再打开。

const { getDb, withTransaction } = await import('@/lib/db');
const { grantCredits } = await import('@/lib/credits');
const { NextRequest } = await import('next/server');
const { POST: transferPOST } = await import('@/app/api/internal/transfer/route');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

function fund(amountCents: number, pool: 'topup' | 'reward' = 'topup') {
    withTransaction((d) =>
        grantCredits(d, { userId, pool, amountCents, ledgerKind: 'recharge' })
    );
}

function req(body: Record<string, unknown>, secretHeader?: string | null) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secretHeader !== null) headers['x-internal-secret'] = secretHeader ?? SECRET;
    return new NextRequest('https://test.local/api/internal/transfer', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

function serviceSpendRows() {
    return getDb()
        .prepare(
            "SELECT * FROM wallet_ledger WHERE userId = ? AND kind = 'service_spend' ORDER BY id"
        )
        .all(userId) as { id: number; amountCents: number; meta: string | null }[];
}

// ===========================================================================
console.log('\n[1] env 未设 AWD_TRANSFER_BILLING_SECRET → 404');
// ===========================================================================
{
    delete process.env.AWD_TRANSFER_BILLING_SECRET;
    const res = await transferPOST(req({ action: 'quote', accountId: userId, bytes: 1024 }));
    assert.strictEqual(res.status, 404, '功能未开通时必须回 404，不能回 401/403 暴露端点存在');
    ok('env 未配置 → 404');
}

process.env.AWD_TRANSFER_BILLING_SECRET = SECRET;

// ===========================================================================
console.log('\n[2] secret 错 / 缺 → 404；secret 对但 accountId 查无 → 同样 404');
// ===========================================================================
{
    const r1 = await transferPOST(req({ action: 'quote', accountId: userId, bytes: 1024 }, 'wrong-secret'));
    assert.strictEqual(r1.status, 404, 'secret 错 → 404');

    const r2 = await transferPOST(req({ action: 'quote', accountId: userId, bytes: 1024 }, null));
    assert.strictEqual(r2.status, 404, '缺 header → 404');

    const r3 = await transferPOST(req({ action: 'quote', accountId: crypto.randomUUID(), bytes: 1024 }));
    assert.strictEqual(r3.status, 404, 'secret 对但 accountId 查无 → 同样 404（不泄露哪一半错）');
    ok('三种鉴权失败路径都回 404，互相之间在响应上不可区分');
}

// ===========================================================================
console.log('\n[3] quote：10MB ≈ 1 credit，1GB = 60 credits（service_pricing 种子行）');
// ===========================================================================
{
    const GB = 1024 ** 3;
    const r10mb = await transferPOST(
        req({ action: 'quote', accountId: userId, bytes: 10 * 1024 * 1024 })
    );
    assert.strictEqual(r10mb.status, 200);
    const b10mb = await r10mb.json();
    assert.strictEqual(b10mb.ok, true);
    assert.strictEqual(b10mb.credits, 1, '10MB 向上取整应为 1 credit');

    const r1gb = await transferPOST(req({ action: 'quote', accountId: userId, bytes: GB }));
    const b1gb = await r1gb.json();
    assert.strictEqual(b1gb.credits, 60, '1GB = 60 credits（成本 50 分 × 1.2 margin 向上取整）');
    assert.ok('balanceCents' in b1gb, 'quote 必须带 balanceCents');
    ok('quote 计价：10MB→1 credit、1GB→60 credits，且带余额');

    const rBad = await transferPOST(req({ action: 'quote', accountId: userId, bytes: -1 }));
    assert.strictEqual(rBad.status, 400);
    assert.strictEqual((await rBad.json()).error, 'bad_request');
    ok('bytes 非正整数 → 400 bad_request');

    const rOverCap = await transferPOST(req({ action: 'quote', accountId: userId, bytes: 4 * GB }));
    assert.strictEqual(rOverCap.status, 400, '超 maxUnitsPerCall(3GB) 应拒');
    ok('超 maxUnitsPerCall 上限 → 400 bad_request');
}

// ===========================================================================
console.log('\n[4] charge：幂等重放同一 idempotencyKey 只扣一次');
// ===========================================================================
let chargeLedgerId: number;
{
    fund(10_000); // 100 元，足够覆盖测试
    const idemKey = 'xfer-charge-' + crypto.randomUUID();
    const bytes = 10 * 1024 * 1024; // 10MB → 1 credit

    const r1 = await transferPOST(
        req({ action: 'charge', accountId: userId, bytes, refId: 'req-aaa', idempotencyKey: idemKey })
    );
    assert.strictEqual(r1.status, 200);
    const b1 = await r1.json();
    assert.strictEqual(b1.ok, true);
    assert.strictEqual(b1.credits, 1);
    assert.ok(typeof b1.ledgerId === 'number');
    chargeLedgerId = b1.ledgerId;

    const r2 = await transferPOST(
        req({ action: 'charge', accountId: userId, bytes, refId: 'req-aaa', idempotencyKey: idemKey })
    );
    assert.strictEqual(r2.status, 200);
    const b2 = await r2.json();
    assert.deepStrictEqual(b2, b1, '同一幂等键重放必须回放同一响应');

    const rows = serviceSpendRows();
    assert.strictEqual(rows.length, 1, '重放不应产生第二行 service_spend');
    const meta = JSON.parse(rows[0].meta ?? '{}');
    assert.strictEqual(meta.service, 'transfer');
    assert.strictEqual(meta.bytes, bytes);
    assert.strictEqual(meta.refId, 'req-aaa');
    ok('charge 幂等重放：同 ledgerId、只产生一行 service_spend，meta 带 service/bytes/refId');
}

// ===========================================================================
console.log('\n[5] charge：余额不足 → 409 no_credits，带 availableCents/requiredCents');
// ===========================================================================
{
    const freshUserId = crypto.randomUUID();
    const users = JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'users.json'), 'utf-8'));
    users.push({
        id: freshUserId,
        username: 'xfer-poor',
        email: 'poor@test.local',
        passwordHash: 'x:y',
        displayName: 'Poor Tester',
        createdAt: new Date().toISOString(),
    });
    fs.writeFileSync(path.join(cwd, 'data', 'users.json'), JSON.stringify(users));

    const GB = 1024 ** 3;
    const r = await transferPOST(
        req({
            action: 'charge',
            accountId: freshUserId,
            bytes: GB, // 60 credits，穷户余额为 0
            refId: 'req-poor',
            idempotencyKey: 'xfer-charge-poor-' + crypto.randomUUID(),
        })
    );
    assert.strictEqual(r.status, 409);
    const body = await r.json();
    assert.strictEqual(body.error, 'no_credits');
    assert.strictEqual(body.availableCents, 0);
    assert.strictEqual(body.requiredCents, 60);

    const rows = getDb()
        .prepare("SELECT * FROM wallet_ledger WHERE userId = ? AND kind = 'service_spend'")
        .all(freshUserId) as unknown[];
    assert.strictEqual(rows.length, 0, '余额不足必须整体回滚，不留半笔账');
    ok('余额不足 → 409 no_credits 带两个金额，且不留坏账');
}

// ===========================================================================
console.log('\n[6] refund：原批次原额退回，重复 refund 幂等不二次退款');
// ===========================================================================
{
    const before = getDb()
        .prepare('SELECT balanceAfterCents FROM wallet_ledger WHERE userId = ? ORDER BY id DESC LIMIT 1')
        .get(userId) as { balanceAfterCents: number };

    const r1 = await transferPOST(req({ action: 'refund', accountId: userId, ledgerId: chargeLedgerId }));
    assert.strictEqual(r1.status, 200);
    assert.deepStrictEqual(await r1.json(), { ok: true });

    const afterFirst = getDb()
        .prepare('SELECT balanceAfterCents FROM wallet_ledger WHERE userId = ? ORDER BY id DESC LIMIT 1')
        .get(userId) as { balanceAfterCents: number };
    assert.strictEqual(afterFirst.balanceAfterCents, before.balanceAfterCents + 1, '退回 1 credit');

    // 再退一次：幂等，不产生第二笔 adjust 退款、余额不再变化
    const r2 = await transferPOST(req({ action: 'refund', accountId: userId, ledgerId: chargeLedgerId }));
    assert.strictEqual(r2.status, 200);
    assert.deepStrictEqual(await r2.json(), { ok: true });

    const afterSecond = getDb()
        .prepare('SELECT balanceAfterCents FROM wallet_ledger WHERE userId = ? ORDER BY id DESC LIMIT 1')
        .get(userId) as { balanceAfterCents: number };
    assert.strictEqual(
        afterSecond.balanceAfterCents,
        afterFirst.balanceAfterCents,
        '重复 refund 不应再次改变余额'
    );

    const refundRows = getDb()
        .prepare(`SELECT * FROM wallet_ledger WHERE userId = ? AND json_extract(meta, '$.refundOf') = ?`)
        .all(userId, chargeLedgerId) as unknown[];
    assert.strictEqual(refundRows.length, 1, 'refundOf 指向该 ledgerId 的退款行必须恰好一行，不能有第二笔');
    ok('refund：原批次原额退回一次；重复调用幂等回放，不二次退款');

    // ledgerId 传成数字字符串也要接受（云后端 chargeLedgerId 是 TEXT 列）
    const rStr = await transferPOST(
        req({ action: 'refund', accountId: userId, ledgerId: String(chargeLedgerId) })
    );
    assert.strictEqual(rStr.status, 200);
    ok('refund 的 ledgerId 接受数字字符串（贴合云后端 TEXT 列）');
}

console.log(`\n全部通过：${passed} 项`);
