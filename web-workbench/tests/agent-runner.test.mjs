import test from 'node:test';
import assert from 'node:assert/strict';
import { runDocumentAgent } from '../src/agent-runner.js';

const initial = () => ({ runId: 'run-1', document: { id: 'file-1', name: 'notes.docx', version: 3, text: 'source' }, targets: [{ targetId: 'target-1', kind: 'paragraph', paragraphIndex: 0, text: 'source' }] });
const capabilities = (per = 10, total = per * 4) => ({ agentEnabled: true, currency: 'CNY', agent: { maxChargeCents: per, maxRunChargeCents: total } });
const callData = ({ id = 'call-1', name = 'doc_find_text', args = { queries: [{ text: 'source' }] }, fileId = 'file-1', version = 3, runId = 'run-1' } = {}) => {
  const rawArgs = JSON.stringify(args);
  return { requestId: 'request-1', fileId, version, calls: [{ id, type: 'function', function: { name, arguments: args } }], assistant: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: rawArgs } }] }, runId };
};
const resultFor = (tool, { runId = 'run-1', fileId = 'file-1', ok = true, partial = false, verification = 'verified', saved = false, error } = {}) => ({ ok, tool, runId, document: { id: fileId, name: 'notes.docx', version: 3 }, revision: 1, saved, partial, verification, result: {}, ...(error ? { error: { code: error, message: error, outcomeUnknown: false, retryable: false } } : {}) });
function streamFor(events, opts = {}) {
  return async (payload, { onEvent }) => {
    for (const [name, value] of events(payload, opts)) onEvent(name, value);
  };
}
const settledEvents = (payload, { kind = 'answer', requestId = payload.requestId, reservedCents = 10, chargedCents = 4, state = 'settled', costCurrency = 'CNY', done = true, call = {} } = {}) => {
  const events = [['start', { requestId }], ['usage', { requestId, state, currency: costCurrency, reservedCents, chargedCents }]];
  if (kind === 'tool') events.push(['tool_calls', callData({ ...call, ...(requestId !== payload.requestId ? { requestId } : {}) })]);
  if (kind === 'answer') events.push(['delta', { text: 'Finished.' }]);
  if (done) events.push(['done', { requestId }]);
  return events;
};
const run = (overrides = {}) => runDocumentAgent({ initial: initial(), instruction: 'Make a safe change', language: 'en', capabilities: capabilities(), execute: async () => resultFor('doc_find_text'), refreshContext: async () => initial(), uuid: () => 'request-1', ...overrides });

test('only a settled receipt followed by done completes a generation', async () => {
  const events = streamFor(payload => settledEvents(payload));
  const record = await run({ stream: events });
  assert.equal(record.status, 'completed');
  assert.equal(record.text, 'Finished.');
  assert.equal(record.chargedCents, 4);
});

test('unknown, released, or over-quote receipts never dispatch tools', async t => {
  for (const receipt of [
    { state: 'usage_pending', chargedCents: undefined },
    { state: 'refunded_pending', chargedCents: 0 },
    { state: 'released', chargedCents: 0 },
    { state: 'settled', reservedCents: 11, chargedCents: 4 },
    { state: 'settled', reservedCents: 10, chargedCents: 11 },
  ]) await t.test(JSON.stringify(receipt), async () => {
    let executions = 0;
    const stream = streamFor(payload => settledEvents(payload, { kind: 'tool', ...receipt }));
    const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(executions, 0);
    assert.equal(record.status, 'failed');
    const known = receipt.state === 'settled' && Number.isSafeInteger(receipt.chargedCents) && receipt.chargedCents >= 0;
    assert.equal(record.chargeStatus, known ? 'settled' : 'unknown');
    assert.equal(Object.hasOwn(record, 'chargedCents'), known, 'an unknown receipt must not be presented as zero');
  });
});

