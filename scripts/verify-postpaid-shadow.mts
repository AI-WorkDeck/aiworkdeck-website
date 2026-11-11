// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Unaccepted accounts keep subscription access; shadow metering never touches money, access or cases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
assert.ok(!fs.existsSync('data')&&!fs.existsSync('package.json'),'Use a fresh empty directory');
fs.mkdirSync('data');fs.writeFileSync('data/users.json',JSON.stringify(['sub','free','acc','shadow-free','shadow-sub'].map(id=>({id,username:id,displayName:'Synthetic',passwordHash:'unused',createdAt:new Date().toISOString()}))));
process.env.AWD_MOBILE_BILLING_SECRET='synthetic-internal';
process.env.AWD_POSTPAID_ENABLED='true';
const {getDb,withTransaction,closeDb}=await import('../lib/db');
const {cloudState,acceptPostpaid,registerCreditGrant,POSTPAID_VERSION}=await import('../lib/postpaid');
const {recordShadowStorage,recordShadowEgress,recordShadowUnmapped}=await import('../lib/postpaid-shadow');
const {NextRequest}=await import('next/server');
const {POST}=await import('../app/api/internal/account/route');
const db=getDb();
const intlSite=process.env.NEXT_PUBLIC_AWD_SITE==='intl',siteId=intlSite?'intl':'cn',otherSite=intlSite?'cn':'intl';
// Expected would-be cents: storage 4 GiB x 30 days, 1 billable GiB-month, 1 GiB and 0.5 GiB of egress.
const [free4,sub1,egress1,egressHalf]=intlSite?[12,3,15,7]:[80,20,60,30];
const now=new Date().toISOString(),at=(h:number)=>new Date(Date.parse(now)+h*3600000).toISOString();
const provision=(user:string,start:string,end:string)=>{
 db.prepare('INSERT INTO pro_payment(outTradeNo,userId,plan,amountCents,periodStart,periodEnd,createdAt) VALUES(?,?,?,?,?,?,?)').run(user,user,'monthly',14900,start,end,start);
 db.prepare('INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES(?,?,?,?,?)').run(user,'pro',user,start,end);
};

// Task A: the postpaid switch on, policy not accepted => exactly the subscription rules.
provision('sub',at(-1),at(720));
let s=cloudState('sub');
assert.equal(s.billing.accepted,false);
assert.equal(s.cloudAccess.canWrite,true,'unaccepted subscriber keeps cloud writes');
assert.equal(s.cloudAccess.canUse,true);assert.equal(s.cloudAccess.canRead,true);
assert.equal(s.cloudAccess.includedStorageBytes,3*1024**3);
s=cloudState('free');
assert.deepEqual([s.cloudAccess.canWrite,s.cloudAccess.canUse,s.cloudAccess.canRead],[false,false,false],'unaccepted free user: same as switch off (no cloud quota)');
assert.equal(s.cloudAccess.reason,'policy_required');
assert.equal(s.billing.creditLimitCents,0,'no credit, so no postpaid debt can accrue');
// Accepted user keeps postpaid behaviour: wallet/credit decide access, not subscription.
acceptPostpaid('acc',POSTPAID_VERSION,now);
assert.equal(cloudState('acc').cloudAccess.canWrite,false,'accepted, zero funds');
withTransaction(d=>registerCreditGrant(d,'acc','g',100,now,at(720)));
assert.equal(cloudState('acc').cloudAccess.canWrite,true,'accepted with credit');
console.log('unaccepted subscriber/free and accepted access rules passed');

