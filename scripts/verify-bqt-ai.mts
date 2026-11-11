// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 包晴天律师 AI 计费接线验收（lib/bqt-ai.ts + 平台 AI / Web AI / Skill 结算）。
 * 必须在空目录运行：npm run test:bqt-ai。包晴天用 setBqtFetchForTest 假装，绝不调真实扣减接口。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
assert.ok(!fs.existsSync('data') && !fs.existsSync('package.json'), 'Use a fresh temporary cwd');
fs.writeFileSync('authorized.json', JSON.stringify({ workspaceId: 'ws-test', models: ['deepseek-v4.1-flash-1017'] }));
fs.writeFileSync('available.json', JSON.stringify({ workspaceId: 'ws-test', models: ['deepseek-v4.1-flash-1017'] }));
fs.mkdirSync('data'); fs.writeFileSync('data/users.json', '[]');
fs.writeFileSync('data/ai-config.json', JSON.stringify({ exchangeRateMode: 'manual', exchangeRate: 10, marginMultiplier: 1 }));
Object.assign(process.env, {
  BAILIAN_AUTHORIZED_MODELS_FILE: process.cwd() + '/authorized.json', BAILIAN_AVAILABLE_MODELS_FILE: process.cwd() + '/available.json',
  NEXT_PUBLIC_AWD_SITE: 'cn', NODE_ENV: 'production', DASHSCOPE_API_KEY: 'synthetic-bailian-key',
  BAILIAN_BASE_URL: 'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', AWD_KEY_ENCRYPTION_SECRET: 'synthetic-platform-encryption',
  AWD_BQT_MEMBER_BASE_URL: 'https://bqt.fake', AWD_BQT_MEMBER_APP_ID: 'APPID', AWD_BQT_MEMBER_APP_SECRET: 'SECRET',
});
const { getDb, withTransaction } = await import('@/lib/db');
const { grantCredits, getBalance } = await import('@/lib/credits');
const { generateApiKey } = await import('@/lib/api-keys');
const { issueRuntimeToken } = await import('@/lib/platform-ai/auth');
const { parseBailianModel } = await import('@/lib/platform-ai/catalog');
const billing = await import('@/lib/platform-ai/billing');
const m = await import('@/lib/bqt-member');
const { BqtDenialError } = await import('@/lib/bqt-ai');
const { settleAiUsage } = await import('@/lib/ai-usage');
const webStore = await import('@/lib/web-ai/store');
const { validateInput } = await import('@/lib/web-ai/contract');
const { failure } = await import('@/lib/web-ai/http');
const { POST: chat } = await import('@/app/api/account/ai/v1/chat/completions/route');
const { POST: keyRoute } = await import('@/app/api/account/ai-key/route');
const { NextRequest } = await import('next/server');
const db = getDb();
const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

