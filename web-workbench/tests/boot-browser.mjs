// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Real local engine, accelerated host warning clock, delayed real ready delivery.
// Never writes public/web, downloads remote assets, or calls a model.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';
import {observeEditorResources,waitForSavedEditor} from './browser-observation.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.BOOT_TEST_OUTPUT||path.join(root,'test-results/cold-start'));
await fs.mkdir(out,{recursive:true});const built=await fs.mkdtemp(path.join(os.tmpdir(),'awd-boot-ui-'));
await build({configFile:false,root,base:'/web/',logLevel:'error',build:{outDir:built,emptyOutDir:true,target:'es2022'}});
const fallback=createPreviewServer({mockAI:true});
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/web/'||/^\/web\/assets\/[\w.-]+$/.test(pathname)){
  const name=pathname==='/web/'?'index.html':pathname.slice(5);
  try{const bytes=await fs.readFile(path.join(built,name));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cache-Control':'no-store'});res.end(bytes)}catch{res.writeHead(404);res.end()}
 }else fallback.emit('request',req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser,page;const evidence={realEngine:true,realModel:false,acceleratedHostClock:true,delayedRealReady:true,webResources:[],steps:[]};
try{
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',protocolTimeout:180000,args:['--disable-dev-shm-usage']});
 page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===origin?r.continue():r.abort());
 evidence.console=[];page.on('console',m=>{if(m.type()==='error')evidence.console.push(m.text())});page.on('pageerror',e=>evidence.console.push(e.message));
 const stop=await observeEditorResources(page,origin,evidence.webResources);
 await page.evaluateOnNewDocument(()=>{
  if(window!==window.top)return;
  const schedule=window.setTimeout.bind(window);let warning=true,final=true;window.setTimeout=(fn,ms,...args)=>{if(ms===180000&&warning){warning=false;ms=50}else if(ms===600000&&final){final=false;ms=120000}return schedule(fn,ms,...args)};
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.source!==document.querySelector('#editor-container iframe')?.contentWindow||e.data?.__lo!=='lo-relay')return;
   if(e.data.type==='ready'&&!window.releaseBoot){window.heldReady={data:e.data,origin:e.origin,source:e.source};e.stopImmediatePropagation()}
  },true);
 });
 await page.goto(origin+'/web/?lang=en',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#editor-cover').dataset.bootStatus==='slow');
 assert.match(await page.$eval('#boot-progress-live',e=>e.textContent),/longer than usual/);
 assert.equal(await page.$eval('#cover-retry',e=>e.hidden),false);await page.screenshot({path:path.join(out,'01-slow-loading.png')});
 await page.waitForFunction(()=>!!window.heldReady,{timeout:90000});
 assert.equal(await page.$eval('#editor-cover',e=>e.dataset.bootStatus),'slow');
 await page.screenshot({path:path.join(out,'02-real-stage.png')});
 await page.evaluate(()=>{window.releaseBoot=true;window.dispatchEvent(new MessageEvent('message',window.heldReady))});
 await waitForSavedEditor(page);assert.equal(await page.$eval('#cover-retry',e=>e.hidden),true);
 const dir=new URL('../vendor/core/frontend/src/composables/',import.meta.url);
 const relay=(await fs.readFile(new URL('zetaOfficeRelay.js',dir),'utf8')).replace(/^export /gm,'');const host=(await fs.readFile(new URL('useZetaOfficeWebview.js',dir),'utf8')).replace(/^import .*\n/gm,'').replace(/^export /gm,'');
 await page.evaluate(`(()=>{${relay}\n${host}\nwindow.bootEditor=createIframeEditorExecutor(document.querySelector('#editor-container iframe'));})()`);
 const text=await page.evaluate(()=>window.bootEditor.executeCommand('get_document_text',{__agent:true}));assert.equal(text.success,true);assert.match(JSON.stringify(text),/30 days/);
 await page.screenshot({path:path.join(out,'03-late-ready-opened.png')});evidence.steps.push('slow warning retains same iframe and offers refresh','real boot milestones remain visible while waiting','late real ready opens persisted sample and hides retry');
 // Terminal UI is tested separately, with no engine substitution or big asset load.
 const failPage=await browser.newPage();await failPage.setViewport({width:1440,height:1000});
 await failPage.setRequestInterception(true);failPage.on('request',r=>new URL(r.url()).pathname==='/web/editor/editor.html'?r.respond({status:200,contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp'},body:'<!doctype html><title>Silent startup fixture</title>'}):r.continue());
 await failPage.evaluateOnNewDocument(()=>{if(window!==window.top)return;const schedule=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>schedule(fn,ms===180000?30:ms===600000?120:ms,...args)});
 await failPage.goto(origin+'/web/?lang=en',{waitUntil:'domcontentloaded'});await failPage.waitForFunction(()=>document.querySelector('#editor-cover').dataset.bootStatus==='error');
 assert.match(await failPage.$eval('#cover-detail',e=>e.textContent),/ten minutes/);assert.equal(await failPage.$eval('#cover-retry',e=>e.hidden),false);assert.equal(await failPage.$('#editor-container iframe'),null);
 await failPage.screenshot({path:path.join(out,'04-terminal-timeout.png')});evidence.steps.push('silent iframe fixture reaches final error, offers retry and is removed');
 await stop();evidence.passed=true;
}catch(e){evidence.failure=e.message;if(page){evidence.ui=await page.$eval('#cover-detail',e=>e.textContent);await page.screenshot({path:path.join(out,'failure.png')})}throw e}finally{
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));
 if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(built,{recursive:true,force:true});
}
console.log(JSON.stringify({passed:evidence.passed,steps:evidence.steps,out}));
