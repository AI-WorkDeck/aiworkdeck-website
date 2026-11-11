// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import type { UpstreamRequest, UpstreamResult } from '../ai-stream';
import { bailianConfig } from './config';
import { platformModels, usageCostCny } from './catalog';
import { validateChat } from './proxy';
import { getDb, withTransaction } from '../db';
import { captureServiceFunding } from '../subscription';
import { getUserMarginMultiplier } from '../circle-firms';
import { settleAiUsage, type AiUsageSettleResult } from '../ai-usage';
/** Skill remains free when the allowance is insufficient. Its receipt is tracked independently of paid reservations. */
export async function connectBailianSkill(req:UpstreamRequest,service:string):Promise<UpstreamResult> {
  if(!req.userId)return {ok:false,error:'ai_upstream_error'};
  const userId=req.userId,id=randomUUID();
  try {
    const model=(await platformModels()).find(m=>m.id===req.model);
    if(!model)throw new Error('model_unavailable');
    const {body}=validateChat({model:req.model,messages:req.messages,max_tokens:req.maxTokens,temperature:req.temperature,stream:true,enable_thinking:false},model);
    const createdAt=new Date().toISOString(),funding=captureServiceFunding(userId),margin=getUserMarginMultiplier(userId);
    withTransaction(db=>{
      // Accepted requests without a receipt remain visible and pause new free calls until an operator resolves them.
      db.prepare("UPDATE skill_ai_request SET state='usage_pending' WHERE state='submitted' AND createdAt<?").run(new Date(Date.now()-15*60_000).toISOString());
      if(db.prepare("SELECT 1 FROM skill_ai_request WHERE state='usage_pending' LIMIT 1").get())throw new Error('usage_pending');
      const total=db.prepare("SELECT COUNT(*) n FROM skill_ai_request WHERE state='submitted'").get() as {n:number};
      const own=db.prepare("SELECT COUNT(*) n FROM skill_ai_request WHERE state='submitted' AND userId=?").get(userId) as {n:number};
      if(total.n>=32||own.n>=4)throw new Error('busy');
      db.prepare("INSERT INTO skill_ai_request(requestId,userId,state,model,fundingJson,priceJson,margin,createdAt) VALUES (?,?,'submitted',?,?,?,?,?)")
        .run(id,userId,model.id,JSON.stringify(funding),JSON.stringify(model),margin,createdAt);
    });
    const config=bailianConfig();
    const markPending=()=>getDb().prepare("UPDATE skill_ai_request SET state='usage_pending' WHERE requestId=? AND state='submitted'").run(id);
    let response:Response;
    try {response=await fetch(`${config.baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(req.timeoutMs),redirect:'error'});}
    catch(e){markPending();throw e;}
    if(!response.ok||!response.body){await response.body?.cancel();getDb().prepare('UPDATE skill_ai_request SET state=? WHERE requestId=?').run([400,401,402,403,404,413,422,429].includes(response.status)?'released':'usage_pending',id);throw new Error(response.status===429?'busy':'upstream_failed');}
    let bill:AiUsageSettleResult|undefined,detached=false;
    const encoder=new TextEncoder();
    const stream=new ReadableStream<Uint8Array>({start(controller){
      const send=(s:string)=>{if(!detached)try{controller.enqueue(encoder.encode(s));}catch{detached=true;}};
      const heartbeat=setInterval(()=>send(': heartbeat\n\n'),10_000);
      void(async()=>{
        const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',bytes=0,usage:any,done=false;
        const consume=(line:string)=>{if(line.startsWith('data:')){const payload=line.slice(5).trim();if(payload==='[DONE]'){done=true;return;}if(payload){const data=JSON.parse(payload);if(data.error)throw new Error('upstream_failed');if(data.usage)usage=data.usage;}}send(line+'\n');};
        try {
          while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>32_000_000)throw new Error('upstream_failed');buffer+=decoder.decode(chunk.value,{stream:true});let at;while((at=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,at).replace(/\r$/,''));buffer=buffer.slice(at+1);}}
          buffer+=decoder.decode();if(buffer.trim())consume(buffer.trim());if(!done||!usage)throw new Error('usage_pending');
          const cost=usageCostCny(model,usage,body.enable_thinking===true,createdAt);
          bill=withTransaction(db=>{
            const row=db.prepare('SELECT state,resultJson FROM skill_ai_request WHERE requestId=?').get(id) as {state:string;resultJson:string|null};
            if(row.state==='settled')return JSON.parse(row.resultJson!);
            const result=settleAiUsage({userId,funding,costUsd:0,costCny:cost,marginMultiplier:margin,nowIso:createdAt,model:model.id,service:service==='skill-chat'?'skill_chat':'skill_draft'});
            db.prepare("UPDATE skill_ai_request SET state='settled',usageJson=?,costCny=?,resultJson=? WHERE requestId=?").run(JSON.stringify(usage),cost,JSON.stringify(result),id);return result;
          });
          send('data: [DONE]\n\n');
        }catch{markPending();send('data: {"error":{"code":"usage_pending"}}\n\ndata: [DONE]\n\n');}
        finally{clearInterval(heartbeat);await reader.cancel().catch(()=>undefined);reader.releaseLock();if(!detached)try{controller.close();}catch{/* detached */}}
      })();
    },cancel(){detached=true;}});
    return {ok:true,res:new Response(stream,{headers:{'Content-Type':'text/event-stream','X-AWD-Request-Id':id}}),abort:()=>{/* Keep bounded receipt reader alive. */},billing:()=>{if(!bill)throw new Error('usage_pending');return bill;}};
  }catch(e){return {ok:false,error:e instanceof Error&&e.message==='busy'?'ai_busy':e instanceof Error&&e.message==='usage_pending'?'ai_usage_pending':'ai_upstream_error'};}
}