// ── 假百炼 ──
const price = (type: string, amount: number) => ({ type, price: String(amount), price_unit: '每百万tokens', time_band: 'standard' });
const rawModel = { model: 'deepseek-v4.1-flash-1017', name: 'Synthetic', capabilities: ['TG'], features: ['function-calling'], inference_metadata: { request_modality: ['Text'], response_modality: ['Text'] }, model_info: { context_window: 1000000, max_input_tokens: 991808, max_output_tokens: 131072 }, prices: [{ range_name: 'Default', prices: [price('input_token', 1000), price('output_token', 2000)] }] };
assert.ok(parseBailianModel(rawModel));
let providerCalls = 0;
globalThis.fetch = async (resource, init) => {
  const url = String(resource);
  assert.ok(url.startsWith('https://ws-test.cn-beijing.maas.aliyuncs.com/'), 'Unexpected network blocked');
  if (url.includes('/api/v1/models')) return Response.json({ success: true, output: { total: 1, models: [rawModel] } });
  providerCalls++;
  return Response.json({ id: 's', choices: [{ message: { role: 'assistant', content: 'OK' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } });
};

// ── 假包晴天（只在内存里扣） ──
let points = 1000_00, member = { status: 'ACTIVE', aiWorkbench: true }, down = false;
const script: Array<'busy'> = [], consumed = new Map<string, number>();
m.setBqtFetchForTest(async (url, init) => {
  const reply = (o: unknown, status = 200) => ({ status, text: async () => JSON.stringify(o) });
  if (down) throw new Error('connect ECONNREFUSED');
  if (url.includes('/entitlement?')) return reply({ code: 0, data: { lawyerId: '10001', levelCode: 'GROWTH', status: member.status, expireTime: '2027-10-13T23:59:59', aiWorkbench: member.aiWorkbench, usablePoints: points / 100 } });
  assert.ok(url === 'https://bqt.fake/bqt/api/ai/lawyer/member/points/consume');
  const b = JSON.parse(init.body!), want = Math.round(b.points * 100);
  const res = (resultCode: string, code: number, extra: object = {}) => reply({ code, data: { code, resultCode, requestNo: b.requestNo, consumedPoints: 0, usablePoints: points / 100, idempotent: false, ...extra } });
  if (script.shift() === 'busy') return res('SYSTEM_BUSY', 46106);
  if (consumed.has(b.requestNo)) return res('SUCCESS', 0, { consumedPoints: want / 100, idempotent: true });
  if (points < want) return res('INSUFFICIENT_POINTS', 46102);
  points -= want; consumed.set(b.requestNo, want);
  return res('SUCCESS', 0, { consumedPoints: want / 100, usablePoints: points / 100 });
});
const staleSnapshot = () => db.prepare("UPDATE bqt_entitlement_snapshot SET fetchedAt='2000-01-01T00:00:00Z'").run();

let counted = 0;
const check = async (name: string, fn: () => unknown | Promise<unknown>) => { await fn(); console.log('OK', name); counted++; };
function user(cents = 10000) {
  const id = randomUUID(), users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
  users.push({ id, username: `t-${id}`, displayName: 'T', passwordHash: 'unused', createdAt: new Date().toISOString() });
  fs.writeFileSync('data/users.json', JSON.stringify(users));
  if (cents) withTransaction(d => grantCredits(d, { userId: id, pool: 'topup', amountCents: cents, ledgerKind: 'recharge' }));
  return { id, key: generateApiKey(id).key!.plaintextKey };
}
const accountRequest = (u: { key: string }, lang = 'zh') => new NextRequest('https://www.aiworkdeck.com/api/account/ai-key', { method: 'POST', headers: { Authorization: `Bearer ${u.key}`, 'X-AWD-AI-Protocol': '2', 'Accept-Language': lang } });
const callRequest = (token: string, id = randomUUID(), lang = 'zh') => new Request('https://www.aiworkdeck.com/api/account/ai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Request-Id': id, 'Accept-Language': lang }, body: JSON.stringify({ model: 'deepseek-v4.1-flash-1017', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100, stream: false }) });

assert.ok(m.updateBqtSettings({ centsPerPoint: 100, marginMultiplier: 1.5, tunnelEnabled: true }, 'test').ok);
const lawyer = user(10000);
db.prepare(`INSERT INTO bqt_user_binding (userId, bqtUserId, mobile, userName, userType, boundAt, updatedAt) VALUES (?, '10001', NULL, 'L', 'lawyer', ?, ?)`).run(lawyer.id, new Date().toISOString(), new Date().toISOString());
const normal = user(10000);
const lawyerToken = issueRuntimeToken(lawyer.id, accountRequest(lawyer));
assert.deepEqual(m.bqtChargeTarget(lawyer.id), { lawyerId: '10001' });

