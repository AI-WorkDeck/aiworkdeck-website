// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// POLISH W6 step 2, real engine: a first English visit boots with only the base CJK font, and importing a
// document that names 仿宋 restarts the editor with the fonts it needs (fonts register only at boot).
// Requires `npm run build` first. Headless only; set PUPPETEER_EXECUTABLE_PATH to a bundled Chromium.
// Never downloads remote assets or calls a model.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import puppeteer from 'puppeteer-core';
import {createPreviewServer} from '../scripts/preview.mjs';
import {createDocument} from '../src/docx.js';

const server=createPreviewServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-font-subset-'));
const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:process.env.PUPPETEER_HEADLESS==='shell'?'shell':'new',userDataDir:profile,protocolTimeout:180000,args:['--disable-dev-shm-usage','--lang=en-US']});
try{
 const page=await browser.newPage();
 const fonts=[];page.on('requestfinished',r=>{const m=/\/web\/editor\/compressed\/([\w.-]+)$/.exec(r.url());if(m)fonts.push(m[1])});
 const ready=async label=>{for(let i=0;i<360;i++){await new Promise(r=>setTimeout(r,500));if(await page.evaluate(()=>{const c=document.querySelector('#editor-cover');return !!c&&c.hidden&&!/Preparing|正在准备|Opening|正在打开/.test(document.body.innerText)}))return}throw Error('editor not ready: '+label)};
 await page.goto(`${base}/web/`,{waitUntil:'load'});
 await ready('first visit');
 assert.deepEqual([...new Set(fonts)].sort(),['cjk.ttc'],'English first visit loads only the base CJK font');
 const firstSrc=await page.$eval('#editor-container iframe',f=>f.src);
 assert.match(firstSrc,/[?&]fonts=sans(&|$)/);

 const zip=await JSZip.loadAsync(await createDocument(['通知','第一条 本通知自发布之日起施行。']));
 zip.file('word/fontTable.xml','<?xml version="1.0"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="仿宋_GB2312"/></w:fonts>');
 const file=path.join(profile,'公文.docx');await fs.writeFile(file,await zip.generateAsync({type:'uint8array'}));
 fonts.length=0;
 await (await page.$('input[type=file]')).uploadFile(file);
 for(let i=0;i<120;i++){await new Promise(r=>setTimeout(r,500));if(await page.evaluate(()=>document.querySelector('#import-status')?.dataset.phase==='complete'))break}
 await ready('after import');
 // The preview server sends no-store, so the base font is fetched again here; production revalidates it (ETag, 304).
 assert.deepEqual([...new Set(fonts)].filter(f=>f!=='cjk.ttc').sort(),['cjk-fangsong.ttf','cjk-serif.otf'],'the newly needed fonts are fetched on restart');
 assert.ok(!fonts.includes('cjk-kai.ttf'),'fonts the document does not name are still skipped');
 const src=await page.$eval('#editor-container iframe',f=>f.src);
 assert.match(src,/[?&]fonts=sans%2Cserif%2Cfangsong(&|$)/,'editor restarted with the union');
 assert.equal(await page.$$eval('#editor-container iframe',f=>f.length),1,'old editor frame removed');
 assert.match(await page.$eval('#breadcrumb',e=>e.textContent),/公文\.docx/,'the imported document is open');
 console.log('PASS font subset: first visit cjk.ttc only; 仿宋 document restarts with sans,serif,fangsong');
}finally{await browser.close();server.close();await fs.rm(profile,{recursive:true,force:true})}
