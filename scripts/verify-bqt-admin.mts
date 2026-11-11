// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天 / Circle 律所后台接口验收。
 * 必须在空目录运行（data/ 建在 cwd）：npm run test:bqt-admin
 * 包晴天接口全部用假 fetch 应答，不会碰真实环境。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert/strict';
import { NextRequest } from 'next/server';

const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });

const SECRET = 'SUPER-SECRET-VALUE-9f3a';
const TOKEN = 'admin-token-for-tests';
process.env.AWD_ADMIN_TOKEN = TOKEN;
process.env.AWD_BQT_MEMBER_BASE_URL = 'https://bqt.fake';
process.env.AWD_BQT_MEMBER_APP_ID = 'APPID123456';
process.env.AWD_BQT_MEMBER_APP_SECRET = SECRET;

const lawyerUser = crypto.randomUUID();
const circleUser = crypto.randomUUID();
const now = new Date().toISOString();
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), JSON.stringify([
  { id: lawyerUser, username: 'lawyer-a', email: 'a@test.local', passwordHash: 'salt:hash', displayName: 'Lawyer A', createdAt: now },
  { id: circleUser, username: 'circle-b', email: 'b@test.local', passwordHash: 'salt:hash', displayName: 'Circle B', createdAt: now },
]));

const m = await import('@/lib/bqt-member');
const { getDb, withTransaction } = await import('@/lib/db');
const { allowedRelayPath } = await import('@/lib/admin-relay');
const { bindCircleFirm } = await import('@/lib/circle-firms');
const bqtRoute = await import('@/app/api/admin/bqt/route');
const lookupRoute = await import('@/app/api/admin/bqt/lookup/route');
const lawyersRoute = await import('@/app/api/admin/bqt/lawyers/route');
const consumesRoute = await import('@/app/api/admin/bqt/consumes/route');
const actionRoute = await import('@/app/api/admin/bqt/consumes/action/route');
const circleRoute = await import('@/app/api/admin/circle-firms/route');
const circleUsersRoute = await import('@/app/api/admin/circle-firms/[code]/users/route');
const db = getDb();

// ── 假包晴天：所有外呼都在这里，绝不出网 ──
let points = 1000_00;
let entitlementDown = false;
const outbound: string[] = [];
m.setBqtFetchForTest(async (url, init) => {
  outbound.push(url);
  assert.ok(url.startsWith('https://bqt.fake/'), `unexpected outbound ${url}`);
  const reply = (o: unknown, status = 200) => ({ status, text: async () => JSON.stringify(o) });
  if (url.includes('/entitlement?')) {
    if (entitlementDown) throw new Error('connect ECONNREFUSED');
    return reply({ code: 0, msg: 'success', data: { lawyerId: '10001', levelCode: 'GROWTH', status: 'ACTIVE', expireTime: '2027-10-13T23:59:59', aiWorkbench: true, usablePoints: points / 100 } });
  }
  const b = JSON.parse(init.body!);
  const want = Math.round(b.points * 100);
  const res = (resultCode: string, code: number) => reply({ code, msg: resultCode, data: { code, resultCode, requestNo: b.requestNo, lawyerId: '10001', consumedPoints: resultCode === 'SUCCESS' ? want / 100 : 0, usablePoints: points / 100, idempotent: false } });
  if (points < want) return res('INSUFFICIENT_POINTS', 46102);
  points -= want;
  return res('SUCCESS', 0);
});

