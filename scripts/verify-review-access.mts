// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.ok(!fs.existsSync('data') && !fs.existsSync('package.json'), 'Use a new empty temporary cwd');
process.env.NEXT_PUBLIC_AWD_SITE = 'cn';
Object.assign(process.env,{DASHSCOPE_API_KEY:'synthetic-bailian',BAILIAN_BASE_URL:'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',BAILIAN_AVAILABLE_MODELS_FILE:process.cwd()+'/authorized.json',BAILIAN_AUTHORIZED_MODELS_FILE:process.cwd()+'/authorized.json'});
fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:['qwen3.8-max']}));
process.env.OPENROUTER_PROVISIONING_KEY = 'synthetic-management';
process.env.AWD_KEY_ENCRYPTION_SECRET = 'synthetic-encryption';
globalThis.fetch = async (url) => { assert.ok(String(url).startsWith('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/models')); if(disabled)return new Response('{}',{status:503});return Response.json({success:true,output:{total:1,models:[{model:'qwen3.8-max',capabilities:['TG'],features:['function-calling'],model_info:{context_window:10000,max_output_tokens:1000},inference_metadata:{response_modality:['Text']},prices:[{range_name:'Default',prices:['input_token','output_token'].map(type=>({type,price:1,price_unit:'每百万tokens'}))}]}]}}); };
const { getDb, withTransaction } = await import('@/lib/db');
const service = await import('@/lib/review-access');
const { createUser } = await import('@/lib/users');
const { findUserByApiKey, generateApiKey, revokeApiKey, countActiveKeys } = await import('@/lib/api-keys');
const { subscriptionSnapshot, captureServiceFunding, SUBSCRIPTION_LIMITS } = await import('@/lib/subscription');
const { getSpendableBalance, spendCredits } = await import('@/lib/credits');
const { encryptKeyMaterial, getActiveKeyRow } = await import('@/lib/openrouter-keys');
const mgmt = await import('@/lib/openrouter-mgmt');
const db = getDb();
const now = new Date().toISOString();
const day = (n: number) => new Date(Date.parse(now) + n * 86400000).toISOString();
const proof = { identity: service.REVIEW_IDENTITY, cloudUserId: 15, externalAccountId: null };
let checks = 0;
function ok(name: string, fn: () => void) { fn(); checks++; console.log(`PASS ${name}`); }
function rejected(fn: () => unknown, code: string) {
    assert.throws(fn, (e: unknown) => e instanceof service.ReviewAccessError && e.code === code);
}

const regular = (await createUser({ username: 'ordinary-fixture', email: 'ordinary@example.invalid', password: 'synthetic-password', displayName: 'Ordinary' })).user!;
db.prepare('INSERT INTO pro_payment(outTradeNo,userId,plan,amountCents,periodStart,periodEnd,createdAt) VALUES(?,?,?,?,?,?,?)')
    .run('paid-fixture', regular.id, 'monthly', 14900, now, day(30), now);
db.prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES(?,'pro',?,?,?)")
    .run(regular.id, 'paid-fixture', now, day(30));