await check('preflight denials map to the contract error codes in the gateway error format', async () => {
  const expectDenial = async (code: string, status: number, lang = 'zh') => {
    staleSnapshot();
    const before = providerCalls, res = await chat(callRequest(lawyerToken, randomUUID(), lang));
    assert.equal(res.status, status);
    const body = await res.json();
    assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'type']);
    assert.equal(body.error.code, code); assert.equal(body.error.type, code);
    assert.equal(providerCalls, before, 'denied requests never reach the provider');
    return body.error.message as string;
  };
  member = { status: 'EXPIRED', aiWorkbench: true };
  assert.match(await expectDenial('bqt_member_invalid', 403), /包晴天/);
  assert.match(await expectDenial('bqt_member_invalid', 403, 'en'), /BQT membership/);
  member = { status: 'ACTIVE', aiWorkbench: false }; await expectDenial('bqt_ai_closed', 403);
  member = { status: 'ACTIVE', aiWorkbench: true };
  const saved = points; points = 0; await expectDenial('bqt_insufficient_points', 402); points = saved;
  down = true; await expectDenial('bqt_unavailable', 503); down = false;
  withTransaction(d => m.enqueueConsume(d, { userId: lawyer.id, lawyerId: '10001', cents: 1, service: 'test', refId: 'debt' }));
  db.prepare("UPDATE bqt_consume SET state='failed' WHERE refId='debt'").run();
  await expectDenial('bqt_outstanding_debt', 402);
  db.prepare("UPDATE bqt_consume SET state='waived' WHERE refId='debt'").run();
  assert.equal(getBalance(lawyer.id), 10000);
  assert.equal(count('SELECT COUNT(*) n FROM platform_ai_request WHERE userId=?', lawyer.id), 0);
});

await check('ai-key route reports BQT denials with the same codes', async () => {
  staleSnapshot(); member = { status: 'EXPIRED', aiWorkbench: true };
  const res = await keyRoute(accountRequest(lawyer));
  assert.equal(res.status, 403); assert.equal((await res.json()).error, 'bqt_member_invalid');
  staleSnapshot(); member = { status: 'ACTIVE', aiWorkbench: true };
  const ok = await keyRoute(accountRequest(lawyer));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).provider, 'bailian');
});

await check('gateway chat: wallet untouched, settle enqueues and dispatches points with the BQT margin', async () => {
  staleSnapshot();
  const id = randomUUID(), before = points, res = await chat(callRequest(lawyerToken, id));
  assert.equal(res.status, 200);
  const row = billing.requestRow(lawyer.id, id)!;
  assert.equal(row.state, 'settled'); assert.equal(row.margin, 1.5);
  assert.deepEqual(JSON.parse(row.fundingJson), { line: 'bqt', lawyerId: '10001' });
  assert.equal(getBalance(lawyer.id), 10000);
  // 100×1000/1e6 + 10×2000/1e6 = 0.12 CNY × 1.5 = 18 分 = 0.18 积分
  assert.equal(row.chargedCents, 18);
  const c = db.prepare("SELECT * FROM bqt_consume WHERE service='platform_ai' AND refId=?").get(`${lawyer.id}:${id}`) as any;
  assert.equal(c.cents, 18); assert.equal(c.pointsHundredths, 18);
  assert.equal((await m.dispatchConsume(c.requestNo)).state, 'succeeded');
  assert.equal(points, before - 18);
});

await check('reserve without preflight fails closed; release and zero cost never touch the wallet or BQT', async () => {
  assert.throws(() => billing.reserveCostCny(lawyer.id, randomUUID(), {}, 'deepseek-v4.1-flash-1017', 1, {}), (e: unknown) => e instanceof BqtDenialError && e.code === 'bqt_unavailable');
  const id = randomUUID();
  await billing.authorizeCostCny(lawyer.id, id, 1);
  assert.equal(billing.reserveCostCny(lawyer.id, id, {}, 'deepseek-v4.1-flash-1017', 1, {}).reserveCents, 150);
  billing.release(lawyer.id, id);
  assert.equal(billing.requestRow(lawyer.id, id)!.state, 'released');
  const id2 = randomUUID(), n = count('SELECT COUNT(*) n FROM bqt_consume');
  await billing.authorizeCostCny(lawyer.id, id2, 1); billing.reserveCostCny(lawyer.id, id2, {}, 'deepseek-v4.1-flash-1017', 1, {});
  billing.submitted(lawyer.id, id2);
  assert.equal(billing.settleCostCny(lawyer.id, id2, 0, {}).chargedCents, 0);
  assert.equal(count('SELECT COUNT(*) n FROM bqt_consume'), n);
  assert.equal(getBalance(lawyer.id), 10000);
});

