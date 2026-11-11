// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in real provider acceptance. Default performs no browser, credential or network access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import JSZip from 'jszip';
import {waitForSavedEditor} from './browser-observation.mjs';

const plan={
 mode:'dry-run',maximumCompletionPosts:4,maximumRuns:1,automaticRetry:false,mockedAPI:false,
 requiredEnvironment:['WEB_LIVE_BASE_URL','WEB_LIVE_ACCOUNT','WEB_LIVE_PASSWORD','WEB_LIVE_EXPECTED_USER_ID','WEB_LIVE_CURRENCY','WEB_LIVE_MAX_TOTAL_CENTS','WEB_LIVE_APPROVED=1','WEB_LIVE_DEDICATED_ACCOUNT=1'],
 steps:['normal password form login; independently verify dedicated /api/auth/me identity',
  'visible homepage CTA → real LOWA → verify default direct-edit mode and synthetic example',
  'one natural-language instruction: 30→45 and bold the separate payment heading; no selection capture',
  'one run only: agent steps 0..3, unique request IDs, frozen per-generation quote and cumulative reservation cap',
  'require actual verified+saved write tool, full body, native heading bold, IDB DOCX XML and settled per-generation fees',
  'refresh the original AI-edited file; verify same persisted file, body and formatting',
  'actual Download DOCX UI; validate final text, heading bold and tracked changes; normal verified logout'],
 limitations:['Only a legitimately password-enabled dedicated account is supported; no account binding/captcha bypass.',
  'At most four completion POSTs; errors stop the run without completion retry or second user run.',
  'A repeated invocation can spend again; review previous receipts and the shared budget first.',
  'Live whole-run Undo is not exercised: reload invalidates its memory-only checkpoint. Native/fixture Undo acceptance is separate.',
  'No account-page screenshots, credentials, cookies, headers, HAR, provider response text or tool argument logs.']
};
if(!process.argv.includes('--live')||process.argv.includes('--dry-run')){
 console.log(JSON.stringify(plan,null,2));process.exit(0);
}
const required=name=>{const value=process.env[name];if(!value)throw Error('Missing required setting: '+name);return value};
if(process.env.WEB_LIVE_APPROVED!=='1'||process.env.WEB_LIVE_DEDICATED_ACCOUNT!=='1')throw Error('Explicit live approval and dedicated-account confirmation required');
const base=new URL(required('WEB_LIVE_BASE_URL'));
if(base.username||base.password||base.pathname!=='/'||base.search||base.hash||!['https:','http:'].includes(base.protocol))throw Error('BASE_URL must be an origin without credentials, path or query');
if(base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw Error('Non-local origins require HTTPS');
const account=required('WEB_LIVE_ACCOUNT'),password=required('WEB_LIVE_PASSWORD'),expectedUser=required('WEB_LIVE_EXPECTED_USER_ID');
const currency=required('WEB_LIVE_CURRENCY'),budget=Number(required('WEB_LIVE_MAX_TOTAL_CENTS'));
if(!/^[A-Z]{3}$/.test(currency)||!Number.isSafeInteger(budget)||budget<=0||(currency==='CNY'&&budget>10000))throw Error('Invalid explicit currency/budget');
const origin=base.origin,lang=process.env.WEB_LIVE_LANG==='en'?'en':'zh',en=lang==='en';
const out=path.resolve(process.env.WEB_LIVE_OUTPUT_DIR||fileURLToPath(new URL('../test-results/agent-live-'+Date.now()+'/',import.meta.url)));
await fs.mkdir(out,{recursive:true,mode:0o700});
const receiptFile=path.join(out,'receipt.json');await fs.writeFile(receiptFile,'{}',{flag:'wx',mode:0o600});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-agent-live-browser-'));
const audit={status:'running',dedicatedAccountVerified:false,maximumCompletionPosts:4,maximumRuns:1,budgetCents:budget,currency,requests:[],steps:[],automaticRetry:false,mockedAPI:false,liveWholeRunUndoVerified:false,maximumRunMs:1800000};
let browser,page,stage='launch',runExpired=false,completionGate=false,guardFailure=false,loginPosts=0,logoutPosts=0,postCount=0;
let cleanupLogout=false,runTimer,frozenQuote=null,reservationTotal=0,runId=null,documentId=null,fixtureVerified=false,baselineText=null;
const seenIds=new Set();
const original=en?'The Client shall pay the full fee within 30 days after delivery.':'甲方应在交付后30日内支付全部服务费用。';
const replacement=original.replace('30','45'),heading=en?'2. Payment':'第二条  付款安排';
const instruction=en?
 'In this fictional sample, change only the payment deadline from 30 days to 45 days and make the separate heading "2. Payment" bold. Apply both changes directly to the current document and save. Keep all other text and formatting unchanged. Do not ask me to select text or confirm again.':
 '请直接修改这份虚构示例：仅把付款条款的30日改为45日，并将独立标题“第二条  付款安排”加粗。直接保存到当前文档，其余文字和格式保持不变，不需要我手动选区或再次确认。';
const checkpoint=()=>fs.writeFile(receiptFile,JSON.stringify(audit,null,2)+'\n',{mode:0o600});
const pass=async step=>{audit.steps.push(step);await checkpoint();console.log('PASS '+step)};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function boundedCleanup(operation,timeoutMs){
 let timer;
 try{return await Promise.race([Promise.resolve().then(operation).then(()=> 'completed',()=> 'failed'),new Promise(resolve=>{timer=setTimeout(()=>resolve('timed_out'),timeoutMs)})])}
 finally{clearTimeout(timer)}
}
async function cleanupBrowser(){
 const result={},child=browser?.process();
 if(browser){
  result.close=await boundedCleanup(()=>browser.close(),10000);
  if(result.close!=='completed'){
   if(child&&child.exitCode===null&&child.signalCode===null)try{result.ownedChildTerminated=child.kill('SIGKILL')}catch{result.ownedChildTerminated=false}
   result.disconnect=await boundedCleanup(()=>browser.disconnect(),2000);
   child?.stdin?.destroy();child?.stdout?.destroy();child?.stderr?.destroy();child?.unref();
  }
 }
 result.profileRemoval=await boundedCleanup(()=>fs.rm(profile,{recursive:true,force:true,maxRetries:1}),5000);
 return result;
}
const getJSON=url=>page.evaluate(async url=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});return {status:response.status,data:await response.json()}}
 finally{clearTimeout(timer)}
},url);
const safeReceipt=value=>Object.fromEntries(['requestId','state','reservedCents','chargedCents','currency','costUsd'].filter(key=>['string','number'].includes(typeof value?.[key])).map(key=>[key,value[key]]));
async function refreshReceipt(call){
 try{const value=await getJSON('/api/web/requests/'+encodeURIComponent(call.requestId)+'?lang='+lang);
  if(value.status===200&&value.data.requestId===call.requestId)call.receipt=safeReceipt(value.data);
  else call.receiptStatus='unverified_http_'+value.status;
 }catch{call.receiptStatus='unverified'}
 await checkpoint();
}
function sumFees(){
 const settled=audit.requests.length>0&&audit.requests.every(call=>{
  const r=call.receipt;return r?.state==='settled'&&r.currency===currency&&Number.isSafeInteger(r.reservedCents)&&r.reservedCents>0&&r.reservedCents<=frozenQuote&&Number.isSafeInteger(r.chargedCents)&&r.chargedCents>=0&&r.chargedCents<=r.reservedCents;
 });
 audit.chargeStatus=settled?'settled':'unknown';
 audit.totalChargedCents=settled?audit.requests.reduce((n,call)=>n+call.receipt.chargedCents,0):null;
 audit.totalProviderUsd=settled&&audit.requests.every(call=>Number.isFinite(call.receipt.costUsd))?audit.requests.reduce((n,call)=>n+call.receipt.costUsd,0):null;
 if(settled&&audit.totalChargedCents>budget){audit.chargeStatus='unknown';audit.totalChargedCents=null;return false}
 return settled;
}
async function normalLogout(){
 return page.evaluate(async expected=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
  try{
   const opts={credentials:'same-origin',cache:'no-store',signal:controller.signal};
   const before=await fetch('/api/auth/me',opts);if(before.status!==200)return {verified:false};
   const current=await before.json();if(current.user===null)return {verified:true,alreadyAnonymous:true};
   if(current.user?.id!==expected)return {verified:false,identityMismatch:true};
   const response=await fetch('/api/auth/logout',{...opts,method:'POST'}),after=await fetch('/api/auth/me',opts);
   return {verified:response.status===200&&after.status===200&&(await after.json()).user===null};
  }finally{clearTimeout(timer)}
 },expectedUser);
}
async function freezeBudget(){
 const response=await getJSON('/api/web/capabilities?lang='+lang);assert.equal(response.status,200);
 const c=response.data,q=c.agent;assert.equal(c.authenticated,true);assert.equal(c.aiEnabled,true);assert.equal(c.agentEnabled,true);assert.equal(c.currency,currency);
 assert.ok(q&&Number.isSafeInteger(q.maxChargeCents)&&q.maxChargeCents>0);
 assert.ok(Number.isSafeInteger(q.maxRunChargeCents)&&q.maxRunChargeCents>=q.maxChargeCents*4);
 assert.ok(q.maxChargeCents*4<=budget,'Four-generation reservation exceeds approved budget');
 frozenQuote=q.maxChargeCents;audit.frozenPerGenerationMaxCents=frozenQuote;await checkpoint();
}
async function attach(){
 const dir=new URL('../vendor/core/frontend/src/composables/',import.meta.url);
 const relay=(await fs.readFile(new URL('zetaOfficeRelay.js',dir),'utf8')).replace(/^export /gm,'');
 const host=(await fs.readFile(new URL('useZetaOfficeWebview.js',dir),'utf8')).replace(/^import .*\n/gm,'').replace(/^export /gm,'');
 await page.evaluate('(()=>{'+relay+'\n'+host+'\nwindow.__agentLiveEditor=createIframeEditorExecutor(document.querySelector("#editor-container iframe"));})()');
}
async function cmd(action,params={}){
 const result=await page.evaluate((action,params)=>window.__agentLiveEditor.executeCommand(action,params),action,{...params,__agent:true});
 assert.equal(result?.success,true,'Native readback command failed');return result;
}
async function body(){
 const paragraphs=[];let start=0,revision;
 for(;;){
  const result=await cmd('get_document_text',{startParagraph:start,maxParagraphs:500});
  if(revision!==undefined)assert.equal(result.revision,revision);revision=result.revision;
  paragraphs.push(...result.paragraphs);
  if(!result.truncated)return {paragraphs,text:paragraphs.map(p=>p.text).join('\n')};
  assert.ok(result.nextStartParagraph>start);start=result.nextStartParagraph;
 }
}
async function assertNativeFormatting(){
 const result=await body(),paragraph=result.paragraphs.find(p=>p.text===heading);assert.ok(paragraph);
 await cmd('select_paragraph',{index:paragraph.index});assert.equal((await cmd('get_formatting')).character?.bold,true);
}
async function idbFile(expectedId){
 return page.evaluate(expected=>new Promise((resolve,reject)=>{
  const active=document.querySelector('.tab.active [data-file]')?.dataset.file;
  if(expected&&active!==expected)return reject(Error('ACTIVE_FILE_CHANGED'));
  const request=indexedDB.open('ai-workdeck-web-workbench');
  request.onsuccess=()=>{const db=request.result,read=db.transaction('files').objectStore('files').get(active);
   read.onsuccess=()=>{const f=read.result;db.close();f?resolve({id:f.id,version:f.version,bytes:Array.from(f.bytes)}):reject(Error('FILE_MISSING'))};
   read.onerror=()=>{db.close();reject(Error('IDB_READ_FAILED'))};
  };request.onerror=()=>reject(Error('IDB_OPEN_FAILED'));
 }),expectedId);
}
async function inspectDocx(bytes){
 const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('string');
 const parsed=await page.evaluate(({xml,heading})=>{
  const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main',doc=new DOMParser().parseFromString(xml,'application/xml');
  const finalText=p=>[...p.getElementsByTagNameNS(ns,'t')].filter(n=>{for(let e=n.parentElement;e;e=e.parentElement)if(e.namespaceURI===ns&&e.localName==='del')return false;return true}).map(n=>n.textContent).join('');
  const paragraphs=[...doc.getElementsByTagNameNS(ns,'p')],target=paragraphs.find(p=>finalText(p)===heading);
  const boldRuns=target?[...target.getElementsByTagNameNS(ns,'r')].filter(r=>finalText(r).length):[];
  const bold=boldRuns.length>0&&boldRuns.every(r=>[...r.getElementsByTagNameNS(ns,'b')].some(b=>!['0','false','off'].includes(b.getAttributeNS(ns,'val'))));
  return {text:paragraphs.map(finalText).join('\n'),bold,hasDeletion:doc.getElementsByTagNameNS(ns,'del').length>0};
 },{xml,heading});
 return parsed;
}
async function operationRecord(){
 return page.evaluate(run=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('ai-workdeck-web-workbench');
  request.onsuccess=()=>{
   const db=request.result,read=db.transaction('settings').objectStore('settings').getAll();
   read.onsuccess=()=>{
    let record;
    for(const row of read.result)if(String(row.key).startsWith('chat:')&&Array.isArray(row.value))for(const message of row.value)if(message.agent?.runId===run)record=message.agent;
    db.close();
    if(!record)return reject(Error('RUN_RECORD_MISSING'));
    resolve({status:record.status,requestIds:record.requests.map(r=>r.requestId),steps:record.steps.map(s=>({tool:s.tool,status:s.status,editCount:s.editCount,ok:s.result?.ok,saved:s.result?.saved,partial:s.result?.partial,verification:s.result?.verification}))});
   };read.onerror=()=>{db.close();reject(Error('IDB_READ_FAILED'))};
  };request.onerror=()=>reject(Error('IDB_OPEN_FAILED'));
 }),runId);
}
async function downloadDocx(){
 const directory=path.join(out,'downloads');await fs.mkdir(directory,{mode:0o700});
 const cdp=await browser.target().createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory,eventsEnabled:true});
 let timer,onProgress;
 const complete=new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('DOWNLOAD_TIMEOUT')),45000);
  onProgress=event=>{if(event.state==='completed')resolve();if(event.state==='canceled')reject(Error('DOWNLOAD_CANCELED'))};
  cdp.on('Browser.downloadProgress',onProgress);
 });
 try{
  await page.click('[data-action="download"]');await complete;
  const names=(await fs.readdir(directory)).filter(name=>name.endsWith('.docx'));assert.equal(names.length,1);
  const bytes=await fs.readFile(path.join(directory,names[0])),verified=await inspectDocx(bytes);
  assert.equal(verified.text,await body().then(r=>r.text));assert.ok(verified.text.includes(replacement)&&!verified.text.includes(original)&&verified.bold&&verified.hasDeletion);
  audit.download={bytes:bytes.length,sha256:hash(bytes),finalTextVerified:true,headingBoldVerified:true,trackedChangesPresent:true};
 }finally{clearTimeout(timer);cdp.off('Browser.downloadProgress',onProgress);await cdp.detach()}
}
try{
 await Promise.race([(async()=>{
  const launchEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('WEB_LIVE_')));
  browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',userDataDir:profile,headless:process.env.WEB_LIVE_HEADED==='1'?false:'new',env:launchEnv,protocolTimeout:660000,args:['--disable-dev-shm-usage']});
  page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.setDefaultTimeout(30000);await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request',async request=>{
   try{
    const url=new URL(request.url()),method=request.method(),mutation=!['GET','HEAD','OPTIONS'].includes(method);
    if(!mutation)return request.continue();
    const ownLogout=cleanupLogout&&audit.dedicatedAccountVerified&&url.origin===origin&&url.pathname==='/api/auth/logout'&&method==='POST';
    const reject=()=>{guardFailure=true;return request.abort('blockedbyclient')};
    if(url.origin!==origin||method!=='POST'||runExpired&&!ownLogout)return reject();
    if(url.pathname==='/api/auth/login'){if(++loginPosts>1||audit.dedicatedAccountVerified)return reject()}
    else if(url.pathname==='/api/auth/logout'){if(!ownLogout||++logoutPosts>1)return reject()}
    else if(url.pathname==='/api/web/chat'){
     postCount++;
     if(!completionGate||!audit.dedicatedAccountVerified||postCount>4||!Number.isSafeInteger(frozenQuote)||reservationTotal+frozenQuote>budget)return reject();
     let payload;try{payload=JSON.parse(request.postData()||'{}')}catch{return reject()}
     const budgetFields=payload.agentBudget;
     if(payload.mode!=='agent'||payload.language!==lang||payload.agentStep!==audit.requests.length||payload.agentStep>3||
      typeof payload.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.requestId)||seenIds.has(payload.requestId)||
      payload.message!==instruction||payload.document?.id!==documentId||![baselineText,baselineText?.replace(original,replacement)].includes(payload.document?.text)||typeof payload.agentContext?.runId!=='string'||!payload.agentContext.runId||
      !budgetFields||Object.keys(budgetFields).sort().join(',')!=='currency,perGenerationMaxChargeCents'||
      budgetFields.currency!==currency||budgetFields.perGenerationMaxChargeCents!==frozenQuote||
      (runId!==null&&payload.agentContext.runId!==runId)||(documentId!==null&&payload.document?.id!==documentId))return reject();
     if(runId===null)runId=payload.agentContext.runId;
     if(typeof documentId!=='string'||!documentId)return reject();
     seenIds.add(payload.requestId);reservationTotal+=frozenQuote;
     audit.requests.push({requestId:payload.requestId,step:payload.agentStep,reservedUpperBoundCents:frozenQuote});audit.reservationUpperBoundTotalCents=reservationTotal;
     await checkpoint();
    }else return reject();
    await request.continue();
   }catch{guardFailure=true;await request.abort('blockedbyclient').catch(()=>{})}
  });
  stage='login_page';await page.goto(origin+'/'+lang+'/account?next='+encodeURIComponent('/'+lang),{waitUntil:'domcontentloaded'});
  stage='login_hydration';await page.waitForFunction(()=>[...document.querySelectorAll('form input')].some(e=>Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k]?.onChange==='function')));
  if(!await page.$('#auth-account')){
   let clicked=false;for(const button of await page.$$('button[type="button"]'))if(['邮箱登录','密码登录','Email','Password'].includes((await button.evaluate(e=>e.textContent)).trim())){await button.click();clicked=true;break}
   assert.ok(clicked,'Normal password tab unavailable');
  }
  stage='login_form';await page.waitForSelector('#auth-account',{visible:true});await page.type('#auth-account',account);await page.type('#auth-password',password);
  const remember=await page.$('form input[type="checkbox"]');if(remember&&await remember.evaluate(e=>e.checked))await remember.click();
  const loginResponse=page.waitForResponse(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/api/auth/login'&&r.request().method()==='POST');
  await page.click('form button[type="submit"]');assert.equal((await loginResponse).status(),200);
  stage='login_identity';await page.waitForFunction(p=>location.pathname===p,{},'/'+lang);
  assert.equal((await getJSON('/api/auth/me')).data.user?.id,expectedUser);
  audit.dedicatedAccountVerified=true;await pass('normal password login verified the dedicated identity');
  stage='homepage_cta';
  let clicked=false;for(const link of await page.$$('a[href="/web/?lang='+lang+'"]'))if(await link.boundingBox()){await link.click();clicked=true;break}
  assert.ok(clicked,'Visible Web CTA unavailable');await page.waitForFunction(()=>['/web','/web/'].includes(location.pathname));
  stage='editor_boot';await waitForSavedEditor(page);await attach();assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  assert.equal(await page.$eval('#mode-agent',e=>e.classList.contains('active')),true);assert.equal(await page.$eval('#selection-chip',e=>e.hidden),true);
  const baseline=await body();assert.ok(baseline.text.includes(original)&&baseline.text.includes(heading));
  const before=await idbFile();assert.equal((await inspectDocx(Uint8Array.from(before.bytes))).bold,false,'Heading already bold; fixture does not prove formatting');
  documentId=before.id;baselineText=baseline.text;fixtureVerified=true;audit.baseline={sha256:hash(Uint8Array.from(before.bytes))};await pass('website CTA opened the synthetic sample in default direct-edit mode without selection capture');
  await page.screenshot({path:path.join(out,'01-workbench.png')});
  stage='budget_quote';await freezeBudget();
  await page.waitForFunction(()=>!document.querySelector('#send-button').disabled&&!document.querySelector('#chat-input').disabled);
  stage='one_agent_run';await page.type('#chat-input',instruction);completionGate=true;
  const firstPost=page.waitForRequest(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/api/web/chat'&&r.method()==='POST');
  await page.click('#send-button');await firstPost;
  await page.waitForFunction(()=>document.querySelector('.agent-record')&&document.querySelector('#stop-button').hidden,{timeout:660000});completionGate=false;
  assert.equal(guardFailure,false);assert.ok(audit.requests.length>=1&&audit.requests.length<=4);assert.equal(documentId,before.id);
  const record=await operationRecord();assert.equal(record.status,'completed');assert.deepEqual(record.requestIds,audit.requests.map(r=>r.requestId));
  const writes=record.steps.filter(s=>s.tool==='doc_apply_edits');assert.ok(writes.length>0&&writes.every(s=>s.status==='verified'&&s.ok===true&&s.saved===true&&s.partial===false&&s.verification==='verified'));
  audit.toolSteps=record.steps;await waitForSavedEditor(page);
  const changed=await body();assert.equal(changed.text,baseline.text.replace(original,replacement));await assertNativeFormatting();
  const saved=await idbFile(documentId),savedXML=await inspectDocx(Uint8Array.from(saved.bytes));
  assert.equal(savedXML.text,changed.text);assert.ok(savedXML.bold&&savedXML.hasDeletion);assert.ok(saved.version>before.version);
  audit.persisted={sha256:hash(Uint8Array.from(saved.bytes)),finalTextVerified:true,headingBoldVerified:true,trackedChangesPresent:true};
  for(const call of audit.requests)await refreshReceipt(call);assert.ok(sumFees(),'Every generation must have a settled, bounded real receipt');
  await pass('one real agent run verified and saved exact payment text and native heading bold with all fees settled');
  await page.screenshot({path:path.join(out,'02-agent-edited.png')});
  stage='reload_original';await page.reload({waitUntil:'domcontentloaded'});await waitForSavedEditor(page);await attach();
  assert.equal((await body()).text,changed.text);await assertNativeFormatting();await idbFile(documentId);
  await pass('normal refresh reopened the same original AI-edited IDB document with content and format retained');
  stage='download_docx';await downloadDocx();await pass('ordinary Download DOCX produced verified edited text, bold heading and tracked revisions');
  await page.screenshot({path:path.join(out,'03-reopened.png')});
  assert.equal(guardFailure,false);audit.status='passed';
 })(),new Promise((_,reject)=>{runTimer=setTimeout(()=>{runExpired=true;completionGate=false;reject(Error('RUN_DEADLINE'))},audit.maximumRunMs)})]);
}catch(error){
 audit.status='failed_or_unconfirmed';audit.failure={stage,type:['AssertionError','TimeoutError','ProtocolError','Error'].includes(error?.name)?error.name:'Error'};
 console.error('FAIL '+stage+'; inspect the sanitized receipt');process.exitCode=1;
 completionGate=false;runExpired=true;
 if(page&&fixtureVerified)audit.stopCleanup=await boundedCleanup(async()=>{if(await page.$eval('#stop-button',e=>!e.hidden)){await page.click('#stop-button');await page.waitForFunction(()=>document.querySelector('#stop-button').hidden,{timeout:10000})}},12000);
 if(page&&audit.dedicatedAccountVerified&&fixtureVerified&&new URL(page.url()).origin===origin&&['/web','/web/'].includes(new URL(page.url()).pathname))await boundedCleanup(()=>page.screenshot({path:path.join(out,'failure-workbench.png')}),5000);
}finally{
 clearTimeout(runTimer);runExpired=true;completionGate=false;
 const watchdog=setTimeout(()=>{console.error('FAIL cleanup_deadline; safe receipt retained');process.exit(1)},90000);
 try{
  audit.cleanup={receipts:[]};if(page)for(const call of audit.requests)audit.cleanup.receipts.push(await boundedCleanup(()=>refreshReceipt(call),10000));
  audit.attemptedCompletionPosts=postCount;audit.guardRejectedUnexpectedRequest=guardFailure;
  if(guardFailure){audit.status='failed_or_unconfirmed';process.exitCode=1}
  if(!sumFees()&&audit.requests.length){audit.status='failed_or_unconfirmed';process.exitCode=1}
  audit.logoutVerified=false;
  if(page&&audit.dedicatedAccountVerified){
   cleanupLogout=true;
   try{audit.cleanup.logout=await boundedCleanup(async()=>{audit.logoutVerified=(await normalLogout()).verified===true;if(!audit.logoutVerified)throw Error('LOGOUT_UNVERIFIED')},10000)}
   finally{cleanupLogout=false}
   if(!audit.logoutVerified){audit.status='failed_or_unconfirmed';audit.cleanup.logoutRequired=true;process.exitCode=1}
  }else{audit.cleanup.logout='not_attempted_identity_unverified';audit.cleanup.residualSessionUnverified=loginPosts>0}
  audit.logoutPosts=logoutPosts;await checkpoint();Object.assign(audit.cleanup,await cleanupBrowser());
  if(audit.cleanup.close!=='completed'||audit.cleanup.profileRemoval!=='completed'){audit.status='failed_or_unconfirmed';process.exitCode=1}
  await checkpoint();console.log(JSON.stringify({status:audit.status,completionPosts:postCount,receipt:receiptFile,chargedCents:audit.totalChargedCents,currency:audit.currency,logoutVerified:audit.logoutVerified}));
 }finally{clearTimeout(watchdog);setTimeout(()=>process.exit(process.exitCode||0),2000).unref()}
}
