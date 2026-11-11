// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Execute from an empty cwd. All HTTP, images, accounts and money are synthetic. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
assert(!fs.existsSync('package.json')&&!fs.existsSync('data'),'Use a new empty directory');
process.env.NEXT_PUBLIC_AWD_SITE='cn';
process.env.DASHSCOPE_API_KEY='synthetic-key';process.env.BAILIAN_WORKSPACE_ID='ws-test';
process.env.BAILIAN_BASE_URL='https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
process.env.AWD_KEY_ENCRYPTION_SECRET='synthetic-test-secret';
fs.mkdirSync('data');
process.env.BAILIAN_AUTHORIZED_MODELS_FILE='data/authorized-models.json';
process.env.BAILIAN_AVAILABLE_MODELS_FILE='data/available-models.json';
fs.writeFileSync('data/available-models.json',JSON.stringify({workspaceId:'ws-test',models:['qwen-image-3.0']}));
const grants=(models:string[])=>fs.writeFileSync('data/authorized-models.json',JSON.stringify({workspaceId:'ws-test',updatedAt:new Date().toISOString(),models}));
grants(['qwen-image-3.0']);
fs.writeFileSync('data/ai-config.json',JSON.stringify({exchangeRateMode:'manual',exchangeRate:7,marginMultiplier:1.2}));
fs.writeFileSync('data/users.json',JSON.stringify(['image-a','image-b'].map(id=>({id,username:id,email:`${id}@test.invalid`,passwordHash:'x:y',displayName:id,createdAt:new Date().toISOString()}))));
globalThis.fetch=async()=>{throw new Error('Unexpected external network');};
const {imageCompletion,validateImageChat,validatedResultUrl}=await import('../lib/platform-ai/images');
const {parseImagePrices,imagePrices,imageUsageCost,clearImagePriceCache}=await import('../lib/platform-ai/images-billing');
const {getDb,withTransaction}=await import('../lib/db');
const {grantCredits,getBalance}=await import('../lib/credits');
const {requestRow}=await import('../lib/platform-ai/billing');
for(const userId of ['image-a','image-b'])withTransaction(db=>grantCredits(db,{userId,pool:'topup',amountCents:10000,ledgerKind:'recharge'}));
const png=await sharp({create:{width:2048,height:1152,channels:3,background:'#ff0000'}}).png().toBuffer();
const ref=await sharp({create:{width:32,height:32,channels:3,background:'#ff0000'}}).png().toBuffer();
const refUrl=`data:image/png;base64,${ref.toString('base64')}`;
const model={model:'qwen-image-3.0',capabilities:['IG'],prices:[{range_name:'Default',prices:[
  ['qima_input_1k','0.02'],['qima_input_2k','0.02'],['qima_output_1k','0.18'],['qima_output_2k','0.18']
].map(([type,price])=>({type,price,price_unit:'每张',time_band:'standard'}))}]};
function body(refs=0){return {model:'qwen-image-3.0',modalities:['text','image'],image_config:{aspect_ratio:'16:9',image_size:'2K'},messages:[{role:'system',content:'aspect_ratio=16:9, resolution=2K'},{role:'user',content:[...Array.from({length:refs},()=>({type:'image_url',image_url:{url:refUrl}})),{type:'text',text:'A red rectangle on white.'}]}]};}
let generationCalls=0,downloadCalls=0,catalogCalls=0,mode='ok',lastBody:any;
const mockFetch:typeof fetch=async(input,init)=>{
 const url=String(input);
 if(url.includes('/api/v1/models?')){catalogCalls++;return Response.json({success:true,output:{models:[model]}});}
 if(url.endsWith('/multimodal-generation/generation')) {
  generationCalls++;lastBody=JSON.parse(String(init?.body));
  assert.equal(lastBody.model,'qwen-image-3.0');assert.equal(lastBody.parameters.size,'2048*1152');assert.equal(lastBody.parameters.n,1);
  if(mode==='reject')return Response.json({code:'InvalidParameter'},{status:400});
  if(mode==='unknown')return new Response('',{status:503});
  const inputCount=lastBody.input.messages[0].content.filter((p:any)=>p.image).length;
  return Response.json({request_id:'provider-synthetic-id',usage:mode==='no-usage'?undefined:{input_image_count:inputCount,input_image_type:'qima_input_2k',output_image_count:1,output_image_type:'qima_output_2k',output_width:2048,output_height:1152},output:{choices:[{message:{content:[{image:mode==='evil-url'?'http://127.0.0.1/private.png':'https://dashscope-a717.oss-accelerate.aliyuncs.com/synthetic.png?Expires=1'}]}}]}});
 }
 downloadCalls++;assert.equal(url,'https://dashscope-a717.oss-accelerate.aliyuncs.com/synthetic.png?Expires=1');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),null);
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png'}});
};
const request=(id:string)=>new Request('https://www.aiworkdeck.com/api/account/ai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','X-Request-Id':id}});
const prices=parseImagePrices(model);assert(Math.abs(imageUsageCost(prices,{input_image_count:1,input_image_type:'qima_input_2k',output_image_count:1,output_image_type:'qima_output_2k',output_width:2048,output_height:1152},1)-0.2)<1e-10);
assert.throws(()=>parseImagePrices({...model,prices:[]}));assert.throws(()=>imageUsageCost(prices,{input_image_count:0,output_image_count:1},0));
for(const invalid of [{...body(),image_config:{aspect_ratio:'16:9',image_size:'4K'}},body(4),{...body(),tools:[{type:'web_search'}]}])assert.throws(()=>validateImageChat(invalid));
const external:any=body(1);external.messages[1].content[0]={type:'image_url',image_url:{url:'https://example.com/private.png'}};assert.throws(()=>validateImageChat(external));
for(const url of ['https://example.com/x.png','http://dashscope-a717.oss-accelerate.aliyuncs.com/x.png','https://dashscope-a717.oss-accelerate.aliyuncs.com.evil.invalid/x.png','https://user:pass@dashscope-a717.oss-accelerate.aliyuncs.com/x.png'])assert.throws(()=>validatedResultUrl(url));
await Promise.all(Array.from({length:8},()=>imagePrices(mockFetch)));assert.equal(catalogCalls,1);
let before=getBalance('image-a');let response=await imageCompletion('image-a',request('image-test-01'),body(),mockFetch);let result=await response.json();
assert.equal(before-getBalance('image-a'),22);assert.equal(requestRow('image-a','image-test-01')?.state,'settled');
assert.equal(result.choices[0].message.images[0].image_url.url,`data:image/png;base64,${png.toString('base64')}`);
assert.equal(generationCalls,1);assert.equal(downloadCalls,1);
fs.writeFileSync('data/available-models.json',JSON.stringify({workspaceId:'ws-test',models:['qwen-plus']}));await assert.rejects(imageCompletion('image-a',request('image-not-available'),body(),mockFetch),/model_unavailable/);assert.equal(generationCalls,1);fs.writeFileSync('data/available-models.json',JSON.stringify({workspaceId:'ws-test',models:['qwen-image-3.0']}));
grants(['qwen-plus']);await assert.rejects(imageCompletion('image-a',request('image-no-grant'),body(),mockFetch),/model_unavailable/);assert.equal(generationCalls,1);assert.equal(requestRow('image-a','image-no-grant'),undefined);grants(['qwen-image-3.0']);
await assert.rejects(imageCompletion('image-a',request('image-test-01'),body(),mockFetch),/request_already_submitted/);assert.equal(generationCalls,1);
before=getBalance('image-a');await imageCompletion('image-a',request('image-test-02'),body(1),mockFetch);assert.equal(before-getBalance('image-a'),24);
assert.equal(lastBody.input.messages[0].content[0].image,refUrl);
before=getBalance('image-b');await imageCompletion('image-b',request('image-test-01'),body(),mockFetch);assert.equal(before-getBalance('image-b'),22);
mode='reject';before=getBalance('image-a');await assert.rejects(imageCompletion('image-a',request('image-reject'),body(),mockFetch));assert.equal(before,getBalance('image-a'));assert.equal(requestRow('image-a','image-reject')?.state,'released');
mode='unknown';before=getBalance('image-a');await assert.rejects(imageCompletion('image-a',request('image-unknown'),body(),mockFetch));assert.equal(before-getBalance('image-a'),22);assert.equal(requestRow('image-a','image-unknown')?.state,'usage_pending');
mode='no-usage';before=getBalance('image-a');await assert.rejects(imageCompletion('image-a',request('image-nousage'),body(),mockFetch));assert.equal(before-getBalance('image-a'),22);assert.equal(requestRow('image-a','image-nousage')?.state,'usage_pending');
mode='evil-url';before=getBalance('image-a');const downloadsBefore=downloadCalls;await assert.rejects(imageCompletion('image-a',request('image-evilurl'),body(),mockFetch));assert.equal(before-getBalance('image-a'),22);assert.equal(requestRow('image-a','image-evilurl')?.state,'settled');assert.equal(downloadCalls,downloadsBefore);
assert(!JSON.stringify(getDb().prepare('SELECT * FROM platform_ai_request').all()).includes('A red rectangle'));
clearImagePriceCache();
console.log('PASS: platform image sizing/reference mapping, trusted per-image billing, durable idempotency and user isolation, rejection/unknown usage, SSRF prevention, inline PNG response, no prompt persistence');
