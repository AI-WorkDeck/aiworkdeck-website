import test from 'node:test';
import assert from 'node:assert/strict';
import { fitZoom } from '../src/editor.js';

test('W29: desktop keeps 90 %, phones fit an A4 page to the frame width', () => {
  assert.equal(fitZoom(1200), 90);
  assert.equal(fitZoom(760), 90);
  assert.equal(fitZoom(0), 90, 'unknown width keeps the default');
  const phone = fitZoom(348); // 390 px phone minus the left rail
  assert.ok(phone >= 30 && phone < 50, `phone zoom ${phone}`);
  assert.ok(phone * 8.2 + 24 <= 348 + 8.2, 'page fits the frame');
  assert.equal(fitZoom(100), 30, 'never below 30 %');
});
