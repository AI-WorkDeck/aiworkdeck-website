import { platformProvider } from '../platform-ai/config';
import { retireOpenRouter } from '../platform-ai/billing';
// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '@/lib/db';
import { syncAiQuota, usdFromCents } from '@/lib/ai-quota';
import { getAiConfig } from '@/lib/ai-config';
import { getUserMarginMultiplier } from '@/lib/circle-firms';
import { getSpendableBalance } from '@/lib/credits';
import { errorBody, parseProposal, WebError, type WebInput } from './contract';
import { getRequest, markSubmitted, rememberGeneration, markPending, releaseRequest, settleRequest, receipt, refundUnverified, RECONCILIATION_DEADLINE_MS, type WebRequestRow } from './store';
import { generationCost, ProviderRejected, streamCompletion } from './provider';
import { siteConfig } from '@/lib/site-config';
/** Don't provision a new desktop key just for web. Existing desktop limits must shrink before spending. */
export async function syncExistingQuota(userId:string, strict=false) {
  if(platformProvider()==='bailian'){await retireOpenRouter(userId);return;}
  if(!getDb().prepare('SELECT 1 FROM openrouter_keys WHERE userId=? AND disabledAt IS NULL').get(userId))return;
  const q=await syncAiQuota(userId);
  const {getExchangeRateInfo}=await import('@/lib/ai-config');
  const target=usdFromCents(getSpendableBalance(userId),getExchangeRateInfo().rate,getUserMarginMultiplier(userId));
  if(strict && (!q.configured || !q.hasKey || q.remainingUsd>target+0.005))throw new WebError('quota_sync_failed',503);
}
export async function reconcile(userId:string,requestId:string):Promise<WebRequestRow|undefined> {
  let row=getRequest(userId,requestId); if(!row)return;
  const age=Date.now()-Date.parse(row.updatedAt);
  if(row.state==='reserved' && age>180_000) {releaseRequest(userId,requestId,'quota_sync_failed');return getRequest(userId,requestId);}
  if(row.state==='submitted' && age>180_000) {markPending(userId,requestId);row=getRequest(userId,requestId)!;}
  const overdue=Date.now()-Date.parse(row.createdAt)>=RECONCILIATION_DEADLINE_MS;
  if(row.state!=='usage_pending')return row;
  if(!row.generationId || age<30_000)return overdue?refundUnverified(userId,requestId):row;
  const apiKey=getAiConfig().apiKey; if(!apiKey)return overdue?refundUnverified(userId,requestId):row;
  // Compare-and-set also rate limits concurrent status polling across processes.
  if(!getDb().prepare("UPDATE web_ai_request SET updatedAt=? WHERE userId=? AND requestId=? AND updatedAt=? AND state='usage_pending'").run(new Date().toISOString(),userId,requestId,row.updatedAt).changes)return row;
  try {const cost=await generationCost(apiKey,row.generationId);if(cost!==null){settleRequest(userId,requestId,cost);await syncExistingQuota(userId).catch(()=>undefined);}}catch{/* Unknown usage remains reserved. */}
  return overdue?refundUnverified(userId,requestId):getRequest(userId,requestId);
}
export function responseStream(userId:string,input:WebInput,apiKey:string) {
  const encoder=new TextEncoder(); let detached=false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send=(event:string,value:unknown)=>{if(!detached){try{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));}catch{detached=true;}}};
      const heartbeat=setInterval(()=>{if(!detached){try{controller.enqueue(encoder.encode(': heartbeat\n\n'));}catch{detached=true;}}},10_000);
      void (async()=>{
        try {
          send('start',{requestId:input.requestId});
          try {await syncExistingQuota(userId,true);}catch{releaseRequest(userId,input.requestId,'quota_sync_failed');throw new WebError('quota_sync_failed',503);}
          markSubmitted(userId,input.requestId);
          let generationId:string|undefined;
          const result=await streamCompletion(apiKey,input,{onId:id=>{if(!generationId){generationId=id;rememberGeneration(userId,input.requestId,id);}else if(id!==generationId)throw new WebError('upstream_failed',502);},onDelta:text=>{if(input.mode==='chat')send('delta',{text});}},fetch,getRequest(userId,input.requestId)!.exchangeRate);
          let cost=result.cost;
          if(cost===undefined && generationId){const verified=await generationCost(apiKey,generationId);if(verified!==null)cost=verified;}
          let row:WebRequestRow;
          // An unusable agent tool call delivers nothing: agent mode streams no text and the tool_calls event below is never sent.
          // Only that case is free. Chat text already streamed to the user stays billed.
          const waived=result.invalidTools&&input.mode==='agent';
          if(cost===undefined){markPending(userId,input.requestId);row=getRequest(userId,input.requestId)!;}else row=settleRequest(userId,input.requestId,cost,waived);
          if(row.state==='settled')send('usage',{...receipt(row),currency:siteConfig.currency});
          if(result.invalidTools)throw new WebError(!waived?'upstream_failed':row.state==='settled'?'invalid_tool_call':'usage_pending',502);
          if(!result.complete || (!result.text.trim() && !result.toolCalls.length))throw new WebError('upstream_failed',502);
          if(input.mode==='rewrite')send('proposal',parseProposal(result.text,input));
          if(row.state!=='settled')throw new WebError('usage_pending',503);
          if(input.mode==='agent') {
            if(result.toolCalls.length) send('tool_calls',{requestId:input.requestId,fileId:input.document.id,version:input.document.version,
              calls:result.toolCalls.map(call=>({...call,function:{name:call.function.name,arguments:JSON.parse(call.function.arguments)}})),
              assistant:{role:'assistant',content:result.text || null,tool_calls:result.toolCalls}});
            else send('delta',{text:result.text});
          }
        } catch(e) {
          const row=getRequest(userId,input.requestId)!;
          if(e instanceof ProviderRejected){
            // Internal bounded diagnostic only: never log the response body, key or document.
            console.warn('[web-ai] provider_rejected',{status:e.status,requestId:input.requestId});
            releaseRequest(userId,input.requestId,'upstream_failed',true);send('usage',{...receipt(getRequest(userId,input.requestId)!),currency:siteConfig.currency});}
          else if(row.state==='submitted')markPending(userId,input.requestId);
          const code=e instanceof WebError?e.code:'upstream_failed';
          send('error',errorBody(code,input.language).error);
        } finally {
          await syncExistingQuota(userId).catch(()=>undefined);
          send('done',{requestId:input.requestId});clearInterval(heartbeat);
          if(!detached){try{controller.close();}catch{/* Client disconnected. */}}
        }
      })();
    },
    // Client disconnect does not discard the provider receipt. The bounded upstream request
    // continues to completion and settlement; cancellation is not a promise of zero cost.
    cancel(){detached=true;}
  });
}
