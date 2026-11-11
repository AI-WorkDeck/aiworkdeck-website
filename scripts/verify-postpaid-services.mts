// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.ok(!fs.existsSync('data')&&!fs.existsSync('package.json'),'Use a fresh empty directory');
const intl=process.env.NEXT_PUBLIC_AWD_SITE==='intl';
Object.assign(process.env,{AWD_POSTPAID_ENABLED:'true',DASHSCOPE_API_KEY:'synthetic-provider',BAILIAN_BASE_URL:'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'});
fs.mkdirSync('data');fs.writeFileSync('data/users.json','[]');fs.writeFileSync('data/ai-config.json',JSON.stringify({exchangeRateMode:'manual',exchangeRate:1,marginMultiplier:1}));
fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:['qwen3.8-max']}));fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:['qwen3.8-max']}));
process.env.BAILIAN_AUTHORIZED_MODELS_FILE=process.cwd()+'/authorized.json';process.env.BAILIAN_AVAILABLE_MODELS_FILE=process.cwd()+'/available.json';
const {acceptPostpaid,registerCreditGrant,cloudState,POSTPAID_VERSION}=await import('../lib/postpaid');
const {withTransaction}=await import('../lib/db');
const {captureServiceFunding}=await import('../lib/subscription');
const {chargeAfterSuccess,chargeTransfer,refundCharge}=await import('../lib/gateway/spend');
const {connectOpenRouter}=await import('../lib/ai-stream');
let providerCalls=0;
const modelId=intl?'synthetic/model':'qwen3.8-max';
const raw={model:modelId,name:'Synthetic',capabilities:['TG'],features:['function-calling'],inference_metadata:{request_modality:['Text'],response_modality:['Text']},model_info:{context_window:100000,max_input_tokens:90000,max_output_tokens:1000},prices:[{range_name:'Default',prices:[{type:'input_token',price:'100',price_unit:'每百万tokens',time_band:'standard'},{type:'output_token',price:'200',price_unit:'每百万tokens',time_band:'standard'}]}]};
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 if(url.includes('/models'))return intl?Response.json({data:[{id:modelId,name:'Synthetic',context_length:100000,top_provider:{max_completion_tokens:1000},architecture:{input_modalities:['text'],output_modalities:['text']},supported_parameters:['tools'],pricing:{prompt:'0.0001',completion:'0.0002'}}]}):Response.json({success:true,output:{total:1,models:[raw]}});
 assert.ok(url.endsWith('/chat/completions'),'unexpected outbound URL');providerCalls++;
 return new Response('data: '+JSON.stringify({choices:[{delta:{content:'synthetic result'}}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200,cost:0.03}})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
};
const setup=(u:string,n:number)=>{acceptPostpaid(u,POSTPAID_VERSION);withTransaction(d=>registerCreditGrant(d,u,'grant',n,new Date().toISOString(),new Date(Date.now()+86400000).toISOString()));};
setup('skill',100);
const request={userId:'skill',apiKey:'synthetic-key',model:modelId,messages:[{role:'user',content:'test'}],maxTokens:100,temperature:0.5,timeoutMs:10000,origin:'http://synthetic.invalid'};
const response=await connectOpenRouter(request,'skill-chat');assert.equal(response.ok,true);
if(response.ok){await response.res.text();assert.equal(response.billing!().charged,true);assert.equal(response.billing!().costCents,3);}
assert.equal(cloudState('skill').billing.debtCents,3);assert.equal(cloudState('skill').billing.reservedCreditCents,0);
const before=providerCalls;setup('empty',1);const rejected=await connectOpenRouter({...request,userId:'empty'},'skill-chat');assert.equal(rejected.ok,false);assert.equal(providerCalls,before,'no funds cannot make free postpaid Skill calls');
setup('gateway',10);
const pricing={service:'synthetic',op:'query',unit:'call',costCentsPerUnit:1,marginMultiplier:1,creditsPerUnit:12,maxUnitsPerCall:1,enabled:true,updatedAt:new Date().toISOString()} as any;
const funding=captureServiceFunding('gateway');
const charged=chargeAfterSuccess({userId:'gateway',pricing,actualUnits:1,funding});assert.equal(charged.chargedCents,12);assert.equal(charged.shortfallCents,0);assert.equal(cloudState('gateway').billing.debtCents,12);
refundCharge('gateway',charged.ledgerId!);assert.equal(cloudState('gateway').billing.debtCents,0);
setup('transfer',100);const transfer=chargeTransfer({userId:'transfer',bytes:100,credits:20,refId:'synthetic-transfer'});assert.equal(cloudState('transfer').billing.debtCents,20);refundCharge('transfer',transfer.id);assert.equal(cloudState('transfer').billing.debtCents,0);
console.log(`${intl?'international':'domestic'} paid Skill receipt, denied unpaid call, gateway delivered shortfall as debt and transfer refunds passed`);
