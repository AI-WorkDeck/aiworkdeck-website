// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
assert.ok(!fs.existsSync(path.join(process.cwd(), 'package.json')), 'Run in an isolated empty directory');
const { getDb, withTransaction } = await import('@/lib/db');
const { subscriptionSnapshot, setWalletFallback, provisionSubscriptionPeriods, SUBSCRIPTION_LIMITS } = await import('@/lib/subscription');
const { grantCredits, getBalance, getRefundableCents, getSpendableBalance, spendCredits, refundSpend, InsufficientCreditsError } = await import('@/lib/credits');
const { listEntitlements } = await import('@/lib/purchases');
const db = getDb();
const now = '2026-10-11T00:00:00.000Z';
const day = (n: number) => new Date(Date.parse(now) + n * 86400000).toISOString();
const provision = (user: string, ref: string, start: string, end: string, plan = 'monthly') => {
    db.prepare('INSERT INTO pro_payment(outTradeNo,userId,plan,amountCents,periodStart,periodEnd,createdAt) VALUES (?,?,?,?,?,?,?)').run(ref,user,plan,14900,start,end,now);
    db.prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES (?,'pro',?,?,?) ON CONFLICT(userId,feature) DO UPDATE SET expiresAt=excluded.expiresAt").run(user,ref,now,end);
};
provision('alice','old-paid',now,day(30));
withTransaction(d => grantCredits(d,{userId:'alice',pool:'topup',amountCents:10000,ledgerKind:'recharge',nowIso:now}));
let snap = subscriptionSnapshot('alice',now);
assert.equal(snap.monthlyLimitCents,74500,'Pro grants 745 Credits per 30 days');
assert.equal(snap.weeklyLimitCents,20000,'Pro caps each 7-day window at 200 Credits');
assert.equal(snap.availableCents,SUBSCRIPTION_LIMITS.weeklyCents);
assert.equal(getSpendableBalance('alice',now),snap.availableCents);
assert.equal(getBalance('alice',now),10000);
assert.equal(getRefundableCents('alice',now),10000);
provisionSubscriptionPeriods(db,'alice');
assert.equal((db.prepare('SELECT COUNT(*) AS n FROM subscription_period').get() as any).n,1);
const spent = withTransaction(d => spendCredits(d,{userId:'alice',amountCents:snap.weeklyLimitCents,ledgerKind:'service_spend',nowIso:now,meta:{service:'ocr'}}));
assert.equal(spent.amountCents,0);
assert.equal(spent.meta?.subscriptionCents,snap.weeklyLimitCents);
assert.equal(getBalance('alice',now),10000);
assert.throws(() => withTransaction(d => spendCredits(d,{userId:'alice',amountCents:1,ledgerKind:'ai_alloc',nowIso:now})),InsufficientCreditsError);
assert.equal(subscriptionSnapshot('alice',day(7)).weeklyUsedCents,0);
assert.equal(subscriptionSnapshot('alice',day(7)).monthlyUsedCents,snap.weeklyLimitCents);
// Refund restores the original week even after the weekly reset; it cannot become cash or fresh-week credit.
const refund = withTransaction(d => refundSpend(d,spent.id,{nowIso:day(7)}));
assert.equal(refund.amountCents,0);
assert.equal(withTransaction(d => refundSpend(d,spent.id,{nowIso:day(7)})).id,refund.id);
assert.equal(subscriptionSnapshot('alice',day(7)).weeklyUsedCents,0);
assert.equal(subscriptionSnapshot('alice',day(7)).monthlyUsedCents,0);
setWalletFallback('alice',true);
const mixed = withTransaction(d => spendCredits(d,{userId:'alice',amountCents:snap.weeklyLimitCents+1000,ledgerKind:'ai_alloc',nowIso:now}));
assert.equal(mixed.amountCents,-1000);
assert.equal(getBalance('alice',now),9000);
withTransaction(d => refundSpend(d,mixed.id,{nowIso:now}));
assert.equal(getBalance('alice',now),10000);
// A plugin purchase never spends subscription allowance.
const purchase = withTransaction(d => spendCredits(d,{userId:'alice',amountCents:1000,ledgerKind:'purchase',nowIso:now}));
assert.equal(purchase.amountCents,-1000);
assert.equal(subscriptionSnapshot('alice',now).monthlyUsedCents,0);
// Pre-renewals cannot be consumed early; old paid rows are lazily, idempotently repaired.
provision('alice','renewal',day(30),day(60));
assert.equal(subscriptionSnapshot('alice',now).periodEnd,day(30));
assert.equal(subscriptionSnapshot('alice',day(30)).periodStart,day(30));
assert.equal(subscriptionSnapshot('alice',day(60)).active,false);
provision('yearly','annual',now,day(365),'yearly');
subscriptionSnapshot('yearly',now);
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM subscription_period WHERE userId='yearly'").get() as any).n,12);
assert.equal(subscriptionSnapshot('yearly',day(364)).active,true);
assert.equal(subscriptionSnapshot('yearly',day(365)).active,false);
// A separately purchased permanent entitlement survives the subscription's expiration.
db.prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt) VALUES ('alice','clipboard.unlimited','permanent',?)").run(now);
const features = listEntitlements('alice');
assert.equal(features.find(e=>e.feature==='clipboard.unlimited')?.expiresAt,null);
assert.ok(features.some(e=>e.feature==='cloud.storage.3gb'));
assert.equal(getBalance('alice',now),9000);
// Period and week limits both constrain spend, regardless of wallet opt-in.
setWalletFallback('alice',false);
for (const [n, available] of [[0,20000],[7,20000],[14,20000],[21,14500]]) {
    const state = subscriptionSnapshot('alice',day(n));
    assert.equal(state.availableCents,available,'availability is bounded by both the 200-Credit week and 745-Credit period');
    if (state.availableCents) withTransaction(d=>spendCredits(d,{userId:'alice',amountCents:state.availableCents,ledgerKind:'ai_alloc',nowIso:day(n)}));
}
assert.equal(subscriptionSnapshot('alice',day(28)).availableCents,0);
assert.equal(subscriptionSnapshot('alice',day(28)).monthlyUsedCents,SUBSCRIPTION_LIMITS.monthlyCents);
console.log('PASS: independent wallet/allowance, hard week/month gate, opt-in, refund idempotency, old payment repair, renewal/yearly, permanent entitlement');

