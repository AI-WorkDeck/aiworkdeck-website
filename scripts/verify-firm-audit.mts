// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 律所审计日志上报验证（readiness S20）。直接调 lib 与 route handler，不起 next 服务。
 *
 * 覆盖：
 *  1. 入所（邀请码 / 邀请）、角色变更、退出、被移出、团队并入 / 退出 / 被移出、建所、重置律所邀请码 → 各一条正确事件；
 *     没有律所的团队一条都不报。
 *  2. 账户 Key 签发 / 吊销 / 登录换 Key → 事件只带行 id 与前缀，绝不带明文。
 *  3. 官网口令登录失败（账号存在且在律所）→ WEBSITE_LOGIN_FAILED，带 IP 与 UA，不带口令。
 *  4. 真 HTTP：对端 500 时按同一 eventId 重试直到成功；404 立刻放弃；对端很慢时调用方不被拖住；env 未配一条不发。
 *
 * 必须在一个空目录里执行（data/ 建在 cwd）：npm run test:firm-audit
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import assert from 'assert';

const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });

const MAIL_SITE = process.env.NEXT_PUBLIC_AWD_SITE === 'intl';
const now = new Date().toISOString();
const ids = {
    owner: crypto.randomUUID(), admin: crypto.randomUUID(), member: crypto.randomUUID(),
    sub: crypto.randomUUID(), loner: crypto.randomUUID(),
};
let n = 0;
function seed(id: string, name: string) {
    n++;
    return MAIL_SITE
        ? { id, username: `fa-${n}`, email: `fa-${n}@test.local`, emailVerifiedAt: now, passwordHash: '', displayName: name, createdAt: now }
        : { id, username: `fa-${n}`, email: '', passwordHash: '', phone: `1390000000${n}`, displayName: name, createdAt: now };
}
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), JSON.stringify([
    seed(ids.owner, '所长'), seed(ids.admin, '主任'), seed(ids.member, '律师甲'), seed(ids.sub, '分所负责人'), seed(ids.loner, '独立律师'),
]));

process.env.AWD_FIRM_AUDIT_URL = 'http://127.0.0.1:1'; // 被测试传输替换；只为通过「已配置」判定
process.env.AWD_FIRM_AUDIT_SECRET = 'test-secret';

const { getDb } = await import('@/lib/db');
const users = await import('@/lib/users');
const team = await import('@/lib/team');
const keys = await import('@/lib/api-keys');
const fa = await import('@/lib/firm-audit');
const { NextRequest } = await import('next/server');
const loginRoute = await import('@/app/api/auth/login/route');
const exchangeRoute = await import('@/app/api/auth/exchange-key/route');
const accountAudit = await import('@/lib/firm-audit-account');
const memberRoute = await import('@/app/api/account/team/members/[accountId]/route');

let passed = 0;
const ok = (name: string) => { passed++; console.log('  PASS', name); };

type Sent = { url: string; secret: string; payload: import('@/lib/firm-audit').FirmAuditPayload };
let sent: Sent[] = [];
fa.__setFirmAuditTransportForTest(async (url, secret, payload) => { sent.push({ url, secret, payload }); return 200; }, [0]);
async function drain() { await fa.flushFirmAudit(); const out = sent; sent = []; return out; }
const user = (id: string) => users.findUserById(id)!;
const code = (sql: string, id: string) => (getDb().prepare(sql).get(id) as { joinCode: string }).joinCode;

// ---------- 1. 团队与律所 ----------
const head = team.createTeam(user(ids.owner), '总部');
const firm = team.createFirm(ids.owner, '甲律所');
let ev = await drain();
assert.deepEqual(ev.map(e => e.payload.action), ['FIRM_CREATED']);
assert.equal(ev[0].payload.firmId, firm.id);
assert.equal(ev[0].payload.actorName, '所长');
assert.equal(ev[0].url, 'http://127.0.0.1:1/api/internal/firm-audit');
assert.equal(ev[0].secret, 'test-secret');
ok('建所 → FIRM_CREATED（律所、操作人、内部口地址与密钥）');

team.joinByCode(user(ids.admin), code('SELECT joinCode FROM team WHERE id = ?', head.id));
team.joinByCode(user(ids.member), code('SELECT joinCode FROM team WHERE id = ?', head.id));
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.actorName, e.payload.detail?.via]), [
    ['FIRM_MEMBER_JOINED', '主任', 'team_code'], ['FIRM_MEMBER_JOINED', '律师甲', 'team_code']]);
ok('凭团队邀请码入所 → FIRM_MEMBER_JOINED');

