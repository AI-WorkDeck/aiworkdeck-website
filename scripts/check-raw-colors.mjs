// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Ratchet for POLISH X30: components should use the colour tokens in app/globals.css, not raw hex.
// The count of raw hex colours in app/ and components/ may only go down; lower RAW_COLOR_BASELINE in the
// same PR that removes some. Plan: readiness/x30/X30-plan.md (token mapping by lane X).
import fs from 'node:fs';
import path from 'node:path';
const RAW_COLOR_BASELINE = Number(fs.readFileSync('scripts/raw-color-baseline.txt', 'utf8').trim());
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.(tsx|ts|css)$/.test(e.name) ? [path.join(d, e.name)] : []);
const files = [...walk('app'), ...walk('components')].filter(f => f !== path.join('app', 'globals.css')); // the token definitions themselves
let total = 0; const perFile = [];
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    const n = (src.match(HEX) || []).length; total += n; if (n) perFile.push([n, f]);
}
if (total > RAW_COLOR_BASELINE) {
    console.error(`✗ ${total} raw hex colours in app/ and components/ (baseline ${RAW_COLOR_BASELINE}). Use a token from app/globals.css instead. Top files:`);
    for (const [n, f] of perFile.sort((a, b) => b[0] - a[0]).slice(0, 10)) console.error(`  ${n}\t${f}`);
    process.exit(1);
}
console.log(`✓ raw hex colours: ${total} (baseline ${RAW_COLOR_BASELINE})${total < RAW_COLOR_BASELINE ? ' — lower scripts/raw-color-baseline.txt to ' + total : ''}`);
