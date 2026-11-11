// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { siteConfig } from '@/lib/site-config';

export type BaseLocale = 'zh' | 'en';

/**
 * 20 supported website URL locale slugs (dev-board#1477 cross-surface contract).
 * `defaultLocale` follows the deployment site (`zh` on CN, `en` on INTL).
 */
export const i18n = {
    defaultLocale: siteConfig.defaultLocale,
    locales: [
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
    ],
} as const;

export type Locale = (typeof i18n)['locales'][number];

export interface LocaleMeta {
    nativeName: string;
    englishName: string;
    bcp47: string;
    ogLocale: string;
    dir: 'ltr' | 'rtl';
    baseLang: BaseLocale;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
    zh: {
        nativeName: '简体中文',
        englishName: 'Simplified Chinese',
        bcp47: 'zh-CN',
        ogLocale: 'zh_CN',
        dir: 'ltr',
        baseLang: 'zh',
    },
    'zh-hant': {
        nativeName: '繁體中文',
        englishName: 'Traditional Chinese',
        bcp47: 'zh-TW',
        ogLocale: 'zh_TW',
        dir: 'ltr',
        baseLang: 'zh',
    },
    en: {
        nativeName: 'English',
        englishName: 'English',
        bcp47: 'en-US',
        ogLocale: 'en_US',
        dir: 'ltr',
        baseLang: 'en',
    },
    ja: {
        nativeName: '日本語',
        englishName: 'Japanese',
        bcp47: 'ja-JP',
        ogLocale: 'ja_JP',
        dir: 'ltr',
        baseLang: 'en',
    },
    ko: {
        nativeName: '한국어',
        englishName: 'Korean',
        bcp47: 'ko-KR',
        ogLocale: 'ko_KR',
        dir: 'ltr',
        baseLang: 'en',
    },
    th: {
        nativeName: 'ไทย',
        englishName: 'Thai',
        bcp47: 'th-TH',
        ogLocale: 'th_TH',
        dir: 'ltr',
        baseLang: 'en',
    },
    ms: {
        nativeName: 'Bahasa Melayu',
        englishName: 'Malay',
        bcp47: 'ms-MY',
        ogLocale: 'ms_MY',
        dir: 'ltr',
        baseLang: 'en',
    },
    id: {
        nativeName: 'Bahasa Indonesia',
        englishName: 'Indonesian',
        bcp47: 'id-ID',
        ogLocale: 'id_ID',
        dir: 'ltr',
        baseLang: 'en',
    },
    vi: {
        nativeName: 'Tiếng Việt',
        englishName: 'Vietnamese',
        bcp47: 'vi-VN',
        ogLocale: 'vi_VN',
        dir: 'ltr',
        baseLang: 'en',
    },
    fr: {
        nativeName: 'Français',
        englishName: 'French',
        bcp47: 'fr-FR',
        ogLocale: 'fr_FR',
        dir: 'ltr',
        baseLang: 'en',
    },
    de: {
        nativeName: 'Deutsch',
        englishName: 'German',
        bcp47: 'de-DE',
        ogLocale: 'de_DE',
        dir: 'ltr',
        baseLang: 'en',
    },
    es: {
        nativeName: 'Español',
        englishName: 'Spanish',
        bcp47: 'es-ES',
        ogLocale: 'es_ES',
        dir: 'ltr',
        baseLang: 'en',
    },
    pt: {
        nativeName: 'Português (Brasil)',
        englishName: 'Portuguese (Brazil)',
        bcp47: 'pt-BR',
        ogLocale: 'pt_BR',
        dir: 'ltr',
        baseLang: 'en',
    },
    it: {
        nativeName: 'Italiano',
        englishName: 'Italian',
        bcp47: 'it-IT',
        ogLocale: 'it_IT',
        dir: 'ltr',
        baseLang: 'en',
    },
    ru: {
        nativeName: 'Русский',
        englishName: 'Russian',
        bcp47: 'ru-RU',
        ogLocale: 'ru_RU',
        dir: 'ltr',
        baseLang: 'en',
    },
    el: {
        nativeName: 'Ελληνικά',
        englishName: 'Greek',
        bcp47: 'el-GR',
        ogLocale: 'el_GR',
        dir: 'ltr',
        baseLang: 'en',
    },
    tr: {
        nativeName: 'Türkçe',
        englishName: 'Turkish',
        bcp47: 'tr-TR',
        ogLocale: 'tr_TR',
        dir: 'ltr',
        baseLang: 'en',
    },
    nl: {
        nativeName: 'Nederlands',
        englishName: 'Dutch',
        bcp47: 'nl-NL',
        ogLocale: 'nl_NL',
        dir: 'ltr',
        baseLang: 'en',
    },
    hi: {
        nativeName: 'हिन्दी',
        englishName: 'Hindi',
        bcp47: 'hi-IN',
        ogLocale: 'hi_IN',
        dir: 'ltr',
        baseLang: 'en',
    },
    ar: {
        nativeName: 'العربية',
        englishName: 'Arabic',
        bcp47: 'ar-SA',
        ogLocale: 'ar_SA',
        dir: 'rtl',
        baseLang: 'en',
    },
};