team.changeMemberRole(ids.owner, ids.admin, 'ADMIN');
ev = await drain();
assert.equal(ev.length, 1);
assert.equal(ev[0].payload.action, 'FIRM_ROLE_CHANGED');
assert.equal(ev[0].payload.targetLabel, '主任');
assert.deepEqual([ev[0].payload.detail?.fromRole, ev[0].payload.detail?.toRole, ev[0].payload.detail?.firmAdmin], ['MEMBER', 'ADMIN', true]);
ok('角色变更 → FIRM_ROLE_CHANGED（总部 ADMIN = 律所管理员）');

team.removeMember(ids.admin, ids.member);
team.removeMember(ids.admin, ids.admin);
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.actorName, e.payload.targetLabel]), [
    ['FIRM_MEMBER_REMOVED', '主任', '律师甲'], ['FIRM_MEMBER_LEFT', '主任', '主任']]);
ok('被移出 / 主动退出 → FIRM_MEMBER_REMOVED / FIRM_MEMBER_LEFT');

const subTeam = team.createTeam(user(ids.sub), '分所');
assert.equal((await drain()).length, 0);
team.joinFirmByCode(ids.sub, code('SELECT joinCode FROM firm WHERE id = ?', firm.id));
team.regenerateFirmJoinCode(ids.owner);
team.removeTeamFromFirm(ids.owner, subTeam.id);
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.targetLabel]), [
    ['FIRM_TEAM_JOINED', '分所'], ['FIRM_JOIN_CODE_REGENERATED', '甲律所'], ['FIRM_TEAM_REMOVED', '分所']]);
assert.ok(ev.every(e => e.payload.firmId === firm.id));
ok('团队并入 / 重置律所码 / 移出团队 → 各一条');

team.joinByCode(user(ids.loner), code('SELECT joinCode FROM team WHERE id = ?', subTeam.id));
team.removeMember(ids.sub, ids.loner);
assert.equal((await drain()).length, 0);
ok('不在律所的团队：一条都不报');

// ---------- 3. 官网口令登录失败 ----------
const pw = await users.hashPassword('Right-pass-123');
const all = JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'users.json'), 'utf8'));
for (const u of all) if (u.id === ids.owner) u.passwordHash = pw;
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), JSON.stringify(all));
const account = MAIL_SITE ? user(ids.owner).email : user(ids.owner).phone!;
const req = (password: string) => new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', body: JSON.stringify({ account, password }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'verify-firm-audit' },
});
assert.equal((await loginRoute.POST(req('wrong-pass'))).status, 401);
ev = await drain();
assert.equal(ev.length, 1);
assert.deepEqual([ev[0].payload.action, ev[0].payload.outcome, ev[0].payload.sourceIp, ev[0].payload.userAgent, ev[0].payload.detail?.via],
    ['WEBSITE_LOGIN_FAILED', 'FAILURE', '203.0.113.7', 'verify-firm-audit', 'password']);
assert.ok(!JSON.stringify(ev).includes('wrong-pass'), '口令绝不上报');
assert.equal((await loginRoute.POST(req('Right-pass-123'))).status, 200);
assert.equal((await drain()).length, 0, '登录成功不在这里报（案件库侧有自己的登录事件）');
ok('官网口令登录失败 → WEBSITE_LOGIN_FAILED（带 IP / UA，不带口令）');

// ---------- 2. 账户 Key（登录换 Key / 满额挤掉最旧 / 吊销） ----------
const exch = (password: string) => new NextRequest('http://localhost/api/auth/exchange-key', {
    method: 'POST', body: JSON.stringify({ account, password, deviceName: 'MacBook' }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8', 'user-agent': 'desktop' },
});
const r1 = await exchangeRoute.POST(exch('Right-pass-123'));
assert.equal(r1.status, 200);
const plain = (await r1.json()).key as string;
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.detail?.via, e.payload.detail?.label]), [['ACCOUNT_API_KEY_CREATED', 'login', 'MacBook']]);
assert.ok(!JSON.stringify(ev).includes(plain), 'Key 明文绝不上报');
assert.ok(!JSON.stringify(ev).includes(keys.hashApiKey(plain)), 'Key 哈希绝不上报');
assert.equal(ev[0].payload.detail?.keyPrefix, plain.slice(0, String(ev[0].payload.detail?.keyPrefix).length));
for (let i = 0; i < keys.MAX_ACTIVE_KEYS; i++) keys.issueLoginKey(ids.owner, null);
await drain();
assert.equal((await exchangeRoute.POST(exch('Right-pass-123'))).status, 200);
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.detail?.via]), [['ACCOUNT_API_KEY_CREATED', 'login'], ['ACCOUNT_API_KEY_REVOKED', 'evicted_by_login']]);
accountAudit.auditAccountKey(user(ids.owner), 'ACCOUNT_API_KEY_REVOKED', { id: 7, prefix: 'awdk_abcdefg' }, 'user');
accountAudit.auditAccountKey(user(ids.loner), 'ACCOUNT_API_KEY_REVOKED', { id: 8, prefix: 'awdk_zzz' }, 'user');
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.targetId, e.payload.detail?.keyPrefix]), [['ACCOUNT_API_KEY_REVOKED', '7', 'awdk_abcdefg']]);
assert.equal((await exchangeRoute.POST(exch('wrong-pass'))).status, 401);
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.detail?.via]), [['WEBSITE_LOGIN_FAILED', 'exchange_key']]);
ok('账户 Key：登录换 Key / 满额挤掉最旧 / 吊销各一条，只带行 id 与前缀；律所外的人不报；换 Key 口令错也算登录失败');

