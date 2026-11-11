/**
 * 网关「已扣费但上游报 MCP 错误」对账报表验证。必须在空目录执行：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-gateway-failed-charges.mts
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

assert.ok(!fs.existsSync(path.join(process.cwd(), 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
fs.writeFileSync(
    path.join(process.cwd(), 'data', 'users.json'),
    JSON.stringify([
        { id: 'u1', username: 'alice', email: 'a@test.local', passwordHash: 'x:y', displayName: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
    ])
);

const { getDb } = await import('@/lib/db');
const { failedChargeReport, failedChargeCsv } = await import('@/lib/gateway/failed-charges');
const d = getDb();

let key = 0;
function seed(o: { user?: string; service?: string; op: string; at: string; raw: string; charged: number | null; refunded?: boolean }) {
    let ledgerId: number | null = null;
    if (o.charged !== null) {
        ledgerId = Number(
            d.prepare(
                `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, meta)
                 VALUES (?, ?, 'service_spend', ?, 0, '{}')`
            ).run(o.user ?? 'u1', o.at, -o.charged).lastInsertRowid
        );
        if (o.refunded) {
            d.prepare(
                `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, meta)
                 VALUES (?, ?, 'adjust', ?, 0, ?)`
            ).run(o.user ?? 'u1', o.at, o.charged, JSON.stringify({ refundOf: ledgerId }));
        }
    }
    d.prepare(
        `INSERT INTO gateway_request (userId, idempotencyKey, service, op, status, responseJson, spendLedgerId, createdAt)
         VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`
    ).run(o.user ?? 'u1', `k${key++}`, o.service ?? 'pkulaw', o.op, JSON.stringify({ ok: true, data: { raw: o.raw } }), ledgerId, o.at);
}

const errJson = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'Unknown tool: x' }] } });
const errSse = `event: message\ndata: ${errJson}\n\n`;
const okJson = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'fine' }] } });

seed({ op: 'search_article', at: '2026-11-05T01:00:00.000Z', raw: errJson, charged: 60 });
seed({ op: 'search_article', at: '2026-11-06T01:00:00.000Z', raw: errSse, charged: 75 }); // SSE，真实金额非 60
seed({ user: 'u2', op: 'get_case', at: '2026-11-06T02:00:00.000Z', raw: errJson, charged: 60 });
seed({ op: 'search_article', at: '2026-11-06T03:00:00.000Z', raw: okJson, charged: 60 }); // 成功已扣：排除
seed({ op: 'search_article', at: '2026-11-06T04:00:00.000Z', raw: errJson, charged: null }); // 报错未扣：排除
seed({ op: 'search_article', at: '2026-11-06T05:00:00.000Z', raw: errJson, charged: 60, refunded: true }); // 已退：不计入待退
seed({ service: 'qcc', op: 'x', at: '2026-11-06T06:00:00.000Z', raw: errJson, charged: 60 }); // 别的服务

const r = failedChargeReport('pkulaw');
assert.equal(r.totals.calls, 3);
assert.equal(r.totals.amountCents, 195);
assert.equal(r.totals.amountCredits, 195);
assert.equal(r.totals.refundedCalls, 1);
assert.equal(r.firstFailureAt, '2026-11-05T01:00:00.000Z');
assert.equal(r.lastFailureAt, '2026-11-06T02:00:00.000Z');
assert.deepEqual(r.perOp.map((o) => [o.op, o.calls]), [['search_article', 2], ['get_case', 1]]);
assert.equal(r.users.length, 2);
assert.deepEqual([r.users[0].userId, r.users[0].username, r.users[0].calls, r.users[0].amountCents], ['u1', 'alice', 2, 135]);
assert.equal(r.users[1].username, null);
console.log('ok 计数/金额/过滤/SSE/已退');

const w = failedChargeReport('pkulaw', '2026-11-06', '2026-11-06');
assert.equal(w.totals.calls, 2);
assert.equal(w.totals.amountCents, 135);
console.log('ok 日期窗口（to 含当日）');

const csv = failedChargeCsv(r);
assert.ok(csv.startsWith('userId,username,displayName,calls,amountCents,amountCredits\n'));
assert.ok(csv.includes('u1,alice,Alice,2,135,135'));
console.log('ok CSV');
console.log('全部通过');
