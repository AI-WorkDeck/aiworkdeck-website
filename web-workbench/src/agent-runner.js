// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {AGENT_LIMITS,validateAgentContext,validateToolCall,validateToolResult} from './agent-contract.js';
import {streamChat} from './chat.js';

const RETRYABLE_STREAM_CODES=new Set(['invalid_tool_call','upstream_failed','rate_limited','busy']);
const RETRYABLE_TOOL_CODES=new Set(['STALE_TARGET','OVERLAPPING_TARGETS','INVALID_TARGET_KIND','EMPTY_FORMAT_TARGET','EMPTY_SEARCH','STALE_TABLE_CELL','ORIGINAL_TEXT_MISMATCH']);

function invalid(){return Error('INVALID_AI_RESPONSE')}
function summarizeCharges(record,currency){
 const receipts=record.requests.map(request=>request.receipt);
 if(!receipts.some(r=>r?.state==='settled')||receipts.some(r=>!(r?.state==='settled'&&Number.isSafeInteger(r.chargedCents)&&r.chargedCents>=0)&&!(r?.state==='released'&&r.chargedCents===0))){
  delete record.chargedCents;record.chargeStatus='unknown';record.currency=currency;return null;
 }
 const total=receipts.reduce((sum,r)=>sum+r.chargedCents,0);
 if(!Number.isSafeInteger(total)){delete record.chargedCents;record.chargeStatus='unknown';record.currency=currency;return null}
 record.chargedCents=total;record.chargeStatus='settled';record.currency=currency;return total;
}
function stopped(signal,deadline){
 if(signal?.aborted)throw new DOMException('Stopped','AbortError');
 if(Date.now()>deadline)throw Error('AGENT_TIMEOUT');
}
async function pause(ms,signal,deadline){
 stopped(signal,deadline);
 if(ms<=0)return;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve()},ms);
  const onAbort=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'))};
  signal?.addEventListener('abort',onAbort,{once:true});
 });
 stopped(signal,deadline);
}
function quote(capabilities){
 const q=capabilities?.agent,currency=capabilities?.currency;
 if(!capabilities?.agentEnabled||!q||!Number.isSafeInteger(q.maxChargeCents)||q.maxChargeCents<=0||!Number.isSafeInteger(q.maxRunChargeCents)||q.maxRunChargeCents<q.maxChargeCents*AGENT_LIMITS.maxGenerations||typeof currency!=='string'||!currency)throw Error('AGENT_UNAVAILABLE');
 return {budget:{currency,perGenerationMaxChargeCents:q.maxChargeCents},runMaxChargeCents:q.maxRunChargeCents};
}
function toolEvent(data,requestId,document,step){
 if(step>=AGENT_LIMITS.maxGenerations-1||data.requestId!==requestId||data.fileId!==document.id||data.version!==document.version||!Array.isArray(data.calls)||data.calls.length!==1)throw invalid();
 const call=data.calls[0],assistant=data.assistant,raw=assistant?.tool_calls?.[0];
 if(typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||call.type!=='function'||assistant?.role!=='assistant'||!Array.isArray(assistant.tool_calls)||assistant.tool_calls.length!==1||raw?.id!==call.id||raw?.type!=='function'||raw.function?.name!==call.function?.name||typeof raw.function.arguments!=='string'||(assistant.content!==null&&typeof assistant.content!=='string'))throw invalid();
 const args=validateToolCall(call.function.name,call.function.arguments);
 if(JSON.stringify(validateToolCall(call.function.name,JSON.parse(raw.function.arguments)))!==JSON.stringify(args))throw invalid();
 return {call:{...call,function:{name:call.function.name,arguments:args}},assistant};
}

/** One browser-owned run; each generation keeps the existing independent paid receipt.
 * Persist onUpdate before execution. Neither SSE replay nor reload resumes an unknown write.
 */
