// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {trackResourceResponse} from './load-progress.js';

// Start consuming both bodies while the complete fonts load. The pinned runtime
// later consumes these results through its Emscripten hooks; no preload cache.
export function startRuntimeTransport({baseUrl, onFatal = () => {}}) {
  const controller = new AbortController();
  let stopped = false, notified = false, compiled, data;
  let rejectStopped;
  const stoppedPromise = new Promise((_, reject) => { rejectStopped = reject; });
  const unavailable = message => Object.assign(new Error(message), {code: 'RUNTIME_ASSET_UNAVAILABLE'});
  const onPageHide = () => dispose();
  function stop(reason) {
    if (stopped) return;
    stopped = true;
    controller.abort();
    compiled = undefined;
    data = undefined;
    globalThis.removeEventListener?.('pagehide', onPageHide);
    rejectStopped(reason);
  }
  function fail(reason) {
    if (stopped) return;
    const error = unavailable('Required editor runtime could not load');
    error.cause = reason;
    stop(error);
    if (!notified) {
      notified = true;
      try { onFatal(error); } catch { /* A host observer must not create an unhandled rejection. */ }
    }
  }
  function dispose() { stop(new DOMException('Editor runtime disposed', 'AbortError')); }
  globalThis.addEventListener?.('pagehide', onPageHide, {once: true});

  async function response(name, mime) {
    const result = await fetch(baseUrl + name, {credentials: 'same-origin', signal: controller.signal});
    // These existing runtime URLs contain pinned Brotli representations. Fail
    // explicitly on invalid delivery; do not retry a 162 MB raw WASM download.
    if (stopped || !result.ok || result.headers.get('content-encoding')?.trim().toLowerCase() !== 'br'
      || result.headers.get('content-type')?.trim().toLowerCase() !== mime) {
      void result.body?.cancel().catch(() => {});
      throw unavailable('Invalid editor runtime response: ' + name);
    }
    return trackResourceResponse(result, name);
  }
  const wasmTask = (async () => {
    const result = await response('soffice.wasm', 'application/wasm');
    const value = await WebAssembly.compileStreaming(result);
    if (!stopped) compiled = value;
  })();
  const dataTask = (async () => {
    const result = await response('soffice.data', 'application/octet-stream');
    const value = await result.arrayBuffer();
    if (!value.byteLength) throw unavailable('Empty editor runtime package');
    if (!stopped) data = value;
  })();
  const ready = Promise.race([Promise.all([wasmTask, dataTask]), stoppedPromise])
    .then(() => undefined).catch(error => { fail(error); throw error; });
  // Fonts may still be downloading when runtime delivery fails. Observe now,
  // report via onFatal, and leave ready rejected for the boot gate as well.
  void ready.catch(() => {});

  return {
    ready,
    dispose,
    hooks: {
      instantiateWasm(imports, receive) {
        if (stopped || !compiled) { fail(unavailable('Runtime compilation unavailable')); return {}; }
        const module = compiled;
        compiled = undefined;
        // Promise.resolve also catches synchronous invalid-import failures.
        void Promise.resolve().then(() => WebAssembly.instantiate(module, imports))
          .then(instance => { if (!stopped) receive(instance, module); }).catch(fail);
        return {};
      },
      getPreloadedPackage(name, size) {
        if (stopped || typeof name !== 'string' || !/(^|\/)soffice\.data$/.test(name)
          || !Number.isSafeInteger(size) || size <= 0 || !data || data.byteLength !== size) {
          const error = unavailable('Editor runtime package mismatch');
          fail(error);
          throw error;
        }
        const bytes = data;
        data = undefined; // The native package loader now owns the decoded bytes.
        return bytes;
      },
    },
  };
}
