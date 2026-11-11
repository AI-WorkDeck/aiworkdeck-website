// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Real built iframe and DOCX persistence; Chromium CDP composition, not an OS IME or paid AI test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';
import {waitForSavedEditor} from './browser-observation.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.IME_TEST_OUTPUT||path.join(root,'test-results/ime-preedit'));
await fs.mkdir(out,{recursive:true});
const server=createPreviewServer({testSupport:true});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const result={passed:false,compositionDriver:'Chromium CDP',modelCalls:0};
let browser;
try {
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',protocolTimeout:180000,args:['--disable-dev-shm-usage']});
 const page=await browser.newPage();
 await page.setViewport({width:1280,height:900});
 await page.setRequestInterception(true);
 page.on('request',request=>{
  if(new URL(request.url()).origin===origin&&['GET','HEAD','OPTIONS'].includes(request.method()))return request.continue();
  if(new URL(request.url()).pathname==='/api/web/chat')result.modelCalls++;
  return request.abort();
 });
 await page.goto(origin+'/web/?lang=zh',{waitUntil:'domcontentloaded'});
 await waitForSavedEditor(page);
 const attach=()=>page.evaluate(async()=>{
  const {createIframeEditorExecutor}=await import('/test-support/useZetaOfficeWebview.js');
  window.imeEditor=createIframeEditorExecutor(document.querySelector('#editor-container iframe'));
 });
 await attach();
 const command=async(action,params={})=>{
  const value=await page.evaluate((a,p)=>window.imeEditor.executeCommand(a,p),action,params);
  assert.equal(value.success,true);return value;
 };
 await command('goto',{type:'end'});
 const frame=page.frames().find(candidate=>candidate.url().includes('/editor/editor.html'));
 await frame.$eval('[data-lo-ime]',input=>input.focus());
 const cdp=await page.createCDPSession();
 const preedit='zhongwenshurufa'.repeat(18);
 const readInput=()=>frame.$eval('[data-lo-ime]',input=>{
  const style=getComputedStyle(input),box=input.getBoundingClientRect(),host=input.parentElement.getBoundingClientRect();
  return {value:input.value,start:input.selectionStart,end:input.selectionEnd,focused:document.activeElement===input,opacity:style.opacity,color:style.color,caretColor:style.caretColor,scrollLeft:input.scrollLeft,left:box.left,right:box.right,hostLeft:host.left,hostRight:host.right};
 });
 await cdp.send('Input.imeSetComposition',{text:preedit,selectionStart:preedit.length,selectionEnd:preedit.length});
 await frame.waitForFunction(()=>document.querySelector('[data-lo-ime]')?.value.length>200);
 result.preedit=await readInput();
 assert.equal(result.preedit.opacity,'1','PREEDIT_VISIBLE');
 assert.equal(result.preedit.focused,true);
 assert.equal(result.preedit.start,preedit.length);
 assert.equal(result.preedit.end,preedit.length);
 assert.notEqual(result.preedit.color,'rgba(0, 0, 0, 0)');
 assert.notEqual(result.preedit.caretColor,'rgba(0, 0, 0, 0)');
 assert.ok(result.preedit.scrollLeft>0,'Long composition scrolls inside the native input');
 assert.ok(result.preedit.left>=result.preedit.hostLeft&&result.preedit.right<=result.preedit.hostRight,'Preedit stays within the editor');
 await cdp.send('Input.imeSetComposition',{text:preedit,selectionStart:5,selectionEnd:10});
 result.selection=await readInput();
 assert.equal(result.selection.start,5);
 assert.equal(result.selection.end,10);
 await page.screenshot({path:path.join(out,'composition-selection.png')});
 const marker='网页中文光标保存重开验收。';
 await cdp.send('Input.insertText',{text:marker});
 await page.click('#save-button');
 await waitForSavedEditor(page);
 result.committedTextVerified=JSON.stringify(await command('get_document_text',{__agent:true})).includes(marker);
 assert.equal(result.committedTextVerified,true);
 assert.equal((await readInput()).opacity,'0','Input becomes transparent after composition');
 await page.reload({waitUntil:'domcontentloaded'});
 await waitForSavedEditor(page);
 await attach();
 result.savedReloadVerified=JSON.stringify(await command('get_document_text',{__agent:true})).includes(marker);
 assert.equal(result.savedReloadVerified,true);
 assert.equal(result.modelCalls,0);
 await page.screenshot({path:path.join(out,'saved-reload.png')});
 result.passed=true;
 console.log('PASS native preedit caret/selection/scrolling, Chinese commit and saved DOCX reload; no model calls');
} finally {
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
 if(browser)await browser.close();
 server.closeAllConnections();
 await new Promise(resolve=>server.close(resolve));
}
