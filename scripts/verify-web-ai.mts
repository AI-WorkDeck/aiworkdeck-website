// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * OpenRouter Web AI contract checks (international provider). Domestic coverage is verify-platform-ai. Run from a fresh temporary cwd, following verify-pro-subscription.mts.
 * All users, sessions, balances and provider replies are synthetic. No network is allowed.
 * REPO="$PWD" D="$(mktemp -d)" sh -c 'cd "$D" && npx tsx --tsconfig "$REPO/tsconfig.json" "$REPO/scripts/verify-web-ai.mts"'
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { WebInput } from '@/lib/web-ai/contract';

assert.ok(!fs.existsSync('package.json') && !fs.existsSync('data'), 'Run only in a fresh temporary cwd; never reuse real data');
fs.mkdirSync('data');
fs.writeFileSync('data/users.json', '[]');
fs.writeFileSync('data/ai-config.json', JSON.stringify({ exchangeRateMode: 'manual', exchangeRate: 1, marginMultiplier: 1 }));
Object.assign(process.env, { NEXT_PUBLIC_AWD_SITE: 'intl', NODE_ENV: 'production', WEB_AI_ENABLED: '1', OPENROUTER_API_KEY: 'synthetic-web-test-key', AWD_KEY_ENCRYPTION_SECRET: 'synthetic-web-test-encryption' });
const originalFetch = globalThis.fetch;
let providerCalls = 0, generationCalls = 0;
let providerReply: () => Promise<Response> = async () => { throw new Error('Unexpected provider request'); };
let generationReply: (id: string) => Response = () => new Response('{}', { status: 404 });
let lastProviderBody: Record<string, unknown> = {};
globalThis.fetch = async (resource, init) => {
  const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url);
  assert.equal(url.origin, 'https://openrouter.ai', 'Unexpected network blocked');
  if (url.pathname === '/api/v1/chat/completions') {
    providerCalls++;
    lastProviderBody = JSON.parse(String(init?.body));
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-web-test-key');
    return providerReply();
  }
  if (url.pathname === '/api/v1/generation') { generationCalls++; return generationReply(url.searchParams.get('id')!); }
  throw new Error(`Unexpected network blocked: ${url.pathname}`);
};