type Init = { method?: string; body?: unknown; auth?: boolean };
function req(url: string, { method = 'GET', body, auth = true }: Init = {}) {
  return new NextRequest(`https://www.aiworkdeck.com${url}`, {
    method,
    headers: {
      ...(auth ? { cookie: `awd_admin=${TOKEN}` } : {}),
      'x-forwarded-for': '203.0.113.7',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const bodies: string[] = [];
async function call(handler: (r: NextRequest, ctx?: any) => Promise<Response>, url: string, init: Init = {}, ctx?: unknown) {
  const res = await handler(req(url, init), ctx);
  const text = await res.text();
  bodies.push(text);
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const usersCtx = (code: string) => ({ params: Promise.resolve({ code }) });

// ── 1. 鉴权：每个接口、每个方法都要管理口令 ──
{
  const cases: Array<[any, string, string, unknown?]> = [
    [bqtRoute.GET, '/api/admin/bqt', 'GET'],
    [bqtRoute.PATCH, '/api/admin/bqt', 'PATCH', { centsPerPoint: 10 }],
    [lookupRoute.POST, '/api/admin/bqt/lookup', 'POST', { lawyerId: '10001' }],
    [lawyersRoute.GET, '/api/admin/bqt/lawyers', 'GET'],
    [consumesRoute.GET, '/api/admin/bqt/consumes', 'GET'],
    [actionRoute.POST, '/api/admin/bqt/consumes/action', 'POST', { requestNo: 'x', action: 'waive' }],
    [circleRoute.GET, '/api/admin/circle-firms', 'GET'],
    [circleRoute.POST, '/api/admin/circle-firms', 'POST', { code: 'KW-X' }],
    [circleRoute.PATCH, '/api/admin/circle-firms', 'PATCH', { code: 'KW-ABNR-2026', enabled: false }],
  ];
  for (const [h, url, method, body] of cases) {
    const r = await call(h, url, { method, body, auth: false });
    assert.equal(r.status, 401, `${method} ${url} 未登录应 401`);
  }
  assert.equal((await call(circleUsersRoute.GET, '/api/admin/circle-firms/KW-ABNR-2026/users', { auth: false }, usersCtx('KW-ABNR-2026'))).status, 401);
  assert.ok(Math.abs(m.getBqtSettings().centsPerPoint! - 100 / 3) < 1e-9, '未登录的 PATCH 不能生效（仍是迁移默认 1 元 = 3 积分）');
  assert.equal(outbound.length, 0, '未登录的查询不能外呼');
}

// ── 2. 设置：校验、开通道前置条件、留痕、密钥不回显 ──
{
  let r = await call(bqtRoute.GET, '/api/admin/bqt');
  assert.equal(r.status, 200);
  assert.equal(r.json.connection.secretConfigured, true);
  assert.equal(r.json.connection.envComplete, true);
  assert.equal(r.json.connection.tunnelActive, false);
  assert.equal(r.json.connection.baseUrl, 'https://bqt.fake');
  assert.notEqual(r.json.connection.appIdMasked, 'APPID123456');
  assert.match(r.json.connection.appIdMasked, /^APP\*+56$/);

  const bad = async (body: unknown, error: string, status = 400) => {
    const x = await call(bqtRoute.PATCH, '/api/admin/bqt', { method: 'PATCH', body });
    assert.equal(x.status, status, JSON.stringify(body));
    assert.equal(x.json.error, error, JSON.stringify(body));
  };
  await bad('not json', 'bad_request');
  await bad({}, 'empty_patch');
  await bad({ tunnelEnabled: 'yes' }, 'invalid_tunnel_enabled');
  await bad({ grantProRights: 1 }, 'invalid_grant_pro_rights');
  await bad({ centsPerPoint: '10' }, 'invalid_cents_per_point');
  await bad({ centsPerPoint: 0 }, 'invalid_cents_per_point');
  await bad({ centsPerPoint: 1.23456 }, 'invalid_cents_per_point');
  await bad({ marginMultiplier: 0.5 }, 'invalid_margin');
  await bad({ marginMultiplier: 11 }, 'invalid_margin');
  // 迁移默认比例 1:3；清空后（直接改库，不经留痕）才能测「未设比例不能开」
  (await import('@/lib/db')).getDb().prepare('UPDATE bqt_settings SET centsPerPoint = NULL WHERE id = 1').run();
  await bad({ tunnelEnabled: true }, 'ratio_required', 409);
  assert.equal(m.listBqtSettingsAudit().length, 0, '失败的修改不留痕');

  // 环境变量缺失时不能开通道
  delete process.env.AWD_BQT_MEMBER_APP_SECRET;
  await bad({ centsPerPoint: 10, tunnelEnabled: true }, 'env_missing', 409);
  r = await call(bqtRoute.GET, '/api/admin/bqt');
  assert.equal(r.json.connection.secretConfigured, false);
  process.env.AWD_BQT_MEMBER_APP_SECRET = SECRET;

  r = await call(bqtRoute.PATCH, '/api/admin/bqt', { method: 'PATCH', body: { centsPerPoint: 10, marginMultiplier: 1.5, tunnelEnabled: true } });
  assert.equal(r.status, 200);
  assert.equal(r.json.settings.tunnelEnabled, true);
  assert.equal(r.json.effectiveMargin, 1.5);
  assert.equal(r.json.connection.tunnelActive, true);
  assert.equal(r.json.audit.length, 3);
  assert.ok(r.json.audit.every((a: any) => a.actor === 'admin@203.0.113.7'));
  // 清空毛利 → 跟随全站
  r = await call(bqtRoute.PATCH, '/api/admin/bqt', { method: 'PATCH', body: { marginMultiplier: null } });
  assert.equal(r.json.settings.marginMultiplier, null);
  assert.equal(r.json.effectiveMargin, r.json.globalMargin);
  assert.equal(r.json.audit[0].field, 'marginMultiplier');
  assert.equal(r.json.audit[0].newValue, 'null');
}

// ── 3. 测试连接 / 查律师（只读） ──
{
  assert.equal((await call(lookupRoute.POST, '/api/admin/bqt/lookup', { method: 'POST', body: { lawyerId: '12a' } })).json.error, 'invalid_lawyer_id');
  let r = await call(lookupRoute.POST, '/api/admin/bqt/lookup', { method: 'POST', body: { lawyerId: '10001' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.entitlement.points, '1000.00');
  assert.equal(r.json.entitlement.levelCode, 'GROWTH');
  assert.ok(outbound.every(u => u.includes('/entitlement?')), '查询不能调扣减接口');
  entitlementDown = true;
  r = await call(lookupRoute.POST, '/api/admin/bqt/lookup', { method: 'POST', body: { lawyerId: '10001' } });
  assert.equal(r.status, 424);
  assert.equal(r.json.error, 'bqt_unavailable');
  assert.match(r.json.reason, /ECONNREFUSED/);
  entitlementDown = false;
}

// ── 4. 绑定律师列表 ──
{
  db.prepare(`INSERT INTO bqt_user_binding (userId, bqtUserId, mobile, userName, userType, boundAt, updatedAt) VALUES (?, '10001', '13812345678', '王律师', 'lawyer', ?, ?)`)
    .run(lawyerUser, now, now);
  let r = await call(lawyersRoute.GET, '/api/admin/bqt/lawyers');
  assert.equal(r.json.total, 1);
  const row = r.json.rows[0];
  assert.equal(row.user.username, 'lawyer-a');
  assert.equal(row.mobileMasked, '138****5678');
  assert.equal(row.entitlement.points, '1000.00');
  assert.ok(!JSON.stringify(r.json).includes('13812345678'), '列表不回显完整手机号');
  assert.equal((await call(lawyersRoute.GET, '/api/admin/bqt/lawyers?q=lawyer-a')).json.total, 1);
  assert.equal((await call(lawyersRoute.GET, '/api/admin/bqt/lawyers?q=5678')).json.total, 1);
  assert.equal((await call(lawyersRoute.GET, '/api/admin/bqt/lawyers?q=nobody')).json.total, 0);
}

// ── 5. 扣减台账与处理动作的状态迁移 ──
{
  const enqueue = (cents: number, refId: string) => withTransaction(d => m.enqueueConsume(d, { userId: lawyerUser, lawyerId: '10001', cents, service: 'platform_ai', refId }));
  const act = (requestNo: string, action: string) => call(actionRoute.POST, '/api/admin/bqt/consumes/action', { method: 'POST', body: { requestNo, action } });

  const ok = enqueue(50, 'ok-1');                    // 50 分 / 10 = 5.00 积分
  assert.equal(ok.pointsHundredths, 500);
  const pending = enqueue(30, 'pend-1');
  db.prepare("UPDATE bqt_consume SET updatedAt='2000-01-01T00:00:00.000Z' WHERE requestNo=?").run(pending.requestNo);
  assert.equal((await m.dispatchConsume(ok.requestNo)).state, 'succeeded');
  points = 1;                                          // 不够 → failed
  const fail = enqueue(100_00, 'fail-1');
  assert.equal((await m.dispatchConsume(fail.requestNo)).state, 'failed');
  const fail2 = enqueue(200, 'fail-2');
  assert.equal((await m.dispatchConsume(fail2.requestNo)).state, 'failed');

  let r = await call(consumesRoute.GET, '/api/admin/bqt/consumes?state=attention');
  assert.deepEqual(r.json.rows.map((x: any) => x.requestNo).sort(), [fail.requestNo, fail2.requestNo, pending.requestNo].sort());
  assert.equal(r.json.stats.failed, 2);
  assert.equal(r.json.stats.stale, 1);
  assert.equal(r.json.stats.today.points, '5.00');
  assert.equal(r.json.stats.today.cents, 50);
  assert.equal(r.json.stats.month.count, 1);
  assert.equal(r.json.rows[0].user.displayName, 'Lawyer A');
  assert.equal((await call(consumesRoute.GET, '/api/admin/bqt/consumes?state=succeeded')).json.total, 1);
  assert.equal((await call(consumesRoute.GET, `/api/admin/bqt/consumes?q=${encodeURIComponent('fail-')}`)).json.total, 2);
  assert.equal((await call(consumesRoute.GET, '/api/admin/bqt/consumes?q=10001')).json.total, 4);
  assert.equal((await call(consumesRoute.GET, '/api/admin/bqt/consumes?q=%25')).json.total, 0, 'LIKE 通配符要转义');
  assert.equal((await call(consumesRoute.GET, '/api/admin/bqt/consumes?from=2000-01-01&to=2000-01-02')).json.total, 0);

  // 状态不对一律 409，且不改数据
  assert.equal((await act(pending.requestNo, 'waive')).status, 409);
  assert.equal((await act(pending.requestNo, 'reissue')).status, 409);
  assert.equal((await act(fail.requestNo, 'retry')).status, 409);
  assert.equal((await act(ok.requestNo, 'waive')).status, 409);
  assert.equal((await act('nope', 'waive')).status, 404);
  assert.equal((await act(fail.requestNo, 'delete')).status, 400);
  assert.equal(m.consumeRow(pending.requestNo)!.state, 'pending');

  // retry：pending → 用原单号原积分发出
  points = 1000_00;
  r = await act(pending.requestNo, 'retry');
  assert.equal(r.status, 200);
  assert.equal(r.json.row.state, 'succeeded');
  assert.equal(r.json.row.requestNo, pending.requestNo);

  points = 5000_00;                                     // 律师补足积分
  // reissue：failed → 原单 waived（reissued:actor），新单号按原积分立即扣
  r = await act(fail.requestNo, 'reissue');
  assert.equal(r.status, 200);
  assert.equal(r.json.original.state, 'waived');
  assert.equal(r.json.original.resolvedBy, 'reissued:admin@203.0.113.7');
  assert.notEqual(r.json.row.requestNo, fail.requestNo);
  assert.equal(r.json.row.pointsHundredths, fail.pointsHundredths);
  assert.equal(r.json.row.state, 'succeeded');
  assert.equal((await act(fail.requestNo, 'reissue')).status, 409, '同一笔不能重扣两次');

  // waive：failed → waived，平台承担
  r = await act(fail2.requestNo, 'waive');
  assert.equal(r.status, 200);
  assert.equal(r.json.row.state, 'waived');
  assert.equal(r.json.row.resolvedBy, 'admin@203.0.113.7');
  assert.equal((await act(fail2.requestNo, 'waive')).status, 409);

  r = await call(consumesRoute.GET, '/api/admin/bqt/consumes?state=attention');
  assert.equal(r.json.total, 0);
  assert.equal(m.bqtOutstandingCents(lawyerUser).cents, 0);
}

// ── 6. Circle 律所：新建 / 修改校验 ──
{
  const post = (body: unknown) => call(circleRoute.POST, '/api/admin/circle-firms', { method: 'POST', body });
  const patch = (body: unknown) => call(circleRoute.PATCH, '/api/admin/circle-firms', { method: 'PATCH', body });
  const base = { code: ' kw-test-2026 ', name: 'Test: Firm', country: 'Singapore', suffix: 'TF', marginMultiplier: 1, freeDeepseekCents: 1500 };
  const expectErr = async (p: Promise<{ status: number; json: any }>, error: string, status = 400) => {
    const r = await p; assert.equal(r.status, status, error); assert.equal(r.json.error, error);
  };
  await expectErr(post({ ...base, code: 'bad code!' }), 'invalid_code');
  await expectErr(post({ ...base, code: 'K' }), 'invalid_code');
  await expectErr(post({ ...base, name: undefined }), 'invalid_name');
  await expectErr(post({ ...base, name: '  ' }), 'invalid_name');
  await expectErr(post({ ...base, suffix: 'A (B)' }), 'invalid_suffix');
  await expectErr(post({ ...base, marginMultiplier: 0.99 }), 'invalid_margin');
  await expectErr(post({ ...base, marginMultiplier: 10.5 }), 'invalid_margin');
  await expectErr(post({ ...base, marginMultiplier: '1.2' }), 'invalid_margin');
  await expectErr(post({ ...base, freeDeepseekCents: -1 }), 'invalid_cents');
  await expectErr(post({ ...base, freeDeepseekCents: 1.5 }), 'invalid_cents');
  await expectErr(post({ ...base, expiresAt: 'not-a-date' }), 'invalid_expires_at');
  let r = await post(base);
  assert.equal(r.status, 200);
  assert.equal(r.json.firm.code, 'KW-TEST-2026', '邀请码规范化为大写');
  assert.equal(r.json.firm.marginMultiplier, 1);
  assert.equal(r.json.firm.enabled, true);
  await expectErr(post({ ...base, code: 'KW-TEST-2026' }), 'code_exists', 409);

  await expectErr(patch({ code: 'KW-NOPE', enabled: false }), 'not_found', 404);
  await expectErr(patch({ name: 'x' }), 'missing_code');
  await expectErr(patch({ code: 'KW-TEST-2026', marginMultiplier: 0 }), 'invalid_margin');
  await expectErr(patch({ code: 'KW-TEST-2026', freeDeepseekCents: -5 }), 'invalid_cents');
  await expectErr(patch({ code: 'KW-TEST-2026', enabled: 'no' }), 'invalid_enabled');
  r = await patch({ code: 'kw-test-2026', name: 'Test: Firm LLP', country: 'Malaysia', marginMultiplier: 1.2, expiresAt: '2027-01-31T23:59:59+08:00' });
  assert.equal(r.status, 200);
  assert.equal(r.json.firm.name, 'Test: Firm LLP');
  assert.equal(r.json.firm.country, 'Malaysia');
  assert.equal(r.json.firm.marginMultiplier, 1.2);
  assert.equal(r.json.firm.expiresAt, '2027-01-31T15:59:59.000Z');
  assert.equal(r.json.firm.suffix, 'TF', '没提交的字段不变');
  r = await patch({ code: 'KW-TEST-2026', expiresAt: null, enabled: false });
  assert.equal(r.json.firm.expiresAt, null);
  assert.equal(r.json.firm.enabled, false);

  // 绑定用户列表 + DeepSeek 剩余
  await patch({ code: 'KW-TEST-2026', enabled: true });
  const bound = bindCircleFirm(circleUser, 'KW-TEST-2026');
  assert.ok(bound.ok);
  r = await call(circleUsersRoute.GET, '/api/admin/circle-firms/KW-TEST-2026/users', {}, usersCtx('KW-TEST-2026'));
  assert.equal(r.status, 200);
  assert.equal(r.json.users.length, 1);
  assert.equal(r.json.users[0].username, 'circle-b');
  assert.equal(r.json.users[0].deepseekRemainingCents, 1500);
  assert.equal((await call(circleUsersRoute.GET, '/api/admin/circle-firms/KW-NOPE/users', {}, usersCtx('KW-NOPE'))).status, 404);
  r = await call(circleRoute.GET, '/api/admin/circle-firms');
  assert.equal(r.json.firms.find((f: any) => f.code === 'KW-TEST-2026').boundUsersCount, 1);
}

// ── 7. 后台跨站代理放行新接口（且只放行对应方法） ──
{
  assert.ok(allowedRelayPath(['admin', 'bqt'], 'GET'));
  assert.ok(allowedRelayPath(['admin', 'bqt'], 'PATCH'));
  assert.ok(!allowedRelayPath(['admin', 'bqt'], 'DELETE'));
  assert.ok(allowedRelayPath(['admin', 'bqt', 'lawyers'], 'GET'));
  assert.ok(allowedRelayPath(['admin', 'bqt', 'consumes'], 'GET'));
  assert.ok(allowedRelayPath(['admin', 'bqt', 'lookup'], 'POST'));
  assert.ok(!allowedRelayPath(['admin', 'bqt', 'lookup'], 'GET'));
  assert.ok(allowedRelayPath(['admin', 'bqt', 'consumes', 'action'], 'POST'));
  assert.ok(allowedRelayPath(['admin', 'circle-firms'], 'POST'));
  assert.ok(allowedRelayPath(['admin', 'circle-firms', 'KW-ABNR-2026', 'users'], 'GET'));
}

// ── 8. 密钥从未出现在任何响应里 ──
assert.ok(bodies.length > 50);
for (const b of bodies) assert.ok(!b.includes(SECRET), 'App Secret 泄露到响应');

m.setBqtFetchForTest(null);
console.log(`verify-bqt-admin OK (${bodies.length} responses checked)`);
