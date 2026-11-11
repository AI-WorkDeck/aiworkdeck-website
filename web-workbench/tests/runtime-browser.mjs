// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Real built iframe and local pinned engine; faults affect only this server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {brotliCompressSync} from 'node:zlib';
import puppeteer from 'puppeteer-core';
import JSZip from 'jszip';
import {createPreviewServer} from '../scripts/preview.mjs';
import {waitForSavedEditor} from './browser-observation.mjs';

const out = path.resolve(process.env.RUNTIME_TEST_OUTPUT || 'test-results/runtime');
await fs.mkdir(out,{recursive:true});
const results = [];
for (const mode of ['normal','wasm-404','wasm-mime','data-size','data-broken-body','dispose']) {
  const run = {mode,requests:[],consoleErrors:[],modelCalls:0}; results.push(run);
  const fallback = createPreviewServer({testSupport:true});
  const pending = new Set();
  const server = http.createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const entry = {path:pathname,start:Date.now()}; run.requests.push(entry);
    res.on('finish',() => { entry.finished=Date.now(); });
    res.on('close',() => { entry.closed=Date.now(); });
    if (pathname === '/api/web/capabilities') {
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({authenticated:false,aiEnabled:false})); return;
    }
    if (mode === 'dispose' && /soffice\.(wasm|data)$/.test(pathname)) {
      // Keep the connection open until closing the owning page cancels it.
      pending.add(res); res.on('close',() => pending.delete(res)); return;
    }
    if (pathname.endsWith('/soffice.wasm') && mode === 'wasm-404') { res.writeHead(404); res.end(); return; }
    if (pathname.endsWith('/soffice.wasm') && mode === 'wasm-mime') {
      res.writeHead(200,{'Content-Type':'text/html','Content-Encoding':'br'});res.end(brotliCompressSync(Buffer.from('not an engine')));return;
    }
    if (pathname.endsWith('/soffice.data') && ['data-size','data-broken-body'].includes(mode)) {
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Encoding':'br'});
      res.end(mode === 'data-size' ? brotliCompressSync(Buffer.from('short package')) : Buffer.from('invalid brotli'));return;
    }
    // Leave enough time to observe both runtime requests before fonts finish.
    if (pathname.startsWith('/web/editor/compressed/')) {
      const timer=setTimeout(() => { if(!res.destroyed) fallback.emit('request',req,res); },800);
      res.on('close',() => clearTimeout(timer)); return;
    }
    fallback.emit('request',req,res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',protocolTimeout:180000,args:['--disable-dev-shm-usage']});
    const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
    await page.setRequestInterception(true);
    page.on('request',r => new URL(r.url()).origin===origin&&['GET','HEAD'].includes(r.method()) ? r.continue() : r.abort());
    page.on('pageerror',e => run.consoleErrors.push(e.message));
    const start=Date.now();await page.goto(origin+'/web/?lang=zh',{waitUntil:'domcontentloaded'});
    if (mode === 'dispose') {
      const deadline=Date.now()+15000;
      while(pending.size<2&&Date.now()<deadline) await new Promise(r=>setTimeout(r,20));
      assert.equal(pending.size,2);await page.close();
      const closedDeadline=Date.now()+5000;
      while(pending.size&&Date.now()<closedDeadline) await new Promise(r=>setTimeout(r,20));
      assert.equal(pending.size,0,'closing the page must cancel its two pending transfers');
    } else if (mode === 'normal') {
      await waitForSavedEditor(page);run.readyMs=Date.now()-start;
      await page.evaluate(async()=>{const {createIframeEditorExecutor}=await import('/test-support/useZetaOfficeWebview.js');window.runtimeEditor=createIframeEditorExecutor(document.querySelector('#editor-container iframe'));});
      const fonts=await page.evaluate(()=>window.runtimeEditor.executeCommand('list_fonts'));
      for(const family of ['Noto Sans SC','Noto Serif SC','霞鹜文楷','朱雀仿宋（预览测试版）'])assert.ok(fonts.families.includes(family));
      const text=await page.evaluate(()=>window.runtimeEditor.executeCommand('get_document_text',{__agent:true}));
      assert.equal(text.success,true);assert.match(JSON.stringify(text),/付款安排/);
      const firstFontFinished=Math.min(...run.requests.filter(r=>r.path.startsWith('/web/editor/compressed/')).map(r=>r.finished));
      for(const name of ['soffice.wasm','soffice.data']) {
        const requests=run.requests.filter(r=>r.path.endsWith('/'+name));
        assert.equal(requests.length,1);assert.ok(requests[0].start<firstFontFinished);
      }
      assert.deepEqual(run.consoleErrors,[]);
      // Deterministic native tracked edit; no AI request or synthetic editor.
      const cmd=(action,params={})=>page.evaluate((a,p)=>window.runtimeEditor.executeCommand(a,p),action,params);
      const original='甲方应在交付后30日内支付全部服务费用。';
      const found=await cmd('find_text_locations',{keyword:original,matchCase:true,__agent:true});
      assert.equal(found.count,1);
      assert.equal((await cmd('replace_at_position',{anchor:found.matches[0].anchorId,newText:original.replace('30','45'),__agent:true})).success,true);
      await page.click('#save-button');await waitForSavedEditor(page);
      run.revisionsBeforeReload=(await cmd('list_revisions',{limit:100})).count;
      assert.ok(run.revisionsBeforeReload>0);
      await page.reload({waitUntil:'domcontentloaded'});await waitForSavedEditor(page);
      await page.evaluate(async()=>{const {createIframeEditorExecutor}=await import('/test-support/useZetaOfficeWebview.js');window.runtimeEditor=createIframeEditorExecutor(document.querySelector('#editor-container iframe'));});
      run.revisionsAfterReload=(await cmd('list_revisions',{limit:100})).count;
      assert.equal(run.revisionsAfterReload,run.revisionsBeforeReload);
      assert.match(JSON.stringify(await cmd('get_document_text',{__agent:true})),/45日/);
      const downloads=await fs.mkdtemp(path.join(out,'downloads-'));
      const cdp=await browser.target().createCDPSession();
      await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
      let timer,listener;
      const completed=new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('Download timeout')),30000);
        listener=e=>{if(e.state==='completed')resolve();if(e.state==='canceled')reject(Error('Download canceled'));};
        cdp.on('Browser.downloadProgress',listener);
      });
      void completed.catch(()=>{});
      try { await page.click('[data-action="download"]');await completed; }
      finally { clearTimeout(timer);cdp.off('Browser.downloadProgress',listener);await cdp.detach(); }
      const names=(await fs.readdir(downloads)).filter(name=>name.endsWith('.docx'));assert.equal(names.length,1);
      const bytes=await fs.readFile(path.join(downloads,names[0]));
      const xml=await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
      assert.match(xml,/<w:del[\s>]/);assert.match(xml,/<w:ins[\s>]/);assert.match(xml,/45/);assert.match(xml,/<w:delText[^>]*>30<\/w:delText>/);
      run.actualTrackedDownload={bytes:bytes.length,path:path.join(downloads,names[0]),verified:true};
      await page.screenshot({path:path.join(out,'normal.png')});
    } else {
      await page.waitForFunction(()=>document.querySelector('#editor-cover')?.dataset.bootStatus==='error',{timeout:30000});
      run.failedAfterMs=Date.now()-start;
      assert.equal(await page.$('#editor-container iframe'),null);
      assert.equal(await page.$eval('#cover-retry',e=>e.hidden),false);
      assert.ok(run.consoleErrors.every(e=>!/Unhandled|Uncaught \(in promise\)/i.test(e)),JSON.stringify(run.consoleErrors));
      await page.screenshot({path:path.join(out,mode+'.png')});
    }
    run.passed=true;console.log('PASS',mode,run.readyMs||run.failedAfterMs||'closed');
  } catch(error) {run.error=error.message;throw error;}
  finally {
    if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify({realLocalEngine:true,modelCalls:0,results},null,2));
  }
}
