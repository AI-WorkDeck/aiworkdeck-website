// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CJK_RE = /\p{Script=Han}/u;
const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;
const STRICT_ALL_LOCALES = process.env.STRICT_ALL_LOCALES !== '0';

const ALL_LOCALES = [
    'zh',
    'zh-hant',
    'en',
    'ja',
    'ko',
    'th',
    'ms',
    'id',
    'vi',
    'fr',
    'de',
    'es',
    'pt',
    'it',
    'ru',
    'el',
    'tr',
    'nl',
    'hi',
    'ar',
];

/** Locales where Han (\p{Script=Han}) characters are natural/allowed in strings. */
const HAN_ALLOWED_LOCALES = new Set(['zh', 'zh-hant', 'ja']);

const TSX_LINE_ALLOWLIST = [
    {
        file: 'app/[lang]/about/page.tsx',
        patterns: [/alternateName:\s*'韩泽伟'/, /alternateName:\s*'韓澤偉'/],
    },
];

function stripComments(source) {
    // Strip block comments /* ... */ (preserving newlines) and single-line comments // ...
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function walkFiles(dir, predicate) {
    const absDir = path.join(ROOT, dir);
    if (!fs.existsSync(absDir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        const relPath = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(relPath, predicate));
        } else if (predicate(relPath)) {
            results.push(relPath);
        }
    }
    return results;
}

function extractPlaceholders(str) {
    const set = new Set();
    for (const match of str.matchAll(PLACEHOLDER_RE)) {
        set.add(match[1]);
    }
    return [...set].sort();
}

function checkNoHanInNode(node, locale, keyPath, errors) {
    if (typeof node === 'string') {
        if (CJK_RE.test(node)) {
            errors.push(
                `[${locale}-dict-cjk] ${keyPath}: ${locale} dictionary string contains Han characters: ${JSON.stringify(node)}`
            );
        }
        return;
    }
    if (Array.isArray(node)) {
        node.forEach((item, idx) => checkNoHanInNode(item, locale, `${keyPath}[${idx}]`, errors));
        return;
    }
    if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
            checkNoHanInNode(v, locale, keyPath ? `${keyPath}.${k}` : k, errors);
        }
    }
}

function compareStructureAndPlaceholders(zhNode, enNode, keyPath, errors) {
    const zhType = Array.isArray(zhNode) ? 'array' : typeof zhNode;
    const enType = Array.isArray(enNode) ? 'array' : typeof enNode;
    if (zhType !== enType || (zhNode === null) !== (enNode === null)) {
        errors.push(`[type-mismatch] ${keyPath}: zh is ${zhType}, en is ${enType}`);
        return;
    }

    if (typeof zhNode === 'string' && typeof enNode === 'string') {
        const zhPh = extractPlaceholders(zhNode);
        const enPh = extractPlaceholders(enNode);
        if (zhPh.join(',') !== enPh.join(',')) {
            errors.push(
                `[placeholder-mismatch] ${keyPath}: zh has {${zhPh.join(', ')}}, en has {${enPh.join(', ')}}`
            );
        }
        if (CJK_RE.test(enNode)) {
            errors.push(`[en-dict-cjk] ${keyPath}: English dictionary string contains CJK: ${JSON.stringify(enNode)}`);
        }
        return;
    }

    if (Array.isArray(zhNode) && Array.isArray(enNode)) {
        const hasObjectItems =
            zhNode.some((item) => item && typeof item === 'object') ||
            enNode.some((item) => item && typeof item === 'object');
        if (hasObjectItems) {
            if (zhNode.length !== enNode.length) {
                errors.push(`[array-length-mismatch] ${keyPath}: zh has ${zhNode.length}, en has ${enNode.length}`);
            }
            const len = Math.min(zhNode.length, enNode.length);
            for (let i = 0; i < len; i++) {
                compareStructureAndPlaceholders(zhNode[i], enNode[i], `${keyPath}[${i}]`, errors);
            }
        } else {
            if (zhNode.length === enNode.length) {
                for (let i = 0; i < zhNode.length; i++) {
                    compareStructureAndPlaceholders(zhNode[i], enNode[i], `${keyPath}[${i}]`, errors);
                }
            } else {
                enNode.forEach((item, i) => {
                    if (typeof item === 'string' && CJK_RE.test(item)) {
                        errors.push(
                            `[en-dict-cjk] ${keyPath}[${i}]: English dictionary string contains CJK: ${JSON.stringify(item)}`
                        );
                    }
                });
            }
        }
        return;
    }

    if (zhNode && typeof zhNode === 'object' && enNode && typeof enNode === 'object') {
        const zhKeys = Object.keys(zhNode);
        const enKeys = Object.keys(enNode);
        const zhSet = new Set(zhKeys);
        const enSet = new Set(enKeys);

        for (const k of zhKeys) {
            if (!enSet.has(k)) {
                errors.push(`[missing-in-en] ${keyPath ? `${keyPath}.${k}` : k}`);
            }
        }
        for (const k of enKeys) {
            if (!zhSet.has(k)) {
                errors.push(`[missing-in-zh] ${keyPath ? `${keyPath}.${k}` : k}`);
            }
        }
        for (const k of zhKeys) {
            if (enSet.has(k)) {
                compareStructureAndPlaceholders(
                    zhNode[k],
                    enNode[k],
                    keyPath ? `${keyPath}.${k}` : k,
                    errors
                );
            }
        }
    }
}

