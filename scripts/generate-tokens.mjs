// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 从 design/tokens/awd-palette.json 生成官网的令牌区段。
//
//   node scripts/generate-tokens.mjs          写回目标文件
//   node scripts/generate-tokens.mjs --check   只比对，不写（不一致则非零退出）
//
// 只替换目标文件里由 AWD-TOKENS:BEGIN/END 标记包住的区段，文件其余部分一概不碰。
// 令牌名是公开契约（--king-* 被 67 个文件的 Tailwind 类名消费，--awd-* 被第三方
// 插件消费），这里只把「名字 -> 色源里的语义角色」这层映射写死，值全部来自色源。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PALETTE_PATH = join(ROOT, 'design/tokens/awd-palette.json');

export function loadPalette() {
  return JSON.parse(readFileSync(PALETTE_PATH, 'utf8'));
}

// ---- 派生：色源里没有现成角色的两档深浅 -------------------------------------
// 旧体系 king-forest #1A5336 -> king-forest-darker #123A26 是 0.70 的通道比，
// 新体系沿用同一比例，让「深一档」在换色前后是同一个视觉台阶。
function scale(hex, k) {
  const m = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => Math.round(Math.min(255, parseInt(m.slice(i, i + 2), 16) * k)));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0').toUpperCase()).join('');
}
// 旧体系 king-mint -> king-mint-lighter 约是 0.28 的向白混合，同样沿用。
function tint(hex, t) {
  const m = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(m.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * t);
  });
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0').toUpperCase()).join('');
}

export const DERIVED = {
  forestDarkerRatio: 0.7,
  mintLighterTint: 0.28,
};

// ---- 官网 --king-* / --neutral-* 令牌表 --------------------------------------
// [令牌名, 取值函数]；分组注释单独一行，便于人读。
function websiteGroups(P) {
  const L = P.roles.light;
  const D = P.roles.dark;
  return [
    {
      title: 'King Forest Palette · 墨竹青族（原深松绿族；令牌名是公开契约，只换值）',
      vars: [
        ['--king-forest', L.accent],
        ['--king-forest-darker', scale(L.accent, DERIVED.forestDarkerRatio)],
        ['--king-forest-lighter', D.accent],
        ['--king-forest-lightest', L['accent-soft']],
      ],
    },
    {
      title: 'King Mint Palette · 竹月青族（氛围色：浅底/选中/悬停/装饰线。对白底 2.6:1，不承载正文与按钮文字）',
      vars: [
        ['--king-mint', L.mint],
        ['--king-mint-lighter', tint(L.mint, DERIVED.mintLighterTint)],
        ['--king-mint-lightest', L['accent-soft']],
        ['--king-bamboo', L.bamboo],
      ],
    },
    {
      title: 'King Gold · 浅茶金点睛（分隔金线/引用块/徽章/空态描边；不做大面积底色，不承载信息层级）',
      vars: [
        ['--king-gold', L.gold],
        ['--king-gold-line', L['gold-line']],
        ['--king-gold-text', L['gold-text']],
        ['--king-gold-soft', L['gold-soft']],
      ],
    },
    {
      title: 'Neutral Palette · 玉脂白暖阶（浅档暖、深档收敛）',
      vars: [
        ['--neutral-white', L.surface],
        ['--neutral-dark-bg', D.surface],
        ['--neutral-gray-dark', L.text],
        ['--neutral-gray-medium', L['text-2']],
        ['--neutral-gray-faint', L['text-3']],
        ['--neutral-gray-light', L['surface-3']],
        ['--neutral-gray-pale', L.bg],
      ],
    },
  ];
}

const CSS_NOTICE = '/* 此段由 scripts/generate-tokens.mjs 生成，勿手改。改色改 design/tokens/awd-palette.json */';
const JS_NOTICE = '// 此段由 scripts/generate-tokens.mjs 生成，勿手改。改色改 design/tokens/awd-palette.json';