// OpenRouter is a mocked management boundary: no live credentials or paid calls.
process.env.OPENROUTER_PROVISIONING_KEY = 'test-provisioning';
process.env.AWD_KEY_ENCRYPTION_SECRET = 'test-encryption';
fs.writeFileSync(path.join(process.cwd(),'data','ai-config.json'),JSON.stringify({exchangeRateMode:'manual',exchangeRate:1,marginMultiplier:1}));
const mgmt = await import('@/lib/openrouter-mgmt');
const { syncAiQuota, getAiSpendableBalance } = await import('@/lib/ai-quota');
const current = new Date().toISOString();
provision('ai','ai-paid',current,new Date(Date.now()+30*86400000).toISOString());
withTransaction(d=>grantCredits(d,{userId:'ai',pool:'topup',amountCents:10000,ledgerKind:'recharge'}));
const expired = new Date(Date.now()-1000).toISOString();
if ((await import('@/lib/site-config')).SITE_ID === 'intl') {
let remoteLimit = 0;
let remoteUsage = 0;
let patchFails = false;
mgmt.__setFetchForTests(async (_url, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (options?.method === 'POST') { remoteLimit=body.limit; return Response.json({key:'test-runtime',data:{hash:'test-hash',limit:remoteLimit}}); }
    if (options?.method === 'PATCH') {
        if (patchFails) return Response.json({error:{message:'unavailable'}},{status:503});
        remoteLimit=body.limit;
    }
    return Response.json({data:{hash:'test-hash',limit:remoteLimit,usage:remoteUsage,disabled:false}});
});
let quota = await syncAiQuota('ai');
assert.equal(quota.creditsCents,SUBSCRIPTION_LIMITS.weeklyCents);
assert.equal(remoteLimit,SUBSCRIPTION_LIMITS.weeklyCents/100,'wallet must not expand key without consent');
remoteUsage=1;
await Promise.all([syncAiQuota('ai'),syncAiQuota('ai')]);
assert.equal(subscriptionSnapshot('ai').monthlyUsedCents,100,'concurrent reads settle once');
assert.equal(getBalance('ai'),10000);
setWalletFallback('ai',true);
await syncAiQuota('ai');
assert.equal(remoteLimit,(SUBSCRIPTION_LIMITS.weeklyCents+10000)/100);
setWalletFallback('ai',false);
patchFails=true;
await assert.rejects(syncAiQuota('ai'),'failed lowering is not reported as success');
patchFails=false;
await syncAiQuota('ai');
assert.equal(remoteLimit,SUBSCRIPTION_LIMITS.weeklyCents/100);
// Usage authorized before expiry must settle the original allowance, and polling must not unlock cash.
remoteUsage = 2;
db.prepare("UPDATE subscription_period SET endsAt=? WHERE userId='ai'").run(expired);
db.prepare("UPDATE entitlements SET expiresAt=? WHERE userId='ai' AND feature='pro'").run(expired);
quota = await syncAiQuota('ai');
assert.equal(getBalance('ai'),10000);
assert.equal(quota.creditsCents,0);
assert.equal(remoteLimit,remoteUsage);
await syncAiQuota('ai');
assert.equal(remoteLimit,remoteUsage,'repeated background polling must not authorize wallet');
setWalletFallback('ai',true);
quota = await syncAiQuota('ai');
assert.equal(quota.creditsCents,10000,'explicit opt-in permits wallet after expiry');
setWalletFallback('ai',false);
patchFails=true;
await assert.rejects(syncAiQuota('ai'),'revoking wallet after expiry must report failed lowering');
assert.equal(getAiSpendableBalance('ai'),0,'degraded balance cannot advertise unconsented wallet');
patchFails=false;
quota = await syncAiQuota('ai');
assert.equal(quota.creditsCents,0);
assert.equal(remoteLimit,remoteUsage,'revoking a previously enabled wallet after expiry lowers the key');
remoteUsage=3;
await syncAiQuota('ai');
assert.equal(getBalance('ai'),10000,'late overrun after revocation never charges wallet');
mgmt.__setFetchForTests(null);
console.log('PASS: AI key capped to consented budget, usage charged once under concurrent sync, lowering failure is visible');
} else {
  const {domesticQuota}=await import('@/lib/platform-ai/billing');
  assert.equal(domesticQuota('ai').creditsCents,SUBSCRIPTION_LIMITS.weeklyCents);
  setWalletFallback('ai',true);assert.equal(domesticQuota('ai').creditsCents,SUBSCRIPTION_LIMITS.weeklyCents+10000);
  setWalletFallback('ai',false);db.prepare("UPDATE subscription_period SET endsAt=? WHERE userId='ai'").run(expired);
  db.prepare("UPDATE entitlements SET expiresAt=? WHERE userId='ai' AND feature='pro'").run(expired);
  assert.equal(domesticQuota('ai').creditsCents,0);setWalletFallback('ai',true);assert.equal(domesticQuota('ai').creditsCents,10000);
  console.log('PASS: Bailian budget respects subscription allowance, consent and expiry');
}