export async function runDocumentAgent({initial,instruction,language,history=[],capabilities,signal,execute,refreshContext,onUpdate=async()=>{},stream=streamChat,uuid=()=>crypto.randomUUID(),maxRetries=2,retryDelayMs=50}){
 const {budget,runMaxChargeCents}=quote(capabilities),deadline=Date.now()+AGENT_LIMITS.runTimeoutMs;
 const record={runId:initial.runId,fileId:initial.document.id,status:'running',requests:[],steps:[],text:'',error:null,chargeStatus:'pending',currency:budget.currency};
 let context=initial,activeRunId=record.runId,agentHistory=[],editCount=0,runChargeCents=0,retries=0,continuations=0;
 const executed=new Set();
 try{
  for(let step=0;step<AGENT_LIMITS.maxGenerations;step++){
   stopped(signal,deadline);
   if(context.runId!==activeRunId||context.document.id!==record.fileId)throw Error('STALE_AGENT_RUN');
   const agentContext=validateAgentContext({runId:context.runId,targets:context.targets});
   const requestId=uuid(),request={requestId,receipt:null,step};record.requests.push(request);
   await onUpdate(record);stopped(signal,deadline);
   const payload={requestId,mode:'agent',language,message:instruction,history,document:context.document,agentStep:step,agentHistory,agentContext,agentBudget:budget};
   if(new TextEncoder().encode(JSON.stringify(payload)).length>AGENT_LIMITS.bodyBytes)throw Error('DOCUMENT_TOO_LARGE');
   let tools=null,answer='',done=false,started=false,usageSeen=false,streamErr=null;
   try{
    await stream(payload,{signal,onEvent:(event,data)=>{
     if(done)throw invalid();
     if(event==='usage'){
      if(usageSeen||!started||data.requestId!==requestId||data.currency!==budget.currency||!Number.isSafeInteger(data.reservedCents)||data.reservedCents<=0||(data.state==='settled'&&(!Number.isSafeInteger(data.chargedCents)||data.chargedCents<0)))throw invalid();
      usageSeen=true;
      request.receipt=data;
      if(data.reservedCents>budget.perGenerationMaxChargeCents)throw invalid();
     }else if(event==='tool_calls'){
      if(tools||answer||!usageSeen||request.receipt?.state!=='settled')throw invalid();
      tools=toolEvent(data,requestId,context.document,step);
     }else if(event==='delta'){
      if(tools||!usageSeen||typeof data.text!=='string'||request.receipt?.state!=='settled')throw invalid();
      answer+=data.text;if(answer.length>32000)throw invalid();
     }else if(event==='done'){
      if(!started||!usageSeen||data.requestId!==requestId)throw invalid();done=true;
     }else if(event==='start'){
      if(started||data.requestId!==requestId)throw invalid();started=true;
     }else throw invalid();
    }});
   }catch(e){streamErr=e}
   if(streamErr){
    const receiptState=request.receipt?.state;
    const canRecover=RETRYABLE_STREAM_CODES.has(streamErr.code)&&(receiptState==='settled'||receiptState==='released'||(!started&&!request.receipt));
    if(canRecover){
     if(receiptState==='settled'){
      if(!Number.isSafeInteger(request.receipt.chargedCents)||request.receipt.chargedCents<0||request.receipt.chargedCents>request.receipt.reservedCents||request.receipt.chargedCents>budget.perGenerationMaxChargeCents)throw invalid();
      if(runChargeCents+request.receipt.chargedCents>runMaxChargeCents)throw Error('AGENT_RUN_CHARGE_LIMIT');
      runChargeCents+=request.receipt.chargedCents;
     }else if(!started&&!request.receipt){
      record.requests.pop();
     }
     summarizeCharges(record,budget.currency);
     await onUpdate(record);
     if(retries<maxRetries&&runChargeCents+budget.perGenerationMaxChargeCents<=runMaxChargeCents){
      retries++;
      await pause(retryDelayMs*retries,signal,deadline);
      context=await refreshContext(activeRunId,{rotate:true});
      activeRunId=context.runId;agentHistory=[];step=-1;
      continue;
     }
     if(editCount>0&&record.steps.every(s=>s.status==='verified')&&!record.requests.some(r=>!['settled','released'].includes(r.receipt?.state))){
      record.text=language==='zh'?`已完成 ${editCount} 处文档修改并通过回读校验。`:`Completed and verified ${editCount} document edit${editCount===1?'':'s'}.`;
      record.status='completed';
      break;
     }
    }
    throw streamErr;
   }
   summarizeCharges(record,budget.currency);
   await onUpdate(record);stopped(signal,deadline);
   if(!done||!started||!usageSeen||request.receipt?.state!=='settled'||!Number.isSafeInteger(request.receipt.chargedCents)||request.receipt.chargedCents<0||request.receipt.chargedCents>request.receipt.reservedCents||request.receipt.chargedCents>budget.perGenerationMaxChargeCents)throw invalid();
   if(runChargeCents+request.receipt.chargedCents>runMaxChargeCents)throw Error('AGENT_RUN_CHARGE_LIMIT');
   runChargeCents+=request.receipt.chargedCents;record.chargedCents=runChargeCents;
   if(!tools){if(!answer.trim())throw invalid();record.text=answer;record.status='completed';break}
   const {call,assistant}=tools;
   if(executed.has(call.id))throw Error('AGENT_REPLAY_REJECTED');
   const changes=call.function.name==='doc_apply_edits'?call.function.arguments.edits.length:0;
   if(editCount+changes>AGENT_LIMITS.maxEditsPerRun)throw Error('AGENT_EDIT_LIMIT');
   editCount+=changes;executed.add(call.id);
   const operation={requestId,callId:call.id,tool:call.function.name,status:'executing',editCount:changes};
   record.steps.push(operation);
   try{await onUpdate(record);stopped(signal,deadline)}catch(e){operation.status='not_started';throw e}
   let result;
   try{
    result=validateToolResult(await execute(activeRunId,call.id,call.function.name,call.function.arguments));
    if(result.runId!==activeRunId||result.document.id!==record.fileId||result.tool!==call.function.name)throw invalid();
    operation.result=result;operation.status=result.ok?'verified':result.verification==='unknown'?'unknown':'failed';
   }catch(e){operation.status='unknown';operation.error=e.code||e.message;throw e}
   if(!result.ok&&!result.partial&&result.verification==='failed'&&RETRYABLE_TOOL_CODES.has(result.error?.code)&&retries<maxRetries&&runChargeCents+budget.perGenerationMaxChargeCents<=runMaxChargeCents){
    retries++;editCount-=changes;record.steps.pop();
    await onUpdate(record);
    await pause(retryDelayMs*retries,signal,deadline);
    context=await refreshContext(activeRunId,{rotate:true});
    activeRunId=context.runId;agentHistory=[];step=-1;
    continue;
   }
   await onUpdate(record);stopped(signal,deadline);
   if(!result.ok||result.partial||result.verification!=='verified'||(changes&&!result.saved))throw Error(result.error?.code||'AGENT_OPERATION_FAILED');
   if(step===AGENT_LIMITS.maxGenerations-2&&editCount>0&&call.function.name!=='doc_apply_edits'&&continuations<maxRetries&&runChargeCents+budget.perGenerationMaxChargeCents<=runMaxChargeCents){
    continuations++;
    context=await refreshContext(activeRunId,{rotate:true});
    activeRunId=context.runId;agentHistory=[];step=-1;
    continue;
   }
   agentHistory.push(assistant,{role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
   context=await refreshContext(activeRunId);
  }
 }catch(e){record.status=e.name==='AbortError'?'stopped':'failed';record.error={code:e.code||e.message,name:e.name,status:e.status};summarizeCharges(record,budget.currency);}
 await onUpdate(record);
 return record;
}