subscriptionSnapshot(regular.id);
function paidRows() {
    return ['pro_payment', 'subscription_period', 'entitlements', 'wallet_ledger'].map(table =>
        db.prepare(`SELECT * FROM ${table} WHERE userId=?`).all(regular.id));
}
const paidBefore = paidRows();
ok('ordinary identity and invalid cloud user are rejected before creating a grant', () => {
    rejected(() => service.grantReviewAccess({ ...proof, identity: regular.email }, 'review-test', 'review', now), 'review_identity_mismatch');
    rejected(() => service.grantReviewAccess({ ...proof, cloudUserId: 0 }, 'review-test', 'review', now), 'review_identity_mismatch');
});
const grant = service.grantReviewAccess(proof, 'review-test', 'dev-board#1622 synthetic verification', now);
ok('grant creates three standard 30-day periods and no payment or cash', () => {
    const periods = db.prepare('SELECT * FROM subscription_period WHERE userId=? ORDER BY cycle').all(grant.userId) as any[];
    assert.equal(periods.length, 3);
    for (let i = 0; i < 3; i++) {
        assert.equal(periods[i].startsAt, day(i * 30));
        assert.equal(periods[i].endsAt, day((i + 1) * 30));
        assert.equal(periods[i].monthlyCents, SUBSCRIPTION_LIMITS.monthlyCents);
        assert.equal(periods[i].weeklyCents, SUBSCRIPTION_LIMITS.weeklyCents);
    }
    for (const table of ['orders', 'pro_payment', 'wallet_ledger', 'credit_lots']) {
        assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE userId=?`).get(grant.userId) as any).n, 0);
    }
    assert.equal(getSpendableBalance(grant.userId, now), SUBSCRIPTION_LIMITS.weeklyCents);
});
withTransaction(d => spendCredits(d, { userId: grant.userId, amountCents: 250, ledgerKind: 'service_spend', nowIso: now }));
ok('same ID retries retain dates and consumption, changed payload/owner/binding fail', () => {
    assert.deepEqual(service.grantReviewAccess(proof, grant.grantId, grant.reason, day(1)), grant);
    assert.equal(subscriptionSnapshot(grant.userId, day(1)).weeklyUsedCents, 250);
    rejected(() => service.grantReviewAccess(proof, grant.grantId, 'different reason', now), 'grant_payload_conflict');
    rejected(() => service.readReviewGrant({ ...proof, cloudUserId: 16 }, grant.grantId), 'grant_owner_mismatch');
    rejected(() => service.readReviewGrant({ ...proof, externalAccountId: regular.id }, grant.grantId), 'review_account_mismatch');
    rejected(() => service.grantReviewAccess(proof, 'another-grant', grant.reason, now), 'existing_account_has_history');
});
ok('90-day expiry does not replenish or extend on retry', () => {
    assert.equal(subscriptionSnapshot(grant.userId, day(29)).periodStart, day(0));
    assert.equal(subscriptionSnapshot(grant.userId, day(30)).periodStart, day(30));
    assert.equal(subscriptionSnapshot(grant.userId, day(60)).periodStart, day(60));
    assert.equal(subscriptionSnapshot(grant.userId, day(90)).active, false);
    rejected(() => service.grantReviewAccess(proof, grant.grantId, grant.reason, day(90)), 'grant_not_active');
});

fs.writeFileSync('data/ai-config.json', JSON.stringify({ exchangeRateMode: 'manual', exchangeRate: 1, marginMultiplier: 1 }));
let remoteLimit = 10;
let remoteUsage = 0;
let disabled = false;
let failPatch = false;
mgmt.__setFetchForTests(async (_url, options) => {
    if (options?.method === 'PATCH') {
        if (failPatch) return new Response('{}', { status: 503 });
        const body=JSON.parse(options.body as string);if(body.limit!==undefined)remoteLimit=body.limit;if(body.disabled!==undefined)disabled=body.disabled;
    }
    return Response.json({ data: { hash: 'synthetic-hash', limit: remoteLimit, usage: remoteUsage,
        limit_remaining: Math.max(0, remoteLimit - remoteUsage), disabled } });
});
const tokens = new Map<number, { id: number; name: string; token: string }>();
tokens.set(1, { id: 1, name: 'Existing device', token: 'existing-device' });
let nextToken = 2;
let loseBridgeReply = false;
let failCloudCleanup = false;
let localReady = true;
let lastAccountKey = '';
const cloud: import('@/lib/review-access').CloudRequest = async (_method, route, body, token) => {
    if (route === '/api/auth/awdk-login') {
        const request = body as { key: string; deviceName: string };
        assert.equal(findUserByApiKey(request.key)?.id, grant.userId);
        lastAccountKey = request.key;
        const id = nextToken++;
        const issued = { id, name: request.deviceName, token: `synthetic-device-${id}` };
        tokens.set(id, issued);
        if (!getActiveKeyRow(grant.userId)) db.prepare(`INSERT INTO openrouter_keys(userId,orKeyHash,limitUsd,createdAt,encKey,settledUsageUsd,fundingJson)
            VALUES(?,?,?,?,?,0,?)`).run(grant.userId, 'synthetic-hash', remoteLimit, now,
                encryptKeyMaterial('synthetic-runtime'), JSON.stringify(captureServiceFunding(grant.userId)));
        if (loseBridgeReply) throw new Error('synthetic lost response');
        return { code: 0, data: { userId: grant.cloudUserId, tokenId: id, token: issued.token } };
    }
    if (route === '/api/platform-ai/key/status') return { code: 0, data: { bound: true, available: localReady, usageAvailable: true, remainingUsd: 1 } };
    if (route === '/api/mobile/billing/balance') return { subscription: { active: true, cloudStorageBytes: SUBSCRIPTION_LIMITS.cloudStorageBytes } };
    if (route === '/api/auth/device-tokens') {
        if (failCloudCleanup) throw new Error('synthetic cloud outage');
        return { code: 0, data: { tokens: [...tokens.values()] } };
    }
    if (route.startsWith('/api/auth/device-token/')) {
        if (failCloudCleanup) throw new Error('synthetic cloud outage');
        tokens.delete(Number(route.split('/')[4])); return { code: 0 };
    }
    if (route === '/api/auth/me') return { code: [...tokens.values()].some(t => t.token === token) ? 0 : 4010 };
    throw new Error('Unexpected cloud route');
};
await service.connectReviewAccess(grant, cloud);
ok('real provider check succeeds; temporary account/device keys are revoked separately', () => {
    assert.equal(findUserByApiKey(lastAccountKey), undefined);
    assert.equal(countActiveKeys(grant.userId), 0);
    assert.equal(tokens.size, 1);
    assert.ok(tokens.has(1));
    assert.ok(getActiveKeyRow(grant.userId)?.encKey, 'revoking awdk does not revoke runtime material');
    assert.equal(service.reviewGrantState(grant).connected, true);
});
disabled = true;(await import('@/lib/platform-ai/catalog')).clearCatalogCache();
await assert.rejects(service.connectReviewAccess(grant, cloud), (e: unknown) => e instanceof service.ReviewAccessError && e.code === 'provider_ai_not_ready');
disabled = false;(await import('@/lib/platform-ai/catalog')).clearCatalogCache();
localReady = false;
await assert.rejects(service.connectReviewAccess(grant, cloud), (e: unknown) => e instanceof service.ReviewAccessError && e.code === 'cloud_ai_not_ready');
localReady = true;
loseBridgeReply = true;
await assert.rejects(service.connectReviewAccess(grant, cloud));
loseBridgeReply = false;
ok('provider disabled, swallowed provisioning failure and lost bridge replies leave no temporary key', () => {
    assert.equal(countActiveKeys(grant.userId), 0);
    assert.equal(tokens.size, 1);
});
db.exec(`CREATE TEMP TRIGGER fail_review_key_cleanup BEFORE UPDATE OF revokedAt ON api_keys
    BEGIN SELECT RAISE(FAIL,'synthetic cleanup failure'); END`);
await assert.rejects(service.connectReviewAccess(grant, cloud));
ok('SQLite key cleanup failure still cleans the cloud device credential', () => {
    assert.equal(countActiveKeys(grant.userId), 1);
    assert.equal(tokens.size, 1);
});
db.exec('DROP TRIGGER fail_review_key_cleanup');
await service.connectReviewAccess(grant, cloud);
ok('same grant retry recovers the previously journaled account key', () => {
    assert.equal(countActiveKeys(grant.userId), 0);
    assert.equal(tokens.size, 1);
});
loseBridgeReply = true;
failCloudCleanup = true;
await assert.rejects(service.connectReviewAccess(grant, cloud));
assert.equal(tokens.size, 2);
loseBridgeReply = false;
failCloudCleanup = false;
await service.connectReviewAccess(grant, cloud);
ok('same grant retry recovers the previous invocation after lost response and cloud outage', () => {
    assert.equal(tokens.size, 1);
    assert.equal(countActiveKeys(grant.userId), 0);
    const pending = db.prepare(`SELECT COUNT(*) AS n FROM admin_audit p WHERE p.action='complimentary_review_credentials_pending'
        AND NOT EXISTS(SELECT 1 FROM admin_audit c WHERE c.action='complimentary_review_credentials_cleaned'
        AND json_extract(c.detail,'$.keyId')=json_extract(p.detail,'$.keyId'))`).get() as { n: number };
    assert.equal(pending.n, 0);
});
const reserved = [generateApiKey(grant.userId).key!, generateApiKey(grant.userId).key!, generateApiKey(grant.userId).key!];
await assert.rejects(service.connectReviewAccess(grant, cloud), (e: unknown) => e instanceof service.ReviewAccessError && e.code === 'temporary_key_limit');
ok('full account-key slots never evict existing devices', () => {
    for (const key of reserved) assert.equal(findUserByApiKey(key.plaintextKey)?.id, grant.userId);
});
for (const key of reserved) revokeApiKey(grant.userId, key.info.id);

failPatch = true;
await assert.rejects(service.revokeReviewAccess(proof, grant.grantId, cloud));
ok('failed provider reduction remains explicitly pending; local access is already stopped', () => {
    assert.equal(service.reviewGrantState(grant).revocationPending, true);
    assert.equal(subscriptionSnapshot(grant.userId).active, false);
    assert.equal(service.reviewGrantState(grant).revoked, false);
    assert.equal(remoteLimit, 10);
});
failPatch = false;
await service.revokeReviewAccess(proof, grant.grantId, cloud);
await service.revokeReviewAccess(proof, grant.grantId, cloud);
ok('revoke retries shrink actual provider limit and cannot reopen the grant', () => {
    assert.equal(disabled,true);assert.equal(getActiveKeyRow(grant.userId),undefined);
    assert.equal(service.reviewGrantState(grant).revoked, true);
    rejected(() => service.grantReviewAccess(proof, grant.grantId, grant.reason), 'grant_not_active');
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action='complimentary_review_revoked'").get() as any).n, 1);
});
// A genuine subsequent payment belongs to the user, not to the reviewer operation.
db.prepare('INSERT INTO pro_payment(outTradeNo,userId,plan,amountCents,periodStart,periodEnd,createdAt) VALUES(?,?,?,?,?,?,?)')
    .run('reviewer-later-paid', grant.userId, 'monthly', 14900, now, day(30), now);
db.prepare("UPDATE entitlements SET orderId='reviewer-later-paid',expiresAt=? WHERE userId=? AND feature='pro'").run(day(30), grant.userId);
subscriptionSnapshot(grant.userId);
const genuine = db.prepare("SELECT * FROM subscription_period WHERE outTradeNo='reviewer-later-paid'").all();
await service.revokeReviewAccess(proof, grant.grantId, cloud);
ok('ordinary accounts and later genuine paid periods remain untouched', () => {
    assert.deepEqual(paidRows(), paidBefore);
    assert.deepEqual(db.prepare("SELECT * FROM subscription_period WHERE outTradeNo='reviewer-later-paid'").all(), genuine);
    assert.equal(subscriptionSnapshot(grant.userId).active, true);
    assert.equal((db.prepare("SELECT orderId FROM entitlements WHERE userId=? AND feature='pro'").get(grant.userId) as any).orderId, 'reviewer-later-paid');
});
console.log(`PASS: ${checks} review-access checks; isolated SQLite and mocked cloud/provider, no production or AI calls`);
