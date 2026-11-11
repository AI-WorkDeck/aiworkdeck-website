// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** One-shot operator-approved real-provider smoke. Never runs in ordinary CI. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const domestic=process.env.NEXT_PUBLIC_AWD_SITE!=='intl';
const plan={model:domestic?'qwen3.8-flash':'qwen/qwen3-235b-a22b-2507',maximumRequests:2,maxProviderUsdPerRequest:0.056192,maxProviderUsdTotal:0.112384,fixture:'two short synthetic Chinese/English paragraphs; temporary user/DB/session; no production ledger writes'};
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({status:'dry_run',...plan}));process.exit(0);}
if(process.env.WEB_AI_SMOKE_APPROVED!=='1')throw Error('Explicit operator budget approval required: WEB_AI_SMOKE_APPROVED=1');
// An explicit deployed file is read in place by this process only; never source a shell file.
if(domestic&&process.env.AWD_SMOKE_BAILIAN_ENV_FILE){
  const file=process.env.AWD_SMOKE_BAILIAN_ENV_FILE;
  if(!path.isAbsolute(file)||!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size>1_000_000)throw Error('Configured Bailian environment file is unavailable; no provider request made.');
  const values=parseEnv(fs.readFileSync(file,'utf8'));
  for(const key of ['DASHSCOPE_API_KEY','BAILIAN_BASE_URL','BAILIAN_WORKSPACE_ID','BAILIAN_AUTHORIZED_MODELS_FILE','BAILIAN_AVAILABLE_MODELS_FILE']){
    if(!process.env[key]&&values[key])process.env[key]=values[key];
  }
}
// Inherited server env takes precedence. Read only the existing server-side API key field.
// Never print this object, copy credential files, or export credentials to an artifact.
let apiKey=domestic?process.env.DASHSCOPE_API_KEY:process.env.OPENROUTER_API_KEY;
if(!apiKey&&!domestic){try{apiKey=JSON.parse(fs.readFileSync(process.env.AWD_SMOKE_CONFIG_FILE || path.join(repo,'data/ai-config.json'),'utf8')).apiKey;}catch{/* Report only absence below. */}}
if(!apiKey)throw Error('No existing server model credential is available; do not run a mock as a substitute.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'awd-web-live-'));
process.chdir(temp); // All dynamically imported DB/user/session modules capture this isolated cwd.
if(domestic)process.env.DASHSCOPE_API_KEY=apiKey;else process.env.OPENROUTER_API_KEY=apiKey;
process.env.WEB_AI_ENABLED='1';
process.env.AWD_KEY_ENCRYPTION_SECRET=crypto.randomBytes(32).toString('hex');
fs.mkdirSync('data',{mode:0o700});
fs.writeFileSync('data/ai-config.json',JSON.stringify({exchangeRateMode:'manual',exchangeRate:7.3,marginMultiplier:1.2}),{mode:0o600});
const userId=crypto.randomUUID();
fs.writeFileSync('data/users.json',JSON.stringify([{id:userId,username:'synthetic-web-smoke',email:'web-smoke@example.invalid',passwordHash:'not-a-login-password',displayName:'Synthetic Web Smoke',createdAt:new Date().toISOString()}]),{mode:0o600});
type Call = { requestId:string; mode:'chat'|'rewrite' };
type Result = Call & {model:string;costUsd:number;chargedCents:number;currency:string;verified:boolean};
const calls:Call[]=[],results:Result[]=[];
let closeDb:(()=>void)|undefined;
let readRequest:((userId:string,requestId:string)=>{generationId:string|null;state:string;costUsd:number|null;chargedCents:number|null}|undefined)|undefined;
let passed=false,finished=false;
function audit() {
  const allowedStates=['reserved','submitted','usage_pending','settled','released','refunded_pending'];
  const safeCalls=calls.map(call=>{
    let row;try{row=readRequest?.(userId,call.requestId);}catch{/* preserve unknown */}
    return {...call,generationId:row?.generationId&&/^[a-zA-Z0-9_-]{1,200}$/.test(row.generationId)?row.generationId:null,
      state:row&&allowedStates.includes(row.state)?row.state:'not_submitted_or_unknown',
      costUsd:typeof row?.costUsd==='number'&&Number.isFinite(row.costUsd)&&row.costUsd>=0?row.costUsd:null,
      chargedCents:typeof row?.chargedCents==='number'&&Number.isSafeInteger(row.chargedCents)&&row.chargedCents>=0?row.chargedCents:null};
  });
  const receipt={status:passed?'passed':'failed_or_unconfirmed',...plan,callCount:calls.length,calls:safeCalls,results,
    totalProviderUsd:passed?results.reduce((n,r)=>n+r.costUsd,0):null,automaticRetry:false};
  const serialized=JSON.stringify(receipt);
  // Safe IDs and accounting metadata survive even when the disposable DB is removed.
  // This file is consumed by the operator workflow's strict whitelist, never raw logs.
  if(process.env.AWD_SMOKE_RECEIPT_FILE){const file=process.env.AWD_SMOKE_RECEIPT_FILE;fs.writeFileSync(file+'.tmp',serialized,{mode:0o600});fs.renameSync(file+'.tmp',file);}
  return serialized;
}
function finish() {
  if(finished)return;finished=true;
  try{console.log(audit());}finally{try{closeDb?.();}finally{process.chdir(repo);fs.rmSync(temp,{recursive:true,force:true});}}
}
process.once('SIGTERM',()=>{try{finish();}finally{process.exit(143);}});
process.once('SIGINT',()=>{try{finish();}finally{process.exit(130);}});
try {
  const database=await import('../lib/db');closeDb=database.closeDb;
  const {withTransaction}=database;
  const {getRequest}=await import('../lib/web-ai/store');readRequest=getRequest;
  const {grantCredits}=await import('../lib/credits');
  const {createSession,SESSION_COOKIE}=await import('../lib/sessions');
  const {siteConfig}=await import('../lib/site-config');
  const {NextRequest}=await import('next/server');
  const {POST}=await import('../app/api/web/chat/route');
  const {RESERVE_USD,WEB_MODEL}=await import('../lib/web-ai/contract');
  assert.equal(WEB_MODEL,plan.model);
  assert.equal(RESERVE_USD,plan.maxProviderUsdPerRequest);
  withTransaction(db=>grantCredits(db,{userId,pool:'topup',amountCents:1000,ledgerKind:'recharge',meta:{synthetic:true}}));
  const session=createSession(userId);
  for(const mode of ['chat','rewrite'] as const){
    const requestId=crypto.randomUUID(), body={requestId,language:'zh',mode,message:mode==='chat'?'请说明这份测试文档的主题，只回复一句话。':'请把选中文本改得更简洁，保持中文。',history:[],document:{id:crypto.randomUUID(),version:1,name:'synthetic.docx',text:'这是一份合成测试文档。项目计划在周五进行测试。'},...(mode==='rewrite'?{selection:{text:'项目计划在周五进行测试。'}}:{})};
    calls.push({requestId,mode});audit();
    const response=await POST(new NextRequest(`${siteConfig.origin}/api/web/chat`,{method:'POST',headers:{host:new URL(siteConfig.origin).host,origin:siteConfig.origin,'content-type':'application/json',cookie:`${SESSION_COOKIE}=${session.token}`},body:JSON.stringify(body)}));
    assert.equal(response.status,200,'Expected authenticated SSE response');
    const events=(await response.text()).split('\n\n').flatMap(block=>{const event=/^event: (.+)$/m.exec(block)?.[1],data=/^data: (.+)$/m.exec(block)?.[1];return event&&data?[{event,data:JSON.parse(data)}]:[];});
    audit();
    assert.ok(!events.some(e=>e.event==='error'),'Real provider did not complete verified generation');
    const usage=events.find(e=>e.event==='usage')?.data;
    assert.equal(usage?.state,'settled');assert.ok(typeof usage.costUsd==='number'&&usage.costUsd>=0&&usage.costUsd<=plan.maxProviderUsdPerRequest);
    assert.ok(events.some(e=>e.event=== (mode==='chat'?'delta':'proposal')));
    results.push({mode,requestId,model:usage.model,costUsd:usage.costUsd,chargedCents:usage.chargedCents,currency:usage.currency,verified:true});
  }
  passed=true;
} catch {
  // No raw exception, provider output, document text, key or cookie reaches stdout.
  process.exitCode=1;
} finally {finish();}
