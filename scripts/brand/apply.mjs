#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

// Turn a throwaway checkout of this site into a white-label deployment before `next build`.
// Same model as the desktop repo (aiworkdeck: scripts/brand/apply.mjs, docs/superpowers/specs/2026-11-23-brand-profile-design.md).
//
//   node scripts/brand/apply.mjs --brand-dir <licensee repo>/brands/<id>/site [--root <tree>] [--dry-run]
//
// DESTRUCTIVE: rewrites files in place. The brand folder lives in the licensee's private repo:
//   site.json            { id, name, domain, supportEmail, replace?: [{name?, from, to, min?}] }
//   brand-profile.json   copied to lib/brand-profile.json (host, entity, currency, locale; see lib/brand-profile.ts)
//   overlay/**           copied over the tree last (logos, favicon, licensee legal texts)
// Every rule must match at least once, so a rule that went stale after a code change fails loudly.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const SCAN = ['app', 'components', 'lib', 'content', 'dictionaries', 'data/articles.json', 'middleware.ts', 'next.config.ts', 'i18n-config.ts', 'get-dictionary.ts']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '__tests__'])
const SKIP_FILES = new Set(['lib/brand-profile.json', 'lib/brand-profile.ts'])
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.md', '.txt', '.xml', '.webmanifest'])

// Text segments left alone: AGPL attribution and the source-code link must keep naming AI WorkDeck. Segments, not
// whole lines, because some lines embed entire files (plugin SDK templates) whose SPDX header must survive while
// the rest is rewritten.
export const KEEP_SEGMENT = [
  /SPDX-FileCopyrightText:[^\n"'`\\]*/g,
  /https?:\/\/github\.com\/AI-WorkDeck\/[\w./#-]*/g,
  /\bAI-WorkDeck\/[\w.-]+/g, // GitHub org/repo slug in API calls (releases, contributors)
]

// Hosts of shared services every edition talks to (the partner-network client portal), not of a brand.
export const KEEP_HOSTS = new Set(['ai-firm.aiworkdeck.com', 'aifirm.aiworkdeck.com'])

const OLD_DOMAIN = String.raw`(?:aiworkdeck\.(?:com|us)|workdeck\.ai)`

export function genericRules(brand) {
  return [
    { name: 'contact emails', re: new RegExp(String.raw`\b[\w.+-]+@` + OLD_DOMAIN + String.raw`\b`, 'g'), to: brand.supportEmail, min: 1 },
    {
      name: 'hosts', re: new RegExp(String.raw`\b((?:[a-z0-9-]+\.)*)` + OLD_DOMAIN + String.raw`\b`, 'g'),
      to: (m, sub) => (KEEP_HOSTS.has(m) ? m : `${sub}${brand.domain}`), min: 1,
    },
    { name: 'product name', re: /AI[ -]?Work[Dd]eck|WorkDeck AI/g, to: brand.name, min: 1 },
    { name: 'product name (caps)', re: /AI[ -]?WORKDECK|\bWORKDECK\b/g, to: brand.name.toUpperCase(), min: 1 },
    { name: 'product name (short)', re: /\bWork[Dd]eck\b/g, to: brand.name, min: 1 },
    { name: 'data dir', re: /(?<![\w.-])\.aiworkdeck(?![\w.-])/g, to: brand.dataDirName, min: 1 },
    // download names and the IDE mock; not integration ids like `aiworkdeck-prd` (a partner's registered source)
    { name: 'project id', re: /(?<![\w./@-])aiworkdeck(?=-(?:website|web-plugin-template|plugin-template|deployment)\b|(?![\w./-]))/g, to: brand.id, min: 1 },
  ]
}

function* walk(root, rel) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return
  const st = fs.statSync(abs)
  if (st.isFile()) { if (TEXT_EXT.has(path.extname(rel))) yield rel; return }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(root, path.join(rel, e.name)) }
    else if (TEXT_EXT.has(path.extname(e.name))) yield path.join(rel, e.name)
  }
}

/** Rewrite one file's text. Exact rules first (they may touch keep-lines), then generic rules line by line. */
export function rewriteText(text, exactRules, rules, hits) {
  for (const r of exactRules) {
    const n = text.split(r.from).length - 1
    if (n) { text = text.split(r.from).join(r.to); hits[r.name] = (hits[r.name] || 0) + n }
  }
  const kept = []
  text = KEEP_SEGMENT.reduce((t, re) => t.replace(re, (m) => `\u0000${kept.push(m) - 1}\u0000`), text)
  for (const r of rules) {
    text = text.replace(r.re, (...m) => {
      hits[r.name] = (hits[r.name] || 0) + 1
      return typeof r.to === 'function' ? r.to(...m) : r.to
    })
  }
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)])
}

function copyTree(from, to, copied, rel = '') {
  for (const e of fs.readdirSync(path.join(from, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name)
    if (e.isDirectory()) copyTree(from, to, copied, r)
    else { fs.mkdirSync(path.dirname(path.join(to, r)), { recursive: true }); fs.copyFileSync(path.join(from, r), path.join(to, r)); copied.push(r) }
  }
}

export function applyBrand({ brandDir, root, dryRun = false, log = console.log }) {
  const brand = JSON.parse(fs.readFileSync(path.join(brandDir, 'site.json'), 'utf8'))
  const exact = (brand.replace || []).map((r, i) => ({ name: r.name || `replace[${i}]`, from: r.from, to: r.to, min: r.min ?? 1 }))
  const rules = genericRules(brand)
  const hits = {}
  const changed = []
  for (const top of SCAN) {
    for (const rel of walk(root, top)) {
      if (SKIP_FILES.has(rel.split(path.sep).join('/'))) continue
      const abs = path.join(root, rel)
      const before = fs.readFileSync(abs, 'utf8')
      const after = rewriteText(before, exact, rules, hits)
      if (after !== before) { changed.push(rel); if (!dryRun) fs.writeFileSync(abs, after) }
    }
  }
  const profile = path.join(brandDir, 'brand-profile.json')
  if (!fs.existsSync(profile)) throw new Error(`missing ${profile}`)
  if (!dryRun) fs.copyFileSync(profile, path.join(root, 'lib/brand-profile.json'))
  const copied = []
  const overlay = path.join(brandDir, 'overlay')
  if (fs.existsSync(overlay) && !dryRun) copyTree(overlay, root, copied)

  const stale = [...exact, ...rules].filter((r) => (hits[r.name] || 0) < r.min).map((r) => r.name)
  for (const [name, n] of Object.entries(hits)) log(`  ${String(n).padStart(5)}  ${name}`)
  log(`${changed.length} files rewritten, ${copied.length} overlay files copied`)
  if (stale.length) throw new Error(`brand rules matched nothing (stale?): ${stale.join(', ')}`)
  return { changed, copied, hits }
}

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
  const brandDir = arg('--brand-dir')
  if (!brandDir) { console.error('usage: apply.mjs --brand-dir <dir> [--root <tree>] [--dry-run]'); process.exit(2) }
  const root = path.resolve(arg('--root') || path.join(HERE, '../..'))
  try { applyBrand({ brandDir: path.resolve(brandDir), root, dryRun: process.argv.includes('--dry-run') }) }
  catch (e) { console.error(e.message); process.exit(1) }
}
