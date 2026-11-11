// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 配色闸门：node scripts/check-palette.mjs
//
//   (a) 色源 design/tokens/awd-palette.json 的 sha256 必须等于 EXPECTED_SHA256。
//       三个仓各存一份逐字节相同的副本，就靠这个常量锁住。改配色时三仓同步改这个常量。
//   (b) 重新生成一遍令牌区段，与入库文件逐字节比对，不一致就打 diff 并失败。
//   (c) 按 WCAG 2.1 相对亮度公式复算色源 contrast 块里声明的每一个对比度，
//       与声明值相差超过 0.05 即失败；并强制正文/强调项不低于 4.5，控件类不低于 3.0。
//
// 不依赖构建产物，node 直接跑。

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, PALETTE_PATH, loadPalette, generateAll } from './generate-tokens.mjs';

const EXPECTED_SHA256 = '2eaa53a9d1a6437f587261b68ad2a372ad1aef9100c79551445089aaf5c2ba64';

const TOLERANCE = 0.05;
const MIN_TEXT = 4.5;
const MIN_CONTROL = 3.0;
const REQUIRED_KEYS = [
  'light/text-on-bg',
  'light/text-2-on-bg',
  'dark/text-on-bg',
  'dark/text-2-on-bg',
];

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}
function pass(msg) {
  console.log(`ok    ${msg}`);
}

// ---- (a) 色源指纹 -----------------------------------------------------------
const raw = readFileSync(PALETTE_PATH);
const sha = createHash('sha256').update(raw).digest('hex');
if (sha !== EXPECTED_SHA256) {
  fail(`色源 sha256 不符：期望 ${EXPECTED_SHA256}，实际 ${sha}\n`
    + '      改配色要三仓同步换色源与本文件的 EXPECTED_SHA256，不许只改一个仓。');
} else {
  pass(`色源 sha256 ${sha.slice(0, 12)}…`);
}

const P = loadPalette();

// ---- (b) 令牌区段与色源一致 --------------------------------------------------
for (const [file, expected] of Object.entries(generateAll(P))) {
  const current = readFileSync(join(ROOT, file), 'utf8');
  if (current === expected) {
    pass(`令牌区段与色源一致 ${file}`);
    continue;
  }
  const a = current.split('\n');
  const b = expected.split('\n');
  const diff = [];
  for (let i = 0; i < Math.max(a.length, b.length) && diff.length < 40; i += 1) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) diff.push(`  ${i + 1}- ${a[i]}`);
      if (b[i] !== undefined) diff.push(`  ${i + 1}+ ${b[i]}`);
    }
  }
  fail(`令牌区段与色源不一致 ${file}（跑 node scripts/generate-tokens.mjs 重新生成）\n${diff.join('\n')}`);
}

// ---- (c) 对比度复算 ---------------------------------------------------------
function channel(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`只支持六位十六进制色值，拿到 ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

for (const key of REQUIRED_KEYS) {
  if (!(key in P.contrast)) fail(`色源 contrast 块缺少必备项 ${key}`);
}

for (const [key, declared] of Object.entries(P.contrast)) {
  if (key.startsWith('_')) continue;
  const [mode, pair] = key.split('/');
  const roles = P.roles[mode];
  if (!roles) { fail(`contrast 项 ${key} 的模式 ${mode} 不在 roles 里`); continue; }
  const at = pair.lastIndexOf('-on-');
  if (at < 0) { fail(`contrast 项 ${key} 不是 <前景>-on-<背景> 形式`); continue; }
  const fgName = kebab(pair.slice(0, at));
  const bgName = kebab(pair.slice(at + 4));
  const fg = roles[fgName];
  const bg = bgName === 'white' ? '#FFFFFF' : roles[bgName];
  if (!fg || !bg) { fail(`contrast 项 ${key} 找不到角色（${fgName} / ${bgName}）`); continue; }

  const actual = contrast(fg, bg);
  const drift = Math.abs(actual - declared);
  // 正文与强调项按正文闸门，其余（控件、点缀）按控件闸门。
  const strict = /text-on-bg|text-2-on-bg|text-2-on-surface|accent/i.test(pair);
  const gate = strict ? MIN_TEXT : MIN_CONTROL;

  if (drift > TOLERANCE) {
    fail(`${key} 声明 ${declared}，复算 ${actual.toFixed(2)}（${fg} on ${bg}），偏差 ${drift.toFixed(2)} > ${TOLERANCE}`);
  } else if (actual < gate) {
    fail(`${key} 实测 ${actual.toFixed(2)} 低于闸门 ${gate}（${fg} on ${bg}）`);
  } else {
    pass(`${key} ${actual.toFixed(2)} ≥ ${gate}（${fg} on ${bg}）`);
  }
}

if (failures.length > 0) {
  console.error(`\n配色闸门未通过：${failures.length} 项。`);
  process.exit(1);
}
console.log('\n配色闸门通过。');
