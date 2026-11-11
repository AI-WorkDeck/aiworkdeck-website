// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Local operator tool, never exposed as an HTTP authentication bypass. */
import { getDb,withTransaction } from '../lib/db';
import { reconcile } from '../lib/web-ai/service';
import { validId } from '../lib/web-ai/contract';
import { getRequest,receipt } from '../lib/web-ai/store';
const [action='list',userId,requestId,reference]=process.argv.slice(2);
if(action==='list') {
  // Metadata only; provider credentials, document body and generated text do not exist here.
  console.log(JSON.stringify(getDb().prepare("SELECT userId,requestId,state,generationId,reserveCents,costUsd,errorCode,createdAt FROM web_ai_request WHERE state IN ('reserved','submitted','usage_pending','refunded_pending') ORDER BY createdAt LIMIT 100").all(),null,2));
} else if(action==='reconcile') {
  if(!userId || !validId(requestId))throw Error('Usage: web-ai-reconcile.mts reconcile USER_ID REQUEST_UUID');
  const row=await reconcile(userId,requestId);if(!row)throw Error('Not found');console.log(JSON.stringify(receipt(row)));
} else if(action==='close-refunded-incident') {
  if(!userId || !validId(requestId)||!reference||reference.length>200)throw Error('Usage: web-ai-reconcile.mts close-refunded-incident USER_ID REQUEST_UUID INCIDENT_REFERENCE');
  withTransaction(db=>{
    const row=getRequest(userId,requestId);if(row?.state!=='refunded_pending')throw Error('Only already-refunded incidents may be acknowledged');
    const now=new Date().toISOString();
    db.prepare('INSERT INTO admin_audit(ts,action,detail) VALUES (?,?,?)').run(now,'web_ai_refunded_incident_closed',JSON.stringify({userId,requestId,reference,reserveCents:row.reserveCents,generationId:row.generationId,usageVerified:row.costUsd!==null}));
    // No speculative cost and no retrospective user charge. The operator owns incident reconciliation.
    db.prepare("UPDATE web_ai_request SET state='released',errorCode='refunded_incident_closed',updatedAt=? WHERE userId=? AND requestId=?").run(now,userId,requestId);
  });
  console.log('Refunded incident acknowledged with audit reference; no user debit.');
} else throw Error('Supported actions: list, reconcile, close-refunded-incident');
