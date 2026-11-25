// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// 站内链接守卫（POLISH X31）：源码里写死的 href: '/<lang>/...' 必须对应 app/[lang]/ 下真实存在的页面。
// 起因：FAQ 的「隐私政策」链接写成 /zh/privacy，真实路由是 /zh/legal/privacy，三种语言全部 404。
// 只认字面量 href（对象属性 href: '...' 与 JSX href="..."），模板字符串与动态拼接不在此列。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP = path.join(ROOT, 'app', '[lang]');
const SCAN = ['lib', 'components', 'app', 'content'];
const HREF_RE = /href(?::\s*|=)['"]\/(zh-hant|zh|en)(\/[A-Za-z0-9\-/]*)?(?:[?#][^'"]*)?['"]/g;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(ts|tsx|mdx?|json)$/.test(e.name) ? [p] : [];
  });
}

// app/[lang]/[...rest] 是 404 兜底（页面只调 notFound()），不算真实页面
function isNotFoundOnly(dir) {
  const page = ['page.tsx', 'page.ts'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!page) return true;
  const src = fs.readFileSync(page, 'utf8');
  return src.includes('notFound()') && !/\breturn\b/.test(src);
}

// 逐段匹配 app/[lang]/：静态目录名优先，其次动态段 [x] / [...x] / [[...x]]
function routeExists(segments) {
  let dir = APP;
  for (const seg of segments) {
    if (fs.existsSync(path.join(dir, seg))) { dir = path.join(dir, seg); continue; }
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const catchAll = entries.find((e) => /^\[\[?\.\.\./.test(e.name) && !isNotFoundOnly(path.join(dir, e.name)));
    if (catchAll) return true;
    const dyn = entries.find((e) => /^\[[^.]/.test(e.name));
    if (!dyn) return false;
    dir = path.join(dir, dyn.name);
  }
  return ['page.tsx', 'page.ts', 'page.mdx', 'route.ts'].some((f) => fs.existsSync(path.join(dir, f)))
    || fs.readdirSync(dir).some((n) => /^\[\[\.\.\./.test(n) && !isNotFoundOnly(path.join(dir, n)));
}

const bad = [];
let checked = 0;
for (const file of SCAN.flatMap((d) => walk(path.join(ROOT, d)))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(HREF_RE)) {
    checked++;
    const segments = (m[2] || '').split('/').filter(Boolean);
    if (!routeExists(segments)) {
      const line = text.slice(0, m.index).split('\n').length;
      bad.push(`${path.relative(ROOT, file)}:${line}  /${m[1]}${m[2] || ''}`);
    }
  }
}

if (bad.length) {
  console.error(`✗ ${bad.length} 个站内链接指向不存在的页面（app/[lang]/ 下没有对应路由）：`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`✓ check-internal-links: ${checked} 个字面量站内链接都有对应页面`);
