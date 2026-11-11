import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalFile} from '../src/import-file.js';
class Reader{static current;constructor(){Reader.current=this}readAsArrayBuffer(){ }abort(){this.aborted=true;this.onabort?.()} }
test('real progress and bytes resolve; cancellation and timeout abort underlying read',async()=>{
 const p=[];const read=readLocalFile({}, {Reader,onProgress:n=>p.push(n)});const reader=Reader.current;
 reader.onprogress({lengthComputable:true,loaded:5,total:10});reader.result=new Uint8Array([1,2]).buffer;reader.onload();
 assert.deepEqual(await read,new Uint8Array([1,2]));assert.deepEqual(p,[50,100]);
 const c=new AbortController(),cancelled=readLocalFile({}, {Reader,signal:c.signal});c.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(Reader.current.aborted,true);
 await assert.rejects(readLocalFile({}, {Reader,timeoutMs:5}),/FILE_READ_TIMEOUT/);assert.equal(Reader.current.aborted,true);
});
test('read error is actionable and same-file retry succeeds',async()=>{
 const first=readLocalFile({}, {Reader});Reader.current.onerror();await assert.rejects(first,/FILE_READ_FAILED/);
 const next=readLocalFile({}, {Reader});Reader.current.result=new ArrayBuffer(4);Reader.current.onload();assert.equal((await next).length,4);
});