/**
 * Validates an additional locale dictionary `<locale>.json` against `en.json`:
 * - Checks `{placeholder}` parity on all present strings
 * - Checks script purity (zero Han characters in non-CJK locales)
 * - Reports unknown keys not in `en.json`
 * - When `requireFullParity` (`STRICT_ALL_LOCALES=1`) is true, also requires 100% key parity with `en.json`.
 */
function validateAdditionalDictionary(baseNode, targetNode, locale, keyPath, requireFullParity, errors) {
    const allowHan = HAN_ALLOWED_LOCALES.has(locale);

    // Tolerate legacy object shape on pricingPage.deploymentBanner if a translation branch used pre-fix shape
    if (
        keyPath === 'pricingPage.deploymentBanner' &&
        typeof baseNode === 'string' &&
        targetNode &&
        typeof targetNode === 'object' &&
        !Array.isArray(targetNode)
    ) {
        if (!allowHan) {
            checkNoHanInNode(targetNode, locale, keyPath, errors);
        }
        return;
    }

    const baseType = Array.isArray(baseNode) ? 'array' : typeof baseNode;
    const targetType = Array.isArray(targetNode) ? 'array' : typeof targetNode;
    if (baseType !== targetType || (baseNode === null) !== (targetNode === null)) {
        errors.push(`[type-mismatch:${locale}] ${keyPath}: en is ${baseType}, ${locale} is ${targetType}`);
        return;
    }

    if (typeof baseNode === 'string' && typeof targetNode === 'string') {
        const basePh = extractPlaceholders(baseNode);
        const targetPh = extractPlaceholders(targetNode);
        if (basePh.join(',') !== targetPh.join(',')) {
            errors.push(
                `[placeholder-mismatch:${locale}] ${keyPath}: en has {${basePh.join(', ')}}, ${locale} has {${targetPh.join(', ')}}`
            );
        }
        if (!allowHan && CJK_RE.test(targetNode)) {
            errors.push(
                `[${locale}-dict-cjk] ${keyPath}: ${locale} dictionary string contains Han characters: ${JSON.stringify(targetNode)}`
            );
        }
        return;
    }

    if (Array.isArray(baseNode) && Array.isArray(targetNode)) {
        const hasObjectItems =
            baseNode.some((item) => item && typeof item === 'object') ||
            targetNode.some((item) => item && typeof item === 'object');
        if (hasObjectItems) {
            if (baseNode.length !== targetNode.length) {
                errors.push(
                    `[array-length-mismatch:${locale}] ${keyPath}: en has ${baseNode.length}, ${locale} has ${targetNode.length}`
                );
            }
            const len = Math.min(baseNode.length, targetNode.length);
            for (let i = 0; i < len; i++) {
                validateAdditionalDictionary(
                    baseNode[i],
                    targetNode[i],
                    locale,
                    `${keyPath}[${i}]`,
                    requireFullParity,
                    errors
                );
            }
        } else if (baseNode.length === targetNode.length) {
            for (let i = 0; i < baseNode.length; i++) {
                validateAdditionalDictionary(
                    baseNode[i],
                    targetNode[i],
                    locale,
                    `${keyPath}[${i}]`,
                    requireFullParity,
                    errors
                );
            }
        } else if (!allowHan) {
            targetNode.forEach((item, i) => checkNoHanInNode(item, locale, `${keyPath}[${i}]`, errors));
        }
        return;
    }

    if (baseNode && typeof baseNode === 'object' && targetNode && typeof targetNode === 'object') {
        const baseKeys = Object.keys(baseNode);
        const targetKeys = Object.keys(targetNode);
        const baseSet = new Set(baseKeys);
        const targetSet = new Set(targetKeys);

        if (requireFullParity) {
            for (const k of baseKeys) {
                if (!targetSet.has(k)) {
                    errors.push(`[missing-in-${locale}] ${keyPath ? `${keyPath}.${k}` : k}`);
                }
            }
        }
        for (const k of targetKeys) {
            if (!baseSet.has(k)) {
                errors.push(`[unknown-key-in-${locale}] ${keyPath ? `${keyPath}.${k}` : k}`);
            }
        }
        for (const k of targetKeys) {
            if (baseSet.has(k)) {
                validateAdditionalDictionary(
                    baseNode[k],
                    targetNode[k],
                    locale,
                    keyPath ? `${keyPath}.${k}` : k,
                    requireFullParity,
                    errors
                );
            }
        }
    }
}