export const LANG_COOKIE = 'awd_lang';

export interface LocalePickerLabels {
    ariaLabel: string;
    searchPlaceholder: string;
    followSystem: string;
    noResults: string;
}

export const LOCALE_PICKER_LABELS: Record<Locale, LocalePickerLabels> = {
    zh: {
        ariaLabel: '选择语言',
        searchPlaceholder: '搜索语言…',
        followSystem: '跟随系统',
        noResults: '无匹配语言',
    },
    'zh-hant': {
        ariaLabel: '選擇語言',
        searchPlaceholder: '搜尋語言…',
        followSystem: '跟隨系統',
        noResults: '無符合語言',
    },
    en: {
        ariaLabel: 'Select language',
        searchPlaceholder: 'Search languages...',
        followSystem: 'Follow system',
        noResults: 'No matching languages',
    },
    ja: {
        ariaLabel: '言語を選択',
        searchPlaceholder: '言語を検索…',
        followSystem: 'システムに従う',
        noResults: '一致する言語がありません',
    },
    ko: {
        ariaLabel: '언어 선택',
        searchPlaceholder: '언어 검색…',
        followSystem: '시스템 설정 따르기',
        noResults: '일치하는 언어가 없습니다',
    },
    th: {
        ariaLabel: 'เลือกภาษา',
        searchPlaceholder: 'ค้นหาภาษา…',
        followSystem: 'ตามระบบ',
        noResults: 'ไม่พบภาษาที่ตรงกัน',
    },
    ms: {
        ariaLabel: 'Pilih bahasa',
        searchPlaceholder: 'Cari bahasa...',
        followSystem: 'Ikut sistem',
        noResults: 'Tiada bahasa yang sepadan',
    },
    id: {
        ariaLabel: 'Pilih bahasa',
        searchPlaceholder: 'Cari bahasa...',
        followSystem: 'Ikuti sistem',
        noResults: 'Tidak ada bahasa yang cocok',
    },
    vi: {
        ariaLabel: 'Chọn ngôn ngữ',
        searchPlaceholder: 'Tìm ngôn ngữ...',
        followSystem: 'Theo hệ thống',
        noResults: 'Không tìm thấy ngôn ngữ',
    },
    fr: {
        ariaLabel: 'Choisir la langue',
        searchPlaceholder: 'Rechercher une langue…',
        followSystem: 'Suivre le système',
        noResults: 'Aucune langue correspondante',
    },
    de: {
        ariaLabel: 'Sprache auswählen',
        searchPlaceholder: 'Sprachen suchen…',
        followSystem: 'Systemstandard',
        noResults: 'Keine passende Sprache',
    },
    es: {
        ariaLabel: 'Seleccionar idioma',
        searchPlaceholder: 'Buscar idiomas…',
        followSystem: 'Seguir el sistema',
        noResults: 'Sin idiomas coincidentes',
    },
    pt: {
        ariaLabel: 'Selecionar idioma',
        searchPlaceholder: 'Pesquisar idiomas…',
        followSystem: 'Seguir o sistema',
        noResults: 'Nenhum idioma encontrado',
    },
    it: {
        ariaLabel: 'Seleziona lingua',
        searchPlaceholder: 'Cerca lingua…',
        followSystem: 'Segui il sistema',
        noResults: 'Nessuna lingua trovata',
    },
    ru: {
        ariaLabel: 'Выбрать язык',
        searchPlaceholder: 'Поиск языка…',
        followSystem: 'Как в системе',
        noResults: 'Языки не найдены',
    },
    el: {
        ariaLabel: 'Επιλογή γλώσσας',
        searchPlaceholder: 'Αναζήτηση γλώσσας…',
        followSystem: 'Ακολούθησε το σύστημα',
        noResults: 'Δεν βρέθηκαν γλώσσες',
    },
    tr: {
        ariaLabel: 'Dil seçin',
        searchPlaceholder: 'Dil ara…',
        followSystem: 'Sistemi takip et',
        noResults: 'Eşleşen dil yok',
    },
    nl: {
        ariaLabel: 'Taal selecteren',
        searchPlaceholder: 'Talen zoeken…',
        followSystem: 'Systeem volgen',
        noResults: 'Geen overeenkomende talen',
    },
    hi: {
        ariaLabel: 'भाषा चुनें',
        searchPlaceholder: 'भाषा खोजें…',
        followSystem: 'सिस्टम का अनुसरण करें',
        noResults: 'कोई भाषा नहीं मिली',
    },
    ar: {
        ariaLabel: 'اختر اللغة',
        searchPlaceholder: 'ابحث عن لغة…',
        followSystem: 'اتّبع النظام',
        noResults: 'لا توجد لغات مطابقة',
    },
};

