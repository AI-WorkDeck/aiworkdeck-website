// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Marketplace terminology (lane X spec X-S3, POLISH X37): 插件市场 / 外掛市集, never the retired 广场 / 廣場,
// and the nav never leaves "Marketplace" in English on the Chinese sites. Legal texts are out of scope (counsel-reviewed).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = l => JSON.parse(fs.readFileSync(`dictionaries/${l}.json`, 'utf8'));
const zh = read('zh'), hant = read('zh-hant');
assert.equal(zh.common.nav.marketplace, '插件市场');
assert.equal(hant.common.nav.marketplace, '外掛市集');
assert.ok(!JSON.stringify(zh).includes('广场'), 'zh dictionary uses 市场, not 广场');
assert.ok(!JSON.stringify(hant).includes('廣場'), 'zh-hant dictionary uses 市集, not 廣場');
assert.ok(!/"Marketplace"/.test(JSON.stringify(zh)) && !/"Marketplace"/.test(JSON.stringify(hant)), 'no bare English "Marketplace" label in zh/zh-hant');
console.log('PASS marketplace terms (X-S3) in zh and zh-hant');
