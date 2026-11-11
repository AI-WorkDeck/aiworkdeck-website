// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.ok(!fs.existsSync('package.json'),'Run in an isolated empty directory');
process.env.NEXT_PUBLIC_AWD_SITE='intl';process.env.AWD_POSTPAID_ENABLED='true';
process.env.OPENROUTER_PROVISIONING_KEY='synthetic-test';process.env.AWD_KEY_ENCRYPTION_SECRET='synthetic-test';
const {withTransaction,getDb}=await import('../lib/db');
const {acceptPostpaid,registerCreditGrant,cloudState,POSTPAID_VERSION}=await import('../lib/postpaid');
const {getSpendableBalance}=await import('../lib/credits');
const {syncPostpaidOpenRouter}=await import('../lib/postpaid-openrouter');
const mgmt=await import('../lib/openrouter-mgmt');
let limit=0,usage=0,disabled=false,requests=0,fail=false;
mgmt.__setFetchForTests(async (_url,options)=>{
    requests++;const body=options?.body?JSON.parse(String(options.body)):{};
    if(fail&&options?.method==='PATCH')throw new Error('synthetic network outage');
    if(options?.method==='POST'){limit=body.limit;return Response.json({key:'synthetic-runtime-key',data:{hash:'synthetic-hash',limit}});}
    if(options?.method==='PATCH'){if(body.limit!==undefined)limit=body.limit;if(body.disabled!==undefined)disabled=body.disabled;return Response.json({data:{}});}
    return Response.json({data:{hash:'synthetic-hash',limit,usage,disabled}});
});
const now=new Date().toISOString(),end=new Date(Date.now()+86400000).toISOString();
acceptPostpaid('or',POSTPAID_VERSION);
withTransaction(d=>registerCreditGrant(d,'or','grant',1000,now,end));
await syncPostpaidOpenRouter('or');
assert.equal(cloudState('or').billing.reservedCreditCents,250);
assert.equal(getSpendableBalance('or'),750,'external capacity cannot be spent again through gateway');
usage=0.1;
await syncPostpaidOpenRouter('or');
assert.equal(cloudState('or').billing.debtCents,12);
assert.equal(cloudState('or').billing.reservedCreditCents,238);
assert.equal(getSpendableBalance('or'),750);
usage=0.1001;await syncPostpaidOpenRouter('or');assert.equal(cloudState('or').billing.debtCents,13);
usage=0.1002;await syncPostpaidOpenRouter('or');assert.equal(cloudState('or').billing.debtCents,13,'poll frequency cannot round each delta up again');
const before=cloudState('or');await syncPostpaidOpenRouter('or');assert.equal(cloudState('or').billing.debtCents,before.billing.debtCents);
fail=true;await assert.rejects(syncPostpaidOpenRouter('or'));fail=false;
const calls=requests;await assert.rejects(syncPostpaidOpenRouter('or'),/reconciliation_required/);assert.equal(requests,calls,'uncertain provider writes never free or reissue budget');
assert.equal(cloudState('or').billing.reservedCreditCents,237);
console.log('OpenRouter external reservation, true-cost settlement, replay and uncertain-write fail-closed passed');

usage=0;limit=0;disabled=false;
acceptPostpaid('small',POSTPAID_VERSION);
withTransaction(d=>registerCreditGrant(d,'small','grant',3,now,end));
await syncPostpaidOpenRouter('small');
assert.equal(cloudState('small').billing.reservedCreditCents,2);
assert.equal(limit,0.01,'three available cents can authorize the minimum provider cent');
console.log('small prepaid/credit budget reaches provider minimum');