const LOCALE_SET: ReadonlySet<string> = new Set(i18n.locales);

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && LOCALE_SET.has(value);
}

/**
 * Maps any of the 20 locales to its two-language base ('zh' for Simplified/Traditional Chinese, 'en' otherwise).
 */
export function toBaseLocale(lang: Locale | string): BaseLocale {
    return lang === 'zh' || lang === 'zh-hant' ? 'zh' : 'en';
}

/**
 * Picks a localized value from a map keyed by locale (with at least `zh` and `en`),
 * following the contract fallback chain:
 * `map[lang] ?? (lang === 'zh-hant' ? map.zh : undefined) ?? map.en ?? map.zh`
 */
export function pickLocale<T>(
    map: { zh: T; en: T } & Partial<Record<Locale, T>>,
    lang: Locale | string
): T {
    const record = map as Partial<Record<string, T>>;
    return (
        record[lang] ??
        (lang === 'zh-hant' ? map.zh : undefined) ??
        map.en ??
        map.zh
    );
}

/**
 * Normalizes a language tag (URL slug, BCP-47 tag, or Accept-Language token) to a supported `Locale`,
 * or `null` if unmatched.
 * Contract rules:
 * - `zh-HK`, `zh-TW`, `zh-MO`, `zh-Hant*` -> `'zh-hant'`
 * - `zh`, `zh-CN`, `zh-SG`, `zh-Hans*`, other `zh-*` -> `'zh'`
 * - `pt`, `pt-*` -> `'pt'`
 * - exact slug or primary subtag match -> corresponding `Locale`
 */
