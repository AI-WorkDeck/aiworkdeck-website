// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Local operator tool; no request content or credentials are printed. */
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { getDb,withTransaction }=require('../lib/db') as typeof import('../lib/db');
const { recoverPending,retireOpenRouter,requestRow }=require('../lib/platform-ai/billing') as typeof import('../lib/platform-ai/billing');
const [action='list',userId,requestId,reference]=process.argv.slice(2);
if(action.startsWith('skill-'))getDb().prepare("UPDATE skill_ai_request SET state='usage_pending' WHERE state='submitted' AND createdAt<?").run(new Date(Date.now()-15*60_000).toISOString());
if(action==='skill-list') {
  console.log(JSON.stringify(getDb().prepare("SELECT requestId,userId,state,model,costCny,createdAt FROM skill_ai_request WHERE state IN ('submitted','usage_pending') ORDER BY createdAt LIMIT 100").all(),null,2));
} else if(action==='skill-close-incident') {
  if(!userId||!requestId||!reference||reference.length>200)throw new Error('Usage: skill-close-incident USER_ID REQUEST_ID INCIDENT_REFERENCE');
  withTransaction(db=>{
    if(!db.prepare("UPDATE skill_ai_request SET state='platform_absorbed',incidentReference=? WHERE userId=? AND requestId=? AND state='usage_pending'").run(reference,userId,requestId).changes)throw new Error('Pending receipt not found');
    db.prepare('INSERT INTO admin_audit(ts,action,detail) VALUES (?,?,?)').run(new Date().toISOString(),'skill_ai_incident_closed',JSON.stringify({userId,requestId,reference}));
  });
  console.log('Incident closed; unresolved cost absorbed by platform, no retrospective debit.');
} else if(action==='list') {
  console.log(JSON.stringify(getDb().prepare("SELECT userId,requestId,state,model,reserveCents,costCny,chargedCents,errorCode,createdAt FROM platform_ai_request WHERE state IN ('reserved','submitted','usage_pending','refunded_pending') ORDER BY createdAt LIMIT 100").all(),null,2));
} else if(action==='reconcile') {
  recoverPending();
  const users=getDb().prepare('SELECT DISTINCT userId FROM openrouter_keys WHERE id IN (SELECT keyId FROM bailian_retired_key)').all() as {userId:string}[];
  let failed=0;
  for(const row of users)try{await retireOpenRouter(row.userId,true);}catch{failed++;}
  console.log(JSON.stringify({retiredAccounts:users.length,failed}));
} else if(action==='migrate-account') {
  if(!userId)throw new Error('Usage: migrate-account USER_ID');
  await retireOpenRouter(userId,true);console.log('Legacy key disabled and current usage reconciled; historical receipts retained.');
} else if(action==='close-refunded-incident') {
  if(!userId||!requestId||!reference||reference.length>200)throw new Error('Usage: close-refunded-incident USER_ID REQUEST_ID INCIDENT_REFERENCE');
  withTransaction(db=>{
    const row=requestRow(userId,requestId);if(row?.state!=='refunded_pending')throw new Error('Only an already refunded incident may be closed');
    const now=new Date().toISOString();
    db.prepare('INSERT INTO admin_audit(ts,action,detail) VALUES (?,?,?)').run(now,'platform_ai_refunded_incident_closed',JSON.stringify({userId,requestId,reference,reserveCents:row.reserveCents,costCny:row.costCny}));
    db.prepare("UPDATE platform_ai_request SET state='released',errorCode='refunded_incident_closed',updatedAt=? WHERE userId=? AND requestId=?").run(now,userId,requestId);
  });
  console.log('Incident closed with audit reference; no retrospective debit.');
} else throw new Error('Supported actions: list, reconcile, migrate-account, close-refunded-incident');
