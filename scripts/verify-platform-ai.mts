// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
assert.ok(!fs.existsSync('data')&&!fs.existsSync('package.json'),'Use a fresh temporary cwd');
fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:['qwen3.8-max']}));
process.env.BAILIAN_AUTHORIZED_MODELS_FILE=process.cwd()+'/authorized.json';
fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:['qwen3.8-max']}));
process.env.BAILIAN_AVAILABLE_MODELS_FILE=process.cwd()+'/available.json';
fs.mkdirSync('data');fs.writeFileSync('data/users.json','[]');
fs.writeFileSync('data/ai-config.json',JSON.stringify({exchangeRateMode:'manual',exchangeRate:10,marginMultiplier:1}));
Object.assign(process.env,{NEXT_PUBLIC_AWD_SITE:'cn',NODE_ENV:'production',DASHSCOPE_API_KEY:'synthetic-bailian-key',BAILIAN_BASE_URL:'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',AWD_KEY_ENCRYPTION_SECRET:'synthetic-platform-encryption',OPENROUTER_PROVISIONING_KEY:'synthetic-or-management'});
const {getDb,withTransaction,closeDb}=await import('@/lib/db');
const {grantCredits,getBalance}=await import('@/lib/credits');
const {generateApiKey,revokeApiKey}=await import('@/lib/api-keys');
const {issueRuntimeToken,resolveRuntimeUser}=await import('@/lib/platform-ai/auth');
const {parseBailianModel,usageCostCny,clearCatalogCache,platformModels}=await import('@/lib/platform-ai/catalog');
const {validateChat,classifyUpstreamError}=await import('@/lib/platform-ai/proxy');
const {reserve,submitted,settle,requestRow,pending,recoverPending,retireOpenRouter}=await import('@/lib/platform-ai/billing');
const {settleUsage}=await import('@/lib/ai-quota');
const {POST:chat}=await import('@/app/api/account/ai/v1/chat/completions/route');
const {POST:keyRoute}=await import('@/app/api/account/ai-key/route');
const {NextRequest}=await import('next/server');
const {__setFetchForTests:setMgmtFetch}=await import('@/lib/openrouter-mgmt');
const originalFetch=globalThis.fetch;
const price=(type:string,amount:number)=>({type,price:String(amount),price_unit:'每百万tokens',time_band:'standard'});
const rawModel={model:'qwen3.8-max',name:'Synthetic model',capabilities:['TG','VU','Reasoning'],features:['function-calling'],inference_metadata:{request_modality:['Text','Image'],response_modality:['Text']},model_info:{context_window:1000000,max_input_tokens:991808,max_output_tokens:131072},prices:[{range_name:'输入<=32k',prices:[price('input_token',1),price('output_token',2),price('input_token_cache',0.1)]},{range_name:'32k<输入<=1m',prices:[price('input_token',3),price('output_token',6),price('input_token_cache',0.3)]}]};
const model=parseBailianModel(rawModel)!;assert.ok(model);
let counted=0;const check=async(name:string,fn:()=>unknown|Promise<unknown>)=>{await fn();console.log('OK',name);counted++;};
function user(cents=10000){const id=randomUUID(),users=JSON.parse(fs.readFileSync('data/users.json','utf8'));users.push({id,username:`test-${id}`,displayName:'Synthetic',passwordHash:'unused',createdAt:new Date().toISOString()});fs.writeFileSync('data/users.json',JSON.stringify(users));if(cents)withTransaction(db=>grantCredits(db,{userId:id,pool:'topup',amountCents:cents,ledgerKind:'recharge'}));const k=generateApiKey(id).key!;return {id,key:k.plaintextKey,keyId:k.info.id};}
function accountRequest(u:ReturnType<typeof user>,protocol=true){return new NextRequest('https://www.aiworkdeck.com/api/account/ai-key',{method:'POST',headers:{Authorization:`Bearer ${u.key}`,...(protocol?{'X-AWD-AI-Protocol':'2'}:{})}});}
function callRequest(token:string,body:unknown,id=randomUUID()){return new Request('https://www.aiworkdeck.com/api/account/ai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Request-Id':id},body:JSON.stringify(body)});}
let providerCalls=0,catalogCalls=0,lastBody:any;
let providerReply:()=>Promise<Response>=async()=>Response.json({id:'synthetic',choices:[{message:{role:'assistant',content:'OK'}}],usage:{prompt_tokens:100,completion_tokens:10}});
globalThis.fetch=async(resource,init)=>{const url=String(resource);assert.ok(url.startsWith('https://ws-test.cn-beijing.maas.aliyuncs.com/'),'Unexpected network blocked');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-bailian-key');if(url.includes('/api/v1/models')){catalogCalls++;return Response.json({success:true,output:{total:1,models:[rawModel]}});}assert.ok(url.endsWith('/chat/completions'));providerCalls++;lastBody=JSON.parse(String(init?.body));return providerReply();};
await check('supplier errors are safely classified',async()=>{
  for(const [status,message,code] of [[400,'product is not activated','model_not_activated'],[403,'Forbidden','upstream_permission_denied'],[429,'rate limit','busy'],[400,'InvalidParameter','invalid_request'],[503,'failure','upstream_failed']] as const){
    assert.equal((await classifyUpstreamError(Response.json({error:{message}},{status}))).code,code);
  }
  assert.equal((await classifyUpstreamError(new Response('not json',{status:400}))).code,'upstream_failed');
});
await check('availability snapshot fails closed and filters authorized models',async()=>{
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:['unavailable-other']}));
  await assert.rejects(platformModels(),/catalog_unavailable/);
  fs.unlinkSync('available.json');await assert.rejects(platformModels(),/catalog_unavailable/);
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'wrong-workspace',models:[model.id]}));await assert.rejects(platformModels(),/catalog_unavailable/);
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:[model.id]}));clearCatalogCache();
});
await check('verified thinking-only constraints apply before billing reservation',()=>{
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:[model.id],constraints:{[model.id]:{thinking:true,temperature:1}}}));
  const result=validateChat({model:model.id,messages:[{role:'user',content:'Hi'}],max_tokens:100,temperature:0.7,enable_thinking:false},model);
  assert.equal(result.body.enable_thinking,true);assert.equal(result.body.temperature,1);
  assert.equal(result.thinking,true);assert.equal(result.outputTokens,200);
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:[model.id]}));
});
await check('curated catalog excludes usable historical models and never substitutes unavailable selections',async()=>{
  const savedFetch=globalThis.fetch;
  const ids=['qwen3.8-max','deepseek-v4-pro-0813','deepseek-v4.1-flash-1017','kimi/kimi-k3.1-pro','glm-5.3','MiniMax/MiniMax-M3.1-Flash','qwen3.8-flash','kimi-k3','MiniMax-M2.5'];
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:ids}));
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:ids}));
  globalThis.fetch=async()=>Response.json({success:true,output:{total:ids.length,models:ids.map(id=>({...rawModel,model:id}))}});
  clearCatalogCache();
  const [internal,menu]=await Promise.all([platformModels(globalThis.fetch,true),platformModels()]);
  assert.deepEqual(internal.map(m=>m.id),ids.slice(0,7));assert.deepEqual(menu.map(m=>m.id),ids.slice(0,6));
  assert.deepEqual((await platformModels()).map(m=>m.id),ids.slice(0,6));
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:ids.filter(id=>id!=='glm-5.3')}));
  assert.deepEqual((await platformModels()).map(m=>m.id),ids.slice(0,6).filter(id=>id!=='glm-5.3'));
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:[model.id]}));
  fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:[model.id]}));
  globalThis.fetch=savedFetch;clearCatalogCache();
});
await check('DeepSeek peak/offpeak pricing observes Beijing boundaries and refuses incomplete bands',()=>{
 const prices=[{range_name:'Default',prices:['peak','offpeak'].flatMap(time_band=>[price('input_token',time_band==='peak'?2:1),price('output_token',time_band==='peak'?8:4)].map(p=>({...p,time_band})))}];
 const peakModel=parseBailianModel({...rawModel,prices})!;assert.ok(peakModel);
 for(const [at,cost] of [['2026-11-03T23:59:59Z',1],['2026-11-04T00:00:00Z',2],['2026-11-04T13:59:59Z',2],['2026-11-04T14:00:00Z',1]] as const)assert.equal(usageCostCny(peakModel,{prompt_tokens:1000000,completion_tokens:0},false,at),cost);
 assert.equal(parseBailianModel({...rawModel,prices:[{...prices[0],prices:prices[0].prices.filter(p=>p.time_band==='peak')}]}),null);
});
await check('MiniMax missing supplier output limit uses verified application cap',()=>{assert.equal(parseBailianModel({...rawModel,model:'MiniMax/MiniMax-M3.1-Flash',model_info:{...rawModel.model_info,max_output_tokens:null}})?.maxOutputTokens,8192);assert.equal(parseBailianModel({...rawModel,model_info:{...rawModel.model_info,max_output_tokens:null}}),null);});
await check('decimal price tier boundaries and cache discount',()=>{assert.equal(usageCostCny(model,{prompt_tokens:32000,completion_tokens:0},false),0.032);assert.equal(usageCostCny(model,{prompt_tokens:32001,completion_tokens:0},false),0.096003);assert.equal(usageCostCny(model,{prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:50}},false),0.000075);assert.throws(()=>usageCostCny(model,{prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:101}},false));});
await check('unpriced, unsupported units and batch-only models fail closed',()=>{assert.equal(parseBailianModel({...rawModel,prices:[]}),null);assert.equal(parseBailianModel({...rawModel,prices:[{range_name:'Default',prices:[{...price('input_token',1),time_band:'batch'},price('output_token',2)]}]}),null);assert.equal(parseBailianModel({...rawModel,prices:[{range_name:'unknown',prices:[price('input_token',1),price('output_token',2)]}]}),null);});
const a=user(),token=issueRuntimeToken(a.id,accountRequest(a));
await check('AI runtime token is stable, signed, account-key-bound and scoped',()=>{assert.equal(issueRuntimeToken(a.id,accountRequest(a)),token);assert.equal(resolveRuntimeUser(callRequest(token,{}))?.id,a.id);assert.equal(resolveRuntimeUser(callRequest(token+'x',{})),null);assert.equal(resolveRuntimeUser(callRequest(a.key,{})),null);});
await check('legacy cn client never receives OR key',async()=>{const response=await keyRoute(accountRequest(a,false));assert.equal(response.status,409);assert.equal((await response.json()).error,'client_upgrade_required');});
await check('cn descriptor contains only scoped runtime token and same-site route',async()=>{const response=await keyRoute(accountRequest(a));assert.equal(response.status,200);const d=await response.json();assert.equal(d.apiKey,token);assert.equal(d.provider,'bailian');assert.equal(d.baseUrl,'https://www.aiworkdeck.com/api/account/ai/v1');assert.equal(d.defaultModel,'qwen3.8-max');assert.equal(d.openrouterKey,undefined);assert.ok(!JSON.stringify(d).includes('synthetic-bailian-key'));});
await check('catalog cached without extra supplier calls',async()=>{const n=catalogCalls;await platformModels();await platformModels();assert.equal(catalogCalls,n);});
await check('untrusted cost/provider controls and builtin tools rejected',()=>{assert.throws(()=>validateChat({messages:[{role:'user',content:'x'}],model:model.id,usage:{cost:0}},model));assert.throws(()=>validateChat({messages:[{role:'user',content:'x'}],model:model.id,tools:[{type:'web_search'}]},model));});
await check('non-stream request charges once from trusted usage',async()=>{const id=randomUUID(),before=getBalance(a.id),body={model:model.id,messages:[{role:'user',content:'Hello'}],max_tokens:100,stream:false};const response=await chat(callRequest(token,body,id));assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'OK');assert.equal(requestRow(a.id,id)?.state,'settled');assert.equal(getBalance(a.id),before-1);const n=providerCalls;const repeat=await chat(callRequest(token,body,id));assert.equal(repeat.status,409);assert.equal(providerCalls,n);});
await check('stream DONE is held until settlement, including no-space frames',async()=>{providerReply=async()=>new Response('data:{"id":"s","choices":[{"delta":{"content":"OK"}}]}\n\ndata:{"id":"s","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\ndata:[DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});const id=randomUUID();const response=await chat(callRequest(token,{model:model.id,messages:[{role:'user',content:'Hi'}],stream:true,max_tokens:100},id));const text=await response.text();assert.ok(text.includes('OK'));assert.equal((text.match(/\[DONE\]/g)||[]).length,1);assert.equal(requestRow(a.id,id)?.state,'settled');});
await check('definitive rejection refunds exactly, network uncertainty stays pending',async()=>{const before=getBalance(a.id);providerReply=async()=>new Response('{}',{status:429});const id=randomUUID();assert.equal((await chat(callRequest(token,{model:model.id,messages:[{role:'user',content:'Hi'}],max_tokens:100},id))).status,429);assert.equal(requestRow(a.id,id)?.state,'released');assert.equal(getBalance(a.id),before);providerReply=async()=>{throw new Error('connection_lost');};const id2=randomUUID();assert.equal((await chat(callRequest(token,{model:model.id,messages:[{role:'user',content:'Hi'}],max_tokens:100},id2))).status,502);assert.equal(requestRow(a.id,id2)?.state,'usage_pending');assert.ok(getBalance(a.id)<before);});
await check('activation rejection is localized and releases the reservation',async()=>{
  const b=user(),tok=issueRuntimeToken(b.id,accountRequest(b)),id=randomUUID(),before=getBalance(b.id);
  providerReply=async()=>Response.json({error:{code:'InvalidParameter',message:'product is not activated private-provider-detail'}},{status:400});
  const response=await chat(callRequest(tok,{model:model.id,messages:[{role:'user',content:'Hi'}],max_tokens:100},id));
  assert.equal(response.status,503);const result=await response.json();assert.equal(result.error.code,'model_not_activated');assert.ok(!JSON.stringify(result).includes('private-provider-detail'));assert.equal(requestRow(b.id,id)?.state,'released');assert.equal(getBalance(b.id),before);
});
await check('audio validation normalizes base64 and reserves full input bound',()=>{const omni=parseBailianModel({...rawModel,model:'qwen3.8-omni-flash',capabilities:['Multimodal-Omni'],inference_metadata:{request_modality:['Text','Audio'],response_modality:['Text']},prices:[{range_name:'Default',prices:[price('omni_input_token',0.8),price('omni_output_token',2.7),price('omni_input_token_cache',0.1)]}]})!;assert.ok(omni.supportsAudio);const v=validateChat({model:omni.id,messages:[{role:'user',content:[{type:'input_audio',input_audio:{format:'wav',data:'UklGRg=='}}]}],max_tokens:10},omni);assert.equal(v.inputTokens,omni.maxInputTokens);assert.equal(v.body.messages[0].content[0].input_audio.data,'data:audio/wav;base64,UklGRg==');});
await check('pre-reservation prevents overspend and preserves zero balance',()=>{const b=user(1),id=randomUUID();reserve(b.id,id,{message:'x'},model,100,10,false);assert.equal(getBalance(b.id),0);assert.throws(()=>reserve(b.id,randomUUID(),{message:'x'},model,100,10,false));submitted(b.id,id);settle(b.id,id,{prompt_tokens:100,completion_tokens:10});assert.equal(getBalance(b.id),0);});
await check('retirement disables first, settles once, then ordinary calls stop depending on OR',async()=>{const b=user(),db=getDb(),calls:string[]=[];db.prepare('INSERT INTO openrouter_keys(userId,orKeyHash,limitUsd,createdAt,settledUsageUsd) VALUES (?,?,?,?,?)').run(b.id,'old-hash',10,new Date().toISOString(),0);setMgmtFetch(async(url,init)=>{calls.push(init?.method||'GET');return Response.json({data:{hash:'old-hash',usage:0.01,limit:10,disabled:true}});});await retireOpenRouter(b.id);assert.deepEqual(calls,['PATCH','GET']);const balance=getBalance(b.id);await retireOpenRouter(b.id);assert.equal(calls.length,2);await retireOpenRouter(b.id,true);assert.equal(getBalance(b.id),balance);assert.equal(calls.length,3);const stale=db.prepare('SELECT * FROM openrouter_keys WHERE userId=?').get(b.id) as any;settleUsage(stale,0.02,10,1);const after=getBalance(b.id);settleUsage(stale,0.02,10,1);assert.equal(getBalance(b.id),after);});
await check('authorization withdrawal invalidates cached catalog and thinking inputs are bounded',async()=>{
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:['other-model']}));
  await assert.rejects(platformModels(),/catalog_unavailable/);
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:[model.id]}));
  for(const extra of [{thinking_budget:-1},{thinking_budget:'10'},{reasoning_effort:{}},{enable_thinking:'true'}])assert.throws(()=>validateChat({model:model.id,messages:[{role:'user',content:'x'}],...extra},model));
  assert.equal(validateChat({model:model.id,messages:[{role:'user',content:'x'}],enable_thinking:true,max_tokens:10,thinking_budget:20},model).outputTokens,30);
});
await check('authorization withdrawal while catalog is in flight never returns revoked models',async()=>{
  clearCatalogCache();let finish!:()=>void;const wait=new Promise<void>(r=>finish=r);
  const slow:typeof fetch=async()=>{await wait;return Response.json({success:true,output:{total:1,models:[rawModel]}});};
  const first=platformModels(slow);fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:['other-model']}));const second=platformModels(slow);
  const results=Promise.allSettled([first,second]);finish();assert.ok((await results).every(r=>r.status==='rejected'));
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:[model.id]}));clearCatalogCache();
});
await check('cost above reservation persists receipt and pending state without overdraft',()=>{
  const b=user(),id=randomUUID();reserve(b.id,id,{x:1},model,100,10,false);submitted(b.id,id);const before=getBalance(b.id);
  assert.equal(settle(b.id,id,{prompt_tokens:900000,completion_tokens:10000}).state,'usage_pending');assert.equal(getBalance(b.id),before);assert.ok(requestRow(b.id,id)?.costCny!>0);
});
await check('stream supplier activation error stays explicit with uncertain usage pending',async()=>{
  providerReply=async()=>new Response('data: {"error":{"message":"product is not activated"}}\n\ndata: [DONE]\n\n');
  const b=user(),tok=issueRuntimeToken(b.id,accountRequest(b)),id=randomUUID();
  const response=await chat(callRequest(tok,{model:model.id,messages:[{role:'user',content:'Hi'}],stream:true,max_tokens:100},id));
  assert.match(await response.text(),/model_not_activated/);
  assert.equal(requestRow(b.id,id)?.state,'usage_pending');
});
await check('paid cancellation detaches delivery but still settles receipt',async()=>{
  let finish!:()=>void;const ready=new Promise<void>(r=>finish=r);providerReply=async()=>new Response(new ReadableStream({async start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));await ready;c.enqueue(new TextEncoder().encode('data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\ndata: [DONE]\n\n'));c.close();}}));
  const id=randomUUID(),b=user(),tok=issueRuntimeToken(b.id,accountRequest(b));const response=await chat(callRequest(tok,{model:model.id,messages:[{role:'user',content:'Hi'}],stream:true,max_tokens:100},id));await response.body!.cancel();finish();
  for(let i=0;i<100&&requestRow(b.id,id)?.state!=='settled';i++)await new Promise(r=>setTimeout(r,5));assert.equal(requestRow(b.id,id)?.state,'settled');
});
await check('paid settlement freezes FX, margin, original subscription period and week',()=>{
  const b=user(),db=getDb(),id=randomUUID(),now=Date.now();const start=new Date(now-1000).toISOString(),end=new Date(now+86400000).toISOString();
  db.prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES (?,'pro','test-sub',?,?)").run(b.id,start,end);
  const period=Number(db.prepare('INSERT INTO subscription_period(userId,outTradeNo,cycle,startsAt,endsAt,monthlyCents,weeklyCents) VALUES (?,?,0,?,?,1000,100)').run(b.id,randomUUID(),start,end).lastInsertRowid);
  reserve(b.id,id,{x:1},model,100,10,false);const row=requestRow(b.id,id)!;assert.equal(JSON.parse(row.fundingJson).periodId,period);
  db.prepare('UPDATE subscription_period SET endsAt=? WHERE id=?').run(start,period);db.prepare("UPDATE entitlements SET expiresAt=? WHERE userId=?").run(start,b.id);
  fs.writeFileSync('data/ai-config.json',JSON.stringify({exchangeRateMode:'manual',exchangeRate:20,marginMultiplier:2}));submitted(b.id,id);const result=settle(b.id,id,{prompt_tokens:100,completion_tokens:10});assert.equal(result.exchangeRate,10);assert.equal(result.margin,1);assert.equal(result.chargedCents,1);
  const used=db.prepare('SELECT SUM(amountCents) n FROM subscription_usage WHERE periodId=? AND weekStart=?').get(period,JSON.parse(row.fundingJson).weekStart) as any;assert.equal(used.n,1);
  fs.writeFileSync('data/ai-config.json',JSON.stringify({exchangeRateMode:'manual',exchangeRate:10,marginMultiplier:1}));
});
await check('domestic Web chat uses Bailian and its original prepaid ledger',async()=>{
  const {createSession,SESSION_COOKIE}=await import('@/lib/sessions');const {POST:webChat}=await import('@/app/api/web/chat/route');const {getRequest}=await import('@/lib/web-ai/store');
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:[model.id,'qwen3.8-flash']}));fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:[model.id,'qwen3.8-flash']}));
  const originalCatalogFetch=globalThis.fetch;globalThis.fetch=async(resource,init)=>String(resource).includes('/api/v1/models')?Response.json({success:true,output:{total:2,models:[rawModel,{...rawModel,model:'qwen3.8-flash'}]}}):originalCatalogFetch(resource,init);clearCatalogCache();
  process.env.WEB_AI_ENABLED='1';const b=user(),id=randomUUID();providerReply=async()=>new Response('data: {"id":"web-native","choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\ndata: [DONE]\n\n');
  const request=new NextRequest('https://www.aiworkdeck.com/api/web/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://www.aiworkdeck.com',Cookie:`${SESSION_COOKIE}=${createSession(b.id).token}`},body:JSON.stringify({requestId:id,language:'en',mode:'chat',message:'Hi',history:[],document:{id:randomUUID(),version:1,name:'test.docx',text:'test'}})});
  const response=await webChat(request);assert.equal(response.status,200);const text=await response.text();assert.ok(text.includes('Hi'));assert.equal(getRequest(b.id,id)?.state,'settled');assert.equal(lastBody.model,'qwen3.8-flash');assert.equal(lastBody.provider,undefined);globalThis.fetch=originalCatalogFetch;clearCatalogCache();
});
await check('recorded Qwen tool-call streams (empty id on continuation chunks) reach the workbench as one valid doc_apply_edits call',async()=>{
  const {createSession,SESSION_COOKIE}=await import('@/lib/sessions');const {POST:webChat}=await import('@/app/api/web/chat/route');const {getRequest,webReserveCents}=await import('@/lib/web-ai/store');const {validateToolCall}=await import('@/web-workbench/src/agent-contract.js');
  const recorded=JSON.parse(fs.readFileSync(new URL('./fixtures/web-agent-qwen-tool-calls.json',import.meta.url),'utf8'));
  fs.writeFileSync('authorized.json',JSON.stringify({workspaceId:'ws-test',models:[model.id,'qwen3.8-flash']}));fs.writeFileSync('available.json',JSON.stringify({workspaceId:'ws-test',models:[model.id,'qwen3.8-flash']}));
  const originalCatalogFetch=globalThis.fetch;globalThis.fetch=async(resource,init)=>String(resource).includes('/api/v1/models')?Response.json({success:true,output:{total:2,models:[rawModel,{...rawModel,model:'qwen3.8-flash'}]}}):originalCatalogFetch(resource,init);clearCatalogCache();
  process.env.WEB_AI_ENABLED='1';
  try{for(const [label,edits] of [['single-clause',1],['three-issues',3]] as const){
    const fixture=recorded.cases.find((c:any)=>c.label===label);assert.ok(fixture.sse.includes('"id":""'),'fixture keeps the supplier quirk');
    const b=user(),id=randomUUID(),body:any={requestId:id,language:'zh',mode:'agent',message:fixture.instruction,history:[],document:fixture.document,agentStep:0,agentHistory:[],agentContext:fixture.agentContext};
    body.agentBudget={currency:'CNY',perGenerationMaxChargeCents:webReserveCents(body,10,1)};
    providerReply=async()=>new Response(fixture.sse);
    const response=await webChat(new NextRequest('https://www.aiworkdeck.com/api/web/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://www.aiworkdeck.com',Cookie:`${SESSION_COOKIE}=${createSession(b.id).token}`},body:JSON.stringify(body)}));
    assert.equal(response.status,200);const text=await response.text();
    assert.ok(!text.includes('event: error'),`${label}: ${text.slice(0,400)}`);
    const frame=text.split('\n\n').find(f=>f.startsWith('event: tool_calls'));assert.ok(frame,label);
    const data=JSON.parse(frame!.slice(frame!.indexOf('data: ')+6));assert.equal(data.calls.length,1);assert.equal(data.calls[0].function.name,'doc_apply_edits');
    const args=validateToolCall('doc_apply_edits',data.calls[0].function.arguments);assert.equal(args.edits.length,edits);
    const known=new Set(fixture.agentContext.targets.map((t:any)=>t.targetId));assert.ok(args.edits.every((e:any)=>known.has(e.targetId)));
    assert.equal(lastBody.model,'qwen3.8-flash');assert.equal(getRequest(b.id,id)?.state,'settled');
  }}finally{globalThis.fetch=originalCatalogFetch;clearCatalogCache();}
});
await check('Skill stays free at zero balance, survives disconnect, and never double charges',async()=>{
  const {connectOpenRouter}=await import('@/lib/ai-stream');const b=user(0);
  providerReply=async()=>new Response('data: {"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\ndata: [DONE]\n\n');
  const reply=await connectOpenRouter({userId:b.id,apiKey:'unused',model:model.id,messages:[{role:'user',content:'Hi'}],maxTokens:100,temperature:0.3,timeoutMs:5000,origin:'https://www.aiworkdeck.com'},'skill-chat');assert.equal(reply.ok,true);if(!reply.ok)return;
  reply.abort();await reply.res.text();assert.equal(reply.billing!().charged,false);assert.equal(reply.billing!().costCents,1);assert.equal(getBalance(b.id),0);
  const c=user();const paid=await connectOpenRouter({userId:c.id,apiKey:'unused',model:model.id,messages:[{role:'user',content:'Hi'}],maxTokens:100,temperature:0.3,timeoutMs:5000,origin:'https://www.aiworkdeck.com'},'skill-draft');if(!paid.ok)throw new Error('Skill unavailable');await paid.res.text();assert.equal(getBalance(c.id),9999);paid.billing!();paid.billing!();assert.equal(getBalance(c.id),9999);
});
await check('Skill HTTP locks a conversation before the upstream handshake and bills once',async()=>{
  const {POST:skillChat}=await import('@/app/api/ai/skill-chat/route');const {createChatSession}=await import('@/lib/skill-chat-store');const {createSession,SESSION_COOKIE}=await import('@/lib/sessions');
  const b=user(),session=createChatSession({userId:b.id,model:model.id,lang:'en',title:'test'}),cookie=`${SESSION_COOKIE}=${createSession(b.id).token}`;let finish!:()=>void,entered!:()=>void;
  const wait=new Promise<void>(r=>finish=r),started=new Promise<void>(r=>entered=r);
  providerReply=async()=>{entered();await wait;return new Response('data: {"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":100,"completion_tokens":10}}\n\ndata: [DONE]\n\n');};
  const req=()=>new NextRequest('https://www.aiworkdeck.com/api/ai/skill-chat',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({message:'Hi',conversationId:session.id,lang:'en',model:model.id})});
  const first=skillChat(req());await started;const second=await skillChat(req());assert.equal(second.status,409);assert.equal((await second.json()).error,'chat_busy');finish();const response=await first;assert.equal(response.status,200);const text=await response.text();assert.match(text,/"type":"billing"/);assert.equal(getBalance(b.id),9999);
});
await check('Skill unknown receipt is explicitly pending, cannot be displayed as free, and is recorded',async()=>{
  const {connectOpenRouter}=await import('@/lib/ai-stream');const b=user();providerReply=async()=>new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n');
  const reply=await connectOpenRouter({userId:b.id,apiKey:'unused',model:model.id,messages:[{role:'user',content:'Hi'}],maxTokens:100,temperature:0.3,timeoutMs:5000,origin:'https://www.aiworkdeck.com'},'skill-chat');if(!reply.ok)throw new Error('Skill unavailable');assert.match(await reply.res.text(),/usage_pending/);assert.throws(()=>reply.billing!(),/usage_pending/);assert.equal((getDb().prepare('SELECT state FROM skill_ai_request WHERE userId=?').get(b.id) as any).state,'usage_pending');assert.equal(getBalance(b.id),10000);
});
await check('revoked parent key invalidates derived runtime immediately',()=>{assert.equal(revokeApiKey(a.id,a.keyId),true);assert.equal(resolveRuntimeUser(callRequest(token,{})),null);});
await check('unknown receipts receive finite incident refund and stop new calls',()=>{const b=user(),id=randomUUID();reserve(b.id,id,{x:1},model,100,10,false);submitted(b.id,id);pending(b.id,id);const before=getBalance(b.id);getDb().prepare('UPDATE platform_ai_request SET createdAt=? WHERE userId=? AND requestId=?').run(new Date(Date.now()-16*60_000).toISOString(),b.id,id);recoverPending();assert.equal(requestRow(b.id,id)?.state,'refunded_pending');assert.ok(getBalance(b.id)>before);assert.throws(()=>reserve(b.id,randomUUID(),{x:2},model,100,10,false),/reconciliation_required/);});
globalThis.fetch=originalFetch;closeDb();console.log(`PASS ${counted} platform AI checks; isolated synthetic data only`);
