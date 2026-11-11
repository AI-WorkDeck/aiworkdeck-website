/**
 * Credits 重构 P1 验证脚本：批次记账 / 有效期 / 消费顺序 / 原批次退款 / 存量迁移。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-credits.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import Database from 'better-sqlite3';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
const otherId = crypto.randomUUID();
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify(
        [userId, otherId].map((id, i) => ({
            id,
            username: `credits-tester-${i}`,
            email: `c${i}@test.local`,
            passwordHash: 'x:y',
            displayName: `Credits Tester ${i}`,
            createdAt: new Date().toISOString(),
        }))
    )
);

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

// ===========================================================================
// A. 迁移：用**真的**迁移 1–6 造一个 v6 库，再让 getDb() 从 v6 跑到最新版
//
// 这里刻意不手抄一份 DDL。手抄的夹具只覆盖「写它那天想得起来的表」，之后每加一条
// 迁移就腐坏一分：迁移 9 要给 orders 加列、迁移 10 要给两张 telemetry 表建索引，
// 而手抄版从没建过它们——于是这段自 PR#40 起就一直在 getDb() 里当场炸掉，
// 整条护栏哑着，后面几十条断言一条都没跑过，也没人发现。
//
// 直接复用 lib/db.ts 的 MIGRATIONS：v6 库按定义就与真库一致，往后再加迁移也不必
// 回来补表——夹具不会再腐坏第二次。
// ===========================================================================
console.log('\n[A] 迁移 7：存量余额回填为不过期的 topup 批次');
{
    const dbFile = path.join(cwd, 'data', 'awd.db');
    const raw = new Database(dbFile);

    // 只跑到 v6 就停：迁移 7 及其之后正是本段要交给 getDb() 验的东西。
    // 注意 import '@/lib/db' 本身不会开库（getDb() 才会），所以此处安全。
    const { MIGRATIONS } = await import('@/lib/db');
    raw.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);');
    const record = raw.prepare('INSERT INTO schema_version (version, appliedAt) VALUES (?, ?)');
    for (const m of MIGRATIONS) {
        if (m.version > 6) continue;
        m.up(raw);
        record.run(m.version, new Date().toISOString());
    }
    // 造历史流水：用户甲 充 100 元 → 扣 30 元（余 70 元）；用户乙 充 20 元后全花光（余 0）
    const ins = raw.prepare(
        `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents) VALUES (?, ?, ?, ?, ?)`
    );
    ins.run(userId, '2026-01-01T00:00:00.000Z', 'recharge', 10000, 10000);
    ins.run(userId, '2026-01-02T00:00:00.000Z', 'ai_alloc', -3000, 7000);
    ins.run(otherId, '2026-01-01T00:00:00.000Z', 'recharge', 2000, 2000);
    ins.run(otherId, '2026-01-03T00:00:00.000Z', 'purchase', -2000, 0);
    raw.close();

    const { getBalance, getBalanceBreakdown } = await import('@/lib/credits');

    assert.strictEqual(getBalance(userId), 7000, '迁移后余额必须与原账本一致');
    assert.strictEqual(getBalance(otherId), 0, '余额为 0 的用户不该被造出批次');
    const bd = getBalanceBreakdown(userId);
    assert.strictEqual(bd.topupCents, 7000);
    assert.strictEqual(bd.rewardCents, 0);
    assert.strictEqual(bd.nextExpiry, null, '存量一律不过期');
    ok('存量余额原样回填为 topup 批次，余额零的用户不建批次');

    const { getDb } = await import('@/lib/db');
    const kinds = getDb()
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_ledger'")
        .get() as { sql: string };
    assert.ok(kinds.sql.includes("'gift'") && kinds.sql.includes("'expire'"), 'kind 枚举应已扩容');
    assert.strictEqual(
        (getDb().prepare('SELECT COUNT(*) AS n FROM wallet_ledger').get() as { n: number }).n,
        4,
        '重建后流水一行不能少'
    );
    ok('wallet_ledger 重建：kind 枚举扩容且行数一字不差');

    const cols = getDb().prepare('PRAGMA table_info(ai_allocations)').all() as { name: string }[];
    assert.ok(cols.some(c => c.name === 'spendLedgerId'), 'ai_allocations 应新增 spendLedgerId');
    // 迁移 8：水位列必须可为 NULL，默认 0 会把历史用量二次扣费
    const orCols = getDb().prepare('PRAGMA table_info(openrouter_keys)').all() as { name: string; dflt_value: unknown; notnull: number }[];
    const settled = orCols.find(c => c.name === 'settledUsageUsd');
    assert.ok(settled, 'openrouter_keys 应新增 settledUsageUsd');
    assert.strictEqual(settled!.notnull, 0, 'settledUsageUsd 必须允许 NULL（表示水位未建立）');
    assert.strictEqual(settled!.dflt_value, null, '不得有默认值 0，否则历史用量会被二次扣费');
    ok('迁移 8：settledUsageUsd 可为 NULL 且无默认值（避免历史用量二次扣费）');
}

const { getDb, withTransaction } = await import('@/lib/db');
const {
    getBalance,
    getBalanceBreakdown,
    getRefundableCents,
    grantCredits,
    spendCredits,
    refundSpend,
    expireCredits,
    rewardExpiryFrom,
    InsufficientCreditsError,
} = await import('@/lib/credits');

// ===========================================================================
// B. 批次属性：topup 不过期、reward 24 个月
// ===========================================================================
console.log('\n[B] 批次属性');
{
    const start = getBalance(userId);
    withTransaction(db =>
        grantCredits(db, { userId, pool: 'reward', amountCents: 1000, ledgerKind: 'earning' })
    );
    const bd = getBalanceBreakdown(userId);
    assert.strictEqual(bd.totalCents, start + 1000);
    assert.strictEqual(bd.rewardCents, 1000);
    assert.ok(bd.nextExpiry && bd.nextExpiry.amountCents === 1000);
    ok('分成入 reward 批次并带上到期日');

    assert.strictEqual(getRefundableCents(userId), 7000, '可退现只算 topup');
    ok('可退现金额只含充值批次，分成不计入');

    const exp = rewardExpiryFrom('2026-08-08T00:00:00.000Z');
    assert.strictEqual(exp.slice(0, 10), '2028-08-08', '24 个月后');
    assert.strictEqual(rewardExpiryFrom('2026-01-31T00:00:00.000Z').slice(0, 10), '2028-01-31');
    ok('有效期 = 入账 + 24 个月，月末不溢出');

    // 表级 CHECK：topup 绝不允许带有效期（预付卡红线的最后一道闸）
    assert.throws(
        () =>
            getDb()
                .prepare(
                    `INSERT INTO credit_lots (userId, pool, originalCents, remainingCents, grantedAt, expiresAt, sourceKind)
           VALUES (?, 'topup', 100, 100, ?, ?, 'test')`
                )
                .run(userId, new Date().toISOString(), '2027-01-01T00:00:00.000Z'),
        /CHECK/
    );
    ok('DB 层拒绝「带有效期的充值批次」');
}

// ===========================================================================
// C. 消费顺序：reward 优先，同类先到期先扣
// ===========================================================================
console.log('\n[C] 消费顺序');
{
    const u = crypto.randomUUID();
    withTransaction(db => {
        grantCredits(db, { userId: u, pool: 'topup', amountCents: 5000, ledgerKind: 'recharge' });
        // 两笔 reward，人为拉开到期日
        grantCredits(db, {
            userId: u,
            pool: 'reward',
            amountCents: 300,
            ledgerKind: 'earning',
            nowIso: '2026-06-01T00:00:00.000Z',
        });
        grantCredits(db, {
            userId: u,
            pool: 'reward',
            amountCents: 200,
            ledgerKind: 'earning',
            nowIso: '2026-01-01T00:00:00.000Z',
        });
    });

    withTransaction(db => spendCredits(db, { userId: u, amountCents: 250, ledgerKind: 'purchase' }));
    const bd = getBalanceBreakdown(u);
    assert.strictEqual(bd.topupCents, 5000, '还有 reward 时绝不能动 topup');
    assert.strictEqual(bd.rewardCents, 250, '500 reward 扣 250 剩 250');

    const lots = getDb()
        .prepare('SELECT expiresAt, remainingCents FROM credit_lots WHERE userId = ? AND pool = ? ORDER BY expiresAt')
        .all(u, 'reward') as { expiresAt: string; remainingCents: number }[];
    assert.strictEqual(lots[0].remainingCents, 0, '先到期的那笔先被扣空');
    assert.strictEqual(lots[1].remainingCents, 250);
    ok('reward 优先于 topup，且先到期先扣');

    withTransaction(db => spendCredits(db, { userId: u, amountCents: 1000, ledgerKind: 'purchase' }));
    const bd2 = getBalanceBreakdown(u);
    assert.strictEqual(bd2.rewardCents, 0);
    assert.strictEqual(bd2.topupCents, 4250, 'reward 花完才轮到 topup');
    ok('reward 耗尽后自动续扣 topup');
}

// ===========================================================================
// D. 到期：余额立即少掉，不依赖清理任务
// ===========================================================================
console.log('\n[D] 到期');
{
    const u = crypto.randomUUID();
    withTransaction(db => {
        grantCredits(db, {
            userId: u,
            pool: 'reward',
            amountCents: 800,
            ledgerKind: 'earning',
            nowIso: '2020-01-01T00:00:00.000Z', // 到期日 2022，早已过期
        });
        grantCredits(db, { userId: u, pool: 'topup', amountCents: 400, ledgerKind: 'recharge' });
    });
    assert.strictEqual(getBalance(u), 400, '过期批次不计入余额（清理任务尚未跑）');
    ok('到期批次立即不计余额，无需等清理任务');

    assert.throws(
        () => withTransaction(db => spendCredits(db, { userId: u, amountCents: 500, ledgerKind: 'purchase' })),
        InsufficientCreditsError
    );
    ok('过期批次不可被花掉');

    const res = withTransaction(db => expireCredits(db, new Date().toISOString()));
    assert.ok(res.totalCents >= 800);
    const expireRow = getDb()
        .prepare("SELECT amountCents FROM wallet_ledger WHERE userId = ? AND kind = 'expire'")
        .get(u) as { amountCents: number };
    assert.strictEqual(expireRow.amountCents, -800);
    assert.strictEqual(getBalance(u), 400, '清理不改变余额，只补流水');
    ok('清理任务补一行 expire 流水，余额前后一致');

    const again = withTransaction(db => expireCredits(db, new Date().toISOString()));
    assert.strictEqual(again.lots, 0, '重复跑不应再产生流水');
    ok('清理幂等：重复执行不重复记账');
}

// ===========================================================================
// E. 退款必须原批次原额（防把 reward 洗成可退的 topup）
// ===========================================================================
console.log('\n[E] 原批次退款');
{
    const u = crypto.randomUUID();
    withTransaction(db => {
        grantCredits(db, { userId: u, pool: 'reward', amountCents: 600, ledgerKind: 'earning' });
        grantCredits(db, { userId: u, pool: 'topup', amountCents: 600, ledgerKind: 'recharge' });
    });
    // 花 1000：600 reward + 400 topup
    const spend = withTransaction(db =>
        spendCredits(db, { userId: u, amountCents: 1000, ledgerKind: 'ai_alloc' })
    );
    assert.strictEqual(getBalanceBreakdown(u).rewardCents, 0);
    assert.strictEqual(getBalanceBreakdown(u).topupCents, 200);

    withTransaction(db => refundSpend(db, spend.id, { ledgerKind: 'adjust' }));
    const bd = getBalanceBreakdown(u);
    assert.strictEqual(bd.rewardCents, 600, 'reward 必须原样退回 reward');
    assert.strictEqual(bd.topupCents, 600);
    assert.strictEqual(getRefundableCents(u), 600, '退款后可退现金额不得变大');
    ok('退款按原批次原额还原，reward 不会被洗成 topup');

    assert.throws(
        () => withTransaction(db => refundSpend(db, spend.id + 99999)),
        /找不到要退回的流水行/
    );
    ok('退回不存在的流水行被拒');
}

// ===========================================================================
// F. 并发与不变式
// ===========================================================================
console.log('\n[F] 不变式');
{
    const u = crypto.randomUUID();
    withTransaction(db => grantCredits(db, { userId: u, pool: 'topup', amountCents: 100, ledgerKind: 'recharge' }));
    assert.throws(
        () => withTransaction(db => spendCredits(db, { userId: u, amountCents: 101, ledgerKind: 'purchase' })),
        InsufficientCreditsError
    );
    assert.strictEqual(getBalance(u), 100, '失败的扣减必须整体回滚');

    // 批次剩余永不为负、永不超过原额
    const bad = getDb().prepare('SELECT COUNT(*) AS n FROM credit_lots WHERE remainingCents < 0 OR remainingCents > originalCents').get() as { n: number };
    assert.strictEqual(bad.n, 0);
    ok('批次剩余始终在 [0, 原额] 区间内');

    // 全库对账：每个用户的余额 = 未过期批次之和
    const users = getDb().prepare('SELECT DISTINCT userId FROM credit_lots').all() as { userId: string }[];
    for (const { userId: uid } of users) {
        const sum = getDb()
            .prepare(
                `SELECT COALESCE(SUM(remainingCents),0) AS s FROM credit_lots
          WHERE userId = ? AND remainingCents > 0 AND (expiresAt IS NULL OR expiresAt > ?)`
            )
            .get(uid, new Date().toISOString()) as { s: number };
        assert.strictEqual(getBalance(uid), sum.s);
    }
    ok(`全库 ${users.length} 个账户余额与批次之和逐一对账通过`);
}

console.log(`\n全部通过：${passed} 项`);
