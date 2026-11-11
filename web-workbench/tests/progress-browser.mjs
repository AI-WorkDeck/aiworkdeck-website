// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Local pinned assets, throttled browser network, real native ready held for UI inspection.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';
import {waitForSavedEditor} from './browser-observation.mjs';
const out=path.resolve(process.env.PROGRESS_TEST_OUTPUT||'test-results/progress');
await fs.mkdir(out,{recursive:true});
const fallback=createPreviewServer();
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/web/capabilities')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({authenticated:false,aiEnabled:false}));return}
 fallback.emit('request',req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;const evidence={localOnly:true,realEngine:true,realModel:false,downloadBytesPerSecond:8*1024*1024,steps:[]};
try{
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',protocolTimeout:180000,args:['--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===origin?r.continue():r.abort());
 const cdp=await page.createCDPSession();await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:30,downloadThroughput:evidence.downloadBytesPerSecond,uploadThroughput:evidence.downloadBytesPerSecond});
 await page.evaluateOnNewDocument(()=>{
  if(window!==window.top)return;
  window.progressEvents=[];window.progressUI=[];
  const get=IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get=function(key){
   const request=get.call(this,key);
   if(window.releaseReady&&this.name==='settings'&&String(key).startsWith('tabs:')&&!window.tabsHeld){
    window.tabsHeld=true;const tx=this.transaction;let released=false;
    tx.addEventListener('complete',event=>{
     if(released)return;event.stopImmediatePropagation();window.releaseTabs=()=>{released=true;tx.dispatchEvent(new Event('complete'))};
    },true);
   }
   return request;
  };
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.source!==document.querySelector('#editor-container iframe')?.contentWindow||e.data?.__lo!=='lo-relay')return;
   if(e.data.type==='boot-progress')window.progressEvents.push(e.data);
   if(e.data.type==='ready'&&!window.releaseReady){window.heldReady={data:e.data,origin:e.origin,source:e.source};e.stopImmediatePropagation()}
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
   const bar=document.querySelector('#boot-progress');
   new MutationObserver(()=>window.progressUI.push({status:document.querySelector('#editor-cover').dataset.bootStatus,percent:bar.getAttribute('aria-valuenow'),label:document.querySelector('#boot-progress-label').textContent,hidden:bar.hidden})).observe(bar,{attributes:true});
  });
 });
 await page.goto(origin+'/web/?lang=zh',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const n=Number(document.querySelector('#boot-progress').getAttribute('aria-valuenow'));return n>=10&&n<90},{timeout:60000});
 await page.screenshot({path:path.join(out,'01-resource-progress-zh.png')});
 await page.waitForFunction(()=>!!window.heldReady,{timeout:90000});
 assert.equal(await page.$eval('#boot-progress',e=>e.getAttribute('aria-valuenow')),null);
 assert.equal(await page.$eval('#boot-progress-label',e=>e.textContent),'正在启动编辑器');
 await page.screenshot({path:path.join(out,'02-engine-starting-zh.png')});
 const before=await page.evaluate(()=>({events:window.progressEvents,ui:window.progressUI}));
 assert.ok(before.events.length>10);assert.ok(before.events.every((p,i)=>!i||p.loaded>=before.events[i-1].loaded));
 assert.equal(before.events.at(-1).completed,6);assert.equal(before.events.at(-1).loaded,before.events.at(-1).total);assert.equal(before.events.at(-1).reliable,true);
 assert.ok(before.ui.every(p=>p.percent!=='100'));assert.ok(new Set(before.ui.map(p=>p.percent).filter(Boolean)).size>5);
 await page.evaluate(()=>{window.releaseReady=true;window.dispatchEvent(new MessageEvent('message',window.heldReady))});
 await page.waitForFunction(()=>!!window.releaseTabs);
 assert.equal(await page.$eval('#boot-progress',e=>e.getAttribute('aria-valuenow')),null);
 assert.equal(await page.$eval('#boot-progress-label',e=>e.textContent),'正在打开文档');
 await page.screenshot({path:path.join(out,'03a-document-reading-zh.png')});await page.evaluate(()=>window.releaseTabs());
 await waitForSavedEditor(page);assert.equal(await page.$eval('#boot-progress',e=>e.hidden),true);
 await page.screenshot({path:path.join(out,'03-document-ready-zh.png')});
 evidence.progress=await page.evaluate(()=>({events:window.progressEvents,ui:window.progressUI}));
 assert.ok(evidence.progress.ui.every(p=>p.percent!=='100'));assert.equal(await page.$eval('#boot-progress-live',e=>e.textContent),'');
 evidence.steps.push('throttled decoded resource progress increases monotonically','all six resources complete before indeterminate engine stage','held real ready never shows 100','delayed IndexedDB read after engine ready remains indeterminate document opening','real document opens and saves then hides startup meter and clears live announcement');
 await page.close();
 const failure=await browser.newPage();await failure.setViewport({width:1440,height:1000});await failure.setRequestInterception(true);
 failure.on('request',r=>new URL(r.url()).origin!==origin?r.abort():r.url().endsWith('/soffice.wasm')?r.respond({status:404,body:''}):r.continue());
 await failure.goto(origin+'/web/?lang=en',{waitUntil:'domcontentloaded'});
 await failure.waitForFunction(()=>document.querySelector('#editor-cover').dataset.bootStatus==='error');
 assert.equal(await failure.$eval('#boot-progress',e=>e.hidden),true);assert.equal(await failure.$eval('#boot-progress',e=>e.getAttribute('aria-valuenow')),null);
 assert.equal(await failure.$eval('#cover-retry',e=>e.hidden),false);assert.match(await failure.$eval('#cover-detail',e=>e.textContent),/could not load|stopped responding/);
 assert.equal(await failure.$eval('.desktop-link',e=>e.getAttribute('href')),'/en/start');
 assert.equal(await failure.$eval('.desktop-link',e=>e.textContent),'Download desktop');
 await failure.setViewport({width:390,height:844});
 assert.ok(await failure.$eval('.topbar',e=>e.scrollWidth<=e.clientWidth),'mobile header must fit both desktop and account links');
 await failure.screenshot({path:path.join(out,'05-mobile-header-en.png')});await failure.setViewport({width:1440,height:1000});
 await failure.screenshot({path:path.join(out,'04-error-retry-en.png')});
 await failure.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 assert.equal(await failure.$eval('#boot-progress span',e=>getComputedStyle(e).animationName),'none');
 evidence.steps.push('real runtime failure hides meter and offers English retry','reduced motion disables progress animation');evidence.passed=true;
}catch(error){evidence.failure=error.message;throw error}finally{
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
console.log(JSON.stringify({passed:evidence.passed,steps:evidence.steps,out}));
