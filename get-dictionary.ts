// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locale } from '@/i18n-config';
import { i18n, isLocale } from '@/i18n-config';

const baseDictionaries = {
    en: () => import('@/dictionaries/en.json').then((module) => module.default),
    zh: () => import('@/dictionaries/zh.json').then((module) => module.default),
};

export type Dictionary = Awaited<ReturnType<typeof baseDictionaries.en>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges `override` over `base`, preserving `base` keys when missing or empty in `override`.
 */
export function deepMergeDictionary<T>(base: T, override: unknown): T {
    if (override === undefined || override === null) {
        return base;
    }
    if (typeof base === 'string') {
        return (typeof override === 'string' && override.length > 0 ? override : base) as T;
    }
    if (Array.isArray(base)) {
        if (!Array.isArray(override) || override.length === 0) {
            return base;
        }
        if (base.some((item) => isPlainObject(item))) {
            return base.map((item, idx) =>
                idx < override.length ? deepMergeDictionary(item, override[idx]) : item
            ) as T;
        }
        return override as T;
    }
    if (isPlainObject(base) && isPlainObject(override)) {
        const result: Record<string, unknown> = { ...base };
        for (const key of Object.keys(override)) {
            if (key in base) {
                result[key] = deepMergeDictionary(
                    (base as Record<string, unknown>)[key],
                    override[key]
                );
            } else {
                result[key] = override[key];
            }
        }
        return result as T;
    }
    return (typeof override === typeof base ? override : base) as T;
}

async function loadLocaleOverride(locale: Locale): Promise<Record<string, unknown> | null> {
    const filePath = path.join(process.cwd(), 'dictionaries', `${locale}.json`);
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Loads the dictionary for any of the 20 supported locales.
 * - `zh` and `en` load their canonical JSON bundles directly.
 * - `zh-hant` deep-merges `dictionaries/zh-hant.json` (when present) over `zh.json`.
 * - All other locales deep-merge `dictionaries/<slug>.json` (when present) over `en.json`.
 * - Unknown locale strings fall back to `i18n.defaultLocale`.
 */
export const getDictionary = async (locale: Locale): Promise<Dictionary> => {
    const resolved: Locale = isLocale(locale) ? locale : i18n.defaultLocale;
    if (resolved === 'en') {
        return baseDictionaries.en();
    }
    if (resolved === 'zh') {
        return baseDictionaries.zh() as unknown as Promise<Dictionary>;
    }

    const base =
        resolved === 'zh-hant'
            ? ((await baseDictionaries.zh()) as unknown as Dictionary)
            : await baseDictionaries.en();
    const override = await loadLocaleOverride(resolved);
    if (!override) {
        return base;
    }
    return deepMergeDictionary(base, override);
};
