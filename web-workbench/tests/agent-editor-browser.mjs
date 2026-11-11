// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated native engine + real IDB. Direct tools are synthetic: no model/API call.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import JSZip from 'jszip';
import {createPreviewServer} from '../scripts/preview.mjs';
import {createDocument} from '../src/docx.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const assetRoot=path.resolve(process.env.AWD_EDITOR_ASSET_ROOT||path.join(root,'../public/web/editor'));
await fs.access(path.join(assetRoot,'editor.html'));
const assetManifest=JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8'));
const representations=JSON.parse(await fs.readFile(path.join(assetRoot,'../representation-manifest.json'),'utf8'));
const out=path.resolve(process.env.AWD_AGENT_TEST_OUTPUT||path.join(root,'test-results/agent-editor-native'));
await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'awd-agent-editor-'));
const evidence={assetRoot,realModel:false,synthetic:true,steps:[],errors:[],started:new Date().toISOString(),sourceHashes:{}};
const nativeHash=createHash('sha256').update(await fs.readFile(path.join(assetRoot,'office_thread.js'))).digest('hex');
assert.equal(nativeHash,createHash('sha256').update(await fs.readFile(path.join(root,'vendor/core/frontend/src/zetaoffice/public/office_thread.js'))).digest('hex'));
evidence.nativeWorkerHash=nativeHash;
for(const name of ['editor.js','agent-editor.js','agent-contract.js'])evidence.sourceHashes[name]=createHash('sha256').update(await fs.readFile(path.join(root,'src',name))).digest('hex');
const server=createPreviewServer({testSupport:true});
const fallback=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/web/editor/')){
   const relative=decodeURIComponent(url.pathname.slice('/web/editor/'.length)),file=path.resolve(assetRoot,relative);
   if(!file.startsWith(assetRoot+path.sep))throw Error('Invalid asset path');
   const contentType={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.data':'application/octet-stream','.ttf':'font/ttf','.ttc':'font/collection','.otf':'font/otf'};
   res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Type',contentType[path.extname(file)]||'application/octet-stream');
   if(relative.startsWith('lowa/')&&assetManifest.encodings[path.basename(file)])res.setHeader('Content-Encoding',assetManifest.encodings[path.basename(file)]);
   if(relative.startsWith('compressed/')){const representation=representations.files['editor/'+relative];if(!representation)throw Error('Unknown representation');res.setHeader('Content-Encoding',representation.contentEncoding);res.setHeader('Content-Type',representation.contentType)}
   res.end(await fs.readFile(file));return;
  }
  if(!url.pathname.startsWith('/agent-test/'))return fallback(req,res);
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/agent-test/'){
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Native agent synthetic fixture</title><style>iframe{width:100%;height:920px;border:0}body{margin:0}</style><div id="editor"></div>');return;
  }
  const name=url.pathname.slice('/agent-test/'.length);
  if(!['editor.js','agent-editor.js','agent-contract.js','proposal.js','storage.js'].includes(name)){res.writeHead(404);res.end();return}
  let source=await fs.readFile(path.join(root,'src',name),'utf8');
  if(name==='editor.js')source=source.replace('../vendor/core/frontend/src/composables/useZetaOfficeWebview.js','/test-support/useZetaOfficeWebview.js');
  res.setHeader('Content-Type','text/javascript');res.end(source);
 }catch(error){res.writeHead(500);res.end('Fixture error')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser,page,watchdog;
const pass=name=>{console.log('PASS',name);evidence.steps.push(name)};
try{
 const work=async()=>{
  browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:'new',userDataDir:profile,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage']});
  evidence.ownedBrowserPid=browser.process().pid;
  page=await browser.newPage();await page.setViewport({width:1440,height:1000});
  page.on('pageerror',e=>evidence.errors.push(e.message));
  page.on('response',response=>{if(response.status()>=400)(evidence.failedRequests??=[]).push({url:new URL(response.url()).pathname,status:response.status()})});
  await page.setRequestInterception(true);page.on('request',request=>{const url=new URL(request.url());if(url.origin!==origin&&!['data:','blob:','about:'].includes(url.protocol))return request.abort();if(url.pathname.startsWith('/api/'))return request.abort();return request.continue()});
  await page.goto(origin+'/agent-test/',{waitUntil:'domcontentloaded'});
  const lines=['原生操作验收','甲方30日付款。','乙方30日付款。','删除本句。','格式正文。','末尾锚点。'],bytes=await createDocument(lines);
  await page.evaluate(async bytes=>{
   const {EditorSession}=await import('/agent-test/editor.js'),{openWorkspace}=await import('/agent-test/storage.js');
   window.fixture={states:[],commands:[]};const f=window.fixture;f.store=await openWorkspace();const project=await f.store.createProject('合成工具验收');
   f.file=await f.store.createFile({projectId:project.id,name:'synthetic-agent.docx',bytes:new Uint8Array(bytes)});
   f.session=new EditorSession({container:document.querySelector('#editor'),store:f.store,onState:value=>f.states.push({status:value.status,error:value.error}),onBusy(){},onBoot:value=>{f.boot=value}});
   f.opening=f.session.show(f.file).then(()=>{f.opened=true},error=>{f.openError=error.message});const exec=f.session.exec.bind(f.session);f.session.exec=async(action,params)=>{f.commands.push({action,params:{...params,bytes:undefined}});return exec(action,params)};
  },Array.from(bytes));
  await page.waitForFunction(()=>fixture.opened||fixture.openError,{timeout:150000});
  assert.equal(await page.evaluate(()=>fixture.openError),undefined);
  const begin=()=>page.evaluate(()=>fixture.session.beginAgent());
  const context=runId=>page.evaluate(runId=>fixture.session.agentContext(runId),runId);
  const tool=(runId,callId,name,args)=>page.evaluate((runId,callId,name,args)=>fixture.session.executeAgentTool(runId,callId,name,args),runId,callId,name,args);
  const body=()=>page.evaluate(()=>fixture.session.readText());
  let ctx=await begin();assert.equal(ctx.document.text,lines.join('\n'));pass('stable full body and opaque targets without manual selection');
  const found=await tool(ctx.runId,'find','doc_find_text',{queries:[{text:'30',matchCase:true},{text:'删除本句。',matchCase:true}]});evidence.find=found;assert.equal(found.ok,true);
  const edits=found.result.queries[0].matches.map(m=>({type:'replace_text',targetId:m.targetId,newText:'45'}));edits.push({type:'replace_text',targetId:found.result.queries[1].matches[0].targetId,newText:''});
  const changed=await tool(ctx.runId,'batch','doc_apply_edits',{edits});evidence.batch=changed;assert.equal(changed.ok,true);assert.match(await body(),/甲方45日付款。\n乙方45日付款。\n\n格式正文。/);pass('multiple native tracked replacements and empty deletion saved');
  ctx=await context(ctx.runId);
  const format=await tool(ctx.runId,'format','doc_apply_edits',{edits:[
   {type:'format_text',targetId:ctx.targets.find(t=>t.text==='格式正文。').targetId,format:{bold:false,italic:true,fontSize:14}},
   {type:'format_paragraph',targetId:ctx.targets.find(t=>t.text==='原生操作验收').targetId,format:{alignment:'center',headingLevel:1}}]});
  evidence.format=format;assert.equal(format.ok,true);pass('native character and paragraph format verified by actual property readback');
  ctx=await context(ctx.runId);
  const inserted=await tool(ctx.runId,'insert','doc_apply_edits',{edits:[{type:'insert_text',targetId:ctx.targets.find(t=>t.position==='end').targetId,position:'after',text:'\n**字面**😀\n新段落。'}]});
  evidence.insert=inserted;assert.equal(inserted.ok,true);assert.match(await body(),/末尾锚点。\n\*\*字面\*\*😀\n新段落。/);pass('literal Markdown, emoji and explicit paragraph insertion');
  ctx=await context(ctx.runId);
  const created=await tool(ctx.runId,'create','doc_apply_edits',{edits:[{type:'create_table',targetId:ctx.targets.find(t=>t.position==='end').targetId,position:'after',rows:[['姓名','期限','金额'],['甲方','30','100']],headerRow:true}]});
  evidence.create=created;assert.equal(created.ok,true);pass('native 2x3 Writer table created and all cells read back');
  const table=await tool(ctx.runId,'table-read','doc_read_tables',{tables:[{tableIndex:0}]});evidence.tableRead=table;assert.equal(table.ok,true);
  const cells=await tool(ctx.runId,'cells','doc_apply_edits',{edits:[{type:'set_table_cell',targetId:table.result.tables[0].cells[1][1].targetId,text:'45'},{type:'set_table_cell',targetId:table.result.tables[0].cells[1][2].targetId,text:''}]});
  evidence.cells=cells;assert.equal(cells.ok,true);pass('explicit B2 change and empty C2 clear preserve neighboring cells');
  const stored=await page.evaluate(async()=>{const f=await fixture.store.getFile(fixture.session.file.id);return {name:f.name,bytes:Array.from(f.bytes),version:f.version}});
  const zip=await JSZip.loadAsync(Uint8Array.from(stored.bytes)),xml=await zip.file('word/document.xml').async('string');
  assert.match(xml,/<w:tbl[ >]/);assert.match(xml,/<w:del[ >]/);assert.match(xml,/AI|助手/);assert.match(xml,/<w:i[ />]/);
  await fs.writeFile(path.join(out,'native-agent.docx'),Uint8Array.from(stored.bytes));await page.screenshot({path:path.join(out,'native-agent.png')});pass('actual IDB DOCX includes native table, tracked changes, AI author and formatting');
  const restored=await page.evaluate(async runId=>{fixture.session.endAgent(runId);return fixture.session.restoreAgent(runId)},ctx.runId);assert.equal(restored.saved,true);assert.equal(await body(),lines.join('\n'));
  const noTable=await page.evaluate(()=>fixture.session.exec('table_read',{tableIndex:0}).then(()=>false,e=>e.message));assert.match(noTable,/文档共 0 张表/);pass('whole-run DOCX checkpoint restores text, formatting source and removes inserted table');
  await page.evaluate(async()=>{const s=fixture.session,file=await fixture.store.getFile(s.file.id);await s.show(null);await s.show(file)});assert.equal(await body(),lines.join('\n'));pass('restored DOCX reopens through native load and persisted IDB');
  ctx=await begin();await page.evaluate(()=>{fixture.session.agent.invalidate();fixture.session.generation++});
  const stale=await tool(ctx.runId,'stale','doc_apply_edits',{edits:[{type:'replace_text',targetId:ctx.targets.find(t=>t.text==='甲方30日付款。').targetId,newText:'不应发生'}]});assert.equal(stale.ok,false);assert.equal(stale.partial,false);assert.equal(await body(),lines.join('\n'));pass('stale user edit lease rejected before content dispatch');
  evidence.commands=await page.evaluate(()=>fixture.commands);
  assert.deepEqual(evidence.errors,[]);
 };
 await Promise.race([work(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('NATIVE_FIXTURE_240S_LIMIT')),240000)})]);
 evidence.ok=true;
}catch(error){evidence.ok=false;evidence.failure=error.stack||String(error);if(page)try{evidence.finalState=await page.evaluate(()=>({boot:window.fixture?.boot,states:window.fixture?.states,openError:window.fixture?.openError}))}catch{}throw error}
finally{
 clearTimeout(watchdog);
 if(page)try{await Promise.race([page.evaluate(()=>fixture?.session.dispose()),new Promise(r=>setTimeout(r,2000))])}catch{}
 if(browser){try{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))])}finally{if(browser.process()?.exitCode===null)browser.process().kill('SIGKILL')}}
 server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});
 evidence.finished=new Date().toISOString();evidence.cleanedProfile=true;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log('Receipt: '+path.join(out,'receipt.json'));
}