delete process.env.OPENROUTER_PROVISIONING_KEY;
const { openHold, settleHold, releaseHold, pendingHoldCents } = await import('@/lib/gateway/spend');
provision('asr','asr-paid',current,new Date(Date.now()+30*86400000).toISOString());
const pricing = { service:'asr',op:'transcribe',unit:'minute',costCentsPerUnit:100,marginMultiplier:1,creditsPerUnit:100,maxUnitsPerCall:100,enabled:true,updatedAt:current } as const;
openHold({userId:'asr',taskId:'asr-test',pricing,estimatedUnits:10,nowMs:Date.now()});
assert.equal(pendingHoldCents('asr'),1000);
assert.equal(subscriptionSnapshot('asr').monthlyUsedCents,1000);
settleHold('asr-test',4,pricing);
assert.equal(pendingHoldCents('asr'),0);
assert.equal(subscriptionSnapshot('asr').monthlyUsedCents,400);
assert.equal(getBalance('asr'),0);
openHold({userId:'asr',taskId:'asr-fail',pricing,estimatedUnits:5,nowMs:Date.now()});
releaseHold('asr-fail','upstream-failed');
releaseHold('asr-fail','retry');
assert.equal(subscriptionSnapshot('asr').monthlyUsedCents,400);
console.log('PASS: ASR allowance holds, true-cost settlement, failure release and repeat refund');

// In-flight services retain their original week/period even when completed after the boundary.
const { assertBalanceFor, chargeAfterSuccess } = await import('@/lib/gateway/spend');
for (const boundary of ['week','period','expiry']) {
    const user = `boundary-${boundary}`;
    provision(user,`${user}-paid`,current,new Date(Date.now()+30*86400000).toISOString());
    withTransaction(d=>grantCredits(d,{userId:user,pool:'topup',amountCents:10000,ledgerKind:'recharge'}));
    const authorization = assertBalanceFor(user,1000);
    openHold({userId:user,taskId:user,pricing,estimatedUnits:10,nowMs:Date.now()});
    const oldPeriod = subscriptionSnapshot(user).periodId!;
    if (boundary === 'week') {
        // Moving the anchor simulates entering another week without changing the original authorization.
        db.prepare('UPDATE subscription_period SET startsAt=? WHERE id=?').run(new Date(Date.now()-8*86400000).toISOString(),oldPeriod);
    } else {
        db.prepare('UPDATE subscription_period SET endsAt=? WHERE id=?').run(expired,oldPeriod);
        if (boundary === 'period') provision(user,`${user}-renewal`,current,new Date(Date.now()+30*86400000).toISOString());
        else db.prepare("UPDATE entitlements SET expiresAt=? WHERE userId=? AND feature='pro'").run(expired,user);
    }
    settleHold(user,4,pricing);
    chargeAfterSuccess({userId:user,pricing,actualUnits:2,funding:authorization});
    assert.equal(getBalance(user),10000,`${boundary}: no implicit cash spending`);
    const charged = db.prepare('SELECT SUM(amountCents) n FROM subscription_usage WHERE periodId=? AND weekStart=?').get(oldPeriod,authorization.weekStart) as {n:number};
    assert.equal(charged.n,600,`${boundary}: service bills the originally authorized period/week`);
    assert.equal(subscriptionSnapshot(user).weeklyUsedCents,0,`${boundary}: new allowance is untouched`);
}
console.log('PASS: AI expiry cannot authorize wallet; async and synchronous services retain original funding across week, period and expiry');
