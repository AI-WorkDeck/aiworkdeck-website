/**
 * W36: notification mail stays under Resend's 10 requests/second (shared with login codes) and retries a 429.
 *   npx tsx --tsconfig tsconfig.json scripts/verify-mail-notify-throttle.mts
 */
import assert from 'node:assert/strict';
process.env.AWD_MAIL_RESEND_KEY = 're_test_fixture';
process.env.AWD_MAIL_FROM = 'AI WorkDeck <no-reply@example.test>';
const calls: number[] = [];
let reject429 = 0;
globalThis.fetch = (async () => {
  calls.push(Date.now());
  if (reject429 > 0) { reject429--; return new Response('{"name":"rate_limit_exceeded"}', { status: 429, headers: { 'retry-after': '1' } }); }
  return new Response('{"id":"x"}', { status: 200 });
}) as typeof fetch;
const { sendNotifyMail } = await import('../lib/mail-notify');

const results = await Promise.all(Array.from({ length: 12 }, (_, i) => sendNotifyMail({ to: `u${i}@example.test`, subject: 's', text: 't' })));
assert.ok(results.every(Boolean), 'all 12 sent');
assert.equal(calls.length, 12);
for (let i = 1; i < calls.length; i++) assert.ok(calls[i] - calls[i - 1] >= 190, `gap ${i} is ${calls[i] - calls[i - 1]}ms`);
const span = calls[calls.length - 1] - calls[0];
assert.ok(11 / (span / 1000) <= 5.5, `rate ${(11 / (span / 1000)).toFixed(1)}/s stays near 5/s`);

calls.length = 0; reject429 = 1;
assert.equal(await sendNotifyMail({ to: 'r@example.test', subject: 's', text: 't' }), true, '429 is retried');
assert.equal(calls.length, 2);
assert.ok(calls[1] - calls[0] >= 990, 'waits Retry-After');

calls.length = 0; reject429 = 5;
assert.equal(await sendNotifyMail({ to: 'r@example.test', subject: 's', text: 't' }), false, 'gives up after 3 attempts');
assert.equal(calls.length, 3);
console.log('PASS mail-notify: ≤5/s queue, 429 retry with Retry-After, 3 attempts max');
