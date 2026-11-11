import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationStore} from '../src/conversations.js';
const fixture=()=>{const data=new Map([['chat:p',[{role:'user',content:'Legacy question',fileId:'doc1',fileName:'one.docx'}]]]);let fail=false;return {data,setFail:v=>fail=v,store:{getSetting:async k=>structuredClone(data.get(k)),setSetting:async(k,v)=>{if(fail)throw Error('disk full');data.set(k,structuredClone(v))}}}};
test('migrates legacy, preserves >30 messages, switches and reloads with document association',async()=>{
 const f=fixture(),h=new ConversationStore(f.store);const old=await h.load('p'),id=h.data('p').activeId;
 assert.equal(old[0].fileId,'doc1');assert.equal(f.data.get('chat:p'),null);
 const many=Array.from({length:42},(_,i)=>({role:'user',content:String(i),fileId:'doc1'}));await h.save('p',many);
 assert.deepEqual(await h.change('p','new'),[]);await h.save('p',[{role:'user',content:'Second'}]);
 assert.equal((await h.change('p','switch',id)).length,42);
 const reload=new ConversationStore(f.store);assert.equal((await reload.load('p')).length,42);
 await reload.change('p','rename',id,'Renamed');assert.equal(reload.data('p').items[0].title,'Renamed');
 assert.equal((await reload.change('p','delete',id))[0].content,'Second');
});
test('failed writes preserve selected conversation and retryable data; projects remain isolated',async()=>{
 const f=fixture(),h=new ConversationStore(f.store);await h.load('p');await h.load('q');const before=structuredClone(h.data('p'));
 f.setFail(true);await assert.rejects(h.change('p','new'),/disk full/);assert.deepEqual(h.data('p'),before);
 f.setFail(false);await h.change('p','new');assert.equal(h.data('q').items.length,1);assert.equal(h.data('p').items.length,2);
 const id=h.data('p').activeId;await h.change('p','delete',id);assert.equal(h.data('p').items.length,1);
});
test('queued snapshots cannot leak late messages into another conversation',async()=>{
 const f=fixture(),h=new ConversationStore(f.store);await h.load('p');const id=h.data('p').activeId;
 await Promise.all([h.change('p','new'),h.save('p',[{content:'late receipt'}])]);
 assert.equal(h.data('p').items.find(c=>c.id===id).messages[0].content,'late receipt');
 assert.deepEqual(h.data('p').items.find(c=>c.id!==id).messages,[]);
});
test('late billing receipt updates its own conversation without replacing newer messages',async()=>{
 const f=fixture(),h=new ConversationStore(f.store);await h.load('p');const id=h.data('p').activeId;
 await h.save('p',[{role:'assistant',requestId:'r1',content:'answer'},{role:'user',content:'newer question'}]);
 await h.change('p','new');await h.updateReceipt('p',id,'r1',{receipt:{state:'settled'}});
 assert.deepEqual(h.data('p').items.find(c=>c.id!==id).messages,[]);
 const old=h.data('p').items.find(c=>c.id===id);assert.equal(old.messages.length,2);assert.equal(old.messages[0].receipt.state,'settled');
 await h.change('p','delete',id);await h.updateReceipt('p',id,'r1',{receipt:{state:'settled'}});assert.equal(h.data('p').items.length,1);
});
