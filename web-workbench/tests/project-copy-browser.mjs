// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated real browser/IndexedDB and editor; no account, cloud writes or paid AI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';
const server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-project-copy-'));
const browser=await puppeteer.launch({executablePath:process.env.AWD_BROWSER_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',userDataDir:profile,protocolTimeout:180000});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())||(![origin].includes(u.origin)&&!['data:','blob:'].includes(u.protocol)))r.abort();else r.continue()});
 const ready=()=>page.waitForFunction(()=>document.querySelector('#save-button')?.dataset.status==='saved',{timeout:180000});
 const snapshot=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ai-workdeck-web-workbench');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['files','projects','settings']);const result={};for(const key of ['files','projects','settings']){const q=tx.objectStore(key).getAll();q.onsuccess=()=>result[key]=q.result}tx.oncomplete=()=>{db.close();resolve(result)}}}));
 await page.goto(origin+'/web/?lang=zh');await ready();
 assert.equal(await page.$eval('#project-select',e=>e.selectedOptions[0].textContent),'临时项目');
 await page.click('[data-action="new-project"]');await page.$eval('#dialog-input',e=>e.value='Formal case');await page.click('dialog button[value="ok"]');
 await page.waitForFunction(()=>document.querySelector('#project-select').selectedOptions[0].textContent==='Formal case');
 const targetId=await page.$eval('#project-select',e=>e.value);await page.select('#project-select','temporary-project');await ready();
 const before=await snapshot(),file=before.files[0];
 await page.evaluate(({file})=>new Promise(resolve=>{const r=indexedDB.open('ai-workdeck-web-workbench');r.onsuccess=()=>{const db=r.result,tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({key:'conversations:temporary-project',value:{version:1,activeId:'copy-chat',items:[{id:'copy-chat',title:'Copy conversation',updatedAt:new Date().toISOString(),messages:[{role:'user',content:'Review this file',fileId:file.id,fileName:file.name},{role:'assistant',content:'Readable advice',fileId:file.id,proposal:{original:'Old wording',replacement:'New wording'}}]}]}});tx.oncomplete=()=>{db.close();resolve()}}}),{file});
 await page.reload();await ready();
 await page.click('[data-action="copy-project"]');await page.waitForSelector('dialog[open] .copy-form');await page.click('dialog button[value="cancel"]');assert.equal((await snapshot()).files.length,before.files.length);
 await page.click('[data-action="copy-project"]');await page.waitForSelector('dialog[open] .copy-form');await page.click('dialog button[value="ok"]');assert.match(await page.$eval('#copy-status',e=>e.textContent),/至少选择/);
 await page.click('[name="file"]');await page.click('[name="conversation"]');
 // Fail after files have been queued to prove the dialog retains selections and the transaction rolls back.
 await page.$eval('[name="conversation"]',e=>e.value='missing');await page.click('dialog button[value="ok"]');
 await page.waitForFunction(()=>document.querySelector('#copy-status')?.textContent.includes('转存未完成'));assert.equal((await snapshot()).files.length,before.files.length);
 await page.$eval('[name="conversation"]',e=>e.value='copy-chat');await page.click('dialog button[value="ok"]');await page.waitForSelector('dialog:not([open])');
 const after=await snapshot(),copy=after.files.find(f=>f.projectId===targetId);assert.ok(copy);assert.notEqual(copy.id,file.id);assert.equal(after.files.length,before.files.length+1);
 const target=after.settings.find(s=>s.key==='conversations:'+targetId).value;
 const conversation=target.items.find(c=>c.title==='Copy conversation');assert.equal(conversation.messages[0].fileId,copy.id);assert.equal(conversation.messages[1].copiedHistory,true);
 assert.equal(after.settings.find(s=>s.key==='conversations:temporary-project').value.items[0].messages[1].copiedHistory,undefined);
 await page.select('#project-select',targetId);await page.waitForFunction(()=>document.querySelector('#project-select').selectedOptions[0].textContent==='Formal case');
 await page.click('[data-action="history"]');await page.click(`[data-conversation="${conversation.id}"]`);await page.waitForSelector('[data-apply][disabled]');assert.match(await page.$eval('[data-apply]',e=>e.textContent),/历史副本/);
 const out=process.env.AWD_BROWSER_TEST_OUTPUT||path.join(os.tmpdir(),'1656-browser');await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'copied-history.png')});
 console.log('PASS default project, formal target, cancel, empty selection, atomic rollback, retry without duplicates, copied file references, preserved originals, read-only proposals');
}finally{await browser.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true})}
