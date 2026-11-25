// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// public/og.png is the link-preview card for both sites: 1200×630 PNG, small enough for WeChat/X/Slack previews.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const png = fs.readFileSync('public/og.png');
assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', 'og.png is a PNG');
assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], 'og.png is 1200×630');
assert.ok(png.length < 600 * 1024, `og.png is under 600 KB (${png.length} bytes)`);
assert.ok(fs.existsSync('design/og/og-card.html'), 'og.png has its source template');
console.log('PASS og.png 1200x630, ' + Math.round(png.length / 1024) + ' KB, source in design/og/');
