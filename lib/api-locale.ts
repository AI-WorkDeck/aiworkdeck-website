// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
    isLocale,
    LANG_COOKIE,
    matchLanguageTagToLocale,
    toBaseLocale,
    type Locale,
} from '@/i18n-config';
import { siteConfig } from '@/lib/site-config';

function parseExplicitLocale(value: unknown): Locale | null {
    return matchLanguageTagToLocale(value);
}

function extractLocaleFromPath(pathname: string): Locale | null {
    const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    return first && isLocale(first) ? first : null;
}

function readCookieValue(cookieHeader: string, name: string): string | null {
    for (const part of cookieHeader.split(';')) {
        const [rawKey, ...rest] = part.trim().split('=');
        if (rawKey === name) {
            try {
                return decodeURIComponent(rest.join('='));
            } catch {
                return rest.join('=');
            }
        }
    }
    return null;
}

/**
 * Resolves the preferred locale (any of the 20 supported `Locale` slugs) for an incoming API request:
 * 1. Explicit `explicitLang` argument, `?lang=` query parameter, or `X-App-Language` header
 * 2. `Referer` URL path prefix (`/<locale>/...`)
 * 3. `awd_lang` cookie (when not `'system'`)
 * 4. `Accept-Language` header tags
 * 5. `siteConfig.defaultLocale`
 */
export function resolveRequestLocale(
    req?: Request | null,
    explicitLang?: unknown,
    fallback: Locale = siteConfig.defaultLocale
): Locale {
    const explicit = parseExplicitLocale(explicitLang);
    if (explicit) return explicit;

    if (req) {
        try {
            const url = new URL(req.url);
            const queryLang = parseExplicitLocale(url.searchParams.get('lang'));
            if (queryLang) return queryLang;
        } catch {
            // Ignore malformed request URL in unit tests
        }

        const appLangHeader = parseExplicitLocale(req.headers.get('x-app-language'));
        if (appLangHeader) return appLangHeader;

        const referer = req.headers.get('referer') || req.headers.get('referrer') || '';
        if (referer) {
            try {
                const refLocale = extractLocaleFromPath(new URL(referer).pathname);
                if (refLocale) return refLocale;
            } catch {
                const match = referer.match(/(?:^|\/)([a-z]{2}(?:-hant)?)(?:\/|$)/i);
                if (match?.[1] && isLocale(match[1].toLowerCase())) {
                    return match[1].toLowerCase() as Locale;
                }
            }
        }

        const cookieHeader = req.headers.get('cookie') || '';
        if (cookieHeader) {
            const cookieLang = readCookieValue(cookieHeader, LANG_COOKIE);
            if (cookieLang && cookieLang !== 'system') {
                const parsedCookie = parseExplicitLocale(cookieLang);
                if (parsedCookie) return parsedCookie;
            }
        }

        const acceptLang = req.headers.get('accept-language') || '';
        if (acceptLang) {
            const tags = acceptLang
                .split(',')
                .map((part) => part.split(';')[0]?.trim())
                .filter(Boolean);
            for (const tag of tags) {
                const matched = matchLanguageTagToLocale(tag);
                if (matched) return matched;
            }
        }
    }

    return fallback;
}

export function pickLangText(
    lang: Locale,
    zh: string,
    en: string,
    overrides?: Partial<Record<Locale, string>>
): string {
    if (overrides && overrides[lang]) return overrides[lang]!;
    return toBaseLocale(lang) === 'zh' ? zh : en;
}
