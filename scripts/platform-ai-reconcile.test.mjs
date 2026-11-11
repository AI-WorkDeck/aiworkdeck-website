// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url),Database=require('better-sqlite3');
const cli=path.join(root,'scripts/platform-ai-reconcile.mts'),tsx=path.join(root,'node_modules/tsx/dist/cli.mjs');
const seed=`import {createRequire} from 'node:module';
const require=createRequire(${JSON.stringify(path.join(root,'package.json'))});
const {getDb,withTransaction,closeDb}=require(${JSON.stringify(path.join(root,'lib/db.ts'))});
const {grantCredits}=require(${JSON.stringify(path.join(root,'lib/credits.ts'))});
const {reserveCostCny}=require(${JSON.stringify(path.join(root,'lib/platform-ai/billing.ts'))});
const db=getDb();
for(const id of ['account-a','account-b']){
 withTransaction(d=>grantCredits(d,{userId:id,pool:'topup',amountCents:10000,ledgerKind:'recharge'}));
 db.prepare('INSERT INTO openrouter_keys(userId,orKeyHash,limitUsd,createdAt,settledUsageUsd) VALUES (?,?,?,?,?)').run(id,'hash-'+id,10,new Date().toISOString(),0.01);
 reserveCostCny(id,'request-'+id,{},'synthetic-model',1,{});
}
db.prepare("UPDATE platform_ai_request SET state='refunded_pending' WHERE userId='account-a'").run();
db.prepare("UPDATE platform_ai_request SET createdAt='2000-01-01T00:00:00Z' WHERE userId='account-b'").run();
db.prepare('INSERT INTO skill_ai_request(requestId,userId,state,model,fundingJson,priceJson,margin,createdAt) VALUES (?,?,?,?,?,?,?,?)').run('skill-a','account-a','submitted','synthetic-model','{}','{}',1,'2000-01-01T00:00:00Z');
closeDb();`;
function fixture(t,seeded=true){
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'awd-reconcile-cli-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 const preload=path.join(cwd,'fake-management.cjs');
 fs.writeFileSync(preload,`const fs=require('node:fs'),path=require('node:path');globalThis.fetch=async(resource,init)=>{
  const url=new URL(String(resource));if(url.origin!=='https://openrouter.ai'||!/^\\/api\\/v1\\/keys\\/hash-account-[ab]$/.test(url.pathname))throw Error('Unexpected network blocked');
  const hash=url.pathname.split('/').pop();fs.appendFileSync(path.join(process.cwd(),'management.jsonl'),JSON.stringify({hash,method:init.method,body:init.body?JSON.parse(init.body):null})+'\\n');
  if(hash===process.env.FAIL_MANAGEMENT_HASH)return new Response('{}',{status:503});
  return Response.json({data:{hash,usage:0.03,limit:10,disabled:true}});
 };`);
 const env={PATH:path.dirname(process.execPath)+path.delimiter+'/usr/bin:/bin',HOME:cwd,TMPDIR:cwd,NODE_ENV:'production',NEXT_PUBLIC_AWD_SITE:'cn',OPENROUTER_PROVISIONING_KEY:'synthetic-management-only',NODE_OPTIONS:'--require '+JSON.stringify(preload)};
 const execute=(script,args=[],extra={})=>spawnSync(process.execPath,[tsx,'--tsconfig',path.join(root,'tsconfig.json'),script,...args],{cwd,env:{...env,...extra},encoding:'utf8',timeout:20000});
 const run=(args=[],extra={})=>execute(cli,args,extra);
 const sql=fn=>{const db=new Database(path.join(cwd,'data/awd.db'));try{return fn(db);}finally{db.close();}};
 const calls=()=>fs.existsSync(path.join(cwd,'management.jsonl'))?fs.readFileSync(path.join(cwd,'management.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const snapshot=id=>sql(db=>Object.fromEntries(['openrouter_keys','credit_lots','wallet_ledger','platform_ai_request','skill_ai_request'].map(table=>[table,db.prepare(`SELECT * FROM ${table} WHERE userId=? ORDER BY rowid`).all(id)])));
 const balance=id=>sql(db=>db.prepare('SELECT SUM(remainingCents) n FROM credit_lots WHERE userId=?').get(id).n);
 if(seeded){
  fs.mkdirSync(path.join(cwd,'data'));fs.writeFileSync(path.join(cwd,'data/users.json'),JSON.stringify(['account-a','account-b'].map(id=>({id,username:id,displayName:'Synthetic',passwordHash:'unused',createdAt:new Date().toISOString()}))));
  fs.writeFileSync(path.join(cwd,'data/ai-config.json'),JSON.stringify({exchangeRateMode:'manual',exchangeRate:10,marginMultiplier:1}));
  const source=path.join(cwd,'seed.mts');fs.writeFileSync(source,seed);const result=execute(source);assert.equal(result.status,0,result.stderr);
 }
 return {cwd,run,execute,sql,calls,snapshot,balance};
}
function success(result){assert.equal(result.status,0,result.stderr);return result.stdout;}
test('real business modules load before the original unsupported-action error, without DB or management calls',t=>{
 const f=fixture(t,false);const result=f.run(['__release_import_probe__']);assert.notEqual(result.status,0);assert.match(result.stderr,/Supported actions:/);assert.doesNotMatch(result.stderr,/does not provide an export/);assert.equal(fs.existsSync(path.join(f.cwd,'data')),false);assert.deepEqual(f.calls(),[]);
 const probe=path.join(f.cwd,'types.mts');fs.writeFileSync(probe,`import{createRequire}from'node:module';const r=createRequire(${JSON.stringify(path.join(root,'package.json'))});const d=r(${JSON.stringify(path.join(root,'lib/db.ts'))}),b=r(${JSON.stringify(path.join(root,'lib/platform-ai/billing.ts'))});console.log(JSON.stringify([d.getDb,d.withTransaction,b.retireOpenRouter,b.recoverPending,b.requestRow].map(x=>typeof x)));`);
 assert.deepEqual(JSON.parse(success(f.execute(probe))),Array(5).fill('function'));assert.equal(fs.existsSync(path.join(f.cwd,'data')),false);
});
test('migrate-account changes only the named account; repeated retirement reconciles without another debit',t=>{
 const f=fixture(t),beforeB=f.snapshot('account-b'),balance=f.balance('account-a');success(f.run(['migrate-account','account-a']));assert.deepEqual(f.snapshot('account-b'),beforeB);assert.equal(f.balance('account-a'),balance-20);
 f.sql(db=>{const key=db.prepare("SELECT * FROM openrouter_keys WHERE userId='account-a'").get();assert.ok(key.disabledAt);assert.equal(key.settledUsageUsd,0.03);assert.ok(db.prepare('SELECT lastCheckedAt FROM bailian_retired_key WHERE keyId=?').get(key.id).lastCheckedAt);});
 const ledger=f.sql(db=>db.prepare('SELECT * FROM wallet_ledger ORDER BY id').all());success(f.run(['migrate-account','account-a']));assert.deepEqual(f.sql(db=>db.prepare('SELECT * FROM wallet_ledger ORDER BY id').all()),ledger);assert.deepEqual(f.snapshot('account-b'),beforeB);assert.deepEqual(f.calls().map(c=>[c.hash,c.method]),[['hash-account-a','PATCH'],['hash-account-a','GET'],['hash-account-a','GET']]);
});
test('single-account management failure exits nonzero without continuing to another account',t=>{
 const f=fixture(t),a=f.snapshot('account-a'),b=f.snapshot('account-b');const result=f.run(['migrate-account','account-a'],{FAIL_MANAGEMENT_HASH:'hash-account-a'});assert.notEqual(result.status,0);assert.deepEqual(f.snapshot('account-a'),a);assert.deepEqual(f.snapshot('account-b'),b);assert.deepEqual(f.calls().map(c=>[c.hash,c.method]),[['hash-account-a','PATCH']]);
});
test('default list and missing migrate argument retain existing behavior',t=>{
 const f=fixture(t),a=f.snapshot('account-a'),b=f.snapshot('account-b');const rows=JSON.parse(success(f.run()));assert.deepEqual(new Set(rows.map(r=>r.userId)),new Set(['account-a','account-b']));const bad=f.run(['migrate-account']);assert.notEqual(bad.status,0);assert.match(bad.stderr,/Usage: migrate-account USER_ID/);assert.deepEqual(f.snapshot('account-a'),a);assert.deepEqual(f.snapshot('account-b'),b);assert.deepEqual(f.calls(),[]);
});
test('reconcile retains pending recovery and per-account failure continuation',t=>{
 const f=fixture(t);f.sql(db=>db.exec('INSERT INTO bailian_retired_key(keyId) SELECT id FROM openrouter_keys'));
 const result=JSON.parse(success(f.run(['reconcile'],{FAIL_MANAGEMENT_HASH:'hash-account-a'})));assert.deepEqual(result,{retiredAccounts:2,failed:1});f.sql(db=>{assert.equal(db.prepare("SELECT state FROM platform_ai_request WHERE userId='account-b'").get().state,'released');assert.ok(db.prepare("SELECT disabledAt FROM openrouter_keys WHERE userId='account-b'").get().disabledAt);assert.equal(db.prepare("SELECT disabledAt FROM openrouter_keys WHERE userId='account-a'").get().disabledAt,null);});assert.deepEqual(f.calls().map(c=>[c.hash,c.method]),[['hash-account-a','PATCH'],['hash-account-b','PATCH'],['hash-account-b','GET']]);
});
test('skill-list ages submitted receipts and skill-close records an incident without debit',t=>{
 const f=fixture(t),balance=f.balance('account-a'),beforeB=f.snapshot('account-b');const rows=JSON.parse(success(f.run(['skill-list'])));assert.equal(rows[0].state,'usage_pending');success(f.run(['skill-close-incident','account-a','skill-a','synthetic-incident']));f.sql(db=>{assert.equal(db.prepare("SELECT state FROM skill_ai_request WHERE requestId='skill-a'").get().state,'platform_absorbed');assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE action='skill_ai_incident_closed'").get().n,1);});assert.equal(f.balance('account-a'),balance);assert.deepEqual(f.snapshot('account-b'),beforeB);assert.deepEqual(f.calls(),[]);
});
test('close-refunded-incident preserves balance and rejects another non-refunded receipt',t=>{
 const f=fixture(t),balance=f.balance('account-a'),beforeB=f.snapshot('account-b');success(f.run(['close-refunded-incident','account-a','request-account-a','synthetic-incident']));f.sql(db=>{assert.equal(db.prepare("SELECT state FROM platform_ai_request WHERE userId='account-a'").get().state,'released');assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE action='platform_ai_refunded_incident_closed'").get().n,1);});const result=f.run(['close-refunded-incident','account-b','request-account-b','synthetic-incident']);assert.notEqual(result.status,0);assert.match(result.stderr,/Only an already refunded incident/);assert.equal(f.balance('account-a'),balance);assert.deepEqual(f.snapshot('account-b'),beforeB);assert.deepEqual(f.calls(),[]);
});
