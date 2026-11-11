// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadProgress} from '../src/load-progress.js';
import {progressView} from '../src/boot-progress-view.js';
const sizes={wasm:4,data:4,sans:4,serif:4,kai:4,fangsong:4};
function fixture(){const events=[];let clock=0;return {events,track:createLoadProgress(sizes,p=>events.push(p),()=>clock+=101)}}
test('counts consumed decoded chunks with backpressure, preserves headers, and waits for EOF',async()=>{
 const {track,events}=fixture();let pulled=0;
 const response=new Response(new ReadableStream({pull(c){pulled++;if(pulled<=2)c.enqueue(new Uint8Array(2));else c.close()}},{highWaterMark:0}),{headers:{'Content-Type':'application/wasm','Content-Encoding':'br','Content-Length':'1'}});
 const wrapped=track(response,'wasm');await Promise.resolve();assert.equal(pulled,0);
 assert.equal(wrapped.headers.get('content-type'),'application/wasm');const reader=wrapped.body.getReader();
 await reader.read();assert.equal(events.at(-1).loaded,2);assert.equal(events.at(-1).total,24);
 await reader.read();assert.equal(events.at(-1).loaded,4);assert.equal(events.at(-1).completed,0);
 await reader.read();assert.equal(events.at(-1).completed,1);assert.equal(response.body.locked,false);
});
test('fallback uses a high water mark and completion requires successful EOF',async()=>{
 const {track,events}=fixture();let pulls=0;
 const bad=new Response(new ReadableStream({pull(c){if(!pulls++){c.enqueue(new Uint8Array(4))}else c.error(Error('broken body'))}},{highWaterMark:0}));
 await assert.rejects(track(bad,'sans').arrayBuffer(),/broken body/);assert.equal(events.at(-1).completed,0);
 await track(new Response(new Uint8Array(4)),'sans').arrayBuffer();
 assert.equal(events.at(-1).loaded,4);assert.equal(events.at(-1).completed,1);
 assert.ok(events.every((v,i)=>!i||v.loaded>=events[i-1].loaded));
});
test('unknown sizes become indeterminate and observer exceptions do not fail resources',async()=>{
 const {track,events}=fixture();await track(new Response(new Uint8Array(2)),'data').arrayBuffer();
 assert.equal(events.at(-1).reliable,false);assert.equal(progressView({status:'loading',progress:events.at(-1)}).percent,null);
 const throwing=createLoadProgress(sizes,()=>{throw Error('observer')});assert.equal((await throwing(new Response(new Uint8Array(4)),'data').arrayBuffer()).byteLength,4);
});
test('cancellation reaches original reader and releases its lock',async()=>{
 const {track}=fixture();let reason;const original=new Response(new ReadableStream({cancel(r){reason=r}},{highWaterMark:0}));
 await track(original,'wasm').body.cancel('disposed');assert.equal(reason,'disposed');assert.equal(original.body.locked,false);
});
test('cancel during a pending read cannot publish completion or create an unhandled rejection',async()=>{
 const {track,events}=fixture();let cancelled=false;
 const original=new Response(new ReadableStream({cancel(){cancelled=true}},{highWaterMark:0}));
 const reader=track(original,'wasm').body.getReader();const pending=reader.read();
 await reader.cancel('disposed');assert.equal((await pending).done,true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);assert.equal(original.body.locked,false);
 assert.equal(events.length,1);assert.equal(events.at(-1).completed,0);assert.equal(events.at(-1).reliable,true);
});
test('real streaming compilation succeeds through the single counting stream',async()=>{
 const bytes=new Uint8Array([0,97,115,109,1,0,0,0]);const events=[];
 const track=createLoadProgress({...sizes,wasm:8},p=>events.push(p));
 assert.ok(await WebAssembly.compileStreaming(track(new Response(bytes,{headers:{'Content-Type':'application/wasm','Content-Encoding':'br'}}),'wasm')) instanceof WebAssembly.Module);
 assert.equal(events.at(-1).completed,1);
});
test('resource completion, engine ready, document opening and failure never claim 100',()=>{
 const state={status:'loading',phase:'resources',progress:{loaded:12,total:24,reliable:true,completed:0}};
 assert.equal(progressView(state).percent,50);assert.match(progressView(state,true).label,/50%/);
 state.progress.loaded=24;assert.equal(progressView(state).percent,null);
 state.progress.completed=6;assert.equal(progressView(state).percent,null);assert.equal(progressView(state,true).label,'Starting the editor');
 assert.equal(progressView({...state,status:'error'}).hidden,true);assert.equal(progressView({...state,status:'error'}).percent,null);
 assert.equal(progressView({...state,status:'ready'}).percent,null);assert.equal(progressView({...state,status:'ready'},true).label,'Opening your document');
 assert.equal(progressView({status:'loading',phase:'resources'}).percent,null);
});