function renderRoot(P) {
  const out = [CSS_NOTICE];
  for (const g of websiteGroups(P)) {
    out.push('');
    out.push(`/* ${g.title} */`);
    for (const [name, value] of g.vars) out.push(`${name}: ${value};`);
  }
  return out;
}

function renderTheme(P) {
  const out = [CSS_NOTICE];
  for (const g of websiteGroups(P)) {
    out.push('');
    for (const [name] of g.vars) out.push(`--color-${name.slice(2)}: var(${name});`);
  }
  return out;
}

// ---- 第三方插件模板内嵌的 --awd-* 表 ----------------------------------------
// 与桌面端同源：同一份色源、同一批语义角色名。令牌名一个都不许改（跨仓公开契约）。
const AWD_TOKEN_ROLES = [
  'bg', 'surface', 'surface-2', 'surface-3',
  'text', 'text-2', 'text-3',
  'border', 'border-subtle', 'border-strong',
  'accent', 'accent-hover', 'accent-text', 'accent-soft',
  'mint', 'bamboo',
  'danger', 'danger-text', 'danger-soft',
  'warning', 'warning-text', 'warning-soft',
  'info', 'info-text', 'info-soft',
];

function renderPluginThemes(P) {
  const mode = (name, trailingComma) => {
    const R = P.roles[name];
    const lines = [`  ${name}: {`];
    AWD_TOKEN_ROLES.forEach((role, i) => {
      const comma = i === AWD_TOKEN_ROLES.length - 1 ? '' : ',';
      lines.push(`    '--awd-${role}': '${R[role]}'${comma}`);
    });
    lines.push(`  }${trailingComma ? ',' : ''}`);
    return lines;
  };
  return [
    JS_NOTICE,
    '// 主题（v2.6）：token 表与桌面端同源，切换按钮拿它们 postMessage 给插件。',
    'var THEMES = {',
    ...mode('light', true),
    ...mode('dark', false),
    '};',
  ];
}

// ---- 区段替换 ---------------------------------------------------------------
export const TARGETS = [
  { file: 'app/globals.css', section: 'website-root', indent: '  ', render: renderRoot },
  { file: 'app/globals.css', section: 'website-theme', indent: '  ', render: renderTheme },
  { file: 'lib/plugin-template.ts', section: 'plugin-theme-tokens', indent: '  ', render: renderPluginThemes },
];

function replaceSection(text, section, bodyLines, indent) {
  const lines = text.split('\n');
  const begin = lines.findIndex((l) => l.includes(`AWD-TOKENS:BEGIN ${section}`));
  const end = lines.findIndex((l) => l.includes(`AWD-TOKENS:END ${section}`));
  if (begin < 0 || end < 0 || end < begin) {
    throw new Error(`找不到区段标记 AWD-TOKENS:BEGIN/END ${section}`);
  }
  const body = bodyLines.map((l) => (l === '' ? '' : indent + l));
  return [...lines.slice(0, begin + 1), ...body, ...lines.slice(end)].join('\n');
}

/** 生成所有目标文件的期望内容：{ [相对路径]: 文本 }。不写盘。 */
export function generateAll(palette = loadPalette()) {
  const out = {};
  for (const t of TARGETS) {
    const current = out[t.file] ?? readFileSync(join(ROOT, t.file), 'utf8');
    out[t.file] = replaceSection(current, t.section, t.render(palette), t.indent);
  }
  return out;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const expected = generateAll();
  let dirty = 0;
  for (const [file, text] of Object.entries(expected)) {
    const path = join(ROOT, file);
    const current = readFileSync(path, 'utf8');
    if (current === text) {
      console.log(`unchanged  ${file}`);
      continue;
    }
    dirty += 1;
    if (checkOnly) {
      console.error(`OUT OF DATE  ${file}`);
    } else {
      writeFileSync(path, text);
      console.log(`written    ${file}`);
    }
  }
  if (checkOnly && dirty > 0) {
    console.error('令牌文件与色源不一致，跑 node scripts/generate-tokens.mjs 重新生成。');
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('generate-tokens.mjs')) main();