// Task B: shadow ledger.
assert.throws(()=>recordShadowStorage('shadow-free',{eventId:'x',observedAt:now,storedBytes:'1'},now),/postpaid_shadow_disabled/,'default off');
process.env.AWD_POSTPAID_SHADOW_ENABLED='true';
const money=()=>[db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get(),db.prepare('SELECT COUNT(*) n FROM postpaid_debt').get(),db.prepare('SELECT COUNT(*) n FROM postpaid_case').get(),db.prepare('SELECT COUNT(*) n FROM credit_lots').get(),db.prepare('SELECT COUNT(*) n FROM subscription_usage').get(),db.prepare('SELECT COUNT(*) n FROM postpaid_policy').get(),db.prepare('SELECT COUNT(*) n FROM postpaid_meter').get()];
const before=money(),accessBefore=JSON.stringify(cloudState('shadow-free',now).cloudAccess);
const fourGiB=String(4*1024**3);
assert.equal(recordShadowStorage('shadow-free',{eventId:'f0',observedAt:now,storedBytes:fourGiB},now).wouldChargeCents,0,'first reading is a baseline');
assert.equal(recordShadowStorage('shadow-free',{eventId:'f1',observedAt:at(720),storedBytes:fourGiB},at(720)).wouldChargeCents,free4,'4 GiB x 30 days');
assert.equal(recordShadowStorage('shadow-free',{eventId:'f1',observedAt:at(720),storedBytes:fourGiB},at(720)).recorded,false,'idempotent replay');
assert.throws(()=>recordShadowStorage('shadow-free',{eventId:'f1',observedAt:at(720),storedBytes:'1'},at(720)),/usage_event_conflict/);
provision('shadow-sub',at(-1),at(800));
recordShadowStorage('shadow-sub',{eventId:'s0',observedAt:now,storedBytes:fourGiB},now);
assert.equal(recordShadowStorage('shadow-sub',{eventId:'s1',observedAt:at(720),storedBytes:fourGiB},at(720)).wouldChargeCents,sub1,'3 GiB included, 1 GiB billable');
assert.equal(recordShadowStorage('shadow-free',{eventId:'neg',observedAt:at(721),storedBytes:'-5'},at(721)).anomaly,'negative_reading');
assert.equal(recordShadowStorage('shadow-free',{eventId:'old',observedAt:at(1),storedBytes:'5'},at(721)).anomaly,'out_of_order');
assert.equal(recordShadowEgress('shadow-free',{eventId:'e1',observedAt:at(1),bytes:String(1024**3),completed:true},at(2)).wouldChargeCents,egress1);
assert.equal(recordShadowEgress('shadow-free',{eventId:'e2',observedAt:at(1),bytes:String(1024**3/2)},at(2)).wouldChargeCents,egressHalf);
// Live precedence: an accepted account is billed live, so shadow never records it.
assert.equal(recordShadowStorage('acc',{eventId:'a0',observedAt:now,storedBytes:fourGiB},now).skipped,'live');
assert.equal(recordShadowEgress('acc',{eventId:'a1',observedAt:now,bytes:'5'},now).skipped,'live');
assert.equal((db.prepare("SELECT COUNT(*) n FROM postpaid_shadow_event WHERE userId='acc'").get() as {n:number}).n,0);
recordShadowUnmapped({observedAt:at(2),users:2,bytes:'2048',sample:[11,12]},at(2));
assert.deepEqual(money(),before,'shadow never writes ledger, debt, cases, lots, allowance usage, policy or live meters');
assert.equal(JSON.stringify(cloudState('shadow-free',now).cloudAccess),accessBefore,'shadow never changes access');
// Internal API wiring.
const internal=(body:object)=>POST(new NextRequest('http://localhost/api/internal/account',{method:'POST',headers:{'Content-Type':'application/json','X-Internal-Secret':'synthetic-internal'},body:JSON.stringify(body)}));
let r=await internal({action:'shadow-egress',accountId:'shadow-sub',eventId:'api-e',observedAt:at(3),bytes:'100'});assert.equal(r.status,200);assert.equal((await r.json()).recorded,true);
assert.equal((await internal({action:'shadow-storage',accountId:'shadow-sub',eventId:'bad',observedAt:'bad',storedBytes:'1'})).status,409);
assert.equal((await internal({action:'shadow-unmapped',observedAt:at(3),users:1,bytes:'10',sample:[11]})).status,200);
process.env.AWD_POSTPAID_SHADOW_ENABLED='false';
assert.equal((await internal({action:'shadow-egress',accountId:'shadow-sub',eventId:'off',observedAt:at(3),bytes:'1'})).status,409);
console.log('shadow ledger, anomalies, live precedence and isolation passed');

// Reconciliation script: reports, and opens the database strictly read-only.
db.pragma('wal_checkpoint(TRUNCATE)');closeDb();
const hash=(f:string)=>fs.existsSync(f)?crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;
const files=['data/awd.db'],hashes=files.map(hash);
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'postpaid-shadow-reconcile.mts');
const out=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--no-warnings',script,'--db','data/awd.db','--site',siteId,'--to',at(721)],{encoding:'utf8',env:{...process.env,NODE_PATH:path.join(path.dirname(script),'..','node_modules')}}));
assert.deepEqual(files.map(hash),hashes,'reconciliation writes nothing');
// SQLite may create an empty WAL index for a read-only reader of a WAL database; it must hold no frames.
assert.ok(!fs.existsSync('data/awd.db-wal')||fs.statSync('data/awd.db-wal').size===0);
const user=(id:string)=>out.users.find((u:{userId:string})=>u.userId===id);
assert.equal(user('shadow-free').storage.wouldChargeCents,free4);assert.equal(user('shadow-free').egress.wouldChargeCents,egress1+egressHalf);
assert.equal(user('shadow-free').owedCents,free4+egress1+egressHalf);assert.equal(user('shadow-free').overLimit,true,'no allowance, wallet or credit');
assert.equal(user('shadow-sub').storage.includedGibDays,90);assert.equal(user('shadow-sub').storage.billableGibDays,30);
assert.equal(user('shadow-sub').entitlements.monthlyAllowanceCents,74500);assert.equal(user('shadow-sub').covered.fromAllowance,sub1);assert.equal(user('shadow-sub').owedCents,0);
assert.equal(user('acc'),undefined);
assert.equal(out.anomalyCounts.negative_reading,1);assert.equal(out.anomalyCounts.out_of_order,1);assert.equal(out.anomalyCounts.gap,2);
assert.equal(out.anomalyCounts.unmapped_cloud_users,1);assert.equal(out.checks.noReadingAnomalies,false);assert.equal(out.checks.coverageAtLeast7Days,true);
assert.equal(out.checks.noCurrencyMismatch,true);
const intl=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--no-warnings',script,'--db','data/awd.db','--site',otherSite,'--to',at(721)],{encoding:'utf8'}));
assert.equal(intl.checks.noCurrencyMismatch,false,'events in another site currency are flagged');
assert.throws(()=>execFileSync(process.execPath,['--experimental-strip-types','--no-warnings',script,'--db','data/missing.db'],{stdio:'pipe'}),'never creates a database');
assert.ok(!fs.existsSync('data/missing.db'));
console.log('read-only reconciliation report passed');