const { NextRequest } = await import('next/server');
const { siteConfig } = await import('@/lib/site-config');
const { getDb, withTransaction, closeDb } = await import('@/lib/db');
const { grantCredits, getBalance, expireCredits } = await import('@/lib/credits');
const { createSession, SESSION_COOKIE, getUserByToken } = await import('@/lib/sessions');
const { deleteAccount, findDeletionBlocker, tombstoneUserId } = await import('@/lib/account-deletion');
const { __setFetchForTests: setMgmtFetch } = await import('@/lib/openrouter-mgmt');
const { LIMITS, WEB_MODEL, PRICE_CAP, AGENT_RESERVE_USD, validateInput, messagesFor, WebError } = await import('@/lib/web-ai/contract');
const { reserveRequest, getRequest, markSubmitted, markPending, settleRequest, releaseRequest, refundUnverified, RECONCILIATION_DEADLINE_MS } = await import('@/lib/web-ai/store');
const { validateToolCall, validateToolResult } = await import('@/web-workbench/src/agent-contract.js');
const { streamCompletion, generationCost, ProviderRejected } = await import('@/lib/web-ai/provider');
const { POST } = await import('@/app/api/web/chat/route');
const { GET: capabilities } = await import('@/app/api/web/capabilities/route');
const { GET: status } = await import('@/app/api/web/requests/[requestId]/route');
let db = getDb();
const origin = siteConfig.origin;
let checked = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>) {
  providerReply = async () => { throw new Error('Unexpected provider request'); };
  generationReply = () => new Response('{}', { status: 404 });
  try { await fn(); checked++; console.log('  OK ', name); }
  catch (error) { failures.push(name); console.error(' FAIL ', name, error); }
}
function user(cents = 0) {
  const id = randomUUID(), now = new Date().toISOString();
  const users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
  users.push({ id, username: `web-${id}`, email: `${id}@test.invalid`, passwordHash: 'synthetic:unused', displayName: 'Synthetic Web Test', createdAt: now });
  fs.writeFileSync('data/users.json', JSON.stringify(users));
  if (cents) withTransaction(d => grantCredits(d, { userId: id, pool: 'topup', amountCents: cents, ledgerKind: 'recharge' }));
  return { id, token: createSession(id).token };
}
type Account = ReturnType<typeof user>;
function input(overrides: Partial<WebInput> = {}): WebInput {
  return { requestId: randomUUID(), language: 'en', mode: 'chat', message: 'Summarize the passage.', history: [], document: { id: randomUUID(), version: 3, name: 'Synthetic.docx', text: 'A unique passage for testing.' }, ...overrides };
}
function request(body: unknown, account?: Account, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/web/chat?lang=en`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(account ? { Cookie: `${SESSION_COOKIE}=${account.token}` } : {}), ...headers }, body: JSON.stringify(body) });
}
function getReq(route: string, account?: Account) {
  return new NextRequest(`${origin}${route}?lang=en`, { headers: account ? { Cookie: `${SESSION_COOKIE}=${account.token}` } : {} });
}
async function errorIs(response: Response, code: string, http: number) {
  assert.equal(response.status, http); assert.equal((await response.json()).error.code, code);
}
function sse(text: string, cost: number | null = 0.01, id = 'gen-synthetic', complete = true) {
  const records = [': provider heartbeat\r\n', ...[...text].map(t => `data: ${JSON.stringify({ id, choices: [{ delta: { content: t } }] })}\r\n\r\n`), `data: ${JSON.stringify({ id, choices: [{ delta: {}, finish_reason: complete ? 'stop' : 'length' }], ...(cost === null ? {} : { usage: { cost } }) })}\n\n`, ...(complete ? ['data: [DONE]\n\n'] : [])].join('');
  const bytes = new TextEncoder().encode(records);
  let offset = 0;
  // Deliberately split JSON, CRLF and multibyte UTF-8 over arbitrary network chunks.
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) { if (offset === bytes.length) return controller.close(); const end = Math.min(bytes.length, offset + 7); controller.enqueue(bytes.slice(offset, end)); offset = end; } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
type Event = { event: string; data: Record<string, unknown> };
async function events(response: Response): Promise<Event[]> {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  return (await response.text()).split('\n\n').filter(b => b.startsWith('event: ')).map(b => { const lines = b.split('\n'); return { event: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) }; });
}
const rowCount = () => (db.prepare('SELECT COUNT(*) n FROM web_ai_request').get() as { n: number }).n;

try {
  await check('Cookie authentication and same-site Origin are required before reservation/provider calls', async () => {
    const a = user(100), before = providerCalls, rows = rowCount();
    await errorIs(await POST(request(input())), 'unauthorized', 401);
    await errorIs(await POST(request(input(), undefined, { Cookie: `${SESSION_COOKIE}=invalid` })), 'unauthorized', 401);
    await errorIs(await POST(request(input(), a, { Origin: '' })), 'forbidden_origin', 403);
    await errorIs(await POST(request(input(), a, { Origin: 'https://attacker.invalid' })), 'forbidden_origin', 403);
    await errorIs(await POST(request(input(), a, { 'Sec-Fetch-Site': 'cross-site' })), 'forbidden_origin', 403);
    await errorIs(await POST(request(input(), a, { Host: 'other.invalid' })), 'forbidden_origin', 403);
    assert.equal(providerCalls, before); assert.equal(rowCount(), rows); assert.equal(getBalance(a.id), 100);
    const anonymous = await (await capabilities(getReq('/api/web/capabilities'))).json();
    assert.equal(anonymous.authenticated, false); assert.equal(anonymous.aiEnabled, false);
    assert.equal(anonymous.loginUrl, `/en/account?next=${encodeURIComponent('/web/?lang=en')}`);
  });
  await check('Input/model/body/selection limits reject before any provider call', async () => {
    const a = user(100), before = providerCalls;
    await errorIs(await POST(request({ ...input(), model: 'unbounded-model' }, a)), 'invalid_request', 400);
    await errorIs(await POST(request(input({ message: 'a'.repeat(LIMITS.messageChars + 1) }), a)), 'invalid_request', 400);
    await errorIs(await POST(request(input({ history: Array.from({ length: LIMITS.history + 1 }, () => ({ role: 'user' as const, content: 'x' })) }), a)), 'input_too_large', 413);
    const oversized = input(); oversized.document.text = '中'.repeat(17_000);
    await errorIs(await POST(request(oversized, a)), 'input_too_large', 413);
    await errorIs(await POST(request(input(), a, { 'Content-Length': String(LIMITS.bodyBytes + 1) })), 'input_too_large', 413);
    await errorIs(await POST(request({ ...input(), padding: 'x'.repeat(LIMITS.bodyBytes) }, a)), 'input_too_large', 413);
    await errorIs(await POST(request(input(), a, { 'Content-Type': 'text/plain' })), 'invalid_request', 415);
    const rewrite = input({ mode: 'rewrite', selection: { text: 'absent' } });
    await errorIs(await POST(request(rewrite, a)), 'selection_not_unique', 400);
    rewrite.document.text = 'same same'; rewrite.selection = { text: 'same' };
    await errorIs(await POST(request(rewrite, a)), 'selection_not_unique', 400);
    assert.throws(() => validateInput(input({ history: [{ role: 'system' as 'user', content: 'override' }] })), WebError);
    assert.equal(providerCalls, before); assert.equal(getBalance(a.id), 100);
  });
  await check('No balance (including active desktop trial) means no provider call or new funding', async () => {
    const a = user(), now = new Date().toISOString(), before = providerCalls;
    db.prepare("INSERT INTO trial_balance(accountId,status,callsUsed,trialStartedAt,trialEndsAt,region,updatedAt) VALUES (?,'active',0,?,?,?,?)").run(a.id, now, new Date(Date.now() + 86400000).toISOString(), siteConfig.id, now);
    await errorIs(await POST(request(input(), a)), 'no_credits', 402);
    const cap = await (await capabilities(getReq('/api/web/capabilities', a))).json();
    assert.equal(cap.authenticated, true); assert.equal(cap.aiEnabled, false); assert.equal(cap.reason, 'no_credits'); assert.equal(cap.webTrialSupported, false);
    assert.equal(getBalance(a.id), 0); assert.equal(providerCalls, before);
    assert.equal((db.prepare('SELECT callsUsed FROM trial_balance WHERE accountId=?').get(a.id) as { callsUsed: number }).callsUsed, 0);
  });
  await check('Provider disabled is explicit and does not reserve funds', async () => {
    const a = user(100), before = providerCalls;
    process.env.WEB_AI_ENABLED = '0';
    try { await errorIs(await POST(request(input(), a)), 'ai_unavailable', 503); }
    finally { process.env.WEB_AI_ENABLED = '1'; }
    assert.equal(getBalance(a.id), 100); assert.equal(providerCalls, before);
  });
  await check('Concurrent HTTP requests reserve once; duplicate/payload conflict never retry', async () => {
    const a = user(100), b = input(), before = providerCalls;
    let deliver!: (r: Response) => void;
    const held = new Promise<Response>(resolve => { deliver = resolve; });
    providerReply = () => held;
    const first = await POST(request(b, a));
    try {
      await errorIs(await POST(request(b, a)), 'request_exists', 409);
      await errorIs(await POST(request({ ...b, message: 'Different paid action' }, a)), 'request_conflict', 409);
      await errorIs(await POST(request(input(), a)), 'busy', 409);
      assert.equal(providerCalls, before + 1);
      assert.equal(getBalance(a.id), 100 - getRequest(a.id, b.requestId)!.reserveCents);
    } finally { deliver(sse('A completed answer.')); }
    const frames = await events(first);
    assert.ok(frames.some(e => e.event === 'usage')); assert.equal(frames.at(-1)?.event, 'done');
    assert.equal(getRequest(a.id, b.requestId)!.state, 'settled'); assert.equal(getBalance(a.id), 99);
    await errorIs(await POST(request(b, a)), 'request_exists', 409);
    assert.equal(providerCalls, before + 1);
  });
  await check('Status is scoped to authenticated user and contains no document/provider secret', async () => {
    const a = user(100), other = user(), b = input(), before = generationCalls;
    reserveRequest(a.id, b, 1, 1);
    const route = `/api/web/requests/${b.requestId}`, context = { params: Promise.resolve({ requestId: b.requestId }) };
    await errorIs(await status(getReq(route), context), 'unauthorized', 401);
    await errorIs(await status(getReq(route, other), context), 'not_found', 404);
    const own = await status(getReq(route, a), context), text = await own.text();
    assert.equal(own.status, 200); assert.equal(own.headers.get('cache-control'), 'no-store');
    assert.equal(JSON.parse(text).state, 'reserved');
    for (const privateValue of [b.document.text, b.message, 'synthetic-web-test-key', a.token]) assert.ok(!text.includes(privateValue));
    assert.equal(generationCalls, before);
    releaseRequest(a.id, b.requestId, 'test_cleanup');
  });
  await check('Arbitrarily split UTF-8 SSE is decoded and provider model/token/price controls are fixed', async () => {
    const b = input(); let observed = '', id = '';
    providerReply = async () => sse('你好🙂 fragment');
    const result = await streamCompletion('synthetic-web-test-key', b, { onDelta: t => { observed += t; }, onId: v => { id = v; } });
    assert.equal(result.complete, true); assert.equal(result.text, '你好🙂 fragment'); assert.equal(observed, result.text); assert.equal(id, 'gen-synthetic');
    assert.equal(lastProviderBody.model, WEB_MODEL); assert.equal(lastProviderBody.max_tokens, LIMITS.outputTokens);
    assert.deepEqual(lastProviderBody.provider, { max_price: PRICE_CAP, allow_fallbacks: true, require_parameters: true, data_collection: 'deny' });
    assert.equal(lastProviderBody.tools, undefined);
    assert.equal(lastProviderBody.models, undefined, 'Provider fallback must not introduce model fallback');
    assert.equal(lastProviderBody.route, undefined, 'No alternate model router');
  });
  await check('Valid rewrite emits one version-bound proposal; raw JSON never appears as delta', async () => {
    const a = user(100), b = input({ mode: 'rewrite', selection: { text: 'unique passage' } });
    providerReply = async () => sse(JSON.stringify({ replacement: 'clear passage', explanation: 'More concise.' }));
    const frames = await events(await POST(request(b, a))), proposals = frames.filter(e => e.event === 'proposal');
    assert.equal(proposals.length, 1); assert.deepEqual(proposals[0].data, { requestId: b.requestId, fileId: b.document.id, version: 3, original: 'unique passage', replacement: 'clear passage', explanation: 'More concise.' });
    assert.ok(!frames.some(e => e.event === 'delta' || e.event === 'error'));
    assert.equal(getBalance(a.id), 99); assert.equal(lastProviderBody.response_format && (lastProviderBody.response_format as { type: string }).type, 'json_object');
    const stored = JSON.stringify(getRequest(a.id, b.requestId));
    assert.ok(!stored.includes('clear passage') && !stored.includes(b.document.text));
  });
  // Deliberately still billed: the charge waiver covers only unusable agent tool calls (invalid_tool_call).
  // Rewrite billing was not part of that decision; its error text keeps saying usage is charged.
  await check('Invalid proposal never emits an applyable proposal but actual generation is billed', async () => {
    const a = user(100), b = input({ mode: 'rewrite', selection: { text: 'unique passage' } });
    providerReply = async () => sse('{"replacement":"unsafe","explanation":"x","command":"execute"}');
    const frames = await events(await POST(request(b, a)));
    assert.ok(!frames.some(e => e.event === 'proposal' || e.event === 'delta'));
    assert.equal(frames.find(e => e.event === 'error')?.data.code, 'invalid_proposal');
    assert.equal(frames.find(e => e.event === 'usage')?.data.chargedCents, 1);
    assert.equal(getRequest(a.id, b.requestId)!.state, 'settled'); assert.equal(getBalance(a.id), 99);
  });
  await check('Missing usage remains pending, is not replayed/refunded, then reconciles against matching receipt', async () => {
    const a = user(100), b = input(), before = providerCalls;
    providerReply = async () => sse('Usage not yet known.', null);
    generationReply = () => new Response('{}', { status: 404 });
    const frames = await events(await POST(request(b, a))), row = getRequest(a.id, b.requestId)!;
    assert.equal(row.state, 'usage_pending'); assert.equal(row.chargedCents, null);
    assert.equal(frames.find(e => e.event === 'error')?.data.code, 'usage_pending');
    assert.ok(!frames.some(e => e.event === 'usage'));
    assert.equal(getBalance(a.id), 100 - row.reserveCents);
    assert.throws(() => releaseRequest(a.id, b.requestId, 'timeout'), /uncertain/);
    await errorIs(await POST(request(b, a)), 'request_exists', 409);
    await errorIs(await POST(request(input(), a)), 'busy', 409);
    generationReply = id => Response.json({ data: { id, total_cost: 0.02 } });
    db.prepare('UPDATE web_ai_request SET updatedAt=? WHERE userId=? AND requestId=?').run(new Date(Date.now() - 31_000).toISOString(), a.id, b.requestId);
    const receipt = await (await status(getReq(`/api/web/requests/${b.requestId}`, a), { params: Promise.resolve({ requestId: b.requestId }) })).json();
    assert.equal(receipt.state, 'settled'); assert.equal(receipt.chargedCents, 2); assert.equal(getBalance(a.id), 98); assert.equal(providerCalls, before + 1);
  });
  await check('Provider metadata requires matching id and explicit finite cost; explicit zero is accepted', async () => {
    for (const data of [{ id: 'other', total_cost: 0.01 }, { id: 'gen-check' }, { id: 'gen-check', total_cost: -1 }, { id: 'gen-check', total_cost: '0' }]) {
      generationReply = () => Response.json({ data });
      assert.equal(await generationCost('synthetic-web-test-key', 'gen-check'), null);
    }
    generationReply = id => Response.json({ data: { id, total_cost: 0 } });
    assert.equal(await generationCost('synthetic-web-test-key', 'gen-check'), 0);
  });
  await check('Definitive rejection refunds exactly once; uncertain network failure keeps reservation', async () => {
    const a = user(100), b = input(); providerReply = async () => new Response('{}', { status: 429 });
    await events(await POST(request(b, a)));
    assert.equal(getRequest(a.id, b.requestId)!.state, 'released'); assert.equal(getBalance(a.id), 100);
    releaseRequest(a.id, b.requestId, 'upstream_failed', true); assert.equal(getBalance(a.id), 100);
    const c = input(), before = providerCalls; providerReply = async () => { throw new TypeError('Synthetic connection lost after possible submission'); };
    await events(await POST(request(c, a)));
    assert.equal(getRequest(a.id, c.requestId)!.state, 'usage_pending'); assert.equal(providerCalls, before + 1);
    await errorIs(await POST(request(c, a)), 'request_exists', 409); assert.equal(providerCalls, before + 1);
  });
  await check('429 keeps safe internal status, refunds once, and never retries or exposes upstream body', async () => {
    const secretBody='Synthetic provider detail that must not escape';
    providerReply = async () => new Response(secretBody, { status: 429 });
    const beforeDirect=providerCalls;
    await assert.rejects(streamCompletion('synthetic-web-test-key', input(), { onId() {}, onDelta() {} }), (e: unknown) => e instanceof ProviderRejected && e.status===429 && e.message==='Provider request rejected');
    assert.equal(providerCalls,beforeDirect+1);
    const a=user(100), b=input(), before=providerCalls, warnings:unknown[][]=[];
    const warn=console.warn;console.warn=(...args:unknown[])=>{warnings.push(args);};
    try {
      const frames=await events(await POST(request(b,a))), row=getRequest(a.id,b.requestId)!;
      assert.equal(row.state,'released');assert.equal(row.costUsd,null);assert.equal(getBalance(a.id),100);
      assert.equal(frames.find(e=>e.event==='usage')?.data.costUsd,undefined);
      assert.equal(frames.find(e=>e.event==='error')?.data.code,'upstream_failed');
      assert.deepEqual(warnings,[['[web-ai] provider_rejected',{status:429,requestId:b.requestId}]]);
      const emitted=JSON.stringify({frames,warnings});
      for(const value of [secretBody,'synthetic-web-test-key',a.token,b.document.text])assert.ok(!emitted.includes(value));
      await errorIs(await POST(request(b,a)),'request_exists',409);assert.equal(providerCalls,before+1);
    } finally {console.warn=warn;}
  });
  await check('Provider output truncation/size bounds never become rewrite proposals', async () => {
    const a = user(100), b = input({ mode: 'rewrite', selection: { text: 'unique passage' } });
    generationReply = id => Response.json({ data: { id, total_cost: 0.01 } });
    providerReply = async () => sse('{"replacement":"unfinished', 0.01, 'gen-truncated', false);
    const partial = await streamCompletion('synthetic-web-test-key', b, { onId() {}, onDelta() {} });
    assert.equal(partial.complete, false); assert.equal(partial.cost, undefined, 'No DONE means the streaming cost is not final');
    const frames = await events(await POST(request(b, a)));
    assert.ok(!frames.some(e => e.event === 'proposal')); assert.equal(frames.find(e => e.event === 'error')?.data.code, 'upstream_failed'); assert.equal(getBalance(a.id), 99);
    const oversize = `data: ${JSON.stringify({ id: 'gen-large', choices: [{ delta: { content: 'x'.repeat(LIMITS.outputChars + 1) } }] })}\n\n`;
    providerReply = async () => new Response(oversize);
    await assert.rejects(streamCompletion('synthetic-web-test-key', input(), { onId() {}, onDelta() {} }), WebError);
  });
  await check('Settlement keeps original subscription period/week even after expiration and renewal', () => {
    const a = user(500), b = input(), t0 = '2025-01-07T23:59:00.000Z';
    db.prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES (?,'pro','synthetic-pro',?,?)").run(a.id, '2025-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
    const old = db.prepare('INSERT INTO subscription_period(userId,outTradeNo,cycle,startsAt,endsAt,monthlyCents,weeklyCents) VALUES (?, ?,0,?,?,1000,100)').run(a.id, randomUUID(), '2025-01-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z').lastInsertRowid;
    const current = db.prepare('INSERT INTO subscription_period(userId,outTradeNo,cycle,startsAt,endsAt,monthlyCents,weeklyCents) VALUES (?, ?,0,?,?,1000,100)').run(a.id, randomUUID(), '2025-02-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z').lastInsertRowid;
    const reserved = reserveRequest(a.id, b, 1, 1, t0);
    assert.equal(JSON.parse(reserved.fundingJson).periodId, Number(old)); assert.equal(JSON.parse(reserved.fundingJson).walletAllowed, false);
    markSubmitted(a.id, b.requestId); const settled = settleRequest(a.id, b.requestId, 0.02);
    assert.equal(settled.chargedCents, 2); assert.equal(getBalance(a.id), 500);
    assert.deepEqual(db.prepare('SELECT periodId,weekStart,SUM(amountCents) amount FROM subscription_usage GROUP BY periodId,weekStart HAVING periodId=?').get(old), { periodId: Number(old), weekStart: '2025-01-01T00:00:00.000Z', amount: 2 });
    assert.equal((db.prepare('SELECT COUNT(*) n FROM subscription_usage WHERE periodId=?').get(current) as { n: number }).n, 0);
    settleRequest(a.id, b.requestId, 0.02);
    assert.equal((db.prepare('SELECT SUM(amountCents) n FROM subscription_usage WHERE periodId=?').get(old) as { n: number }).n, 2);
  });
  await check('Expired reward reserved before expiry still settles after expiry sweeper; no topup conversion', () => {
    const a = user(), b = input(), granted = '2023-01-01T00:00:00.000Z', reservedAt = '2024-12-31T23:59:59.000Z';
    withTransaction(d => grantCredits(d, { userId: a.id, pool: 'reward', amountCents: 100, ledgerKind: 'gift', nowIso: granted }));
    const row = reserveRequest(a.id, b, 1, 1, reservedAt);
    withTransaction(d => expireCredits(d, '2025-01-01T00:00:01.000Z'));
    assert.equal(getBalance(a.id), 0);
    markSubmitted(a.id, b.requestId); assert.equal(settleRequest(a.id, b.requestId, 0.02).chargedCents, 2);
    const lot = db.prepare('SELECT pool,expiresAt,remainingCents FROM credit_lots WHERE userId=?').get(a.id) as { pool: string; expiresAt: string; remainingCents: number };
    assert.equal(lot.pool, 'reward'); assert.equal(lot.expiresAt, '2025-01-01T00:00:00.000Z'); assert.equal(lot.remainingCents, row.reserveCents - 2); assert.equal(getBalance(a.id), 0);
    withTransaction(d => expireCredits(d));
    assert.equal((db.prepare('SELECT remainingCents FROM credit_lots WHERE userId=?').get(a.id) as { remainingCents: number }).remainingCents, 0);
    assert.equal((db.prepare('SELECT SUM(amountCents) amount FROM wallet_ledger WHERE userId=?').get(a.id) as { amount: number }).amount, 0, 'Expiry plus actual spend plus refunds must conserve the original grant');
    assert.equal(getBalance(a.id), 0);
  });
  for (const state of ['reserved','submitted','usage_pending'] as const) {
    await check(`Account deletion blocks unresolved Web AI state ${state} without orphaning its funds`, async () => {
      const a=user(),b=input(),before=providerCalls;
      withTransaction(d=>grantCredits(d,{userId:a.id,pool:'reward',amountCents:100,ledgerKind:'gift'}));
      reserveRequest(a.id,b,1,1);
      if(state!=='reserved')markSubmitted(a.id,b.requestId);
      if(state==='usage_pending')db.prepare("UPDATE web_ai_request SET state='usage_pending' WHERE userId=?").run(a.id);
      const balance=getBalance(a.id),ledgerCount=(db.prepare('SELECT COUNT(*) n FROM wallet_ledger WHERE userId=?').get(a.id) as {n:number}).n;
      try {
        const result=await deleteAccount(a.id);
        assert.ok('blocked' in result && result.blocked==='has_pending_allocation', `Deletion must block ${state}; got ${JSON.stringify(result)}`);
        assert.equal(findDeletionBlocker(a.id)?.blocked,'has_pending_allocation');
        assert.equal(getRequest(a.id,b.requestId)!.state,state);assert.equal(getBalance(a.id),balance);assert.equal(getUserByToken(a.token)?.id,a.id);
        assert.equal((db.prepare('SELECT COUNT(*) n FROM wallet_ledger WHERE userId=?').get(a.id) as {n:number}).n,ledgerCount);
        assert.equal((db.prepare('SELECT COUNT(*) n FROM wallet_ledger WHERE userId=?').get(tombstoneUserId(a.id)) as {n:number}).n,0);
        assert.equal(providerCalls,before);
      } finally {
        // Fixture cleanup only, so an intentionally red baseline cannot pause following cases.
        db.prepare("UPDATE web_ai_request SET state='released',errorCode=NULL WHERE userId=?").run(a.id);
      }
    });
  }
  await check('Deletion rechecks Web reservations created while key revocation is in flight', async () => {
    const a=user(),b=input(),before=providerCalls,priorKey=process.env.OPENROUTER_PROVISIONING_KEY;
    withTransaction(d=>grantCredits(d,{userId:a.id,pool:'reward',amountCents:100,ledgerKind:'gift'}));
    db.prepare('INSERT INTO openrouter_keys(userId,orKeyHash,limitUsd,createdAt) VALUES (?,?,1,?)').run(a.id,'synthetic-delete-race',new Date().toISOString());
    assert.equal(findDeletionBlocker(a.id),null);
    process.env.OPENROUTER_PROVISIONING_KEY='synthetic-management-key';let revocations=0;
    setMgmtFetch(async (url,init)=>{
      assert.equal(String(url),'https://openrouter.ai/api/v1/keys/synthetic-delete-race');assert.equal(init?.method,'PATCH');assert.deepEqual(JSON.parse(String(init?.body)),{disabled:true});
      revocations++;reserveRequest(a.id,b,1,1);markSubmitted(a.id,b.requestId);
      return Response.json({data:{disabled:true}});
    });
    try {
      const result=await deleteAccount(a.id);
      assert.ok('blocked' in result&&result.blocked==='has_pending_allocation','Transaction recheck must prevent deletion after a concurrent Web reservation');
      assert.equal(revocations,1);assert.equal(getUserByToken(a.token)?.id,a.id);assert.equal(getRequest(a.id,b.requestId)!.state,'submitted');
      assert.equal((db.prepare('SELECT userId FROM wallet_ledger WHERE id=?').get(getRequest(a.id,b.requestId)!.reserveLedgerId) as {userId:string}).userId,a.id);
      assert.equal(settleRequest(a.id,b.requestId,0.01).state,'settled','The blocked deletion must leave the original funding usable for settlement');
      assert.equal(getBalance(a.id),99);
      assert.equal(providerCalls,before);
    } finally {
      setMgmtFetch(null);if(priorKey===undefined)delete process.env.OPENROUTER_PROVISIONING_KEY;else process.env.OPENROUTER_PROVISIONING_KEY=priorKey;
      db.prepare("UPDATE web_ai_request SET state='released' WHERE userId=?").run(a.id);
    }
  });
  await check('Deletion tombstones settled/released/refunded Web receipts and retains accounting links and incident pause', async () => {
    const a=user(),before=providerCalls;
    withTransaction(d=>grantCredits(d,{userId:a.id,pool:'reward',amountCents:100,ledgerKind:'gift'}));
    const first=input();reserveRequest(a.id,first,1,1);markSubmitted(a.id,first.requestId);settleRequest(a.id,first.requestId,0.01);
    const second=input();reserveRequest(a.id,second,1,1);releaseRequest(a.id,second.requestId,'synthetic-release');
    const third=input(),reserved=reserveRequest(a.id,third,1,1);markSubmitted(a.id,third.requestId);
    refundUnverified(a.id,third.requestId,new Date(Date.parse(reserved.createdAt)+RECONCILIATION_DEADLINE_MS+1).toISOString());
    const rows=[getRequest(a.id,first.requestId)!,getRequest(a.id,second.requestId)!,getRequest(a.id,third.requestId)!],tombstone=tombstoneUserId(a.id);
    try {
      assert.equal(findDeletionBlocker(a.id),null);
      const result=await deleteAccount(a.id);assert.ok('deletedAt' in result);assert.equal(getUserByToken(a.token),undefined);
      assert.equal((db.prepare('SELECT COUNT(*) n FROM web_ai_request WHERE userId=?').get(a.id) as {n:number}).n,0);
      for(const row of rows){
        assert.deepEqual(getRequest(tombstone,row.requestId),{...row,userId:tombstone});
        for(const id of [row.reserveLedgerId,row.chargeLedgerId].filter(v=>v!==null))assert.equal((db.prepare('SELECT userId FROM wallet_ledger WHERE id=?').get(id) as {userId:string}).userId,tombstone);
      }
      assert.equal((db.prepare('SELECT COUNT(*) n FROM credit_lots WHERE userId=?').get(a.id) as {n:number}).n,0);
      const ledgerCount=(db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get() as {n:number}).n;
      assert.throws(()=>settleRequest(tombstone,third.requestId,0.01),/not been submitted/,'Incident refund must never be retrospectively charged');
      assert.equal((db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get() as {n:number}).n,ledgerCount);
      const other=user(100);
      assert.throws(()=>reserveRequest(other.id,input(),1,1),(e:unknown)=>e instanceof WebError&&e.code==='reconciliation_paused','Anonymization must preserve the operator incident pause');
      assert.equal(providerCalls,before);
    } finally {
      // Close only the synthetic incident so subsequent cases can reserve normally.
      db.prepare("UPDATE web_ai_request SET state='released',errorCode=NULL WHERE requestId=?").run(third.requestId);
    }
  });
  await check('Existing migration37 receipts survive migrations38/39/40/41/42/43/44/45/46/47/48/49/50 and repeated database opens', () => {
    const requests = db.prepare('SELECT * FROM web_ai_request ORDER BY userId,requestId').all();
    const ledgers = db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get();
    const laterTables = ['bqt_entitlement_snapshot', 'bqt_consume', 'bqt_settings_audit', 'bqt_settings', 'postpaid_shadow_event', 'postpaid_shadow_meter', 'postpaid_shadow_unmapped', 'postpaid_repayment_reversal', 'postpaid_repayment', 'postpaid_debt', 'postpaid_cleanup_claim', 'postpaid_case', 'postpaid_payment_review', 'postpaid_policy', 'postpaid_grant', 'postpaid_meter', 'postpaid_usage', 'postpaid_egress', 'postpaid_export', 'postpaid_external_budget', 'bqt_monthly_grant', 'bqt_user_binding', 'bqt_scan_session', 'user_circle_binding', 'circle_firms', 'appstore_subscription_transaction', 'appstore_subscription', 'appstore_subscription_account', 'skill_ai_request', 'platform_ai_request', 'bailian_retired_key', 'openrouter_rotated_key', 'plugin_submission_token', 'developer_review', 'developer_profile', 'captcha_challenge', 'web_ai_agent_run', 'password_setup_ticket', 'password_credential'];
    // Recreate a real v37 boundary: remove every later table along with its version marker.
    // All tables here belong to this script's guarded synthetic temporary cwd.
    db.transaction(() => {
      for (const table of laterTables) db.exec(`DROP TABLE ${table}`);
      // 迁移 46 给既有表 team_member 加列（职务），回到 v37 要把列一并撤掉
      db.exec('ALTER TABLE team_member DROP COLUMN title');
      // 迁移 50 给 openrouter_keys 加列（铸造账号指纹）
      db.exec('ALTER TABLE openrouter_keys DROP COLUMN mgmtAccount');
      db.exec('DELETE FROM schema_version WHERE version >= 38');
    })();
    try {
      assert.equal((db.prepare('SELECT MAX(version) v FROM schema_version').get() as {v:number}).v, 37);
      closeDb(); db = getDb();
      assert.equal((db.prepare('SELECT MAX(version) v FROM schema_version').get() as {v:number}).v, 50);
      assert.deepEqual(db.prepare('SELECT * FROM web_ai_request ORDER BY userId,requestId').all(), requests);
      assert.deepEqual(db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get(), ledgers);
      for (const table of laterTables) {
        assert.equal((db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n, table === 'circle_firms' ? 10 : table === 'bqt_settings' ? 1 : 0);
      }
      closeDb(); db = getDb();
      assert.ok((db.prepare('PRAGMA table_info(team_member)').all() as {name:string}[]).some(c => c.name === 'title'), 'migration46 restores team_member.title');
      for (const version of [38, 39, 40, 41, 42, 43, 44, 45, 46, 47]) {
        assert.equal((db.prepare('SELECT COUNT(*) n FROM schema_version WHERE version=?').get(version) as {n:number}).n, 1);
      }
      assert.deepEqual(db.prepare('SELECT * FROM web_ai_request ORDER BY userId,requestId').all(), requests);
      assert.deepEqual(db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get(), ledgers);
      for (const table of laterTables) {
        assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
      }
    } finally {
      // Even a failed assertion must not leave the remaining cases on a downgraded fixture.
      closeDb(); db = getDb();
    }
  });
  const agentInput = (overrides: Partial<WebInput> = {}) => input({ mode: 'agent', agentStep: 0, agentHistory: [], agentContext: { runId: randomUUID(), targets: [] }, agentBudget: { currency: siteConfig.currency, perGenerationMaxChargeCents: Math.ceil(AGENT_RESERVE_USD * 100) }, ...overrides });
  const nativeCall = (name = 'doc_find_text', args: unknown = { queries: [{ text: 'unique' }] }) => ({ id: 'call-synthetic', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
  function toolSse(call = nativeCall(), options: { finish?: string; done?: boolean; cost?: number | null; extra?: boolean } = {}) {
    const records = [JSON.stringify({ id: 'gen-tool', choices: [{ delta: { tool_calls: [{ index: 0, id: call.id, type: call.type, function: { name: call.function.name, arguments: '' } }] } }] }),
      ...[...call.function.arguments].map(c => JSON.stringify({ id: 'gen-tool', choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: c } }] } }] })),
      ...(options.extra ? [JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, ...call, id: 'call-other' }] } }] })] : []),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: options.finish ?? 'tool_calls' }], ...(options.cost === null ? {} : { usage: { cost: options.cost ?? 0.01 } }) })];
    const bytes = new TextEncoder().encode(records.map(r => `data: ${r}\r\n\r\n`).join('') + (options.done === false ? '' : 'data: [DONE]\n\n'));
    let offset = 0;
    return new Response(new ReadableStream({ pull(controller) { if (offset >= bytes.length) return controller.close(); controller.enqueue(bytes.slice(offset, offset += 3)); } }));
  }
  const pair = (b: WebInput, id = 'call-synthetic') => [
    { role: 'assistant', content: null, tool_calls: [{ ...nativeCall(), id }] },
    { role: 'tool', tool_call_id: id, content: JSON.stringify({ ok: true, tool: 'doc_find_text', runId: b.agentContext!.runId, document: { id: b.document.id, name: b.document.name, version: b.document.version }, revision: 0, saved: true, partial: false, verification: 'verified', result: { queries: [] } }) },
  ] as NonNullable<WebInput['agentHistory']>;
  await check('A verified edit batch is followed by a stop reminder; read-only results and the tool-less final step are not', () => {
    const b = agentInput(), found = pair(b), result = JSON.parse((found[1] as { content: string }).content);
    const edited = [found[0], { ...found[1], content: JSON.stringify({ ...result, tool: 'doc_apply_edits', result: { edits: [] } }) }] as NonNullable<WebInput['agentHistory']>;
    const tail = (history: NonNullable<WebInput['agentHistory']>, agentStep = 1) => messagesFor({ ...b, agentStep, agentHistory: history }).at(-1)!;
    assert.equal(tail(edited).role, 'user'); assert.match(String(tail(edited).content), /make NO tool call/);
    assert.equal(tail(found).role, 'tool'); assert.equal(tail(edited, 3).role, 'tool');
    // A read-only call after the edit must not re-open it: the reminder stays for the rest of the run.
    assert.equal(tail([...edited, ...pair(b, 'call-read')], 2).role, 'user'); assert.equal(messagesFor(b).at(-1)!.role, 'user'); assert.equal(messagesFor(b).length, 2);
  });
  function primeAgentSteps(userId: string, b: WebInput, steps: number) {
    for (let step = 0; step < steps; step++) {
      const previous = { ...b, agentStep: step, requestId: randomUUID() };
      reserveRequest(userId, previous, 1, 1); markSubmitted(userId, previous.requestId); settleRequest(userId, previous.requestId, 0.01);
    }
  }
  await check('Shared edit allowlist accepts text/format/table primitives and rejects executable or ambiguous edits', () => {
    for (const text of ['汉字rn', 'back\\slash', '']) validateToolCall('doc_apply_edits', { edits: [{ type: 'set_table_cell', targetId: 'target', text }] });
    for (const text of ['a\nb', 'a\rb']) assert.throws(() => validateToolCall('doc_apply_edits', { edits: [{ type: 'set_table_cell', targetId: 'target', text }] }));
    validateToolCall('doc_apply_edits', { edits: [{ type: 'replace_text', targetId: 'target', originalText: 'old', newText: '' }, { type: 'insert_text', targetId: 'target', position: 'after', text: '\nNew paragraph' }, { type: 'format_text', targetId: 'target', format: { bold: false, fontSize: 12 } }, { type: 'format_paragraph', targetId: 'target', format: { headingLevel: 0 } }, { type: 'create_table', targetId: 'target', position: 'after', rows: [['A', 'B'], ['C', 'D']] }] });
    for (const edits of [[{ type: 'format_text', targetId: 'target', format: {} }], [{ type: 'create_table', targetId: 'target', position: 'after', rows: [['a'], ['b', 'c']] }], [{ type: 'replace_text', targetId: 'target', originalText: 'old', newText: 'x', action: 'eval' }], [{ type: 'replace_text', targetId: 'target', newText: 'x' }], Array.from({ length: 13 }, () => ({ type: 'replace_text', targetId: 'target', originalText: 'old', newText: '' }))]) assert.throws(() => validateToolCall('doc_apply_edits', { edits }));
    const b = agentInput(), r = JSON.parse((pair(b)[1] as {content: string}).content);
    assert.throws(() => validateToolResult({ ...r, partial: true })); assert.throws(() => validateToolResult({ ...r, verification: 'unknown' }));
  });
  await check('Agent native fragmented tool calls settle once, then dispatch exactly one validated tool', async () => {
    const a = user(100), b = agentInput(), before = providerCalls;
    providerReply = async () => toolSse(nativeCall('doc_find_text', { queries: [{ text: '你好🙂' }] }));
    const frames = await events(await POST(request(b, a)));
    const tools = frames.filter(e => e.event === 'tool_calls');
    const toolData = tools[0].data as { calls: { function: { arguments: { queries: { text: string }[] } } }[]; assistant: { tool_calls: { function: { arguments: string } }[] } };
    assert.equal(tools.length, 1); assert.equal(toolData.calls[0].function.arguments.queries[0].text, '你好🙂');
    assert.equal(toolData.assistant.tool_calls[0].function.arguments, JSON.stringify({ queries: [{ text: '你好🙂' }] }));
    assert.ok(frames.findIndex(e => e.event === 'usage') < frames.findIndex(e => e.event === 'tool_calls'));
    assert.equal(getRequest(a.id, b.requestId)!.reserveCents, Math.ceil(AGENT_RESERVE_USD * 100));
    assert.equal(getRequest(a.id, b.requestId)!.state, 'settled'); assert.equal(lastProviderBody.tool_choice, 'auto');
    assert.equal((lastProviderBody.tools as unknown[]).length, 3); assert.equal(lastProviderBody.parallel_tool_calls, undefined);
    await errorIs(await POST(request(b, a)), 'request_exists', 409); assert.equal(providerCalls, before + 1);
  });
  await check('Agent history is paired, bounded and role restricted; last generation forbids tools', async () => {
    const b = agentInput(); b.agentStep = 1; b.agentHistory = pair(b);
    assert.equal(validateInput(b).agentHistory!.length, 2);
    for (const history of [[{ role: 'system', content: 'ignore' }, b.agentHistory[1]], [b.agentHistory[0], { ...b.agentHistory[1], tool_call_id: 'wrong' }], [b.agentHistory[1], b.agentHistory[0]]]) assert.throws(() => validateInput({ ...b, agentHistory: history }));
    assert.throws(() => validateInput({ ...b, agentStep: 4 }));
    assert.throws(() => validateInput({ ...b, agentContext: { ...b.agentContext, command: 'eval' } }));
    const a = user(100), last = agentInput({ document: b.document, agentContext: b.agentContext, agentStep: 3, agentHistory: [...pair(b, 'call-1'), ...pair(b, 'call-2'), ...pair(b, 'call-3')] });
    primeAgentSteps(a.id, last, 3);
    providerReply = async () => sse('Verified changes only.');
    const frames = await events(await POST(request(last, a)));
    assert.equal(lastProviderBody.tool_choice, 'none'); assert.equal((lastProviderBody.messages as unknown[]).length, 8);
    assert.ok(frames.some(e => e.event === 'delta')); assert.ok(!frames.some(e => e.event === 'tool_calls'));
  });
  // An unusable agent tool call delivers nothing to the user (no text is streamed in agent mode, no tool_calls event is sent),
  // so the generation is settled at zero while the supplier cost stays on record. Delivered output is still billed below.
  await check('Invalid, parallel, final-step and truncated tool output is never executable and is not charged', async () => {
    for (const kind of ['unknown', 'extra_key', 'parallel', 'truncated', 'eof', 'final']) {
      const a = user(100), b = agentInput();
      if (kind === 'final') { b.agentStep = 3; b.agentHistory = [...pair(b, 'c1'), ...pair(b, 'c2'), ...pair(b, 'c3')]; primeAgentSteps(a.id, b, 3); }
      providerReply = async () => toolSse(kind === 'unknown' ? nativeCall('execute_code', {}) : kind === 'extra_key' ? nativeCall('doc_find_text', { queries: [{ text: 'x' }], command: 'eval' }) : nativeCall(), { extra: kind === 'parallel', finish: kind === 'truncated' ? 'length' : undefined, done: kind !== 'eof' });
      if (kind === 'eof') generationReply = id => new Response(JSON.stringify({ data: { id, total_cost: 0.01 } }));
      const frames = await events(await POST(request(b, a)));
      assert.ok(!frames.some(e => e.event === 'tool_calls'), kind); assert.ok(frames.some(e => e.event === 'error'), kind);
      // A stream cut before [DONE] carried a well-formed call: that is an incomplete supplier reply (upstream_failed), billed as before.
      const waived = kind !== 'eof', row = getRequest(a.id, b.requestId)!;
      assert.equal(frames.find(e => e.event === 'error')?.data.code, waived ? 'invalid_tool_call' : 'upstream_failed', kind); assert.equal(frames.find(e => e.event === 'usage')?.data.chargedCents, waived ? 0 : 1, kind);
      assert.equal(row.state, 'settled'); assert.equal(row.chargedCents, waived ? 0 : 1); assert.equal(row.costUsd, 0.01, 'supplier cost stays on record');
      assert.equal(getBalance(a.id), kind === 'final' ? 97 : waived ? 100 : 99);
    }
  });
  await check('A tool call written out as prose (reasoning, tool intent, internal target ids) is never shown as the answer', async () => {
    // Seen on staging: "[Thinking] ... For edit 2 (第二条): targetId = ... [Tool intent] Replace text" was displayed and the run labelled finished.
    const targetId = randomUUID();
    for (const leaked of ['[Thinking] The user wants three fixes.\n[Tool intent] Replace text in paragraph 2', `I will now replace paragraph ${targetId} with the new wording.`, 'Calling doc_apply_edits with the edits.']) {
      const a = user(100), b = agentInput({ agentContext: { runId: randomUUID(), targets: [{ targetId, kind: 'paragraph', text: 'A unique passage for testing.', paragraphIndex: 0 }] } });
      providerReply = async () => sse(leaked);
      const frames = await events(await POST(request(b, a)));
      assert.ok(!frames.some(e => e.event === 'delta' || e.event === 'tool_calls'), leaked);
      assert.equal(frames.find(e => e.event === 'error')?.data.code, 'invalid_tool_call'); assert.ok(!JSON.stringify(frames).includes(leaked.slice(0, 20)));
      assert.equal(getBalance(a.id), 100, 'nothing was delivered, so nothing is charged');
    }
  });
  await check('The waiver cannot yield free output: valid tool calls, agent answers and non-agent replies stay billed', async () => {
    const a = user(100), b = agentInput();
    providerReply = async () => toolSse();
    assert.ok((await events(await POST(request(b, a)))).some(e => e.event === 'tool_calls')); assert.equal(getBalance(a.id), 99);
    const c = user(100), d = agentInput();
    providerReply = async () => sse('Nothing to change.');
    assert.ok((await events(await POST(request(d, c)))).some(e => e.event === 'delta')); assert.equal(getBalance(c.id), 99);
    // Chat text is streamed as it arrives, so a stray tool call there never makes the generation free.
    const e = user(100), f = input();
    providerReply = async () => toolSse();
    const frames = await events(await POST(request(f, e)));
    assert.equal(frames.find(v => v.event === 'error')?.data.code, 'upstream_failed'); assert.equal(frames.find(v => v.event === 'usage')?.data.chargedCents, 1); assert.equal(getBalance(e.id), 99);
  });
  await check('Unknown agent usage withholds tools until receipt reconciliation without replaying generation', async () => {
    const a = user(100), b = agentInput(), before = providerCalls;
    providerReply = async () => toolSse(nativeCall(), { cost: null });
    const frames = await events(await POST(request(b, a)));
    assert.ok(!frames.some(e => e.event === 'tool_calls')); assert.equal(getRequest(a.id, b.requestId)!.state, 'usage_pending');
    db.prepare('UPDATE web_ai_request SET updatedAt=? WHERE userId=? AND requestId=?').run(new Date(Date.now() - 31000).toISOString(), a.id, b.requestId);
    generationReply = id => new Response(JSON.stringify({ data: { id, total_cost: 0.01 } }));
    const row = await (await status(getReq(`/api/web/requests/${b.requestId}`, a), { params: Promise.resolve({ requestId: b.requestId }) })).json();
    assert.equal(row.state, 'settled'); assert.equal(providerCalls, before + 1);
  });
  await check('Detached agent still settles the single bounded generation without delivering tools', async () => {
    const a = user(100), b = agentInput(); let deliver!: (r: Response) => void;
    providerReply = () => new Promise(resolve => { deliver = resolve; });
    const response = await POST(request(b, a));
    assert.equal(response.status, 200, 'Detached agent must start successfully before waiting for its provider');
    await response.body!.cancel();
    const deadline = Date.now() + 2000;
    while (!deliver && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert.ok(deliver, 'Synthetic provider was not invoked within 2 seconds');
    deliver(toolSse());
    for (let i = 0; i < 100 && getRequest(a.id, b.requestId)!.state !== 'settled'; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(getRequest(a.id, b.requestId)!.state, 'settled'); assert.equal(getBalance(a.id), 99);
  });
  await check('Agent whole provider context and quote caps reject before reservation or network', async () => {
    const a = user(100), before = providerCalls, b = agentInput();
    const initialRows = rowCount();
    await errorIs(await POST(request({ ...b, agentBudget: { currency: siteConfig.currency, perGenerationMaxChargeCents: 1 } }, a)), 'price_changed', 409);
    await errorIs(await POST(request({ ...b, agentBudget: { currency: siteConfig.currency, perGenerationMaxChargeCents: b.agentBudget!.perGenerationMaxChargeCents + 1 } }, a)), 'price_changed', 409);
    assert.equal(rowCount(), initialRows);
    assert.equal(db.prepare('SELECT 1 FROM web_ai_agent_run WHERE runId=?').get(b.agentContext!.runId), undefined);
    assert.equal(getBalance(a.id), 100); assert.equal(providerCalls, before);
    await errorIs(await POST(request({ ...b, agentBudget: { currency: 'OTHER', perGenerationMaxChargeCents: 100 } }, a)), 'price_changed', 409);
    const large = agentInput({ agentContext: b.agentContext, agentStep: 3, document: { ...b.document, text: 'd'.repeat(40000) }, agentHistory: [...pair(b, 'c1'), ...pair(b, 'c2'), ...pair(b, 'c3')] });
    for (const entry of large.agentHistory!) if (entry.role === 'tool') { const value = JSON.parse(entry.content); value.result.text = 'r'.repeat(18000); entry.content = JSON.stringify(value); }
    assert.throws(() => validateInput(large), (e: unknown) => e instanceof WebError && e.code === 'input_too_large');
    assert.equal(getBalance(a.id), 100); assert.equal(providerCalls, before);
    const cap = await (await capabilities(getReq('/api/web/capabilities', a))).json();
    assert.equal(cap.agent.maxChargeCents, Math.ceil(AGENT_RESERVE_USD * 100)); assert.equal(cap.agent.maxRunChargeCents, 4 * cap.agent.maxChargeCents); assert.equal(cap.agentEnabled, true);
  });
  await check('Server persists exactly four generation attempts and rejects replay, skip, scope or quote changes atomically', async () => {
    const a = user(1000), other = user(1000), b = agentInput(), before = providerCalls;
    const run = () => db.prepare('SELECT * FROM web_ai_agent_run WHERE runId=?').get(b.agentContext!.runId) as { nextStep: number; totalReservedCents: number; lastRequestId: string };
    providerReply = async () => toolSse();
    await events(await POST(request(b, a)));
    assert.equal(run().nextStep, 1);
    assert.ok(!JSON.stringify(run()).includes(b.message)); assert.ok(!JSON.stringify(run()).includes(b.document.text));
    const rejected = async (candidate: WebInput, owner = a) => {
      const balance = getBalance(owner.id), count = rowCount(), old = JSON.stringify(run()), calls = providerCalls;
      await errorIs(await POST(request(candidate, owner)), 'run_conflict', 409);
      assert.equal(getBalance(owner.id), balance); assert.equal(rowCount(), count); assert.equal(JSON.stringify(run()), old); assert.equal(providerCalls, calls);
    };
    const next = { ...b, requestId: randomUUID(), agentStep: 1, agentHistory: pair(b) };
    await rejected({ ...b, requestId: randomUUID() });
    await rejected({ ...next, agentStep: 2, agentHistory: [...pair(b, 'c1'), ...pair(b, 'c2')] });
    await rejected({ ...next, message: 'New instruction' });
    await rejected({ ...next, language: 'zh' });
    await rejected({ ...next, history: [{ role: 'user', content: 'Different original conversation' }] });
    const differentFile = { ...next, document: { ...b.document, id: randomUUID() } }; differentFile.agentHistory = pair(differentFile);
    await rejected(differentFile); await rejected(next, other);
    await rejected({ ...next, agentBudget: { ...b.agentBudget!, perGenerationMaxChargeCents: b.agentBudget!.perGenerationMaxChargeCents + 1 } });
    // Reopen the database: there is no process-local run counter to reset on restart.
    const persisted = run(); closeDb(); db = getDb(); assert.deepEqual(run(), persisted);
    for (let step = 1; step < 4; step++) {
      const current = { ...b, requestId: randomUUID(), agentStep: step, agentHistory: Array.from({ length: step }, (_, i) => pair(b, `prior-${i}`)).flat() };
      providerReply = async () => step === 3 ? sse('Verified final summary.') : toolSse(nativeCall());
      const frames = await events(await POST(request(current, a)));
      assert.ok(!frames.some(e => e.event === 'error')); assert.equal(run().nextStep, step + 1); assert.equal(run().lastRequestId, current.requestId);
    }
    assert.equal(run().totalReservedCents, 4 * Math.ceil(AGENT_RESERVE_USD * 100)); assert.equal(getBalance(a.id), 996); assert.equal(providerCalls, before + 4);
    await rejected({ ...b, requestId: randomUUID() });
    const fifth = { ...b, requestId: randomUUID(), agentStep: 3, agentHistory: [...pair(b, 'c1'), ...pair(b, 'c2'), ...pair(b, 'c3')] };
    await rejected(fifth);
  });
  await check('Persisted first quote permits lower subsequent server prices without accepting a changed quote', () => {
    const a = user(100), b = agentInput();
    reserveRequest(a.id,b,1,1); markSubmitted(a.id,b.requestId); settleRequest(a.id,b.requestId,0.01);
    const next = { ...b, requestId: randomUUID(), agentStep: 1, agentHistory: pair(b) };
    const lower = reserveRequest(a.id,next,0.5,1);
    assert.equal(lower.reserveCents, Math.ceil(AGENT_RESERVE_USD * 0.5 * 100));
    assert.equal((db.prepare('SELECT perGenerationMaxChargeCents n FROM web_ai_agent_run WHERE runId=?').get(b.agentContext!.runId) as {n:number}).n, b.agentBudget!.perGenerationMaxChargeCents);
    markSubmitted(a.id,next.requestId); settleRequest(a.id,next.requestId,0.01);
  });
  await check('Agent failed spend rolls back run creation; rejected, unknown or expired runs cannot continue', async () => {
    const poor = user(), empty = agentInput(), count = rowCount();
    await errorIs(await POST(request(empty, poor)), 'no_credits', 402);
    assert.equal(db.prepare('SELECT 1 FROM web_ai_agent_run WHERE runId=?').get(empty.agentContext!.runId), undefined); assert.equal(rowCount(), count);
    for (const failure of ['rejected', 'unknown', 'expired']) {
      const a = user(100), b = agentInput(); reserveRequest(a.id, b, 1, 1); markSubmitted(a.id, b.requestId);
      if (failure === 'rejected') releaseRequest(a.id, b.requestId, 'upstream_failed', true);
      else { if (failure === 'unknown') markPending(a.id, b.requestId); settleRequest(a.id, b.requestId, 0.01); }
      if (failure === 'expired') db.prepare('UPDATE web_ai_agent_run SET expiresAt=? WHERE runId=?').run(new Date(Date.now() - 1).toISOString(), b.agentContext!.runId);
      const balance = getBalance(a.id), rows = rowCount(), calls = providerCalls;
      await errorIs(await POST(request({ ...b, requestId: randomUUID(), agentStep: 1, agentHistory: pair(b) }, a)), 'run_closed', 409);
      assert.equal(getBalance(a.id), balance); assert.equal(rowCount(), rows); assert.equal(providerCalls, calls);
    }
  });
  await check('Agent run metadata is tombstoned with settled request ledgers on account deletion', async () => {
    const a = user(), b = agentInput();
    withTransaction(d => grantCredits(d, { userId: a.id, pool: 'reward', amountCents: 100, ledgerKind: 'gift' }));
    reserveRequest(a.id, b, 1, 1); markSubmitted(a.id, b.requestId); settleRequest(a.id, b.requestId, 0.01);
    const before = db.prepare('SELECT * FROM web_ai_agent_run WHERE runId=?').get(b.agentContext!.runId) as Record<string, unknown>;
    const deleted = await deleteAccount(a.id); assert.ok('deletedAt' in deleted);
    assert.deepEqual(db.prepare('SELECT * FROM web_ai_agent_run WHERE runId=?').get(b.agentContext!.runId), { ...before, userId: tombstoneUserId(a.id) });
    assert.equal(db.prepare('SELECT 1 FROM web_ai_agent_run WHERE userId=?').get(a.id), undefined);
  });
  await check('Per-user minute limiter also covers released requests', () => {
    const a = user(100), now = new Date().toISOString();
    for (let i = 0; i < 6; i++) { const b = input(); reserveRequest(a.id, b, 1, 1, now); releaseRequest(a.id, b.requestId, 'synthetic'); }
    assert.throws(() => reserveRequest(a.id, input(), 1, 1, now), (e: unknown) => e instanceof WebError && e.code === 'rate_limited');
    assert.equal(getBalance(a.id), 100);
  });
  await check('Cost above authorized ceiling stays pending and cannot overdraw or refund uncertain work', () => {
    const a = user(100), b = input(), row = reserveRequest(a.id, b, 1, 1);
    markSubmitted(a.id, b.requestId); const result = settleRequest(a.id, b.requestId, 100);
    assert.equal(result.state, 'usage_pending'); assert.equal(result.errorCode, 'cost_cap_exceeded'); assert.equal(result.chargedCents, null); assert.equal(getBalance(a.id), 100 - row.reserveCents);
    assert.throws(() => releaseRequest(a.id, b.requestId, 'timeout'), /uncertain/);
    const other = user(100);
    assert.throws(() => reserveRequest(other.id, input(), 1, 1), (e: unknown) => e instanceof WebError && e.code === 'reconciliation_paused');
    // A corrected provider receipt permits reconciliation without deleting synthetic records.
    assert.equal(settleRequest(a.id, b.requestId, 0.02).state, 'settled');
  });
  await check('Unknown usage refunds once at 15 minutes and globally pauses new requests', async () => {
    assert.equal(RECONCILIATION_DEADLINE_MS, 15 * 60_000);
    const a = user(100), other = user(100), b = validateInput(input()), before = providerCalls;
    const createdMs = Date.now() - RECONCILIATION_DEADLINE_MS - 1000;
    const row = reserveRequest(a.id, b, 1, 1, new Date(createdMs).toISOString());
    markSubmitted(a.id, b.requestId);
    assert.equal(refundUnverified(a.id, b.requestId, new Date(createdMs + RECONCILIATION_DEADLINE_MS - 1).toISOString()).state, 'submitted');
    assert.equal(getBalance(a.id), 100 - row.reserveCents);
    db.prepare('UPDATE web_ai_request SET generationId=?,updatedAt=? WHERE userId=? AND requestId=?').run('gen-overdue', new Date(createdMs).toISOString(), a.id, b.requestId);
    generationReply = () => new Response('{}', { status: 404 });
    const ctx = { params: Promise.resolve({ requestId: b.requestId }) }, url = `/api/web/requests/${b.requestId}`;
    const result = await (await status(getReq(url, a), ctx)).json();
    assert.equal(result.state, 'refunded_pending'); assert.equal(result.chargedCents, 0); assert.equal(result.errorCode, 'refunded_unverified');
    assert.equal(getBalance(a.id), 100);
    refundUnverified(a.id, b.requestId); await status(getReq(url, a), ctx);
    assert.equal(getBalance(a.id), 100);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM wallet_ledger WHERE json_extract(meta,'$.refundOf')=?").get(row.reserveLedgerId) as { n: number }).n, 1);
    await errorIs(await POST(request(b, a)), 'request_exists', 409);
    await errorIs(await POST(request(input(), other)), 'reconciliation_paused', 503);
    const cap = await (await capabilities(getReq('/api/web/capabilities', other))).json();
    assert.equal(cap.aiEnabled, false, 'Capabilities must reflect the global incident pause');
    assert.equal(cap.reason, 'reconciliation_paused');
    assert.equal(getBalance(other.id), 100); assert.equal(providerCalls, before);
    assert.throws(() => settleRequest(a.id, b.requestId, 0.01), /submitted/, 'A late receipt must not silently charge a refunded user');
  });
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}
console.log(`\nWeb AI: ${checked} passed, ${failures.length} failed; all network mocked; isolated cwd ${path.resolve('.')}`);
if (failures.length) process.exitCode = 1;
