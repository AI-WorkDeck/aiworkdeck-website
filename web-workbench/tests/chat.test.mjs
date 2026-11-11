// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';import {streamChat} from '../src/chat.js';
function response(parts){return new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(new TextEncoder().encode(p));c.close()}}),{headers:{'content-type':'text/event-stream'}})}
test('fragmented UTF-8 stream preserves events and waits for done',async()=>{const events=[];await streamChat({},{fetcher:async()=>response(['event: delta\ndata: {"text":"中','文"}\n\nevent: done\ndata: {"requestId":"r"}\n\n']),onEvent:(n,d)=>events.push([n,d])});assert.deepEqual(events,[['delta',{text:'中文'}],['done',{requestId:'r'}]])});
test('partial reply without terminal event is not a success',async()=>{await assert.rejects(streamChat({},{fetcher:async()=>response(['event: delta\ndata: {"text":"partial"}\n\n'])}),/AI_STREAM_INTERRUPTED/)});
test('HTTP auth errors preserve code and status',async()=>{await assert.rejects(streamChat({},{fetcher:async()=>new Response(JSON.stringify({error:{code:'unauthenticated',message:'Login'}}),{status:401})}),e=>e.status===401&&e.code==='unauthenticated')});
test('malformed proposal data is never silently accepted',async()=>{await assert.rejects(streamChat({},{fetcher:async()=>response(['event: proposal\ndata: {"broken"\n\n'])}),/INVALID_AI_RESPONSE/)});