test('error, incomplete stream, and abort do not dispatch even after a settled usage frame', async t => {
  await t.test('error', async () => {
    let executions = 0;
    const stream = async (payload, { onEvent }) => {
      onEvent('start', { requestId: payload.requestId });
      onEvent('usage', { requestId: payload.requestId, state: 'settled', currency: 'CNY', reservedCents: 10, chargedCents: 1 });
      const error = Error('usage_pending'); error.code = 'usage_pending'; throw error;
    };
    const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(executions, 0); assert.equal(record.status, 'failed');
  });
  await t.test('no done', async () => {
    let executions = 0;
    const stream = streamFor(payload => settledEvents(payload, { kind: 'tool', done: false }));
    const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(executions, 0); assert.equal(record.status, 'failed');
  });
  await t.test('abort after stream', async () => {
    let executions = 0; const controller = new AbortController();
    const record = await run({ signal: controller.signal, stream: streamFor(payload => settledEvents(payload, { kind: 'tool' })), onUpdate: async r => { if (r.requests[0]?.receipt?.state === 'settled') controller.abort(); }, execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(executions, 0); assert.equal(record.status, 'stopped');
  });
});

test('wrong file/version and invalid tool calls are rejected before dispatch', async t => {
  for (const call of [
    { fileId: 'other-file' },
    { version: 99 },
    { name: 'run_arbitrary_code' },
    { id: 'bad id' },
  ]) await t.test(JSON.stringify(call), async () => {
    let executions = 0;
    const record = await run({ stream: streamFor(payload => settledEvents(payload, { kind: 'tool', call })), execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(executions, 0); assert.equal(record.status, 'failed');
  });
});

test('wrong run, file, or tool result fails and does not start another generation', async t => {
  for (const returned of [
    resultFor('doc_find_text', { runId: 'other-run' }),
    resultFor('doc_find_text', { fileId: 'other-file' }),
    resultFor('doc_read_tables'),
  ]) await t.test(JSON.stringify({ runId: returned.runId, fileId: returned.document.id, tool: returned.tool }), async () => {
    let streams = 0;
    const record = await run({ stream: async (payload, opts) => { streams++; await streamFor(p => settledEvents(p, { kind: 'tool' }))(payload, opts); }, execute: async () => returned });
    assert.equal(streams, 1); assert.equal(record.status, 'failed'); assert.equal(record.steps[0].status, 'unknown');
  });
});

test('partial edit failure stops the run immediately', async () => {
  let streams = 0;
  const stream = async (payload, opts) => { streams++; await streamFor(p => settledEvents(p, { kind: 'tool', call: { name: 'doc_apply_edits', args: { edits: [{ type: 'replace_text', targetId: 'target-1', originalText: 'source', newText: 'updated' }] } } }))(payload, opts); };
  const record = await run({ stream, execute: async () => resultFor('doc_apply_edits', { ok: false, partial: true, verification: 'failed', saved: true, error: 'PARTIAL_WRITE' }) });
  assert.equal(streams, 1); assert.equal(record.status, 'failed'); assert.equal(record.steps[0].status, 'failed');
});

test('duplicate tool call IDs are rejected before a second execute', async () => {
  let streams = 0, executions = 0;
  const stream = async (payload, opts) => { streams++; await streamFor(p => settledEvents(p, { kind: 'tool', call: { id: 'same-call' } }))(payload, opts); };
  const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_find_text'); } });
  assert.equal(streams, 2); assert.equal(executions, 1); assert.equal(record.status, 'failed'); assert.equal(record.error.code, 'AGENT_REPLAY_REJECTED');
});

test('persists executing state before dispatch and stop invalidates pending dispatch', async () => {
  const controller = new AbortController(); let executed = false, persisted = false;
  const record = await run({ signal: controller.signal, stream: streamFor(payload => settledEvents(payload, { kind: 'tool' })), onUpdate: async value => {
    if (value.steps[0]?.status === 'executing') { persisted = true; controller.abort(); }
  }, execute: async () => { executed = true; return resultFor('doc_find_text'); } });
  assert.equal(persisted, true); assert.equal(executed, false); assert.equal(record.status, 'stopped'); assert.equal(record.steps[0].status, 'not_started');
});

test('enforces 4 generations and 24 edit calls per run', async t => {
  await t.test('four generation maximum', async () => {
    let streams = 0;
    const stream = async (payload, opts) => { streams++; const last = payload.agentStep === 3; await streamFor(p => settledEvents(p, { kind: last ? 'answer' : 'tool', call: { id: `call-${p.agentStep}` } }))(payload, opts); };
    const record = await run({ stream, execute: async () => resultFor('doc_find_text') });
    assert.equal(streams, 4); assert.equal(record.status, 'completed');
  });
  await t.test('24 edit maximum', async () => {
    let streams = 0, executions = 0;
    const stream = async (payload, opts) => { streams++; const edits = Array.from({ length: payload.agentStep < 2 ? 12 : 1 }, (_, i) => ({ type: 'replace_text', targetId: `target-${i}`, originalText: 'source', newText: `v${i}` })); await streamFor(p => settledEvents(p, { kind: 'tool', call: { id: `call-${p.agentStep}`, name: 'doc_apply_edits', args: { edits } } }))(payload, opts); };
    const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_apply_edits', { saved: true }); } });
    assert.equal(streams, 3); assert.equal(executions, 2); assert.equal(record.status, 'failed'); assert.equal(record.error.code, 'AGENT_EDIT_LIMIT');
  });
});

test('checks each generation and aggregate charge against frozen run quote', async t => {
  await t.test('per-generation', async () => {
    let executions = 0;
    const stream = streamFor(payload => settledEvents(payload, { kind: 'tool', chargedCents: 11 }));
    const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(executions, 0); assert.equal(record.status, 'failed');
  });
  await t.test('tracks actual charge across the maximum four generations', async () => {
    let streams = 0, executions = 0;
    const stream = async (payload, opts) => { streams++; const last = payload.agentStep === 3; await streamFor(p => settledEvents(p, { kind: last ? 'answer' : 'tool', chargedCents: 10, call: { id: `call-${p.agentStep}` } }))(payload, opts); };
    const record = await run({ stream, execute: async () => { executions++; return resultFor('doc_find_text'); } });
    assert.equal(streams, 4); assert.equal(executions, 3); assert.equal(record.status, 'completed'); assert.equal(record.chargedCents, 40);
  });
});

test('automatically retries recoverable stream errors and pre-mutation tool errors with rotated runId', async t => {
  await t.test('retries invalid_tool_call and upstream_failed', async () => {
    let attempts = 0, rotations = 0;
    const stream = async (payload, opts) => {
      attempts++;
      if (attempts === 1) {
        opts.onEvent('start', { requestId: payload.requestId });
        opts.onEvent('usage', { requestId: payload.requestId, state: 'settled', currency: 'CNY', reservedCents: 10, chargedCents: 2 });
        const err = Error('invalid_tool_call'); err.code = 'invalid_tool_call'; throw err;
      }
      await streamFor(p => settledEvents(p, { chargedCents: 3 }))(payload, opts);
    };
    const record = await run({
      retryDelayMs: 0,
      uuid: () => `req-${attempts + 1}`,
      refreshContext: async (id, opts) => {
        if (opts?.rotate) rotations++;
        return { ...initial(), runId: opts?.rotate ? `run-rotated-${rotations}` : id };
      },
      stream,
    });
    assert.equal(attempts, 2);
    assert.equal(rotations, 1);
    assert.equal(record.status, 'completed');
    assert.equal(record.chargedCents, 5);
  });

  await t.test('retries pre-mutation OVERLAPPING_TARGETS without leaving failed step', async () => {
    let streams = 0, executions = 0;
    const stream = async (payload, opts) => {
      streams++;
      if (streams <= 2) {
        await streamFor(p => settledEvents(p, {
          kind: 'tool',
          chargedCents: 2,
          call: { id: `call-${streams}`, name: 'doc_apply_edits', args: { edits: [{ type: 'replace_text', targetId: 'target-1', originalText: 'source', newText: 'updated' }] } },
        }))(payload, opts);
      } else {
        await streamFor(p => settledEvents(p, { chargedCents: 2 }))(payload, opts);
      }
    };
    const record = await run({
      retryDelayMs: 0,
      stream,
      execute: async () => {
        executions++;
        if (executions === 1) return resultFor('doc_apply_edits', { ok: false, partial: false, verification: 'failed', saved: false, error: 'OVERLAPPING_TARGETS' });
        return resultFor('doc_apply_edits', { saved: true });
      },
    });
    assert.equal(executions, 2);
    assert.equal(record.status, 'completed');
    assert.equal(record.steps.length, 1);
    assert.equal(record.steps[0].status, 'verified');
  });

  await t.test('a redundant call that fails cleanly after saved edits is retried instead of failing the run', async () => {
    // The real editor reports saved:true for a failure that wrote nothing (the document has no unsaved changes).
    let streams = 0, executions = 0;
    const edit = id => ({ kind: 'tool', chargedCents: 2, call: { id, name: 'doc_apply_edits', args: { edits: [{ type: 'replace_text', targetId: 'target-1', originalText: 'source', newText: 'updated' }] } } });
    const stream = async (payload, opts) => {
      streams++;
      await streamFor(p => settledEvents(p, streams <= 2 ? edit(`call-${streams}`) : { chargedCents: 2 }))(payload, opts);
    };
    const record = await run({
      retryDelayMs: 0,
      stream,
      execute: async () => ++executions === 1 ? resultFor('doc_apply_edits', { saved: true }) : resultFor('doc_apply_edits', { ok: false, partial: false, verification: 'failed', saved: true, error: 'STALE_TARGET' }),
    });
    assert.equal(streams, 3); assert.equal(executions, 2);
    assert.equal(record.status, 'completed');
    assert.deepEqual(record.steps.map(s => s.status), ['verified']);
    assert.equal(record.chargedCents, 6);
  });

  await t.test('continues automatically when step 2 calls doc_find_text after an edit', async () => {
    let streams = 0;
    const stream = async (payload, opts) => {
      streams++;
      const stepTools = [
        { id: 'c1', name: 'doc_find_text', args: { queries: [{ text: 'source' }] } },
        { id: 'c2', name: 'doc_apply_edits', args: { edits: [{ type: 'replace_text', targetId: 'target-1', originalText: 'source', newText: 'v1' }] } },
        { id: 'c3', name: 'doc_find_text', args: { queries: [{ text: 'v1' }] } },
        { id: 'c4', name: 'doc_apply_edits', args: { edits: [{ type: 'replace_text', targetId: 'target-1', originalText: 'source', newText: 'v2' }] } },
      ];
      if (streams <= stepTools.length) {
        await streamFor(p => settledEvents(p, { kind: 'tool', chargedCents: 2, call: stepTools[streams - 1] }))(payload, opts);
      } else {
        await streamFor(p => settledEvents(p, { chargedCents: 2 }))(payload, opts);
      }
    };
    const record = await run({
      retryDelayMs: 0,
      stream,
      execute: async (_runId, _callId, name) => resultFor(name, { saved: name === 'doc_apply_edits' }),
    });
    assert.equal(streams, 5);
    assert.equal(record.status, 'completed');
    assert.equal(record.steps.length, 4);
    assert.equal(record.chargedCents, 10);
  });

  await t.test('completes gracefully if final summary fails after verified edits and retries exhausted', async () => {
    let streams = 0;
    const stream = async (payload, opts) => {
      streams++;
      if (streams === 1) {
        await streamFor(p => settledEvents(p, {
          kind: 'tool',
          chargedCents: 2,
          call: { id: 'c1', name: 'doc_apply_edits', args: { edits: [{ type: 'replace_text', targetId: 'target-1', originalText: 'source', newText: 'v1' }] } },
        }))(payload, opts);
        return;
      }
      opts.onEvent('start', { requestId: payload.requestId });
      opts.onEvent('usage', { requestId: payload.requestId, state: 'settled', currency: 'CNY', reservedCents: 10, chargedCents: 2 });
      const err = Error('upstream_failed'); err.code = 'upstream_failed'; throw err;
    };
    const record = await run({
      maxRetries: 1,
      retryDelayMs: 0,
      stream,
      execute: async () => resultFor('doc_apply_edits', { saved: true }),
    });
    assert.equal(record.status, 'completed');
    assert.match(record.text, /Completed and verified 1 document edit/);
    assert.equal(record.chargedCents, 6);
  });
});

