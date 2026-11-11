// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'crypto';
import { platformModels, type PlatformModel } from './catalog';
import { bailianModelConstraints, bailianConfig, deepseekConfig, deepseekConfigured, isDeepSeekModelId, mapToDeepSeekUpstreamModel, platformProvider } from './config';
import { retireOpenRouter, reserve, authorizeReserve, submitted, pending, settle, release } from './billing';
import { trialBlockReason } from '../trial';
import { InsufficientCreditsError } from '../credits';
import { pickLangText, resolveRequestLocale } from '../api-locale';
import { canCircleUserCallOverseasModel } from '../circle-firms';
import { getAiConfig } from '../ai-config';
import { bqtChargeTarget } from '../bqt-member';
import { BQT_ERROR_TEXT, BqtDenialError } from '../bqt-ai';
type Obj=Record<string,any>;
export class AiGatewayError extends Error { constructor(public code:string,public status=400){super(code);} }
const errors:Record<string,[string,string]>={
  unauthorized:['账户凭据无效','Account credential is invalid'],not_configured:['平台 AI 尚未配置完成','Platform AI is not configured'],
  client_upgrade_required:['国内平台 AI 已迁移至百炼，请更新客户端后使用','China platform AI has moved to Bailian. Update your client to continue.'],
  no_credits:['平台 AI 可用额度不足','Insufficient platform AI allowance'],
  circle_paid_credits_required:['Circle 联盟所赠送额度仅限 DeepSeek 模型使用，调用其他海外模型请先充值 Credits','Circle alliance free quota is for DeepSeek models only. Please top up Credits to use other overseas models.'],
  invalid_request:['模型请求参数不受支持','Unsupported model request parameters'],
  model_unavailable:['该模型当前不可用','This model is currently unavailable'],catalog_unavailable:['模型目录暂时不可用','Model catalog is temporarily unavailable'],
  busy:['并发请求较多，请稍后重试','Too many concurrent requests. Try again later.'],
  request_already_submitted:['该请求已受理，请勿重复提交','This request was already accepted'],request_id_conflict:['请求编号已用于其他内容','Request ID was used for different content'],
  reconciliation_required:['平台 AI 用量正在核对，暂时无法接受新请求','Platform AI usage is being reconciled; new requests are temporarily unavailable'],
  usage_pending:['本次用量待核对，可到账户页查看','Usage verification is pending. Check your account page.'],
  model_not_activated:['平台尚未开通此模型，请选择其他模型','The platform has not activated this model. Choose another model'],
  upstream_permission_denied:['平台暂无此模型的调用权限，请选择其他模型','The platform does not have permission to use this model. Choose another model'],
  upstream_failed:['模型服务暂时不可用','Model service is temporarily unavailable'],input_too_large:['输入内容超过模型请求上限','Input exceeds the model request limit'],
  ...BQT_ERROR_TEXT,
};
export function gatewayError(error:unknown,request:Request) {
  const code=error instanceof InsufficientCreditsError?'no_credits':error instanceof Error && errors[error.message]?error.message:'upstream_failed';
  const status=error instanceof AiGatewayError||error instanceof BqtDenialError?error.status:(code==='no_credits'||code==='circle_paid_credits_required')?402:code==='unauthorized'?401:code==='busy'?429:code==='request_already_submitted'||code==='request_id_conflict'?409:503;
  const [zh,en]=errors[code]||errors.upstream_failed;
  return Response.json({error:{code,type:code,message:pickLangText(resolveRequestLocale(request),zh,en)}},{status,headers:{'Cache-Control':'no-store'}});
}
/** Only classify bounded supplier errors; never return their raw text or credentials. */
export async function classifyUpstreamError(response:Response):Promise<AiGatewayError> {
  let detail='';
  const reader=response.body?.getReader();
  if(reader) {
    try {
      const chunks:Uint8Array[]=[];let bytes=0;
      while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>65536)break;chunks.push(part.value);}
      if(bytes<=65536){const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));const error=value.error||value;detail=[error.code,error.type,error.message].filter(v=>typeof v==='string').join(' ').toLowerCase();}
    } catch { /* Unknown or malformed responses retain the safe generic classification. */ }
    finally { await reader.cancel().catch(()=>undefined);reader.releaseLock(); }
  }
  return classifySupplierError(response.status,detail);
}
function classifySupplierError(status:number,detail:string):AiGatewayError {
  if(status===429)return new AiGatewayError('busy',429);
  if(status>=500)return new AiGatewayError('upstream_failed',502);
  if(/product.*not.*activat|model.*not.*activat|notactivated|may not have activated/.test(detail))return new AiGatewayError('model_not_activated',503);
  if([401,403].includes(status)||/accessdenied|permission.denied|unauthorized/.test(detail))return new AiGatewayError('upstream_permission_denied',503);
  if(status===404)return new AiGatewayError('model_unavailable',404);
  if(status===413)return new AiGatewayError('input_too_large',413);
  if([400,422].includes(status)&&/invalidparameter|invalid.parameter|invalid_request|unsupported|parameter/.test(detail))return new AiGatewayError('invalid_request',400);
  return new AiGatewayError('upstream_failed',502);
}
export async function readChatBody(request:Request):Promise<Obj> {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AiGatewayError('invalid_request',415);
  const reader=request.body?.getReader();if(!reader)throw new AiGatewayError('invalid_request');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>32_000_000)throw new AiGatewayError('input_too_large',413);chunks.push(r.value);}}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AiGatewayError('invalid_request');}
}
export function validateChat(raw:Obj,model:PlatformModel) {
  if(!raw||Array.isArray(raw)||!Array.isArray(raw.messages)||!raw.messages.length||raw.messages.length>1000)throw new AiGatewayError('invalid_request');
  const allowed=new Set(['model','messages','tools','tool_choice','temperature','top_p','stop','response_format','seed','max_tokens','max_completion_tokens','stream','stream_options','frequency_penalty','presence_penalty','parallel_tool_calls','enable_thinking','thinking_budget','reasoning_effort']);
  if(Object.keys(raw).some(k=>!allowed.has(k))||raw.n!==undefined||raw.stream!==undefined&&typeof raw.stream!=='boolean')throw new AiGatewayError('invalid_request');
  if(raw.tools!==undefined&&(!model.supportsTools||!Array.isArray(raw.tools)||raw.tools.length>256))throw new AiGatewayError('invalid_request');
  let images=false,audio=false;
  for(const message of raw.messages) {
    if(!message||!['system','user','assistant','tool','developer'].includes(message.role))throw new AiGatewayError('invalid_request');
    if(Array.isArray(message.content))for(const part of message.content) {
      if(part?.type==='image_url') {
        const url=part.image_url?.url;
        if(!model.supportsVision||typeof url!=='string'||!(/^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/.test(url)))throw new AiGatewayError('invalid_request');
        images=true;
      } else if(part?.type==='input_audio') {
        const value=part.input_audio;
        if(!model.supportsAudio||!value||!['wav','mp3'].includes(value.format)||typeof value.data!=='string'||value.data.length>8_400_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data))throw new AiGatewayError('invalid_request');
        part.input_audio={...value,data:`data:audio/${value.format};base64,${value.data}`};
        audio=true;
      } else if(part?.type!=='text'||typeof part.text!=='string')throw new AiGatewayError('invalid_request');
      if(part.cache_control)throw new AiGatewayError('invalid_request');
    }
    else if(message.content!==null&&message.content!==undefined&&typeof message.content!=='string')throw new AiGatewayError('invalid_request');
    if(message.cache_control)throw new AiGatewayError('invalid_request');
  }
  if(audio&&Buffer.byteLength(JSON.stringify(raw),'utf8')>8_500_000)throw new AiGatewayError('input_too_large',413);
  if(raw.tools?.some((tool:Obj)=>tool?.type!=='function'||tool.cache_control||!tool.function||typeof tool.function.name!=='string'))throw new AiGatewayError('invalid_request');
  const requested=raw.max_completion_tokens??raw.max_tokens??Math.min(8192,model.maxOutputTokens);
  if(!Number.isSafeInteger(requested)||requested<1||requested>model.maxOutputTokens)throw new AiGatewayError('invalid_request');
  if(raw.enable_thinking!==undefined&&typeof raw.enable_thinking!=='boolean')throw new AiGatewayError('invalid_request');
  if(raw.reasoning_effort!==undefined&&!['none','minimal','low','medium','high'].includes(raw.reasoning_effort))throw new AiGatewayError('invalid_request');
  if(raw.thinking_budget!==undefined&&(!Number.isSafeInteger(raw.thinking_budget)||raw.thinking_budget<0||raw.thinking_budget>model.maxOutputTokens))throw new AiGatewayError('invalid_request');
  const constraints=platformProvider()==='bailian'?bailianModelConstraints(model.id):{};
  const thinking=constraints.thinking===true||raw.enable_thinking===true;
  // A thinking budget is explicit and part of the preauthorized output ceiling.
  const thinkingBudget=thinking?(raw.thinking_budget??Math.min(requested,8192)):0;
  if(!Number.isSafeInteger(thinkingBudget)||thinkingBudget<0||thinkingBudget>model.maxOutputTokens)throw new AiGatewayError('invalid_request');
  const body:Obj={...raw,max_tokens:requested,stream:raw.stream===true,enable_thinking:thinking,...(thinking?{thinking_budget:thinkingBudget}:{})};
  if(constraints.temperature!==undefined)body.temperature=constraints.temperature;
  if(!thinking)delete body.thinking_budget;
  delete body.max_completion_tokens;
  if(body.stream)body.stream_options={include_usage:true};else delete body.stream_options;
  // Explicit cache and provider-specific paid add-ons cannot enter through arbitrary extra_body fields.
  const input=images||audio?model.maxInputTokens:Buffer.byteLength(JSON.stringify({messages:raw.messages,tools:raw.tools}),'utf8')+raw.messages.length*32+1024;
  if(input>model.maxInputTokens||(!images&&!audio&&input+requested>model.contextLength))throw new AiGatewayError('input_too_large',413);
  return {body,inputTokens:input,outputTokens:requested+thinkingBudget,thinking};
}
/** Disconnect detaches delivery but continues the bounded upstream read to obtain the receipt. */
export async function chatCompletion(userId:string,request:Request,fetcher:typeof fetch=fetch):Promise<Response> {
  const isBailian=platformProvider()==='bailian';
  // BQT lawyers are gated by BQT preflight, not by the local-credits trial.
  if(!bqtChargeTarget(userId)&&trialBlockReason(userId))throw new AiGatewayError('no_credits',402);
  const raw=await readChatBody(request);
  if(isBailian&&raw?.model==='qwen-image-3.0') {
    const config=bailianConfig();if(!config.apiKey||!config.baseUrl)throw new AiGatewayError('not_configured',503);
    const { imageCompletion }=await import('./images');
    return imageCompletion(userId,request,raw,fetcher);
  }
  const requestedModelId=typeof raw?.model==='string'?raw.model:'';
  const useDedicatedDeepseek=!isBailian&&isDeepSeekModelId(requestedModelId)&&deepseekConfigured();
  if(!isBailian&&!isDeepSeekModelId(requestedModelId)&&!canCircleUserCallOverseasModel(userId)) {
    throw new AiGatewayError('circle_paid_credits_required',402);
  }
  let upstreamBaseUrl='';
  let upstreamApiKey='';
  if(isBailian) {
    const config=bailianConfig();if(!config.apiKey||!config.baseUrl)throw new AiGatewayError('not_configured',503);
    upstreamBaseUrl=config.baseUrl;upstreamApiKey=config.apiKey;
  } else if(useDedicatedDeepseek) {
    const ds=deepseekConfig();if(!ds.apiKey||!ds.baseUrl)throw new AiGatewayError('not_configured',503);
    upstreamBaseUrl=ds.baseUrl;upstreamApiKey=ds.apiKey;
  } else {
    const orKey=getAiConfig().apiKey;if(!orKey)throw new AiGatewayError('not_configured',503);
    upstreamBaseUrl='https://openrouter.ai/api/v1';upstreamApiKey=orKey;
  }
  const catalog=await platformModels(fetcher);
  const model=catalog.find(m=>m.id===requestedModelId)||(useDedicatedDeepseek?catalog.find(m=>m.id===(mapToDeepSeekUpstreamModel(requestedModelId)==='deepseek-reasoner'?'deepseek/deepseek-reasoner':'deepseek/deepseek-chat')):undefined);
  if(!model)throw new AiGatewayError('model_unavailable',404);
  const input=validateChat({...raw,model:model.id},model);
  const id=request.headers.get('x-request-id')||randomUUID();
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))throw new AiGatewayError('invalid_request');
  if(isBailian)await retireOpenRouter(userId);
  await authorizeReserve(userId,id,model,input.inputTokens,input.outputTokens,input.thinking);
  reserve(userId,id,input.body,model,input.inputTokens,input.outputTokens,input.thinking);
  submitted(userId,id);
  const upstreamPayload:Obj={...input.body};
  if(!isBailian) {
    delete upstreamPayload.enable_thinking;
    delete upstreamPayload.thinking_budget;
    if(useDedicatedDeepseek)upstreamPayload.model=mapToDeepSeekUpstreamModel(model.id);
  }
  let upstream:Response;
  try {
    upstream=await fetcher(`${upstreamBaseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${upstreamApiKey}`,'Content-Type':'application/json'},body:JSON.stringify(upstreamPayload),signal:AbortSignal.timeout(600_000),redirect:'error'});
  } catch {pending(userId,id);throw new AiGatewayError('upstream_failed',502);}
  if(!upstream.ok||!upstream.body) {
    const failure=await classifyUpstreamError(upstream);
    if([400,401,402,403,404,413,422,429].includes(upstream.status))release(userId,id,true);else pending(userId,id);
    throw failure;
  }
  const headers={'Cache-Control':'no-store, no-transform','X-AWD-Request-Id':id};
  if(!input.body.stream) {
    try {
      const reader=upstream.body!.getReader(),chunks:Uint8Array[]=[];let bytes=0;
      try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>32_000_000)throw new Error('upstream_failed');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
      const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(result.error)throw classifySupplierError(200,JSON.stringify(result.error).slice(0,65536).toLowerCase());
      if(!Array.isArray(result.choices))throw new Error('upstream_failed');
      if(settle(userId,id,result.usage).state!=='settled')throw new Error('usage_pending');
      return Response.json(result,{headers});
    } catch(e) {pending(userId,id);throw e instanceof AiGatewayError||e instanceof Error&&e.message==='usage_pending'?e:new AiGatewayError('upstream_failed',502);}
  }
  let detached=false;
  const encoder=new TextEncoder();
  const stream=new ReadableStream<Uint8Array>({
    start(controller) {
      const send=(bytes:Uint8Array)=>{if(!detached)try{controller.enqueue(bytes);}catch{detached=true;}};
      const heartbeat=setInterval(()=>send(encoder.encode(': heartbeat\n\n')),10_000);
      void (async()=>{
        const reader=upstream.body!.getReader(),decoder=new TextDecoder();let buffer='',bytes=0,usage:Obj|undefined,done=false;
        const consume=(line:string)=>{
          if(!line.startsWith('data:'))return;
          const payload=line.slice(5).trim();if(payload==='[DONE]'){done=true;return;}if(!payload)return;
          const chunk=JSON.parse(payload);if(chunk.error)throw classifySupplierError(200,JSON.stringify(chunk.error).slice(0,65536).toLowerCase());
          if(chunk.usage)usage=chunk.usage;
        };
        try {
          while(true) {
            const part=await reader.read();if(part.done)break;
            bytes+=part.value.length;if(bytes>32_000_000)throw new Error('upstream_failed');
            buffer+=decoder.decode(part.value,{stream:true});
            let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).replace(/\r$/,'');consume(line);buffer=buffer.slice(at+1);if(!(line.startsWith('data:')&&line.slice(5).trim()==='[DONE]'))send(encoder.encode(line+'\n'));}
          }
          buffer+=decoder.decode();if(buffer.trim())consume(buffer.trim());
          if(!done||!usage)throw new Error('usage_pending');
          if(settle(userId,id,usage).state!=='settled')throw new Error('usage_pending');
          send(encoder.encode('data: [DONE]\n\n'));
        } catch(e) {
          pending(userId,id);
          const response=gatewayError(e,request),body=await response.text();
          send(encoder.encode(`data: ${body}\n\ndata: [DONE]\n\n`));
        } finally {
          clearInterval(heartbeat);await reader.cancel().catch(()=>undefined);reader.releaseLock();
          if(!detached)try{controller.close();}catch{/* disconnected */}
        }
      })();
    },cancel(){detached=true;},
  });
  return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'}});
}