export function matchLanguageTagToLocale(input: unknown): Locale | null {
    if (typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase().replace(/_/g, '-');
    if (!clean || clean === '*' || clean === 'system') return null;

    if (LOCALE_SET.has(clean)) {
        return clean as Locale;
    }

    if (
        clean === 'zh-tw' ||
        clean === 'zh-hk' ||
        clean === 'zh-mo' ||
        clean === 'zh-hant' ||
        clean.startsWith('zh-hant-') ||
        clean.startsWith('zh-tw-') ||
        clean.startsWith('zh-hk-') ||
        clean.startsWith('zh-mo-')
    ) {
        return 'zh-hant';
    }

    if (clean === 'zh' || clean.startsWith('zh-')) {
        return 'zh';
    }

    if (clean === 'pt' || clean.startsWith('pt-')) {
        return 'pt';
    }

    if (clean === 'in' || clean.startsWith('in-')) {
        return 'id';
    }

    const primary = clean.split('-')[0];
    if (primary && LOCALE_SET.has(primary)) {
        return primary as Locale;
    }

    return null;
}

/**
 * ISO 3166-1 alpha-2 country/region code -> default website `Locale` slug.
 * Used for Geo-IP default language routing when a visitor has no explicit `awd_lang` cookie.
 */
export const COUNTRY_TO_LOCALE: Readonly<Record<string, Locale>> = {
    // Simplified Chinese
    CN: 'zh',
    SG: 'zh',
    // Traditional Chinese
    TW: 'zh-hant',
    HK: 'zh-hant',
    MO: 'zh-hant',
    // Japanese / Korean
    JP: 'ja',
    KR: 'ko',
    // Southeast Asia
    TH: 'th',
    MY: 'ms',
    BN: 'ms',
    ID: 'id',
    VN: 'vi',
    // French
    FR: 'fr',
    MC: 'fr',
    SN: 'fr',
    CI: 'fr',
    // German
    DE: 'de',
    AT: 'de',
    LI: 'de',
    // Spanish
    ES: 'es',
    MX: 'es',
    AR: 'es',
    CO: 'es',
    CL: 'es',
    PE: 'es',
    VE: 'es',
    EC: 'es',
    GT: 'es',
    CU: 'es',
    BO: 'es',
    DO: 'es',
    HN: 'es',
    PY: 'es',
    SV: 'es',
    NI: 'es',
    CR: 'es',
    PA: 'es',
    UY: 'es',
    // Portuguese
    BR: 'pt',
    PT: 'pt',
    AO: 'pt',
    MZ: 'pt',
    // Italian
    IT: 'it',
    SM: 'it',
    VA: 'it',
    // Russian
    RU: 'ru',
    BY: 'ru',
    KZ: 'ru',
    KG: 'ru',
    // Greek
    GR: 'el',
    CY: 'el',
    // Turkish
    TR: 'tr',
    // Dutch
    NL: 'nl',
    SR: 'nl',
    // Hindi / India
    IN: 'hi',
    // Arabic (MENA)
    SA: 'ar',
    AE: 'ar',
    EG: 'ar',
    QA: 'ar',
    KW: 'ar',
    BH: 'ar',
    OM: 'ar',
    JO: 'ar',
    LB: 'ar',
    IQ: 'ar',
    MA: 'ar',
    DZ: 'ar',
    TN: 'ar',
    LY: 'ar',
    YE: 'ar',
    SY: 'ar',
    PS: 'ar',
    SD: 'ar',
    // English-primary countries/regions
    US: 'en',
    GB: 'en',
    AU: 'en',
    CA: 'en',
    NZ: 'en',
    IE: 'en',
    ZA: 'en',
    PH: 'en',
    NG: 'en',
    KE: 'en',
};

/**
 * Maps an ISO 3166-1 alpha-2 country code (e.g. `'JP'`, `'TW'`, `'SA'`) to a supported `Locale`,
 * or `null` if unknown/invalid.
 */
export function matchCountryToLocale(countryCode: unknown): Locale | null {
    if (typeof countryCode !== 'string') return null;
    const code = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
    return COUNTRY_TO_LOCALE[code] ?? null;
}

/**
 * Standard CDN / reverse-proxy Geo-IP country headers checked in priority order:
 * - Cloudflare: `cf-ipcountry`
 * - Vercel / Next Edge: `x-vercel-ip-country`
 * - AWS CloudFront: `cloudfront-viewer-country`
 * - Alibaba Cloud CDN / ESA: `ali-cdn-real-country`
 * - Nginx GeoIP2 / Ingress: `x-geo-country`, `x-country-code`
 */
export const GEO_COUNTRY_HEADERS = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'cloudfront-viewer-country',
    'ali-cdn-real-country',
    'x-geo-country',
    'x-country-code',
] as const;

export function extractGeoCountry(
    headers: Pick<Headers, 'get'> | Record<string, string | undefined> | null | undefined
): string | null {
    if (!headers) return null;
    for (const name of GEO_COUNTRY_HEADERS) {
        const raw =
            typeof (headers as Pick<Headers, 'get'>).get === 'function'
                ? (headers as Pick<Headers, 'get'>).get(name)
                : (headers as Record<string, string | undefined>)[name] ??
                  (headers as Record<string, string | undefined>)[name.toUpperCase()];
        if (typeof raw === 'string') {
            const code = raw.trim().toUpperCase();
            if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
                return code;
            }
        }
    }
    return null;
}