const errors = [];

// 1 & 2 & 3a: Strict zh/en dictionary key parity, placeholder parity, and zero CJK in dictionaries/en.json
const zhDict = JSON.parse(fs.readFileSync(path.join(ROOT, 'dictionaries/zh.json'), 'utf8'));
const enDict = JSON.parse(fs.readFileSync(path.join(ROOT, 'dictionaries/en.json'), 'utf8'));
compareStructureAndPlaceholders(zhDict, enDict, '', errors);

// 2b: Validate any additional dictionaries/<slug>.json files (and require all 20 when STRICT_ALL_LOCALES=1)
const dictDir = path.join(ROOT, 'dictionaries');
const presentDictFiles = fs
    .readdirSync(dictDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));

if (STRICT_ALL_LOCALES) {
    for (const expectedLocale of ALL_LOCALES) {
        if (!presentDictFiles.includes(expectedLocale)) {
            errors.push(`[missing-locale-file] dictionaries/${expectedLocale}.json does not exist`);
        }
    }
}

let additionalChecked = 0;
for (const slug of presentDictFiles) {
    if (slug === 'zh' || slug === 'en') continue;
    if (!ALL_LOCALES.includes(slug)) {
        errors.push(`[unknown-locale-file] dictionaries/${slug}.json is not in the 20-locale contract`);
        continue;
    }
    const dictPath = path.join(dictDir, `${slug}.json`);
    try {
        const targetDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        validateAdditionalDictionary(enDict, targetDict, slug, '', STRICT_ALL_LOCALES, errors);
        additionalChecked++;
    } catch (err) {
        errors.push(`[invalid-json:${slug}] dictionaries/${slug}.json: ${err.message}`);
    }
}

// 3b: Zero Han characters in non-CJK content/legal/*-<slug>.ts files (outside comments)
const nonCjkLegalFiles = walkFiles('content/legal', (p) => {
    if (!p.endsWith('.ts')) return false;
    const base = path.posix.basename(p, '.ts');
    if (base === 'types' || base === 'index') return false;
    const matchedLocale = ALL_LOCALES.find((loc) => base.endsWith(`-${loc}`));
    if (!matchedLocale) return false;
    return !HAN_ALLOWED_LOCALES.has(matchedLocale);
});

for (const relFile of nonCjkLegalFiles) {
    const raw = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
    const clean = stripComments(raw);
    const lines = clean.split('\n');
    lines.forEach((line, idx) => {
        if (CJK_RE.test(line)) {
            errors.push(`[legal-cjk] ${relFile}:${idx + 1}: ${line.trim()}`);
        }
    });
}

// 4: Zero unapproved CJK in app/[lang]/**/*.tsx and components/**/*.tsx
const tsxFiles = [
    ...walkFiles('app/[lang]', (p) => p.endsWith('.tsx') && !p.startsWith('app/[lang]/admin/')),
    ...walkFiles('components', (p) => p.endsWith('.tsx')),
];

for (const relFile of tsxFiles) {
    const raw = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
    const clean = stripComments(raw);
    const lines = clean.split('\n');
    const allowRule = TSX_LINE_ALLOWLIST.find((rule) => rule.file === relFile);

    lines.forEach((line, idx) => {
        if (!CJK_RE.test(line)) return;
        if (allowRule && allowRule.patterns.some((re) => re.test(line))) return;
        errors.push(`[unapproved-tsx-cjk] ${relFile}:${idx + 1}: ${line.trim()}`);
    });
}

if (errors.length > 0) {
    console.error(`\n[check:locales] Failed with ${errors.length} error(s):`);
    for (const err of errors) {
        console.error(`  - ${err}`);
    }
    process.exit(1);
}

console.log(
    `[check:locales] OK — zh/en dictionary parity verified, ${additionalChecked} additional locale(s) verified, ${nonCjkLegalFiles.length} non-CJK legal files clean, ${tsxFiles.length} TSX files verified.`
);
