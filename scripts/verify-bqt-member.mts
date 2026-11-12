/**
 * 包晴天积分通道基础层验收（lib/bqt-member.ts）。
 *
 * 必须在空目录运行（data/awd.db 建在 cwd）：npm run test:bqt-member
 * 另设 BQT_LIVE_ENTITLEMENT=1 时，用 AWD_BQT_MEMBER_* 环境变量对真实环境只读查一次权益（不扣积分）。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });

const live = process.env.BQT_LIVE_ENTITLEMENT === '1';
const liveEnv = { url: process.env.AWD_BQT_MEMBER_BASE_URL, id: process.env.AWD_BQT_MEMBER_APP_ID, secret: process.env.AWD_BQT_MEMBER_APP_SECRET };
process.env.AWD_BQT_MEMBER_BASE_URL = 'https://bqt.fake';
process.env.AWD_BQT_MEMBER_APP_ID = 'APPID';
process.env.AWD_BQT_MEMBER_APP_SECRET = 'SECRET';

const m = await import('@/lib/bqt-member');
const { getDb, withTransaction } = await import('@/lib/db');
const db = getDb();

// ── 签名：与包晴天 Python 脚本同算法 ──
{
  const h = m.bqtSignHeaders('APPID', 'SECRET', 1700000000000, 'a'.repeat(32));
  const expect = crypto.createHmac('sha256', 'SECRET').update(`appId=APPID&timestamp=1700000000000&nonce=${'a'.repeat(32)}&app_secret=SECRET`).digest('hex').toUpperCase();
  assert.equal(h['X-Sign'], expect);
  assert.equal(m.bqtSignHeaders('A', 'S')['X-Nonce'].length, 32);
  assert.equal(h['X-Timestamp'].length, 13);
}

// ── 积分换算 ──
assert.equal(m.centsToPointsHundredths(10, 100), 10);      // 10 分 / (100 分/积分) = 0.10 积分
assert.equal(m.centsToPointsHundredths(1, 3), 34);         // 0.333.. → 0.34 向上
assert.equal(m.pointsHundredthsToCents(34, 3), 1);         // 1.02 → 1 向下
assert.equal(m.formatPoints(1205), '12.05');
assert.equal(m.formatPoints(7), '0.07');

// ── 设置：校验 + 留痕 + 开通道前置条件 ──
assert.equal(m.bqtTunnelActive(), false);
// 迁移默认 1 元 = 3 积分（2026-11-06 用户定）；1:3 换算不能因循环小数多扣
assert.ok(Math.abs(m.getBqtSettings().centsPerPoint! - 100 / 3) < 1e-9);
assert.equal(m.centsToPointsHundredths(100, 100 / 3), 300);
assert.equal(m.centsToPointsHundredths(1, 100 / 3), 3);
assert.equal(m.centsToPointsHundredths(2, 100 / 3), 6);
assert.equal(m.pointsHundredthsToCents(300, 100 / 3), 100);
assert.equal(m.pointsHundredthsToCents(9998, 100 / 3), 3332);
assert.ok(m.updateBqtSettings({ centsPerPoint: 100 / 3 }, 't').ok, '1 元 = 3 积分换算的循环小数必须能存');
assert.ok(m.updateBqtSettings({ centsPerPoint: null }, 't').ok);
assert.deepEqual(m.updateBqtSettings({ tunnelEnabled: true }, 't'), { ok: false, error: 'ratio_required' });
assert.deepEqual(m.updateBqtSettings({ centsPerPoint: -1 }, 't'), { ok: false, error: 'invalid_cents_per_point' });
assert.deepEqual(m.updateBqtSettings({ centsPerPoint: 1.23456 }, 't'), { ok: false, error: 'invalid_cents_per_point' });
assert.deepEqual(m.updateBqtSettings({ marginMultiplier: 0.9 }, 't'), { ok: false, error: 'invalid_margin' });
assert.ok(m.updateBqtSettings({ centsPerPoint: 100, tunnelEnabled: true, marginMultiplier: 1.2 }, 'admin@1.2.3.4').ok);
assert.equal(m.bqtTunnelActive(), true);
assert.equal(m.listBqtSettingsAudit().length, 4);
assert.equal(m.bqtMarginMultiplier(), 1.2);

// ── 路由：只有绑定了的律师才走包晴天 ──
const userId = crypto.randomUUID();
db.prepare(`INSERT INTO bqt_user_binding (userId, bqtUserId, mobile, userName, userType, boundAt, updatedAt) VALUES (?, '10001', NULL, 'L', 'lawyer', ?, ?)`)
  .run(userId, new Date().toISOString(), new Date().toISOString());
assert.deepEqual(m.bqtLinkedLawyer(userId), { lawyerId: '10001' });
assert.equal(m.bqtLinkedLawyer('nobody'), null);

// ── 假包晴天 ──
let points = 1200_00;            // 百分之一积分
let member = { status: 'ACTIVE', aiWorkbench: true };
const ledger = new Map<string, number>();
const script: Array<'busy' | 'drop' | 'http500'> = [];
const seen: Array<{ url: string; body?: string; headers: Record<string, string> }> = [];
m.setBqtFetchForTest(async (url, init) => {
  seen.push({ url, body: init.body, headers: init.headers });
  const reply = (o: unknown, status = 200) => ({ status, text: async () => JSON.stringify(o) });
  if (url.includes('/entitlement?')) {
    return reply({ code: 0, msg: 'success', data: { lawyerId: '10001', levelCode: 'GROWTH', status: member.status, expireTime: '2027-10-13T23:59:59', aiWorkbench: member.aiWorkbench, usablePoints: points / 100 } });
  }
  const step = script.shift();
  if (step === 'drop') throw new Error('socket hang up');
  if (step === 'http500') return reply({}, 500);
  const b = JSON.parse(init.body!);
  const want = Math.round(b.points * 100);
  const res = (resultCode: string, code: number, extra: object = {}) => reply({ code, msg: resultCode, data: { code, resultCode, requestNo: b.requestNo, lawyerId: '10001', consumedPoints: 0, usablePoints: points / 100, idempotent: false, ...extra } });
  if (step === 'busy') return res('SYSTEM_BUSY', 46106);
  if (ledger.has(b.requestNo)) {
    return ledger.get(b.requestNo) === want ? res('SUCCESS', 0, { consumedPoints: want / 100, idempotent: true }) : res('AMOUNT_MISMATCH', 46107, { consumedPoints: ledger.get(b.requestNo)! / 100 });
  }
  if (member.status !== 'ACTIVE') return res('MEMBER_INVALID', 46101);
  if (points < want) return res('INSUFFICIENT_POINTS', 46102);
  points -= want; ledger.set(b.requestNo, want);
  return res('SUCCESS', 0, { consumedPoints: want / 100, usablePoints: points / 100 });
});

// 灰度请求头 version：配了才带，没配不带
await m.fetchBqtEntitlement('10001');
assert.equal(seen.at(-1)!.headers.version, undefined);
process.env.AWD_BQT_MEMBER_VERSION = 'v2.5.7';
await m.fetchBqtEntitlement('10001');
assert.equal(seen.at(-1)!.headers.version, 'v2.5.7');
assert.ok(seen.at(-1)!.headers['X-Sign'], '签名头照带');
delete process.env.AWD_BQT_MEMBER_VERSION;

// 权益 + 快照 + 预检
const e = await m.fetchBqtEntitlement('10001');
assert.equal(e.usablePointsHundredths, 1200_00);
assert.equal(e.expireAt, new Date('2027-10-13T23:59:59+08:00').toISOString());
assert.ok(m.bqtProRightsUntil(userId));
const pre = await m.bqtPreflight(userId, '10001', 500);
assert.ok(pre.ok && pre.availableCents === 120000);
assert.deepEqual((await m.bqtPreflight(userId, '10001', 120001)).ok, false);

// 正常扣：lawyerId 作为数字字面量、积分两位小数
let row = withTransaction(d => m.enqueueConsume(d, { userId, lawyerId: '10001', cents: 1234, service: 'platform_ai', refId: 'req-1' }));
assert.equal(row.pointsHundredths, 1234);
assert.equal(m.bqtOutstandingCents(userId).cents, 1234);
row = await m.dispatchConsume(row.requestNo);
assert.equal(row.state, 'succeeded');
assert.match(seen.at(-1)!.body!, /^\{"lawyerId":10001,"points":12\.34,"requestNo":"aw-platform_ai-req-1"\}$/);
assert.equal(m.bqtOutstandingCents(userId).cents, 0);
assert.equal(m.bqtBalanceView(userId, '10001')!.points, '1187.66');
// 同号同参再登记 → 原行；不同金额 → 冲突
assert.equal(withTransaction(d => m.enqueueConsume(d, { userId, lawyerId: '10001', cents: 1234, service: 'platform_ai', refId: 'req-1' })).state, 'succeeded');
assert.throws(() => withTransaction(d => m.enqueueConsume(d, { userId, lawyerId: '10001', cents: 99, service: 'platform_ai', refId: 'req-1' })), /bqt_request_no_conflict/);

// 掉线 / SYSTEM_BUSY / 500 → 留 pending，原单号原积分重发，只扣一次
script.push('drop', 'busy', 'http500');
row = withTransaction(d => m.enqueueConsume(d, { userId, lawyerId: '10001', cents: 500, service: 'platform_ai', refId: 'req-2' }));
for (let i = 0; i < 3; i++) { row = await m.dispatchConsume(row.requestNo); assert.equal(row.state, 'pending'); }
db.prepare("UPDATE bqt_consume SET updatedAt='2000-01-01T00:00:00Z' WHERE requestNo=?").run(row.requestNo);
assert.equal(await m.retryPendingConsumes(), 1);
assert.equal(m.consumeRow(row.requestNo)!.state, 'succeeded');
assert.equal(m.consumeRow(row.requestNo)!.attempts, 4);
assert.equal(points, 1200_00 - 1234 - 500);
const bodies = seen.filter(s => s.body?.includes('req-2')).map(s => s.body);
assert.ok(bodies.every(b => b === bodies[0]), '重试必须原样');

// 积分不足 → failed，挂账拦后续；后台放弃后放行；重扣开新单号
points = 100;
row = withTransaction(d => m.enqueueConsume(d, { userId, lawyerId: '10001', cents: 5000, service: 'cloud_meter', refId: 'm-1' }));
row = await m.dispatchConsume(row.requestNo);
assert.equal(row.state, 'failed'); assert.equal(row.resultCode, 'INSUFFICIENT_POINTS');
assert.deepEqual((await m.bqtPreflight(userId, '10001', 1)), { ok: false, reason: 'outstanding_debt' });
points = 10_000_00;
const again = m.reissueConsume(row.requestNo, 'admin')!;
assert.notEqual(again.requestNo, row.requestNo);
assert.equal(m.consumeRow(row.requestNo)!.state, 'waived');
assert.equal((await m.dispatchConsume(again.requestNo)).state, 'succeeded');
assert.ok((await m.bqtPreflight(userId, '10001', 1)).ok);

points = 0;
const r3 = await m.dispatchConsume(withTransaction(d => m.enqueueConsume(d, { userId, lawyerId: '10001', cents: 1, service: 'x', refId: 'w' })).requestNo);
assert.equal(r3.state, 'failed');
assert.ok(m.waiveConsume(r3.requestNo, 'admin'));
assert.equal(m.bqtOutstandingCents(userId).failed, 0);

// 会员状态拒绝
points = 1000_00;
member = { status: 'ACTIVE', aiWorkbench: false };
db.prepare("UPDATE bqt_entitlement_snapshot SET fetchedAt='2000-01-01T00:00:00Z'").run();
assert.equal((await m.bqtPreflight(userId, '10001', 1) as any).reason, 'ai_closed');
assert.equal(m.bqtProRightsUntil(userId), null);
member = { status: 'EXPIRED', aiWorkbench: false };
db.prepare("UPDATE bqt_entitlement_snapshot SET fetchedAt='2000-01-01T00:00:00Z'").run();
assert.equal((await m.bqtPreflight(userId, '10001', 1) as any).reason, 'member_invalid');

// 通道关 → 走原线路
assert.ok(m.updateBqtSettings({ tunnelEnabled: false }, 't').ok);
assert.equal(m.bqtLinkedLawyer(userId), null);
console.log('verify-bqt-member: offline OK');

if (live) {
  m.setBqtFetchForTest(null);
  process.env.AWD_BQT_MEMBER_BASE_URL = liveEnv.url ?? '';
  process.env.AWD_BQT_MEMBER_APP_ID = liveEnv.id ?? '';
  process.env.AWD_BQT_MEMBER_APP_SECRET = liveEnv.secret ?? '';
  const got = await m.fetchBqtEntitlement(process.env.BQT_LIVE_LAWYER_ID ?? '10001');
  console.log('live entitlement:', got);
}
