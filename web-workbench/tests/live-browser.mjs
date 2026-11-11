// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in real website browser acceptance. No API mocks, copied cookies or default profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import JSZip from 'jszip';
import {observeEditorResources,waitForSavedEditor} from './browser-observation.mjs';

const plan={mode:'dry-run',maximumCompletionPosts:2,automaticRetry:false,steps:['normal password form login; verify dedicated account ID','website CTA → /web/ → real LOWA','synthetic Chinese browser input → saved','real chat → settled receipt','real selected-text rewrite → explicit apply as tracked change','save → reload → actual DOCX download → content/revision verification'],requiredEnvironment:['WEB_LIVE_BASE_URL','WEB_LIVE_ACCOUNT','WEB_LIVE_PASSWORD','WEB_LIVE_EXPECTED_USER_ID','WEB_LIVE_CURRENCY','WEB_LIVE_MAX_TOTAL_CENTS','WEB_LIVE_APPROVED=1','WEB_LIVE_DEDICATED_ACCOUNT=1'],limitations:['password-enabled dedicated account required; account binding/captcha gates are not bypassed','at most two requests per invocation; repeating the command is a new potentially billable run','local profile and synthetic documents only; real provider/account ledger charges are possible']};
if(!process.argv.includes('--live')||process.argv.includes('--dry-run')){console.log(JSON.stringify(plan,null,2));process.exit(0)}
function requireSetting(name){const v=process.env[name];if(!v)throw Error('Missing required setting: '+name);return v}
if(process.env.WEB_LIVE_APPROVED!=='1'||process.env.WEB_LIVE_DEDICATED_ACCOUNT!=='1')throw Error('Explicit live approval and dedicated-account confirmation required');
const base=new URL(requireSetting('WEB_LIVE_BASE_URL'));
if(base.username||base.password||base.pathname!=='/'||base.search||base.hash||!['http:','https:'].includes(base.protocol))throw Error('BASE_URL must be an origin without credentials, path or query');
if(base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw Error('Non-local origins require HTTPS');
const account=requireSetting('WEB_LIVE_ACCOUNT'),password=requireSetting('WEB_LIVE_PASSWORD'),expectedUser=requireSetting('WEB_LIVE_EXPECTED_USER_ID');
const currency=requireSetting('WEB_LIVE_CURRENCY'),budget=Number(requireSetting('WEB_LIVE_MAX_TOTAL_CENTS'));
if(!/^[A-Z]{3}$/.test(currency)||!Number.isSafeInteger(budget)||budget<=0||(currency==='CNY'&&budget>10000))throw Error('Invalid explicit currency/budget');
const lang=process.env.WEB_LIVE_LANG==='en'?'en':'zh',en=lang==='en',origin=base.origin;
const out=path.resolve(process.env.WEB_LIVE_OUTPUT_DIR||fileURLToPath(new URL('../test-results/live-'+Date.now()+'/',import.meta.url)));
await fs.mkdir(out,{recursive:true,mode:0o700});
// Refuse to overwrite the evidence of a previous run.
const receiptFile=path.join(out,'receipt.json');await fs.writeFile(receiptFile,'{}',{flag:'wx',mode:0o600});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-web-live-browser-'));
const audit={status:'running',origin,language:lang,dedicatedAccountVerified:false,accountIdHash:null,maximumCompletionPosts:2,budgetCents:budget,currency,requests:[],steps:[],automaticRetry:false,mockedAPI:false,webResources:[],maximumRunMs:1800000};
let stage='launch',browser,page,reservationTotal=0,postCount=0,loginPosts=0,guardFailure=false,modelGate=false,runExpired=false,runTimer,stopObserving,cleanupLogout=false,logoutPosts=0;
const checkpoint=()=>fs.writeFile(receiptFile,JSON.stringify(audit,null,2)+'\n',{mode:0o600});
// A protocol deadline is not a cleanup deadline. Browser.close can wait forever for
// the launcher exit callback; no cleanup step may block the test runner indefinitely.
async function boundedCleanup(operation,timeoutMs){
 let timer;
 try{return await Promise.race([Promise.resolve().then(operation).then(()=> 'completed',()=> 'failed'),new Promise(resolve=>{timer=setTimeout(()=>resolve('timed_out'),timeoutMs)})])}
 finally{clearTimeout(timer)}
}
async function cleanupBrowser(){
 const result={};const child=browser?.process();
 if(browser){
  result.close=await boundedCleanup(()=>browser.close(),10000);
  if(result.close!=='completed'){
   // Only the exact child created by this invocation; never discover/kill other browsers.
   if(child&&child.exitCode===null&&child.signalCode===null){try{result.ownedChildTerminated=child.kill('SIGKILL')}catch{result.ownedChildTerminated=false}}
   result.disconnect=await boundedCleanup(()=>browser.disconnect(),2000);
   child?.stdin?.destroy();child?.stdout?.destroy();child?.stderr?.destroy();child?.unref();
  }
 }
 result.profileRemoval=await boundedCleanup(()=>fs.rm(profile,{recursive:true,force:true,maxRetries:1}),5000);
 return result;
}

const pass=async label=>{audit.steps.push(label);await checkpoint();console.log('PASS '+label)};
const safeReceipt=r=>Object.fromEntries(['requestId','state','model','reservedCents','chargedCents','currency','costUsd','errorCode','updatedAt'].filter(k=>['string','number'].includes(typeof r?.[k])).map(k=>[k,r[k]]));
const getJSON=async url=>page.evaluate(async url=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});return {status:r.status,data:await r.json()}},url);
const waitSaved=()=>waitForSavedEditor(page);
const attach=async()=>{const dir=new URL('../vendor/core/frontend/src/composables/',import.meta.url);const relay=(await fs.readFile(new URL('zetaOfficeRelay.js',dir),'utf8')).replace(/^export /gm,'');const host=(await fs.readFile(new URL('useZetaOfficeWebview.js',dir),'utf8')).replace(/^import .*\n/gm,'').replace(/^export /gm,'');await page.evaluate(`(()=>{${relay}\n${host}\nwindow.__liveEditor=createIframeEditorExecutor(document.querySelector('#editor-container iframe'));})()`)};
const cmd=async(action,params={})=>{const r=await page.evaluate((a,p)=>window.__liveEditor.executeCommand(a,p),action,params);assert.equal(r?.success,true,'Real editor command failed');return r};
const readText=async()=>{const a=[];let start=0;while(true){const r=await cmd('get_document_text',{__agent:true,startParagraph:start,maxParagraphs:500});a.push(...r.paragraphs);if(!r.truncated)return a.map(p=>p.text).join('\n');assert.ok(r.nextStartParagraph>start);start=r.nextStartParagraph}};
async function refreshReceipt(call){try{const r=await getJSON('/api/web/requests/'+encodeURIComponent(call.requestId)+'?lang='+lang);if(r.status===200&&r.data.requestId===call.requestId)call.receipt=safeReceipt(r.data);else call.receiptStatus='unverified_http_'+r.status}catch{call.receiptStatus='unverified'}await checkpoint()}
async function normalLogout(){
 return page.evaluate(async expected=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
  try{
   const opts={credentials:'same-origin',cache:'no-store',signal:controller.signal};
   const before=await fetch('/api/auth/me',opts);
   if(before.status!==200)return {verified:false};
   const current=await before.json();
   if(current.user===null)return {verified:true,alreadyAnonymous:true};
   if(current.user?.id!==expected)return {verified:false,identityMismatch:true};
   const response=await fetch('/api/auth/logout',{...opts,method:'POST'});
   const after=await fetch('/api/auth/me',opts);
   const anonymous=after.status===200&&(await after.json()).user===null;
   return {verified:response.status===200&&anonymous,httpStatus:response.status};
  }finally{clearTimeout(timer)}
 },expectedUser);
}
async function budgetGate(){const r=await getJSON('/api/web/capabilities?lang='+lang);assert.equal(r.status,200);const c=r.data;assert.equal(c.authenticated,true);assert.equal(c.aiEnabled,true,'Dedicated account is not eligible for AI');assert.equal(c.currency,currency);assert.ok(Number.isSafeInteger(c.maxChargeCents)&&c.maxChargeCents>=0);assert.ok(reservationTotal+c.maxChargeCents<=budget,'Reservation exceeds explicit run budget');return c}
async function send(mode,instruction){
 stage=mode;const c=await budgetGate();reservationTotal+=c.maxChargeCents;
 await page.waitForFunction(()=>!document.querySelector('#chat-input').disabled&&!document.querySelector('#send-button').disabled);
 await page.type('#chat-input',instruction);modelGate=true;const wanted=audit.requests.length+1;await page.click('#send-button');
 await page.waitForFunction(()=>document.querySelector('#stop-button').hidden,{timeout:180000});
 // Wait for the asynchronously captured request plus rendered completion, never submit twice.
 const deadline=Date.now()+180000;while(audit.requests.length<wanted&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
 const call=audit.requests[wanted-1];assert.ok(call,'UI did not submit the expected request');
 await page.waitForFunction(id=>{const box=document.querySelector(`[data-receipt="${id}"]`);return box&&!box.closest('article').querySelector('.streaming-dot')}, {timeout:180000},call.requestId);
 await refreshReceipt(call);assert.equal(call.receipt?.state,'settled','Provider usage is not settled; no retry is made');assert.equal(call.receipt.currency,currency);assert.ok(Number.isSafeInteger(call.receipt.chargedCents)&&call.receipt.chargedCents>=0);
 assert.ok(audit.requests.reduce((n,c)=>n+(c.receipt?.chargedCents??0),0)<=budget);
 const result=await page.$eval(`[data-receipt="${call.requestId}"]`,e=>{const a=e.closest('article');return {error:!!a.querySelector('.message-error'),text:a.querySelector('.message-body')?.textContent,proposal:!!a.querySelector('[data-apply]')}});
 assert.equal(result.error,false,'UI reported an AI error');assert.ok(mode==='chat'?result.text?.trim():result.proposal,'Expected live reply/proposal missing');
 assert.ok(!result.text?.includes('[TEST RESPONSE'),'Synthetic fixture detected');if(mode==='chat')assert.match(result.text,/30|三十|thirty/i,'Live answer did not identify the synthetic payment deadline');await pass('real '+mode+' completed with settled receipt');return call;
}
try{
 await Promise.race([(async()=>{
 const launchEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('WEB_LIVE_')));
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',userDataDir:profile,headless:process.env.WEB_LIVE_HEADED==='1'?false:'new',env:launchEnv,protocolTimeout:660000,args:['--disable-dev-shm-usage']});
 page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.setDefaultTimeout(30000);
 stopObserving=await observeEditorResources(page,origin,audit.webResources);
 await page.setRequestInterception(true);
 page.on('request',async req=>{
  try{const u=new URL(req.url());const ownLogout=cleanupLogout&&u.origin===origin&&u.pathname==='/api/auth/logout'&&req.method()==='POST';if(runExpired&&!['GET','HEAD','OPTIONS'].includes(req.method())&&!ownLogout)return req.abort('blockedbyclient');if(u.origin===origin&&!['GET','HEAD','OPTIONS'].includes(req.method())){
   if(u.pathname==='/api/auth/login'){if(++loginPosts>1){guardFailure=true;return req.abort('blockedbyclient')}}
   else if(u.pathname==='/api/web/chat'){
    postCount++;if(!modelGate||!audit.dedicatedAccountVerified||postCount>2){guardFailure=true;return req.abort('blockedbyclient')}
    modelGate=false;let b;try{b=JSON.parse(req.postData()||'{}')}catch{guardFailure=true;return req.abort('blockedbyclient')}
    if(!/^[0-9a-f-]{36}$/i.test(b.requestId)||b.mode!==(['chat','rewrite'][postCount-1])){guardFailure=true;return req.abort('blockedbyclient')}
    audit.requests.push({requestId:b.requestId,mode:b.mode});await checkpoint();
   }else if(u.pathname==='/api/auth/logout'){if(!ownLogout||++logoutPosts>1){guardFailure=true;return req.abort('blockedbyclient')}}else{guardFailure=true;return req.abort('blockedbyclient')}
  }await req.continue()}catch{guardFailure=true;await req.abort('blockedbyclient').catch(()=>{})}
 });
 stage='login_page_load';await page.goto(origin+`/${lang}/account?next=${encodeURIComponent('/'+lang)}`,{waitUntil:'domcontentloaded'});
 // SSR fields alone do not prove the React form is interactive. Wait for the
 // current site's controlled-input handler to attach; no fixed hydration sleep.
 stage='login_hydration';await page.waitForFunction(()=>[...document.querySelectorAll('form input')].some(e=>Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k]?.onChange==='function')),{timeout:30000});
 stage='login_password_tab';if(!await page.$('#auth-account')){const tabs=await page.$$('button[type="button"]');let found=false;for(const b of tabs){const text=(await b.evaluate(e=>e.textContent)).trim();if(['邮箱登录','密码登录','Email','Password'].includes(text)){await b.click();found=true;break}}assert.ok(found,'Password login tab unavailable')}
 stage='login_form_fields';await page.waitForSelector('#auth-account',{visible:true});await page.type('#auth-account',account);await page.type('#auth-password',password);
 const remember=await page.$('form input[type="checkbox"]');if(remember&&await remember.evaluate(e=>e.checked))await remember.click();
 stage='login_submit_response';const loginResponse=page.waitForResponse(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/api/auth/login'&&r.request().method()==='POST');
 await page.click('form button[type="submit"]');const response=await loginResponse;assert.equal(response.status(),200,'Normal password login was rejected');
 // A full-document redirect may discard the login response body before CDP reads
 // it. The landing URL and authenticated /me below verify binding and identity.
 stage='login_redirect';await page.waitForFunction(p=>location.pathname===p,{},'/'+lang);stage='login_identity';const identity=await getJSON('/api/auth/me');assert.equal(identity.data.user?.id,expectedUser);
 audit.dedicatedAccountVerified=true;audit.accountIdHash=crypto.createHash('sha256').update(expectedUser).digest('hex');await pass('normal website password login verified dedicated identity');
 stage='website-cta';const links=await page.$$(`a[href="/web/?lang=${lang}"]`);let clicked=false;for(const a of links){if(await a.boundingBox()){await a.click();clicked=true;break}}assert.ok(clicked,'Visible website Web CTA missing');await page.waitForFunction(()=>['/web','/web/'].includes(location.pathname));await waitSaved();await attach();assert.equal(await page.evaluate(()=>crossOriginIsolated),true);await budgetGate();await pass('website CTA opened real isolated LOWA workbench');
 stage='manual-edit';const marker=en?'Synthetic browser acceptance note · 浏览器验收。':'浏览器真实流程验收标记。';await cmd('goto',{type:'end'});await cmd('insert_paragraph');const frame=page.frames().find(f=>new URL(f.url()).pathname==='/web/editor/editor.html');assert.ok(frame);await frame.$eval('[data-lo-ime]',e=>e.focus());const cdp=await page.createCDPSession();await cdp.send('Input.imeSetComposition',{text:'yanshou',selectionStart:7,selectionEnd:7});await cdp.send('Input.insertText',{text:marker});assert.ok((await readText()).includes(marker));await page.click('#save-button');await waitSaved();await pass('real browser input saved into synthetic document');
 await page.screenshot({path:path.join(out,'01-editor.png')});
 await send('chat',en?'What is the payment deadline in this document? Answer in one sentence.':'这份文档约定的付款期限是什么？只用一句话回答。');await page.screenshot({path:path.join(out,'02-chat.png')});
 stage='selection';const original=en?'The Client shall pay the full fee within 30 days after delivery.':'甲方应在交付后30日内支付全部服务费用。';const body=await cmd('get_document_text',{__agent:true});const paragraph=body.paragraphs.find(p=>p.text===original);assert.ok(paragraph,'Synthetic payment clause not found');await cmd('select_paragraph',{index:paragraph.index});await page.click('[data-action="capture-selection"]');await page.waitForFunction(text=>!document.querySelector('#selection-chip').hidden&&document.querySelector('#selection-chip span').textContent===text,{},original);
 const call=await send('rewrite',en?'Change only the payment deadline from 30 days to 45 days. Keep every other word unchanged.':'只将所选句子的付款期限从30日改为45日，其他文字完全保持不变。');
 const proposal=await page.$eval(`[data-receipt="${call.requestId}"]`,e=>{const a=e.closest('article');return {original:a.querySelector('.proposal-before')?.textContent,replacement:a.querySelector('.proposal-after')?.textContent,index:a.querySelector('[data-apply]')?.dataset.apply}});
 assert.equal(proposal.original,original);assert.equal(proposal.replacement,original.replace('30','45'),'Live model changed more than the requested deadline');
 stage='apply';await page.click(`[data-apply="${proposal.index}"]`);await page.waitForFunction(i=>document.querySelector(`[data-apply="${i}"]`).disabled,{},proposal.index);await waitSaved();let text=await readText();assert.ok(text.includes(proposal.replacement)&&!text.includes(original)&&text.includes(marker));assert.ok((await cmd('list_revisions',{limit:100})).count>0);await pass('live proposal explicitly applied as a saved tracked change');await page.screenshot({path:path.join(out,'03-applied.png')});
 stage='reload';await page.reload({waitUntil:'domcontentloaded'});await waitSaved();await attach();text=await readText();assert.ok(text.includes(proposal.replacement)&&!text.includes(original)&&text.includes(marker));await pass('refresh reopened persisted edited content and revision history');
 stage='download';const downloads=path.join(out,'downloads');await fs.mkdir(downloads,{mode:0o700});const browserCDP=await browser.target().createCDPSession();await browserCDP.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});const complete=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Download timed out')),45000);browserCDP.on('Browser.downloadProgress',e=>{if(e.state==='completed'){clearTimeout(timer);resolve()}if(e.state==='canceled'){clearTimeout(timer);reject(Error('Download canceled'))}})});await page.click('[data-action="download"]');await complete;const names=(await fs.readdir(downloads)).filter(n=>n.endsWith('.docx'));assert.equal(names.length,1);const bytes=await fs.readFile(path.join(downloads,names[0]));const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('word/document.xml').async('string');assert.match(xml,/<w:del[\s>]/);
 const exported=await page.evaluate(xml=>{const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main',doc=new DOMParser().parseFromString(xml,'application/xml');return [...doc.getElementsByTagNameNS(ns,'p')].map(p=>[...p.getElementsByTagNameNS(ns,'t')].filter(n=>{for(let e=n.parentElement;e;e=e.parentElement)if(e.namespaceURI===ns&&e.localName==='del')return false;return true}).map(n=>n.textContent).join('')).join('\n')},xml);
 assert.ok(exported.includes(proposal.replacement)&&!exported.includes(original)&&exported.includes(marker));audit.export={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),trackedChangesPresent:true,finalTextVerified:true};await pass('actual download DOCX XML preserves edited text and tracked revisions');await page.screenshot({path:path.join(out,'04-reopened.png')});assert.equal(guardFailure,false,'Request budget/mutation guard rejected an unexpected request');assert.equal(audit.requests.length,2);audit.status='passed';
 })(),new Promise((_,reject)=>{runTimer=setTimeout(()=>{runExpired=true;modelGate=false;reject(Error('RUN_DEADLINE'))},audit.maximumRunMs)})]);
}catch(e){audit.status='failed_or_unconfirmed';audit.failure={stage,type:e?.name||'Error'};console.error('FAIL '+stage+' ('+(e?.name||'Error')+'); inspect safe receipt');if(page&&new URL(page.url()).origin===origin&&['/web','/web/'].includes(new URL(page.url()).pathname))await boundedCleanup(()=>page.screenshot({path:path.join(out,'failure-workbench.png')}),5000);process.exitCode=1}
finally{
 clearTimeout(runTimer);runExpired=true;modelGate=false;
 // Includes two receipt GETs (10s each), logout (10s), observer stop (2s),
 // browser close (10s), disconnect (2s), profile removal (5s), plus margin.
 const watchdog=setTimeout(()=>{console.error('FAIL cleanup_deadline; safe receipt retained');process.exit(1)},60000);
 try{
  audit.cleanup={receipts:[]};
  if(page)for(const call of audit.requests)audit.cleanup.receipts.push(await boundedCleanup(()=>refreshReceipt(call),10000));
  audit.attemptedCompletionPosts=postCount;audit.guardRejectedUnexpectedRequest=guardFailure;
  audit.totalProviderUsd=audit.requests.length===2&&audit.requests.every(c=>c.receipt?.state==='settled'&&Number.isFinite(c.receipt.costUsd))?audit.requests.reduce((n,c)=>n+c.receipt.costUsd,0):null;
  audit.logoutVerified=false;
  if(page&&audit.dedicatedAccountVerified){
   cleanupLogout=true;
   try{audit.cleanup.logout=await boundedCleanup(async()=>{const result=await normalLogout();audit.logoutVerified=result.verified===true;if(!audit.logoutVerified)throw Error('LOGOUT_UNVERIFIED')},10000)}
   finally{cleanupLogout=false}
   if(!audit.logoutVerified){audit.status='failed_or_unconfirmed';audit.cleanup.logoutRequired=true;process.exitCode=1}
  }else audit.cleanup.logout='not_attempted_identity_unverified';
  audit.logoutPosts=logoutPosts;
  if(stopObserving)audit.cleanup.resourceObserver=await boundedCleanup(stopObserving,2000);
  await checkpoint();Object.assign(audit.cleanup,await cleanupBrowser());await checkpoint();
  console.log(JSON.stringify({status:audit.status,completionPosts:postCount,receipt:receiptFile,totalProviderUsd:audit.totalProviderUsd,cleanup:audit.cleanup}));
 }finally{
  clearTimeout(watchdog);
  // Some launcher/socket handles can survive a completed close. Permit normal
  // Node exit first, but do not leave an unattended test process running.
  setTimeout(()=>process.exit(process.exitCode||0),2000).unref();
 }
}