// ---------- 3b. 团队路由：事件带本次请求的来源 IP 与 UA（取 X-Real-IP / XFF 最后一段，不信客户端填的第一段） ----------
team.joinByCode(user(ids.admin), code('SELECT joinCode FROM team WHERE id = ?', head.id));
await drain();
const ownerKey = keys.issueLoginKey(ids.owner, null).plaintextKey;
const patch = (role: string, headers: Record<string, string>) => memberRoute.PATCH(
    new NextRequest(`http://localhost/api/account/team/members/${ids.admin}`, {
        method: 'PATCH', body: JSON.stringify({ role }),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerKey}`, ...headers },
    }), { params: Promise.resolve({ accountId: ids.admin }) });
assert.equal((await patch('ADMIN', { 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '6.6.6.6, 198.51.100.4', 'user-agent': 'Mozilla/5.0 (Firm IT)' })).status, 200);
assert.equal((await patch('MEMBER', { 'x-forwarded-for': '6.6.6.6, 198.51.100.9', 'user-agent': 'desktop/0.85' })).status, 200);
ev = await drain();
assert.deepEqual(ev.map(e => [e.payload.action, e.payload.sourceIp, e.payload.userAgent]), [
    ['FIRM_ROLE_CHANGED', '198.51.100.4', 'Mozilla/5.0 (Firm IT)'],
    ['FIRM_ROLE_CHANGED', '198.51.100.9', 'desktop/0.85']]);
ok('团队路由上报带操作人的来源 IP（X-Real-IP 优先，否则 XFF 最后一段，伪造的第一段不用）与 UA');

// ---------- 4. 真 HTTP：重试、幂等键、放弃、不阻塞 ----------
const hits: { status: number; body: { eventId: string }; secret: string | undefined }[] = [];
let plan: number[] = [];
let slowMs = 0;
const server = http.createServer((rq, rs) => {
    let b = '';
    rq.on('data', c => (b += c));
    rq.on('end', () => setTimeout(() => {
        const status = plan.shift() ?? 200;
        hits.push({ status, body: JSON.parse(b), secret: rq.headers['x-internal-secret'] as string | undefined });
        rs.writeHead(status).end();
    }, slowMs));
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as import('net').AddressInfo).port;
process.env.AWD_FIRM_AUDIT_URL = `http://127.0.0.1:${port}/`;
fa.__setFirmAuditTransportForTest(null, [0, 20, 40]);

plan = [500, 503, 200];
fa.emitFirmAudit({ firmId: firm.id, action: 'FIRM_CREATED', actor: { id: ids.owner, name: '所长' } });
await fa.flushFirmAudit();
assert.equal(hits.length, 3);
assert.equal(new Set(hits.map(h => h.body.eventId)).size, 1, '重试带同一个 eventId');
assert.ok(hits.every(h => h.secret === 'test-secret'));
ok('5xx 按同一 eventId 重试，直到收到');

hits.length = 0;
plan = [404];
fa.emitFirmAudit({ firmId: firm.id, action: 'FIRM_CREATED' });
await fa.flushFirmAudit();
assert.equal(hits.length, 1);
ok('404（对端没开这条口子）立刻放弃，不重试');

hits.length = 0;
plan = [];
slowMs = 600;
const t0 = Date.now();
team.regenerateFirmJoinCode(ids.owner);
assert.ok(Date.now() - t0 < 300, `调用方不被上报拖住（${Date.now() - t0} ms）`);
await fa.flushFirmAudit();
assert.equal(hits.length, 1);
ok('对端很慢时官网请求照常立即返回');

hits.length = 0;
slowMs = 0;
delete process.env.AWD_FIRM_AUDIT_SECRET;
team.regenerateFirmJoinCode(ids.owner);
await fa.flushFirmAudit();
assert.equal(hits.length, 0);
ok('env 未配置：一条不发');

server.close();
console.log(`\nverify-firm-audit: ${passed} passed`);
