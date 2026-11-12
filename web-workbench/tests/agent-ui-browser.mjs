// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Real browser + LOWA + IndexedDB with an explicit, local-only synthetic Agent API.
// Never calls a paid model. The browser profile and server are temporary and cleaned up.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import JSZip from 'jszip';
import {createPreviewServer} from '../scripts/preview.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.AWD_AGENT_UI_TEST_OUTPUT||path.join(root,'test-results/agent-ui'));
await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-agent-ui-'));
const server=createPreviewServer({mockAI:true,testSupport:true});
const evidence={realModel:false,synthetic:true,steps:[],errors:[],started:new Date().toISOString(),profile};
const pass=name=>{evidence.steps.push(name);console.log('PASS',name)};
 let browser,page,watchdog,anonymousFixture=false;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',userDataDir:profile,protocolTimeout:120000,args:['--no-sandbox','--disable-dev-shm-usage']});
 evidence.ownedBrowserPid=browser.process().pid;
 page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());
  if(anonymousFixture&&url.pathname==='/api/web/capabilities')return request.respond({status:200,contentType:'application/json',body:JSON.stringify({authenticated:false,aiEnabled:false,reason:'unauthorized',agentEnabled:false,agentReason:'unauthorized',agent:{maxChargeCents:25,maxRunChargeCents:100},currency:'TEST',maxChargeCents:100,loginUrl:'/zh/account?next=%2Fweb%2F'})});
  if(url.origin!==origin&&!['data:','blob:','about:'].includes(url.protocol))return request.abort();
  return request.continue();
 });
 const waitReady=()=>page.waitForFunction(()=>document.querySelector('#save-button')?.dataset.status==='saved'&&document.querySelector('#editor-cover')?.hidden,{timeout:180000});
 const text=async()=>page.evaluate(async()=>{
  const frame=document.querySelector('#editor-container iframe');if(!frame)throw Error('EDITOR_FRAME_MISSING');
  const {createIframeEditorExecutor}=await import('/test-support/useZetaOfficeWebview.js');
  window.agentUiEditor??=createIframeEditorExecutor(frame);
  const body=await window.agentUiEditor.executeCommand('get_document_text',{__agent:true});return body.paragraphs.map(p=>p.text).join('\n');
 });
 const stored=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('ai-workdeck-web-workbench:guest');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,request=db.transaction('files').objectStore('files').getAll();request.onsuccess=()=>{resolve(request.result.map(file=>({id:file.id,name:file.name,version:file.version,bytes:Array.from(file.bytes)})));db.close()};request.onerror=()=>{reject(request.error);db.close()}}}));
 const inspectDocx=async()=>{const files=await stored(),file=files.find(f=>f.name.includes('示例'));assert.ok(file,'sample document remains in workspace');const zip=await JSZip.loadAsync(Uint8Array.from(file.bytes));return {file,xml:await zip.file('word/document.xml').async('string')}};
 await page.goto(origin+'/web/?lang=zh',{waitUntil:'domcontentloaded'});await waitReady();
 assert.equal(await page.evaluate(()=>crossOriginIsolated),true);assert.match(await text(),/甲方应在交付后30日内支付全部服务费用/);
 await page.waitForFunction(()=>document.querySelector('#ai-account-status')?.textContent.includes('TEST 1.00'));
 const desktopLink=await page.$eval('.desktop-link',a=>({href:a.getAttribute('href'),target:a.getAttribute('target'),visible:!!(a.offsetWidth||a.offsetHeight||a.getClientRects().length)}));
 assert.match(desktopLink.href,/\/zh\/start/);assert.equal(desktopLink.target,'_blank');assert.equal(desktopLink.visible,true);pass('real LOWA editor opens sample; desktop download link remains visible at top');

 await page.type('#chat-input','请把合同付款期限调整为45日，直接修改并保存。');await page.click('#send-button');
 await page.waitForFunction(()=>[...document.querySelectorAll('.agent-record>strong')].at(-1)?.textContent.includes('已完成本轮'),{timeout:60000});
 let actual=await text();assert.match(actual,/甲方应在交付后45日内支付全部服务费用/);assert.doesNotMatch(actual,/甲方应在交付后30日内支付全部服务费用/);
 await waitReady();let doc=await inspectDocx();assert.match(doc.xml,/<w:ins[ >][\s\S]*?<w:t>45<\/w:t>[\s\S]*?<\/w:ins>/);assert.match(doc.xml,/<w:del[ >][\s\S]*?<w:delText>30<\/w:delText>[\s\S]*?<\/w:del>/);assert.ok(doc.file.version>1);pass('natural-language synthetic tool call modifies the real document and saves the resulting DOCX');
 await page.screenshot({path:path.join(out,'agent-complete-desktop.png'),fullPage:true});

 const usage=await page.$$eval('.agent-billing summary',nodes=>nodes.at(-1)?.textContent||'');assert.match(usage,/TEST 0\.03/);assert.doesNotMatch(usage,/待核对/);pass('per-generation settled fees aggregate from the fixture receipts');
 await page.click('[data-restore-agent]');await page.waitForSelector('dialog[open]');await page.click('dialog button[value="ok"]');
 await page.waitForFunction(()=>[...document.querySelectorAll('.agent-record')].at(-1)?.textContent.includes('已恢复本轮开始前的文档'),{timeout:30000});
 actual=await text();assert.match(actual,/甲方应在交付后30日内支付全部服务费用/);assert.doesNotMatch(actual,/甲方应在交付后45日内支付全部服务费用/);await waitReady();doc=await inspectDocx();assert.ok(/<w:t>30<\/w:t>/.test(doc.xml),'restored DOCX retains the original 30-day value');pass('guarded whole-run restore returns the saved document to its pre-run text');

 const previousAgentRecords=await page.$$eval('.chat-message.assistant .agent-record',nodes=>nodes.length);
 await page.type('#chat-input','STOP_AFTER_EDIT 请直接修改并保存付款期限。');await page.click('#send-button');
 await page.waitForFunction(()=>[...document.querySelectorAll('.chat-message.user .message-body')].at(-1)?.textContent.includes('STOP_AFTER_EDIT'),{timeout:30000});
 await page.waitForFunction(count=>document.querySelectorAll('.chat-message.assistant .agent-record').length>count,{timeout:30000},previousAgentRecords);
 const latestRun=()=>page.$eval('.chat-message.assistant:last-of-type .agent-record',el=>el.textContent);
 await page.waitForFunction(()=>{const run=[...document.querySelectorAll('.chat-message.assistant .agent-record')].at(-1);return run?.querySelectorAll('li small').length>=2&&run.textContent.includes('TEST 0.02')},{timeout:60000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.chat-message.assistant .agent-record')].at(-1)?.querySelectorAll('.request-receipt').length===3,{timeout:15000});
 await page.click('#stop-button');
 await page.waitForFunction(()=>[...document.querySelectorAll('.agent-record>strong')].at(-1)?.textContent.includes('已停止'),{timeout:20000});
 actual=await text();assert.match(actual,/甲方应在交付后45日内支付全部服务费用/);
 const stopRecord=await latestRun();
 assert.match(stopRecord,/已保存|Saved/);assert.match(stopRecord,/待核对|unverified/i);
 assert.doesNotMatch(stopRecord,/Amount TEST 0\.00|金额 TEST 0\.00/);
 await waitReady();pass('Stop halts future generations while the verified completed edit remains saved and pending fees remain unknown');

 await page.click('[data-restore-agent]');await page.waitForSelector('dialog[open]');await page.click('dialog button[value="ok"]');
 await page.waitForFunction(()=>[...document.querySelectorAll('.chat-message.assistant .agent-record')].at(-1)?.textContent.includes('已恢复本轮开始前的文档'),{timeout:30000});
 assert.match(await text(),/甲方应在交付后30日内支付全部服务费用/);pass('guarded restore also works after Stop and returns to the pre-stop document');

 await page.type('#chat-input','请把合同付款期限调整为45日，直接修改并保存。');await page.click('#send-button');
 await page.waitForFunction(()=>[...document.querySelectorAll('.agent-record>strong')].at(-1)?.textContent.includes('已完成本轮'),{timeout:60000});
 assert.match(await text(),/甲方应在交付后45日内支付全部服务费用/);await waitReady();
 await page.reload({waitUntil:'domcontentloaded'});await waitReady();assert.match(await text(),/甲方应在交付后45日内支付全部服务费用/);doc=await inspectDocx();assert.match(doc.xml,/<w:ins[ >][\s\S]*?<w:t>45<\/w:t>[\s\S]*?<\/w:ins>/);pass('saved agent edit survives a full browser reload');

 await page.setViewport({width:390,height:844});
 const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,desktop:document.querySelector('.desktop-link')?.getBoundingClientRect().toJSON()}));
 assert.ok(overflow.width<=overflow.viewport,`mobile page overflow ${overflow.width}/${overflow.viewport}`);
 assert.ok(overflow.desktop.width>0&&overflow.desktop.height>0,'desktop download link remains visible and does not overflow on mobile');
 await page.click('[data-action="toggle-ai"]');await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ai-panel')).display==='flex');
 assert.equal(await page.$$eval('.agent-record>strong',els=>els.at(-1)?.textContent.includes('已完成本轮')),true);
 await page.$eval('#chat-messages',el=>{el.scrollTop=el.scrollHeight});
 await page.screenshot({path:path.join(out,'agent-complete-390.png'),fullPage:true});
 await page.click('[data-action="toggle-ai"]');await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ai-panel')).display==='none');
 pass('390px viewport has no horizontal overflow and preserves the desktop download entry');

 const anonRoute=async()=>{
  anonymousFixture=true;await page.goto(origin+'/web/?lang=zh',{waitUntil:'domcontentloaded'});await waitReady();
  await page.waitForFunction(()=>document.querySelector('#ai-account-status')?.textContent.includes('登录后'));
  assert.equal(await page.$eval('#send-button',button=>button.disabled),true);
  assert.match(await page.$eval('#account-link',a=>a.getAttribute('href')),/\/zh\/account\?next=/);
  assert.match(await text(),/甲方应在交付后45日内支付全部服务费用/);
  anonymousFixture=false;
 };
 await anonRoute();pass('anonymous capability state disables agent dispatch while keeping local editing available');
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;
}catch(error){
 evidence.passed=false;evidence.failure=error.stack||String(error);console.error(evidence.failure);
 if(page)try{const p=await page.evaluate(()=>({url:location.href,body:document.body.innerText}));evidence.failureUI=p;await page.screenshot({path:path.join(out,'failure.png'),fullPage:true})}catch{}
}finally{
 clearTimeout(watchdog);
 if(browser){try{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))])}finally{if(browser.process()?.exitCode===null)browser.process().kill('SIGKILL')}}
 server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));
 await fs.rm(profile,{recursive:true,force:true});evidence.cleanedProfile=true;evidence.finished=new Date().toISOString();
 await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(evidence,null,2)+'\n');console.log('Receipt: '+path.join(out,'receipt.json'));
}
if(!evidence.passed)process.exitCode=1;
