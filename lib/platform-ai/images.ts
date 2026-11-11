// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'crypto';
import { classifyUpstreamError } from './proxy';
import { bailianConfig, platformProvider } from './config';
import { retireOpenRouter, authorizeCostCny, reserveCostCny, submitted, pending, settleCostCny, release } from './billing';
import { trialBlockReason } from '../trial';
import { bqtChargeTarget } from '../bqt-member';
import { IMAGE_MODEL, imagePrices, maximumImageCost, imageUsageCost } from './images-billing';
type Obj=Record<string,any>;
const MAX_IMAGE_BYTES=10*1024*1024;
const RESULT_HOSTS=new Set(['dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com','dashscope-a717.oss-accelerate.aliyuncs.com']);
export function validateImageChat(raw:Obj) {
  const allowed=new Set(['model','messages','modalities','image_config','stream']);
  if(!raw||raw.model!==IMAGE_MODEL||Object.keys(raw).some(k=>!allowed.has(k))||raw.stream===true||raw.stream!==undefined&&raw.stream!==false
    ||!Array.isArray(raw.modalities)||raw.modalities.length!==2||!raw.modalities.includes('text')||!raw.modalities.includes('image')
    ||!Array.isArray(raw.messages)||raw.messages.length<1||raw.messages.length>2)throw new Error('invalid_request');
  const config=raw.image_config;
  if(!config||Object.keys(config).some(k=>!['aspect_ratio','image_size'].includes(k)))throw new Error('invalid_request');
  const match=/^(\d{1,2}):(\d{1,2})$/.exec(config.aspect_ratio||'');
  if(!match||!['1K','2K'].includes(config.image_size))throw new Error('invalid_request');
  const ratio=Number(match[1])/Number(match[2]);if(!Number.isFinite(ratio)||ratio<1/8||ratio>8)throw new Error('invalid_request');
  const edge=config.image_size==='2K'?2048:1024;
  const width=ratio>=1?edge:Math.round(edge*ratio/16)*16,height=ratio>=1?Math.round(edge/ratio/16)*16:edge;
  if(width*height<512*512||width*height>2048*2048)throw new Error('invalid_request');
  const users=raw.messages.filter((m:any)=>m?.role==='user'),systems=raw.messages.filter((m:any)=>m?.role==='system');
  if(users.length!==1||systems.length>1||users.length+systems.length!==raw.messages.length)throw new Error('invalid_request');
  // The image worker's system message carries size hints only; dimensions are validated above.
  if(systems.some((m:any)=>typeof m.content!=='string'||!/^aspect_ratio=\d{1,2}:\d{1,2}, resolution=[12]K$/.test(m.content)))throw new Error('invalid_request');
  const content=users[0].content;if(!Array.isArray(content)||content.length>4)throw new Error('invalid_request');
  const refs:string[]=[],text:string[]=[];
  for(const part of content) {
    if(part?.type==='text'&&typeof part.text==='string')text.push(part.text);
    else if(part?.type==='image_url'&&typeof part.image_url?.url==='string') {
      const url=part.image_url.url, m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
      if(!m||m[2].length>Math.ceil(MAX_IMAGE_BYTES/3)*4)throw new Error('invalid_request');
      const bytes=Buffer.from(m[2],'base64');if(bytes.length<12||bytes.length>MAX_IMAGE_BYTES||bytes.toString('base64')!==m[2])throw new Error('invalid_request');
      refs.push(url);
    }else throw new Error('invalid_request');
  }
  if(refs.length>3||text.length!==1||!text[0].trim()||Buffer.byteLength(text[0])>18_000)throw new Error('invalid_request');
  return {inputCount:refs.length,body:{model:IMAGE_MODEL,input:{messages:[{role:'user',content:[...refs.map(image=>({image})),{text:text[0]}]}]},parameters:{size:`${width}*${height}`,n:1,prompt_extend:true,prompt_extend_mode:'direct',watermark:false}}};
}
export function validatedResultUrl(raw:unknown):string {
  if(typeof raw!=='string')throw new Error('upstream_failed');
  let url:URL;try{url=new URL(raw);}catch{throw new Error('upstream_failed');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!RESULT_HOSTS.has(url.hostname))throw new Error('upstream_failed');
  return url.toString();
}
async function readLimited(response:Response,max:number):Promise<Buffer> {
  const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>max)throw new Error('upstream_failed');
  const reader=response.body?.getReader();if(!reader)throw new Error('upstream_failed');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>max)throw new Error('upstream_failed');chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  return Buffer.concat(chunks);
}
/** A paid image request is issued once. Disconnect never discards its billing receipt. */
export async function imageCompletion(userId:string,request:Request,raw:Obj,fetcher:typeof fetch=fetch):Promise<Response> {
  if(platformProvider()!=='bailian')throw new Error('model_unavailable');
  const input=validateImageChat(raw),config=bailianConfig();
  if(!config.apiKey||!config.baseUrl)throw new Error('not_configured');
  if(!bqtChargeTarget(userId)&&trialBlockReason(userId))throw new Error('no_credits');
  const prices=await imagePrices(fetcher),id=request.headers.get('x-request-id')||randomUUID();
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))throw new Error('invalid_request');
  await retireOpenRouter(userId);
  await authorizeCostCny(userId,id,maximumImageCost(prices,input.inputCount));
  reserveCostCny(userId,id,input.body,IMAGE_MODEL,maximumImageCost(prices,input.inputCount),{...prices,inputCount:input.inputCount});
  submitted(userId,id);
  let upstream:Response;
  try{upstream=await fetcher(`${new URL(config.baseUrl).origin}/api/v1/services/aigc/multimodal-generation/generation`,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(input.body),signal:AbortSignal.timeout(600_000),redirect:'error'});}
  catch{pending(userId,id);throw new Error('upstream_failed');}
  if(!upstream.ok){const failure=await classifyUpstreamError(upstream);if([400,401,402,403,404,413,422,429].includes(upstream.status))release(userId,id,true);else pending(userId,id);throw failure;}
  let result:Obj;
  try{
    result=JSON.parse((await readLimited(upstream,1_000_000)).toString('utf8'));
    if(result.code||result.error)throw new Error('usage_pending');
    const cost=imageUsageCost(prices,result.usage,input.inputCount);
    if(settleCostCny(userId,id,cost,{...result.usage,request_id:result.request_id}).state!=='settled')throw new Error('usage_pending');
  }catch{pending(userId,id);throw new Error('usage_pending');}
  const choices=result.output?.choices,parts=choices?.[0]?.message?.content;
  if(!Array.isArray(choices)||choices.length!==1||!Array.isArray(parts)||parts.length!==1)throw new Error('upstream_failed');
  const url=validatedResultUrl(parts[0]?.image);
  const image=await fetcher(url,{signal:AbortSignal.timeout(30_000),redirect:'error',cache:'no-store'});
  if(!image.ok||image.headers.get('content-type')?.split(';')[0].trim()!=='image/png')throw new Error('upstream_failed');
  const bytes=await readLimited(image,MAX_IMAGE_BYTES);
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==result.usage.output_width||bytes.readUInt32BE(20)!==result.usage.output_height)throw new Error('upstream_failed');
  return Response.json({id:`awd-image-${id}`,object:'chat.completion',created:Math.floor(Date.now()/1000),model:IMAGE_MODEL,
    choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:null,images:[{type:'image_url',image_url:{url:`data:image/png;base64,${bytes.toString('base64')}`}}]}}],
    usage:result.usage},{headers:{'Cache-Control':'no-store','X-AWD-Request-Id':id}});
}
