// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Counts decoded resource content, never Content-Length (compressed wire bytes).
export function createLoadProgress(sizes, emit, now = () => performance.now()) {
  const entries = new Map(Object.entries(sizes).map(([name, size]) => [name, {size, loaded: 0, complete: false}]));
  const total = [...entries.values()].reduce((sum, item) => sum + item.size, 0);
  if (entries.size !== 6 || ![...entries.values()].every(item => Number.isSafeInteger(item.size) && item.size > 0) || !Number.isSafeInteger(total)) throw Error('Invalid resource sizes');
  let last = -Infinity, reliable = true;
  function publish(force = false) {
    const time = now();
    if (!force && time - last < 100) return;
    last = time;
    const values = [...entries.values()];
    try { emit({version: 1, loaded: values.reduce((sum, item) => sum + item.loaded, 0), total, reliable, completed: values.filter(item => item.complete).length}); } catch { /* Telemetry cannot fail resource loading. */ }
  }
  publish(true);
  return (response, name) => {
    const item = entries.get(name);
    if (!item || !response.body) return response;
    const reader = response.body.getReader();
    let received = 0, cancelled = false;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const {done, value} = await reader.read();
          if (cancelled) return;
          if (done) {
            item.complete = true;
            if (received !== item.size) reliable = false;
            reader.releaseLock(); controller.close(); publish(true); return;
          }
          received += value.byteLength;
          if (received > item.size) reliable = false;
          item.loaded = Math.max(item.loaded, Math.min(received, item.size));
          controller.enqueue(value); publish();
        } catch (error) { if (!cancelled) { reader.releaseLock(); controller.error(error); publish(true); } }
      },
      async cancel(reason) { cancelled = true; try { await reader.cancel(reason); } finally { reader.releaseLock(); } },
    }, {highWaterMark: 0});
    return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
  };
}
let track;
export function configureBootProgress(sizes) {
  track = createLoadProgress(sizes, progress => parent.postMessage({__lo: 'lo-relay', type: 'boot-progress', ...progress}, location.origin));
}
export function trackResourceResponse(response, name) { return track ? track(response, name) : response; }
