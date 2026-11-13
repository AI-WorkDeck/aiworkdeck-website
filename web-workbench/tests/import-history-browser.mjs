// Real editor + isolated browser storage; AI stays off. Delays/errors are explicit test fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';
import {createDocument} from '../src/docx.js';
const out=path.resolve(process.env.AWD_BROWSER_TEST_OUTPUT||'test-results/import-history');await fs.mkdir(out,{recursive:true});
const good=path.join(out,'local-contract.docx'),bad=path.join(out,'invalid.docx');await fs.writeFile(good,await createDocument(['Import regression','LOCAL IMPORT VERIFIED 1300']));await fs.writeFile(bad,'not a docx');
const server=createPreviewServer({testSupport:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=process.env.AWD_PUBLIC_ORIGIN||'http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-import-history-'));
const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',userDataDir:profile,protocolTimeout:180000,args:['--disable-dev-shm-usage']});
const result={origin,realEngine:true,paidAI:false,steps:[]};const pass=s=>{result.steps.push(s);console.log('PASS',s)};
try{
 const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));await page.setViewport({width:1440,height:1000});
 await page.setRequestInterception(true);page.on('request',r=>{
  const u=new URL(r.url());if(u.pathname==='/api/web/chat'||u.pathname==='/api/web/agent')return r.abort();
  if(!['GET','HEAD'].includes(r.method()))return r.abort();
  if(![new URL(origin).origin].includes(u.origin)&&!['data:','blob:'].includes(u.protocol))return r.abort();r.continue();
 });
 await page.evaluateOnNewDocument(()=>{
  if(window!==window.top)return;
  const read=FileReader.prototype.readAsArrayBuffer;
  FileReader.prototype.readAsArrayBuffer=function(file){if(window.holdFileRead){window.releaseFileRead=()=>read.call(this,file)}else read.call(this,file)};
  const add=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(...args){if(window.failFileSave&&this.name==='files')throw new DOMException('Test quota exceeded','QuotaExceededError');return add.apply(this,args)};
 });
 const ready=()=>page.waitForFunction(()=>document.querySelector('#editor-cover')?.hidden&&document.querySelector('#save-button')?.dataset.status==='saved',{timeout:180000});
 const phase=p=>page.waitForFunction(p=>document.querySelector('#import-status')?.dataset.phase===p,{},p);
 const upload=async(file,button='[data-action="import"]')=>{const [chooser]=await Promise.all([page.waitForFileChooser(),page.click(button)]);await chooser.accept([file])};
 const files=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('ai-workdeck-web-workbench:guest');r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').getAll();q.onsuccess=()=>{resolve(q.result.map(f=>({id:f.id,name:f.name,bytes:Array.from(f.bytes)})));db.close()};q.onerror=()=>reject(q.error)}}));
 await page.goto(origin+'/web/?lang=en',{waitUntil:'domcontentloaded'});await ready();
 await page.click('.tab [role="tab"]',{button:'middle'});await page.waitForSelector('#empty-editor:not([hidden])');
 await page.evaluate(()=>window.holdFileRead=true);await upload(good,'#empty-editor [data-action="import"]');await phase('reading');
 assert.equal(await page.$eval('#import-progress',e=>e.value),0);assert.match(await page.$eval('#import-detail',e=>e.textContent),/local-contract/);
 await page.screenshot({path:path.join(out,'01-reading.png')});
 await page.click('[data-action="cancel-import"]');await phase('error');assert.match(await page.$eval('#import-title',e=>e.textContent),/cancelled/);assert.equal((await files()).length,1);pass('middle click closes the active document tab; empty-state file picker immediately shows reading progress; cancel leaves storage unchanged');
 await page.evaluate(()=>window.holdFileRead=false);await upload(bad);await phase('error');assert.match(await page.$eval('#import-detail',e=>e.textContent),/not a readable DOCX/);
 assert.equal(await page.$eval('#file-input',e=>e.value),'');await upload(bad);await phase('error');pass('invalid DOCX keeps actionable error and allows selecting the same file again');
 await page.evaluate(()=>window.failFileSave=true);await upload(good);await phase('error');assert.equal((await files()).length,1);
 await page.evaluate(()=>window.failFileSave=false);await page.click('[data-action="retry-import"]');await phase('complete');await ready();
 assert.equal((await files()).filter(f=>f.name==='local-contract.docx').length,1);pass('storage failure retries once, opens real document, and does not duplicate it');
 await page.screenshot({path:path.join(out,'02-imported.png')});
 if(!process.env.AWD_PUBLIC_ORIGIN){
  const text=await page.evaluate(async()=>{const {createIframeEditorExecutor}=await import('/test-support/useZetaOfficeWebview.js');const e=createIframeEditorExecutor(document.querySelector('#editor-container iframe'));try{return await e.executeCommand('get_document_text',{__agent:true})}finally{e.dispose()}});assert.match(JSON.stringify(text),/LOCAL IMPORT VERIFIED 1300/);pass('native engine text contains imported content');
 }
 // Seed pre-upgrade history only in this isolated browser, then exercise migration and all visible actions.
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('ai-workdeck-web-workbench:guest');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['settings','projects'],'readwrite');const q=tx.objectStore('projects').getAll();q.onsuccess=()=>{const id=q.result[0].id,s=tx.objectStore('settings');s.delete('conversations:'+id);s.put({key:'chat:'+id,value:[{role:'user',content:'Legacy payment review',fileName:'local-contract.docx',fileId:'historical-file'},{role:'assistant',content:'Historical answer retained.'}]})};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}}));
 await page.reload({waitUntil:'domcontentloaded'});await ready();assert.match(await page.$eval('#chat-messages',e=>e.textContent),/Historical answer retained/);
 await page.click('[data-action="history"]');assert.equal(await page.$$eval('.conversation-row',e=>e.length),1);
 await page.click('[data-action="clear-chat"]');await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===2);assert.doesNotMatch(await page.$eval('#chat-messages',e=>e.textContent),/Historical answer/);
 await page.click('.conversation-row:not(.selected) [data-conversation]');await page.waitForFunction(()=>document.querySelector('#chat-messages').textContent.includes('Historical answer'));
 await page.click('.conversation-row.selected [data-rename-conversation]');await page.waitForSelector('dialog[open] input');await page.$eval('#dialog-input',e=>e.value='Saved contract review');await page.click('dialog [value="ok"]');await page.waitForFunction(()=>document.querySelector('#conversation-current').textContent==='Saved contract review');
 await page.screenshot({path:path.join(out,'03-history.png')});pass('legacy history migrated; new conversation preserves it; visible switch and rename work');
 await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal(await page.$eval('#conversation-current',e=>e.textContent),'Saved contract review');assert.match(await page.$eval('#chat-messages',e=>e.textContent),/Historical answer/);
 await page.click('[data-action="history"]');await page.click('.conversation-row.selected [data-delete-conversation]');await page.waitForSelector('dialog[open]');await page.click('dialog [value="cancel"]');assert.equal(await page.$$eval('.conversation-row',e=>e.length),2);
 await page.click('.conversation-row.selected [data-delete-conversation]');await page.waitForSelector('dialog[open]');await page.click('dialog [value="ok"]');await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===1);assert.equal((await files()).length,2);pass('reload retains selected history; delete cancellation and confirmation leave documents intact');
 await page.setViewport({width:390,height:844});await page.click('[data-action="toggle-ai"]');await page.screenshot({path:path.join(out,'04-mobile-history.png')});
 assert.ok(await page.$eval('.ai-panel',e=>e.scrollWidth<=e.clientWidth));pass('history controls fit narrow AI panel');result.passed=true;
}catch(e){result.error=e.message;throw e}finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser.close();await fs.rm(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r))}