await check('cost above the preflighted ceiling is never billed', async () => {
  const id = randomUUID();
  await billing.authorizeCostCny(lawyer.id, id, 1); billing.reserveCostCny(lawyer.id, id, {}, 'deepseek-v4.1-flash-1017', 1, {}); billing.submitted(lawyer.id, id);
  assert.equal(billing.settleCostCny(lawyer.id, id, 2, {}).state, 'usage_pending');
  assert.equal(count("SELECT COUNT(*) n FROM bqt_consume WHERE refId=?", `${lawyer.id}:${id}`), 0);
  db.prepare("UPDATE platform_ai_request SET state='released' WHERE requestId=?").run(id);
});

await check('SYSTEM_BUSY keeps the consume pending; retry resends the same points once', async () => {
  const id = randomUUID(), before = points;
  await billing.authorizeCostCny(lawyer.id, id, 1); billing.reserveCostCny(lawyer.id, id, {}, 'deepseek-v4.1-flash-1017', 1, {}); billing.submitted(lawyer.id, id);
  script.push('busy');
  billing.settleCostCny(lawyer.id, id, 0.6, {});
  const requestNo = (db.prepare('SELECT requestNo FROM bqt_consume WHERE refId=?').get(`${lawyer.id}:${id}`) as any).requestNo;
  assert.equal((await m.dispatchConsume(requestNo)).state, 'pending');
  assert.equal(m.bqtOutstandingCents(lawyer.id).cents, 90);
  db.prepare("UPDATE bqt_consume SET updatedAt='2000-01-01T00:00:00Z' WHERE requestNo=?").run(requestNo);
  assert.equal(await m.retryPendingConsumes(), 1);
  assert.equal(m.consumeRow(requestNo)!.state, 'succeeded');
  assert.equal(points, before - 90);
  assert.equal(getBalance(lawyer.id), 10000);
});

await check('BQT lawyers are limited to one in-flight request (platform and web combined)', async () => {
  const id = randomUUID();
  await billing.authorizeCostCny(lawyer.id, id, 1); billing.reserveCostCny(lawyer.id, id, {}, 'deepseek-v4.1-flash-1017', 1, {}); billing.submitted(lawyer.id, id);
  const id2 = randomUUID();
  await billing.authorizeCostCny(lawyer.id, id2, 1);
  assert.throws(() => billing.reserveCostCny(lawyer.id, id2, {}, 'deepseek-v4.1-flash-1017', 1, {}), /busy/);
  staleSnapshot();
  const res = await chat(callRequest(lawyerToken));
  assert.equal(res.status, 429); assert.equal((await res.json()).error.code, 'busy');
  const input = validateInput({ requestId: randomUUID(), language: 'zh', mode: 'chat', message: 'hi', history: [], document: { id: randomUUID(), version: 0, name: 'a', text: '' } });
  const { bqtAuthorize } = await import('@/lib/bqt-ai');
  await bqtAuthorize(lawyer.id, `web_ai:${input.requestId}`, webStore.webReserveCents(input, 10, 1.5));
  // 网页工作台模型固定为 Qwen：包晴天律师先被「仅 DeepSeek」拦下
  assert.throws(() => webStore.reserveRequest(lawyer.id, input, 10, 1.5), (e: unknown) => e instanceof BqtDenialError && e.code === 'bqt_model_not_allowed');
  // Normal users keep the old limit of 4.
  for (let i = 0; i < 4; i++) { const rid = randomUUID(); await billing.authorizeCostCny(normal.id, rid, 0.01); billing.reserveCostCny(normal.id, rid, {}, 'deepseek-v4.1-flash-1017', 0.01, {}); billing.release(normal.id, rid); }
  // 15-minute incident sweep: same state/circuit semantics, no local refund for BQT rows.
  db.prepare('UPDATE platform_ai_request SET createdAt=? WHERE requestId=?').run(new Date(Date.now() - 16 * 60_000).toISOString(), id);
  billing.recoverPending();
  assert.equal(billing.requestRow(lawyer.id, id)!.state, 'refunded_pending');
  assert.equal(getBalance(lawyer.id), 10000);
  assert.throws(() => billing.reserveCostCny(normal.id, randomUUID(), {}, 'deepseek-v4.1-flash-1017', 0.01, {}), /reconciliation_required/);
  db.prepare("UPDATE platform_ai_request SET state='released' WHERE requestId=?").run(id);
});

