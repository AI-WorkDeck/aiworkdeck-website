// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// POLISH W6 step 5 acceptance (readiness/w6/preview-spec.md §5), real engine, headless:
// readable preview fast on a throttled cold load, edits blocked until ready, swap to the editor,
// engine failure keeps the preview, unsupported browser keeps the preview.
// Requires `npm run build`. PUPPETEER_EXECUTABLE_PATH = bundled headless Chromium (PUPPETEER_HEADLESS=shell for
// chrome-headless-shell). SHOTS=<dir> saves screenshots. Never downloads remote assets or calls a model.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';

const server=createPreviewServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const shots=process.env.SHOTS;if(shots)await fs.mkdir(shots,{recursive:true});
const launch=async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'awd-preview-'));return {dir,browser:await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:process.env.PUPPETEER_HEADLESS==='shell'?'shell':'new',userDataDir:dir,protocolTimeout:180000,args:['--disable-dev-shm-usage','--lang=en-US','--use-angle=swiftshader','--enable-unsafe-swiftshader']})}};
const shot=async(page,name)=>{if(shots)await page.screenshot({path:path.join(shots,name+'.png')})};
const until=async(page,fn,label,ms=180000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await page.evaluate(fn))return;await new Promise(r=>setTimeout(r,100))}throw Error('timeout: '+label)};
const previewText=()=>{const el=document.querySelector('#doc-preview');return !!el&&!el.hidden&&/Service Agreement/.test(el.innerText)};

async function run(label,setup,check){
 const {dir,browser}=await launch();
 try{const page=await browser.newPage();await page.setViewport({width:1440,height:900});await setup?.(page);await check(page)}
 finally{await browser.close();await fs.rm(dir,{recursive:true,force:true})}
 console.log('PASS',label);
}

await run('cold throttled load: readable preview fast, edits blocked, then the swap',async page=>{
 const cdp=await page.createCDPSession();await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1.5e6,uploadThroughput:5e5});
 page.cdp=cdp;
},async page=>{
 const t0=Date.now();await page.goto(`${base}/web/?lang=en`,{waitUntil:'domcontentloaded'});
 await until(page,previewText,'preview text',15000);const readable=Date.now()-t0;
 assert.ok(readable<=3000,`first readable text in ${readable} ms (≤ 3000 on a throttled cold load)`);
 assert.equal(await page.$eval('#preview-badge',e=>e.hidden),false,'read-only badge shown');
 assert.equal(await page.$eval('#editor-cover',e=>e.hidden),true,'no full-page cover over the preview');
 assert.match(await page.$eval('#tabs .tab.active',e=>e.textContent),/Service agreement/,'the tab is shown during the preview');
 assert.match(await page.$eval('#ai-document',e=>e.textContent),/Service agreement/,'AI pane names the document during the preview');
 await until(page,()=>/Preparing editor… \d+%/.test(document.querySelector('#prep-text')?.textContent||''),'progress bar');
 await shot(page,'preview-progress');
 await page.click('[data-action="bold"]');
 await until(page,()=>/as soon as the editor is ready/.test(document.querySelector('#toast')?.textContent||''),'blocked toast',3000);
 assert.equal(await page.$eval('#send-button',b=>b.disabled),true,'AI send disabled before ready');
 assert.equal(await page.$eval('#ai-waiting',e=>e.hidden),false,'AI waiting hint shown');
 await page.cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await until(page,()=>{const p=document.querySelector('#doc-preview');return p.hidden&&!document.querySelector('.document-toolbar').classList.contains('asleep')},'swap');
 assert.match(await page.$eval('#prep-text',e=>e.textContent),/Editor ready/);
 assert.equal(await page.$eval('#doc-preview',e=>e.dataset.swapReason),'painted','swapped only after the engine painted the page');
 assert.ok(await page.$eval('#toast',e=>e.hidden),'blocked-edit toast cleared at the swap');
 assert.match(await page.$eval('#tabs .tab.active',e=>e.textContent),/Service agreement/,'tab shown');
 assert.equal(await page.$eval('#preview-badge',e=>e.hidden),true,'badge gone after the swap');
 assert.equal(await page.$eval('[data-action="bold"]',b=>b.getAttribute('aria-disabled')),null,'toolbar enabled at the swap');
 await shot(page,'after-swap');
});

await run('engine failure keeps the preview with an inline error',async page=>{
 await page.setRequestInterception(true);
 page.on('request',r=>/soffice\.wasm/.test(r.url())?r.abort():r.continue());
},async page=>{
 await page.goto(`${base}/web/?lang=en`,{waitUntil:'domcontentloaded'});
 await until(page,previewText,'preview text',15000);
 await until(page,()=>!document.querySelector('#prep-error').hidden,'engine error',240000);
 assert.match(await page.$eval('#prep-error-text',e=>e.textContent),/couldn't start, but you can still read/);
 assert.ok(await page.evaluate(previewText),'preview still readable');
 await shot(page,'engine-failed');
});

await run('unsupported browser (no cross-origin isolation) keeps the preview',async page=>{
 await page.setRequestInterception(true);
 page.on('request',async r=>{
  if(r.isNavigationRequest()&&/\/web\/(\?|$)/.test(r.url())){const res=await fetch(r.url());const headers=Object.fromEntries([...res.headers].filter(([k])=>!/^cross-origin-(embedder|opener)-policy$/i.test(k)));r.respond({status:res.status,headers,body:Buffer.from(await res.arrayBuffer())});}
  else r.continue();
 });
},async page=>{
 await page.goto(`${base}/web/?lang=en`,{waitUntil:'domcontentloaded'});
 await until(page,previewText,'preview text',15000);
 await until(page,()=>!document.querySelector('#prep-error').hidden,'unsupported error',15000);
 assert.match(await page.$eval('#prep-error-text',e=>e.textContent),/can't run the online editor/);
 assert.equal(await page.$eval('#prep-desktop',e=>e.hidden),false,'desktop app link offered');
 await shot(page,'unsupported');
});
server.close();
