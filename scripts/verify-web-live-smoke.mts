// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Verify failed LIVE-run auditing with a deny-all network substitute; no real API is called. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'awd-web-audit-test-'));
try{
  const preload=path.join(scratch,'network.mjs');
  fs.writeFileSync(preload,`
let calls=0;
globalThis.fetch=async(resource,init)=>{
 const url=new URL(String(resource));
 const domestic=process.env.NEXT_PUBLIC_AWD_SITE==='cn';
 if(url.origin!==(domestic?'https://ws-test.cn-beijing.maas.aliyuncs.com':'https://openrouter.ai'))throw Error('All external network is blocked by this fixture');
 if(domestic&&url.pathname==='/api/v1/models')return Response.json({success:true,output:{total:1,models:[{model:'qwen3.8-flash',capabilities:['TG'],features:['function-calling'],model_info:{context_window:100000,max_output_tokens:8192},inference_metadata:{response_modality:['Text']},prices:[{range_name:'Default',prices:['input_token','output_token'].map(type=>({type,price:7.3,price_unit:'每百万tokens'}))}]}]}});
 if(url.pathname==='/api/v1/generation')return new Response('{}',{status:404});
 if(url.pathname!==(domestic?'/compatible-mode/v1/chat/completions':'/api/v1/chat/completions'))throw Error('Unexpected endpoint');
 calls++;
 const content=calls===1?'合成回复。':'not JSON — synthetic invalid proposal';
 const cost=process.env.AWD_AUDIT_CASE==='missing'?undefined:calls/1000;
 const chunk={id:'gen-synthetic-'+calls,choices:[{delta:{content},finish_reason:'stop'}],...(cost===undefined?{}:{usage:domestic?{prompt_tokens:calls*1000,completion_tokens:0}:{cost}})};
 return new Response('data: '+JSON.stringify(chunk)+'\\n\\ndata: [DONE]\\n\\n',{headers:{'content-type':'text/event-stream'}});
};
`);
  const grants=path.join(scratch,'authorized.json');fs.writeFileSync(grants,JSON.stringify({workspaceId:'ws-test',models:['qwen3.8-flash']}));
  const absent=spawnSync(process.execPath,[path.join(repo,'node_modules/tsx/dist/cli.mjs'),'--tsconfig',path.join(repo,'tsconfig.json'),path.join(repo,'scripts/web-ai-live-smoke.mts')],{cwd:repo,encoding:'utf8',timeout:30000,env:{NODE_ENV:'test',PATH:process.env.PATH,TMPDIR:scratch,NODE_OPTIONS:`--import=${preload}`,NEXT_PUBLIC_AWD_SITE:'cn',WEB_AI_SMOKE_APPROVED:'1',OPENROUTER_API_KEY:'synthetic-never-valid-key',AWD_SMOKE_BAILIAN_ENV_FILE:path.join(scratch,'missing.env')}});
  assert.equal(absent.status,1);assert.match(absent.stderr,/Configured Bailian environment file is unavailable; no provider request made/);
  assert.ok(!absent.stdout.includes('gen-synthetic'));assert.ok(!absent.stderr.includes('synthetic-never-valid-key'));
  console.log('PASS cn/missing-config: explicit deployed file must exist; no OpenRouter fallback or provider request');
  for(const site of ['cn','intl'])for(const testCase of ['missing','invalid']){
    const receipt=path.join(scratch,site+'-'+testCase+'.json'), runtime=path.join(scratch,site+'-'+testCase);fs.mkdirSync(runtime);
    const envFile=path.join(scratch,site+'-'+testCase+'.env');
    fs.writeFileSync(envFile,`DASHSCOPE_API_KEY='synthetic-never-valid-key'\nBAILIAN_BASE_URL=https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1\nBAILIAN_AVAILABLE_MODELS_FILE=${grants}\nBAILIAN_AUTHORIZED_MODELS_FILE=${grants}\nWEB_AI_SMOKE_APPROVED=0\n`,{mode:0o600});
    const bailianEnv=site==='cn'&&testCase==='invalid'?{AWD_SMOKE_BAILIAN_ENV_FILE:envFile}:{DASHSCOPE_API_KEY:'synthetic-never-valid-key',BAILIAN_BASE_URL:'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',BAILIAN_AVAILABLE_MODELS_FILE:grants,BAILIAN_AUTHORIZED_MODELS_FILE:grants};
    const result=spawnSync(process.execPath,[path.join(repo,'node_modules/tsx/dist/cli.mjs'),'--tsconfig',path.join(repo,'tsconfig.json'),path.join(repo,'scripts/web-ai-live-smoke.mts')],{cwd:repo,encoding:'utf8',timeout:30000,env:{NODE_ENV:'test',PATH:process.env.PATH,TMPDIR:runtime,NODE_OPTIONS:`--import=${preload}`,NEXT_PUBLIC_AWD_SITE:site,...bailianEnv,WEB_AI_SMOKE_APPROVED:'1',OPENROUTER_API_KEY:'synthetic-never-valid-key',AWD_SMOKE_RECEIPT_FILE:receipt,AWD_AUDIT_CASE:testCase}});
    assert.equal(result.status,1,'Both fixtures intentionally fail validation');
    const data=JSON.parse(fs.readFileSync(receipt,'utf8'));
    assert.equal(data.model,site==='cn'?'qwen3.8-flash':'qwen/qwen3-235b-a22b-2507');
    assert.equal(data.status,'failed_or_unconfirmed');assert.equal(data.automaticRetry,false);
    assert.equal(data.callCount,testCase==='missing'?1:2);assert.equal(data.calls.length,data.callCount);
    assert.equal(data.calls[0].generationId,'gen-synthetic-1');
    if(testCase==='missing'){assert.equal(data.calls[0].state,'usage_pending');assert.equal(data.calls[0].costUsd,null);}
    else{assert.equal(data.calls[0].costUsd,0.001);assert.equal(data.calls[1].costUsd,0.002);assert.equal(data.calls[1].generationId,'gen-synthetic-2');assert.equal(data.calls[1].state,'settled');}
    const safe=fs.readFileSync(receipt,'utf8')+result.stdout+result.stderr;
    for(const secret of ['synthetic-never-valid-key','合成回复','not JSON','passwordHash','awd_session'])assert.ok(!safe.includes(secret),`Audit leaked forbidden content: ${secret}`);
    assert.ok(!fs.readdirSync(runtime).some(name=>name.startsWith('awd-web-live-')),'Disposable DB/user/session must be removed after failure');
    console.log(`PASS ${site}/${testCase}: failure keeps safe request/generation IDs and known/unknown costs, no retry/secrets/body, synthetic DB cleaned`);
  }
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
