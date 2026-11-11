// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../public',import.meta.url));
const project=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await fs.readFile(new URL('../asset-manifest.json',import.meta.url),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.data':'application/octet-stream','.ttc':'font/collection','.ttf':'font/ttf','.otf':'font/otf','.md':'text/plain; charset=utf-8'};
export function createPreviewServer({mockAI=false,testSupport=false}={}){
 const receipts=new Map();
 return http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/web/capabilities'&&mockAI){const anonymous=url.searchParams.get('testAnonymous')==='1';res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({authenticated:!anonymous,aiEnabled:!anonymous,reason:anonymous?'unauthorized':null,agentEnabled:!anonymous,agentReason:anonymous?'unauthorized':null,agent:{maxChargeCents:25,maxRunChargeCents:100,maxGenerations:4},currency:'TEST',maxChargeCents:100,webTrialSupported:false,loginUrl:`/${url.searchParams.get('lang')||'zh'}/account?next=%2Fweb%2F`}));return}
   if(url.pathname.startsWith('/api/web/requests/')&&mockAI){const receipt=receipts.get(url.pathname.split('/').at(-1));res.writeHead(receipt?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify(receipt||{error:{code:'not_found',message:'TEST: Request not recorded; charge unverified'}}));return}
   if(url.pathname==='/api/web/chat'&&mockAI&&req.method==='POST'){
    let body='';for await(const c of req){body+=c;if(body.length>500000)throw Error('Request too large')}
    const data=JSON.parse(body);if(data.message==='AUTH_TEST'){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'unauthenticated',message:'TEST: Sign-in required'}}));return}
    if(data.mode==='agent'){
     receipts.set(data.requestId,{requestId:data.requestId,state:'usage_pending',reservedCents:25,currency:'TEST'});
     res.writeHead(200,{'Content-Type':'text/event-stream','X-Accel-Buffering':'no'});
     const event=(name,value)=>res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
     event('start',{requestId:data.requestId});
     if(data.message.includes('STOP_AFTER_EDIT')&&data.agentStep>=2){await new Promise(r=>setTimeout(r,10000));return}
     receipts.set(data.requestId,{requestId:data.requestId,state:'settled',chargedCents:1,reservedCents:25,currency:'TEST'});
     event('usage',receipts.get(data.requestId));
     if(data.agentStep===0||data.agentStep===1){
      const needle='甲方应在交付后30日内支付全部服务费用。';
      const target=data.agentContext?.targets?.find(t=>t.kind==='paragraph'&&t.text===needle);
      if(!target){event('error',{code:'TEST_TARGET_MISSING',message:'Synthetic document target missing'});event('done',{requestId:data.requestId});res.end();return}
      const name=data.agentStep===0?'doc_find_text':'doc_apply_edits';
      const args=data.agentStep===0?{queries:[{text:'交付后30日内支付全部服务费用',matchCase:true}]}:{edits:[{type:'replace_text',targetId:target.targetId,newText:'甲方应在交付后45日内支付全部服务费用。'}]};
      const id=`test-call-${data.agentStep}`,raw=JSON.stringify(args);
      event('tool_calls',{requestId:data.requestId,fileId:data.document.id,version:data.document.version,calls:[{id,type:'function',function:{name,arguments:args}}],assistant:{role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:raw}}]}});
     }else event('delta',{text:'已将付款期限改为45日，并保存了文档。'});
     event('done',{requestId:data.requestId});res.end();return;
    }
    receipts.set(data.requestId,{requestId:data.requestId,state:'settled',chargedCents:1,reservedCents:100,currency:'TEST'});
    res.writeHead(200,{'Content-Type':'text/event-stream','X-Accel-Buffering':'no'});
    const event=(name,value)=>res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
    event('start',{requestId:data.requestId});event('delta',{text:'[TEST RESPONSE — not a live model] '});
    if(['STREAM_INTERRUPT_TEST','STREAM_STOP_TEST'].includes(data.message)){receipts.set(data.requestId,{requestId:data.requestId,state:'usage_pending',reservedCents:100,currency:'TEST'});if(data.message==='STREAM_STOP_TEST')await new Promise(r=>setTimeout(r,3000));res.end();return}
    await new Promise(r=>setTimeout(r,60));
    event('delta',{text:data.document.name+': '+(data.mode==='rewrite'?'Proposed a clearer clause.':'Review context received.')});
    if(data.mode==='rewrite'){event('proposal',{requestId:data.requestId,fileId:data.document.id,version:data.document.version,original:data.selection.text,replacement:data.selection.text.replace('30','45')+'（经确认）',explanation:'Synthetic API fixture; no real model invocation.'})}
    event('usage',{requestId:data.requestId,state:'settled',chargedCents:1,reservedCents:100,currency:'TEST'});event('done',{requestId:data.requestId});res.end();return;
   }
   let file;
   if(testSupport&&url.pathname.startsWith('/test-support/')){const name=url.pathname.slice('/test-support/'.length);if(!['useZetaOfficeWebview.js','zetaOfficeRelay.js'].includes(name))throw Error('Not found');file=path.join(project,'vendor/core/frontend/src/composables',name)}
   else{const pathname=decodeURIComponent(url.pathname);file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep))throw Error('Invalid path')}
   const stat=await fs.stat(file);if(!stat.isFile())throw Error('Not a file');const bytes=await fs.readFile(file);const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream'};
   if(url.pathname.startsWith('/web/editor/compressed/')){const representations=JSON.parse(await fs.readFile(path.join(root,'web/representation-manifest.json'),'utf8'));const representation=representations.files[url.pathname.slice('/web/'.length)];if(!representation)throw Error('Unknown font representation');headers['Content-Encoding']=representation.contentEncoding;headers['Content-Type']=representation.contentType}
   if(url.pathname.startsWith('/web/editor/lowa/')){const enc=manifest.encodings[path.basename(file)];if(enc)headers['Content-Encoding']=enc}
   res.writeHead(200,headers);res.end(bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found')}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createPreviewServer({mockAI:process.env.AWD_MOCK_AI==='1'});server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${server.address().port}/web/?lang=zh${process.env.AWD_MOCK_AI==='1'?' (synthetic AI fixture)':''}`));
}
