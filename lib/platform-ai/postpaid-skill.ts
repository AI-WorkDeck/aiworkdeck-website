// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {randomUUID} from 'crypto';
import type {UpstreamRequest,UpstreamResult} from '../ai-stream';
import {platformModels,usageCostCny} from './catalog';
import {validateChat} from './proxy';
import {authorizeCostCny,reserveCostCny,submitted,pending,release,settleCostCny} from './billing';
import {getBalance} from '../credits';
import {getExchangeRateInfo} from '../ai-config';
import {bailianConfig} from './config';
import type {AiUsageSettleResult} from '../ai-usage';
/** Paid Skill calls share the same bounded reservation and receipt lifecycle as workspace AI. */
export async function connectPostpaidSkill(req:UpstreamRequest,international:boolean):Promise<UpstreamResult> {
    if(!req.userId)return {ok:false,error:'ai_upstream_error'};
    const userId=req.userId,id=`skill-${randomUUID()}`;
    try {
        const model=(await platformModels()).find(m=>m.id===req.model);
        if(!model)throw new Error('model_unavailable');
        const {body,inputTokens,outputTokens}=validateChat({model:req.model,messages:req.messages,max_tokens:req.maxTokens,temperature:req.temperature,stream:true,enable_thinking:false},model);
        const exchange=international?getExchangeRateInfo().rate:1;
        const inputPrice=Math.max(...model.priceTiers.map(t=>t.input)),outputPrice=Math.max(...model.priceTiers.map(t=>t.output));
        const maxCostCny=(inputTokens*inputPrice+outputTokens*outputPrice)/1e6*exchange;
        await authorizeCostCny(userId,id,maxCostCny,model.id);
        reserveCostCny(userId,id,body,model.id,maxCostCny,{model,exchange,international});
        submitted(userId,id);
        const config=bailianConfig();
        let response:Response;
        try{response=await fetch(international?'https://openrouter.ai/api/v1/chat/completions':`${config.baseUrl}/chat/completions`,{
            method:'POST',headers:{Authorization:`Bearer ${international?req.apiKey:config.apiKey}`,'Content-Type':'application/json'},
            body:JSON.stringify({...body,...(international?{usage:{include:true}}:{})}),signal:AbortSignal.timeout(req.timeoutMs),redirect:'error'});}
        catch(e){pending(userId,id);throw e;}
        if(!response.ok||!response.body){await response.body?.cancel();if([400,401,402,403,404,413,422,429].includes(response.status))release(userId,id,true);else pending(userId,id);return {ok:false,error:response.status===429?'ai_busy':'ai_upstream_error'};}
        let detached=false,bill:AiUsageSettleResult|undefined;
        const encoder=new TextEncoder();
        const stream=new ReadableStream<Uint8Array>({start(controller){
            const send=(s:string)=>{if(!detached)try{controller.enqueue(encoder.encode(s));}catch{detached=true;}};
            void(async()=>{
                const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',size=0,usage:any,done=false;
                const consume=(line:string)=>{
                    if(line.startsWith('data:')){const payload=line.slice(5).trim();if(payload==='[DONE]'){done=true;return;}if(payload){const value=JSON.parse(payload);if(value.error)throw new Error('upstream_failed');if(value.usage)usage=value.usage;}}
                    send(line+'\n');
                };
                try {
                    while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>32000000)throw new Error('response_too_large');buffer+=decoder.decode(next.value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end).replace(/\r$/,''));buffer=buffer.slice(end+1);}}
                    buffer+=decoder.decode();if(buffer.trim())consume(buffer.trim());if(!done||!usage)throw new Error('usage_pending');
                    const cost=international?usage.cost*exchange:usageCostCny(model,usage,false);
                    if(!Number.isFinite(cost)||cost<0)throw new Error('usage_pending');
                    const settled=settleCostCny(userId,id,cost,usage);if(settled.state!=='settled')throw new Error('usage_pending');
                    bill={costCents:settled.chargedCents??0,charged:true,balanceCents:getBalance(userId)};
                    send('data: [DONE]\n\n');
                }catch{pending(userId,id);send('data: {"error":{"code":"usage_pending"}}\n\ndata: [DONE]\n\n');}
                finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();if(!detached)try{controller.close();}catch{/* disconnected */}}
            })();
        },cancel(){detached=true;}});
        return {ok:true,res:new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),abort:()=>{detached=true;},billing:()=>{if(!bill)throw new Error('usage_pending');return bill;}};
    }catch{return {ok:false,error:'ai_usage_pending'};}
}
