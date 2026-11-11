// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startRuntimeTransport} from '../src/runtime-transport.js';
import {mapRuntimeTransport} from '../scripts/runtime-transform.mjs';
import {mapFontFetching} from '../scripts/asset-representations.mjs';

const wasm = new Uint8Array([0,97,115,109,1,0,0,0]);
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function reply(url, bytes) {
  const isWasm = url.endsWith('.wasm');
  return new Response(bytes ?? (isWasm ? wasm : new Uint8Array([1,2,3])), {
    headers: {'content-type': isWasm ? 'application/wasm' : 'application/octet-stream', 'content-encoding':'br'},
  });
}
function setup(t, fetcher = url => reply(url)) {
  const calls = [], errors = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({url, options}); return fetcher(url, options); });
  const transport = startRuntimeTransport({baseUrl:'/lowa/', onFatal: e => errors.push(e)});
  t.after(() => transport.dispose());
  return {transport, calls, errors};
}

test('both responses are consumed immediately, then supplied once to real Emscripten hooks', async t => {
  const gate = deferred();
  const {transport, calls, errors} = setup(t, async url => { await gate.promise; return reply(url); });
  assert.deepEqual(calls.map(c => c.url), ['/lowa/soffice.wasm','/lowa/soffice.data']);
  assert.ok(calls.every(c => c.options.credentials === 'same-origin'));
  gate.resolve(); await transport.ready;
  const received = deferred();
  assert.deepEqual(transport.hooks.instantiateWasm({}, (instance, module) => received.resolve({instance,module})), {});
  const result = await received.promise;
  assert.ok(result.instance instanceof WebAssembly.Instance);
  assert.ok(result.module instanceof WebAssembly.Module);
  assert.deepEqual(new Uint8Array(transport.hooks.getPreloadedPackage('/lowa/soffice.data',3)), new Uint8Array([1,2,3]));
  assert.equal(errors.length,0);
  assert.throws(() => transport.hooks.getPreloadedPackage('soffice.data',3), /package mismatch/);
  assert.equal(errors.length,1);
});

for (const mode of ['404','mime','encoding','corrupt-wasm','empty-data','body-error','network-error']) {
  test(mode + ' fails explicitly and aborts both requests without an extra download', async t => {
    const {transport,calls,errors} = setup(t, url => {
      if (mode === 'network-error') throw Error('offline');
      if (url.endsWith('.wasm')) {
        if (mode === '404') return new Response('missing',{status:404});
        if (mode === 'corrupt-wasm') return reply(url,'not wasm');
        const response = reply(url);
        if (mode === 'mime') response.headers.set('content-type','text/html');
        if (mode === 'encoding') response.headers.delete('content-encoding');
        return response;
      }
      if (mode === 'empty-data') return reply(url,new Uint8Array());
      if (mode === 'body-error') return reply(url,new ReadableStream({start(c) { c.error(Error('connection reset')); }}));
      return reply(url);
    });
    await assert.rejects(transport.ready);
    assert.equal(errors.length,1);
    assert.equal(errors[0].code,'RUNTIME_ASSET_UNAVAILABLE');
    assert.equal(calls.length,2);
    assert.ok(calls.every(c => c.options.signal.aborted));
  });
}

test('dispose settles a pending compile promptly and late completion cannot instantiate', async t => {
  const gate = deferred();
  t.mock.method(WebAssembly,'compileStreaming',async response => { await response.arrayBuffer(); return gate.promise; });
  const {transport,calls,errors} = setup(t);
  await tick(); transport.dispose();
  await assert.rejects(transport.ready,{name:'AbortError'});
  gate.resolve(await WebAssembly.compile(wasm));
  await tick(); let received = false;
  transport.hooks.instantiateWasm({},() => { received = true; });
  assert.equal(received,false); assert.equal(errors.length,0);
  assert.ok(calls.every(c => c.options.signal.aborted));
  assert.throws(() => transport.hooks.getPreloadedPackage('soffice.data',3));
});

test('pagehide cancels the pending transport and unregisters its listener', async t => {
  const events = new EventTarget();
  const before = {addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener};
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  t.after(() => { for (const [name,value] of Object.entries(before)) { if (value) globalThis[name]=value; else delete globalThis[name]; } });
  const gate = deferred();
  const {transport,errors} = setup(t,async url => { await gate.promise; return reply(url); });
  events.dispatchEvent(new Event('pagehide'));
  await assert.rejects(transport.ready,{name:'AbortError'});
  gate.resolve(); await tick(); assert.equal(errors.length,0);
});

for (const [name,size] of [['else.data',3],['soffice.data',2],['soffice.data',NaN]]) {
  test('reject invalid package identity/size ' + name + ':' + size, async t => {
    const {transport,errors} = setup(t); await transport.ready;
    assert.throws(() => transport.hooks.getPreloadedPackage(name,size),/package mismatch/);
    assert.equal(errors.length,1);
  });
}

test('instantiation errors and receive callback errors reach the fatal observer', async t => {
  for (const mode of ['instantiate','receive']) {
    const {transport,errors} = setup(t); await transport.ready;
    transport.hooks.instantiateWasm(mode === 'instantiate' ? null : {},() => { throw Error('receiver failed'); });
    for (let n=0;n<20&&!errors.length;n++) await tick();
    assert.equal(errors.length,1,mode); transport.dispose();
  }
});

test('dispose during instantiation prevents a late native callback', async t => {
  const {transport,errors} = setup(t); await transport.ready;
  const gate = deferred(); t.mock.method(WebAssembly,'instantiate',() => gate.promise);
  let received = false; transport.hooks.instantiateWasm({},() => { received = true; });
  await tick(); transport.dispose(); gate.resolve({}); await tick();
  assert.equal(received,false); assert.equal(errors.length,0);
});

test('build adaptation composes with fonts and rejects every changed pinned insertion point', async () => {
  const source = await fs.readFile(new URL('../vendor/core/frontend/src/composables/zetaOfficeBoot.js',import.meta.url),'utf8');
  const mapped = mapRuntimeTransport(mapFontFetching(source,'/font.js'),'/runtime.js');
  assert.ok(mapped.indexOf('startRuntimeTransport({') < mapped.indexOf('await Promise.all(fontList'));
  assert.ok(mapped.indexOf('await runtimeTransport.ready') > mapped.indexOf('await Promise.all(fontList'));
  assert.match(mapped,/onRuntimeInitialized: function/);
  assert.match(mapped,/runtimeTransport\.dispose\(\); resizeObserver\.disconnect/);
  for (const marker of ['    let dispose = () => {}','    const injections = []','    const Module = {','dispose = () => { if (disposed) return; disposed = true; resizeObserver.disconnect() }']) {
    assert.throws(() => mapRuntimeTransport(source.replace(marker,marker + '\n' + marker),'/runtime.js'),/pinned runtime boot block/);
    assert.throws(() => mapRuntimeTransport(source.replace(marker,''),'/runtime.js'),/pinned runtime boot block/);
  }
});
