// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession} from '../src/editor.js';

function fixture(t){
 const old={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const listeners=new Set(),timers=new Map(),frameListeners=new Map(),states=[];let now=0,seq=0,removed=0;
 const frame={contentWindow:{postMessage(){}},addEventListener:(k,v)=>frameListeners.set(k,v),removeEventListener:k=>frameListeners.delete(k),remove:()=>removed++};
 globalThis.window={location:{origin:'https://example.test'},addEventListener:(k,v)=>listeners.add(v),removeEventListener:(k,v)=>listeners.delete(v)};
 globalThis.document={createElement:()=>frame};
 globalThis.setTimeout=(fn,ms)=>{const id=++seq;timers.set(id,{at:now+ms,fn});return id};globalThis.clearTimeout=id=>timers.delete(id);
 t.after(()=>{s.dispose();for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}});
 const s=new EditorSession({container:{append(){}},store:{},onState:()=>{},onBusy:()=>{},onBoot:v=>states.push(v)});
 // Observe rejection immediately, including in the intentionally failing baseline.
 let outcome='pending';s.ready.then(()=>outcome='ready',e=>outcome=e.message);
 const message=(type,extra={})=>{for(const fn of [...listeners])fn({origin:window.location.origin,source:frame.contentWindow,data:{__lo:'lo-relay',type,...extra}})};
 const tick=async ms=>{const until=now+ms;while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>until)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();await Promise.resolve()}now=until;await Promise.resolve()};
 return {s,states,message,tick,timers,listeners,frameListeners,outcome:()=>outcome,removed:()=>removed};
}
test('three minutes warns without rejecting; late ready resolves the same startup',async t=>{
 const f=fixture(t);await f.tick(180001);assert.equal(f.outcome(),'pending');assert.equal(f.states.at(-1).status,'slow');
 f.message('boot-log',{msg:'soffice.js loaded — initializing office thread…'});assert.equal(f.states.at(-1).phase,'starting');assert.equal(f.states.at(-1).status,'slow');
 await f.tick(90000);f.message('ready');await f.s.ready;assert.equal(f.outcome(),'ready');assert.equal(f.timers.size,0);
 await f.tick(600000);assert.equal(f.states.at(-1).status,'ready');assert.equal(f.removed(),0);
});
for(const [event,code] of [['boot-failed','EDITOR_BOOT_FAILED'],['engine-failed','EDITOR_ENGINE_FAILED']])test(event+' immediately rejects startup and releases its frame',async t=>{
 const f=fixture(t);f.message(event,{message:'private engine diagnostic'});await Promise.resolve();assert.equal(f.outcome(),code);await assert.rejects(f.s.ready,new RegExp(code));
 assert.equal(f.states.at(-1).error,code);assert.ok(!JSON.stringify(f.states).includes('private'));assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.removed(),1);
 f.message('ready');await f.tick(600000);assert.equal(f.outcome(),code);assert.equal(f.states.at(-1).status,'error');
});
test('ten minute final limit rejects, stops the frame, and ignores late success',async t=>{
 const f=fixture(t);await f.tick(599999);assert.equal(f.outcome(),'pending');await f.tick(1);await assert.rejects(f.s.ready,/EDITOR_BOOT_TIMEOUT/);
 assert.equal(f.states.at(-1).status,'error');assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.removed(),1);f.message('ready');assert.equal(f.outcome(),'EDITOR_BOOT_TIMEOUT');
});
test('dispose during startup rejects waiters and clears timers and subscriptions exactly once',async t=>{
 const f=fixture(t);f.s.dispose();f.s.dispose();await Promise.resolve();assert.equal(f.outcome(),'EDITOR_DISPOSED');await assert.rejects(f.s.ready,/EDITOR_DISPOSED/);
 assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.frameListeners.size,0);assert.equal(f.removed(),1);
 const count=f.states.length;await f.tick(600000);f.message('ready');assert.equal(f.states.length,count);
});
test('only real known milestones advance monotonically; successful dispose leaves no listeners',async t=>{
 const f=fixture(t);f.message('boot-log',{msg:'unknown log /secret'});assert.equal(f.states.length,1);
 f.message('boot-log',{msg:'CJK font fetched: file (10 KB)'});assert.equal(f.states.at(-1).phase,'fonts');
 f.message('boot-log',{msg:'thread port ready'});assert.equal(f.states.at(-1).phase,'opening');
 f.message('boot-log',{msg:'CJK font fetched: file (10 KB)'});assert.equal(f.states.at(-1).phase,'opening');
 f.message('ready');await f.s.ready;f.s.dispose();assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);assert.equal(f.removed(),1);
});
test('resource telemetry is monotonic, validates payloads, and ignores early legacy stages',async t=>{
 const f=fixture(t),p={version:1,loaded:10,total:100,reliable:true,completed:0};
 f.message('boot-progress',p);assert.equal(f.states.at(-1).progress.loaded,10);
 f.message('boot-log',{msg:'CJK font fetched: font'});assert.equal(f.states.at(-1).phase,'resources');
 const count=f.states.length;
 for(const extra of [{loaded:9},{total:101},{loaded:Infinity},{completed:7},{version:2},{reliable:'true'}])f.message('boot-progress',{...p,...extra});
 assert.equal(f.states.length,count);
 f.message('boot-progress',{...p,loaded:100,completed:6});assert.equal(f.states.at(-1).phase,'starting');assert.notEqual(f.states.at(-1).percent,100);
 f.message('ready');await f.s.ready;assert.equal(f.states.at(-1).status,'ready');assert.notEqual(f.states.at(-1).percent,100);
 f.message('boot-progress',p);assert.equal(f.states.at(-1).status,'ready');
});
test('resource completion followed by boot failure never reports 100',async t=>{
 const f=fixture(t);f.message('boot-progress',{version:1,loaded:100,total:100,reliable:true,completed:6});f.message('engine-failed');
 await assert.rejects(f.s.ready,/EDITOR_ENGINE_FAILED/);assert.ok(f.states.every(s=>s.percent!==100));
});
