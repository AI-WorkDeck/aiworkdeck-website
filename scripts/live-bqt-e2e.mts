/**
 * 包晴天积分通道端到端（对包晴天**测试环境**真扣积分，不进 CI）。
 *
 * 需要 AWD_BQT_MEMBER_BASE_URL / AWD_BQT_MEMBER_APP_ID / AWD_BQT_MEMBER_APP_SECRET 与 BQT_LIVE_LAWYER_ID（有效会员、有积分的测试律师）。
 * 每次约扣 0.06 积分。拒绝对 uat.bqt.com（生产）运行。
 *   npm run live:bqt-e2e
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

assert.ok(!fs.existsSync(path.join(process.cwd(), 'package.json')), '必须在隔离目录运行');
const base = process.env.AWD_BQT_MEMBER_BASE_URL ?? '';
const lawyerId = process.env.BQT_LIVE_LAWYER_ID ?? '';
assert.ok(base && !base.includes('uat.bqt.com'), '只允许对包晴天测试环境运行');
assert.match(lawyerId, /^\d{1,19}$/, '需要 BQT_LIVE_LAWYER_ID');
fs.mkdirSync('data'); fs.writeFileSync('data/users.json', '[]');

const m = await import('@/lib/bqt-member');
const { getDb } = await import('@/lib/db');
const { generateApiKey } = await import('@/lib/api-keys');
const { getBalance } = await import('@/lib/credits');
const { subscriptionSnapshot } = await import('@/lib/subscription');
const { hasEntitlement } = await import('@/lib/purchases');
const billing = await import('@/lib/platform-ai/billing');
const { GET: meGET } = await import('@/app/api/account/me/route');

const id = randomUUID();
fs.writeFileSync('data/users.json', JSON.stringify([{ id, username: `bqt-e2e-${id.slice(0, 8)}`, displayName: 'E2E', passwordHash: 'unused', createdAt: new Date().toISOString() }]));
const key = generateApiKey(id).key!.plaintextKey;
const now = new Date().toISOString();
getDb().prepare(`INSERT INTO bqt_user_binding (userId, bqtUserId, mobile, userName, userType, boundAt, updatedAt) VALUES (?, ?, NULL, 'E2E', 'lawyer', ?, ?)`).run(id, lawyerId, now, now);

// 迁移默认 1 元 = 3 积分；毛利 1.2
assert.ok(Math.abs(m.getBqtSettings().centsPerPoint! - 100 / 3) < 1e-9);
assert.ok(m.updateBqtSettings({ marginMultiplier: 1.2, tunnelEnabled: true }, 'e2e').ok);

const before = (await m.fetchBqtEntitlement(lawyerId)).usablePointsHundredths;
console.log('points before', m.formatPoints(before));

// 账户契约字段
const me = await (await meGET(new NextRequest('https://www.aiworkdeck.com/api/account/me', { headers: { Authorization: `Bearer ${key}` } }))).json();
const meBody = me.user ?? me;
console.log('me.billingLine', meBody.billingLine ?? me.billingLine, 'bqtMember', JSON.stringify(meBody.bqtMember ?? me.bqtMember));
assert.equal(meBody.billingLine ?? me.billingLine, 'standard');
assert.ok((meBody.bqtMember ?? me.bqtMember)?.points, '积分另报在 bqtMember');

// Pro 权益
const sub = subscriptionSnapshot(id) as any;
console.log('subscription', sub.active, sub.source, sub.endsAt ?? sub.expiresAt);
assert.equal(sub.active, true);
assert.ok(hasEntitlement(id, 'cloud.storage.3gb'));

// AI：DeepSeek 预检 → 预留（不动本站钱包）→ 结算 → 真实扣积分
const req = randomUUID();
await billing.authorizeCostCny(id, req, 0.05, 'deepseek-v4.1-flash-1017');
// 非 DeepSeek 走本站钱包（这个测试账号钱包为 0 → 余额不足，积分不动）
const q = randomUUID();
await billing.authorizeCostCny(id, q, 0.05, 'qwen3.8-max');
assert.throws(() => billing.reserveCostCny(id, q, { e2e: true }, 'qwen3.8-max', 0.05, {}), /Credits|insufficient/i);
billing.reserveCostCny(id, req, { e2e: true }, 'deepseek-v4.1-flash-1017', 0.05, { e2e: true });
assert.equal(getBalance(id), 0, '本站钱包不应被动用');
billing.submitted(id, req);
billing.settleCostCny(id, req, 0.01, { e2e: true }); // ¥0.01 × 1.2 → 2 分 → 0.06 积分
const row = getDb().prepare("SELECT requestNo FROM bqt_consume WHERE userId=? AND service='platform_ai'").get(id) as { requestNo: string };
let c = m.consumeRow(row.requestNo)!;
for (let i = 0; i < 50 && (c.state === 'pending' || c.state === 'sending'); i++) { await new Promise(r => setTimeout(r, 200)); c = m.consumeRow(row.requestNo)!; }
console.log('consume', c.requestNo, c.state, m.formatPoints(c.pointsHundredths), 'usableAfter', c.usablePointsAfter);
assert.equal(c.state, 'succeeded');
assert.equal(c.pointsHundredths, 6);

const after = (await m.fetchBqtEntitlement(lawyerId)).usablePointsHundredths;
console.log('points after', m.formatPoints(after));
assert.equal(before - after, 6);
assert.equal(getBalance(id), 0);
console.log('live-bqt-e2e OK');
