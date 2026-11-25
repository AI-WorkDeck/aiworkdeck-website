// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// X30 §C / POLISH W18: serif (.font-display) only for display text >= 28 px; no unloaded or template fonts.
import fs from 'node:fs';
import path from 'node:path';

const order = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];
const isBig = t => order.includes(t) ? order.indexOf(t) >= 6 : (() => { const v = parseFloat(t.replace(/[^\d.]/g, '')); return v * (t.includes('rem') ? 16 : 1) >= 28; })();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const errors = [];
for (const f of [...walk('app'), ...walk('components')].filter(f => f.endsWith('.tsx'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})|'([^'\n]*\bfont-display\b[^'\n]*)'/g)) {
    const c = m[1] ?? m[2] ?? m[3];
    if (!/(?<![\w-])font-display(?![\w-])/.test(c)) continue;
    const sizes = [...c.matchAll(/(?:^|\s)(?:[a-z0-9]+:)?text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])/g)].map(x => x[1]);
    if (sizes.length && !sizes.some(isBig)) errors.push(`${f}: font-display (serif) on text below 28 px: "${c.trim()}"`);
  }
}
for (const f of ['app/globals.css', 'app/website-design.css', 'app/ide-home.css']) {
  const css = fs.readFileSync(f, 'utf8');
  for (const bad of ['Plus Jakarta Sans', '--font-geist', 'Arial']) if (css.includes(bad)) errors.push(`${f}: ${bad} (not loaded / template leftover)`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('✓ typography: serif only for display >= 28 px; no Plus Jakarta / Geist / Arial');