await check('Web AI: fixed Qwen web model is refused for BQT lawyers (DeepSeek only); denials map through failure()', async () => {
  const { bqtAuthorize } = await import('@/lib/bqt-ai');
  const input = validateInput({ requestId: randomUUID(), language: 'zh', mode: 'chat', message: 'hi', history: [], document: { id: randomUUID(), version: 0, name: 'a', text: '' } });
  await bqtAuthorize(lawyer.id, `web_ai:${input.requestId}`, webStore.webReserveCents(input, 10, 1.5));
  assert.throws(() => webStore.reserveRequest(lawyer.id, input, 10, 1.5), (e: unknown) => e instanceof BqtDenialError && e.code === 'bqt_model_not_allowed');
  assert.equal(getBalance(lawyer.id), 10000);
  const res = failure(new BqtDenialError('bqt_model_not_allowed'), 'en');
  assert.equal(res.status, 403); assert.equal((await res.json()).error.code, 'bqt_model_not_allowed');
  const res2 = failure(new BqtDenialError('bqt_insufficient_points'), 'en');
  assert.equal(res2.status, 402); assert.equal((await res2.json()).error.code, 'bqt_insufficient_points');
});

await check('quota view and skill usage reflect BQT, not local credits', async () => {
  staleSnapshot(); await m.fetchBqtEntitlement('10001');
  const q = billing.domesticQuota(lawyer.id);
  assert.equal(q.creditsCents, points); // 100 分/积分 → 百分之一积分数 = 分数
  assert.equal(q.remainingUsd, Math.floor(points / (10 * 1.5)) / 100);
  const bill = settleAiUsage({ userId: lawyer.id, costUsd: 0, costCny: 0.1, model: 'm', service: 'skill_draft' });
  assert.equal(bill.charged, false); assert.equal(getBalance(lawyer.id), 10000);
  assert.equal(billing.domesticQuota(normal.id).creditsCents, getBalance(normal.id));
});

await check('BQT lawyers may only use DeepSeek models (2026-11-06 decision)', async () => {
  const id = randomUUID();
  await billing.authorizeCostCny(lawyer.id, id, 1);
  assert.throws(() => billing.reserveCostCny(lawyer.id, id, {}, 'qwen3.8-max', 1, {}), (e: unknown) => e instanceof BqtDenialError && e.code === 'bqt_model_not_allowed' && e.status === 403);
  assert.equal(billing.requestRow(lawyer.id, id), undefined);
  // 普通用户不受限
  const nid = randomUUID();
  await billing.authorizeCostCny(normal.id, nid, 1);
  billing.reserveCostCny(normal.id, nid, {}, 'qwen3.8-max', 1, {});
  billing.release(normal.id, nid);
});

await check('tunnel off: the lawyer is back on the original wallet path', async () => {
  assert.ok(m.updateBqtSettings({ tunnelEnabled: false }, 'test').ok);
  assert.equal(m.bqtChargeTarget(lawyer.id), null);
  const id = randomUUID(), n = count('SELECT COUNT(*) n FROM bqt_consume');
  await billing.authorizeCostCny(lawyer.id, id, 1);
  const row = billing.reserveCostCny(lawyer.id, id, {}, 'deepseek-v4.1-flash-1017', 1, {});
  assert.equal(row.margin, 1); assert.equal(getBalance(lawyer.id), 10000 - 100);
  billing.submitted(lawyer.id, id); billing.settleCostCny(lawyer.id, id, 0.5, {});
  assert.equal(getBalance(lawyer.id), 10000 - 50);
  assert.equal(count('SELECT COUNT(*) n FROM bqt_consume'), n);
  assert.equal(settleAiUsage({ userId: lawyer.id, costUsd: 0, costCny: 0.1, model: 'm', service: 'skill_draft' }).charged, true);
});

console.log(`verify-bqt-ai: ${counted} checks OK`);
