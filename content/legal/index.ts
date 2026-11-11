// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';
import type { Locale } from '@/i18n-config';
import { toBaseLocale } from '@/i18n-config';
import { SITE_ID } from '@/lib/site-config';
import type { LegalDocument } from './types';
import { privacyZh } from './privacy-zh';
import { privacyEn } from './privacy-en';
import { privacyIntlZh } from './privacy-intl-zh';
import { privacyIntlEn } from './privacy-intl-en';
import { termsZh } from './terms-zh';
import { termsEn } from './terms-en';
import { termsIntlZh } from './terms-intl-zh';
import { termsIntlEn } from './terms-intl-en';

export type LegalDocKind = 'privacy' | 'terms';

/**
 * Reference-translation disclaimer shown on legal pages whenever rendered in a
 * language other than `zh` / `en` (or when falling back to `zh` / `en`).
 */
export const LEGAL_REFERENCE_NOTICE: Record<Locale, string> = {
    zh: '',
    en: '',
    'zh-hant': '本頁法律文本僅供參考，如有歧義，以簡體中文或英文正式版本為準。',
    ja: '本ページの法的文書は参考訳です。解釈に相違がある場合は、中国語または英語の正文が優先されます。',
    ko: '본 페이지의 법률 문서는 참고용 번역본이며, 해석상 차이가 있을 경우 중국어 또는 영어 원본이 우선합니다.',
    th: 'เอกสารทางกฎหมายในหน้านี้เป็นคำแปลเพื่อการอ้างอิงเท่านั้น หากมีความขัดแย้งในการตีความ ให้ยึดฉบับภาษาจีนหรือภาษาอังกฤษเป็นหลัก',
    ms: 'Dokumen undang-undang di halaman ini adalah untuk rujukan sahaja. Sekiranya terdapat percanggahan, versi bahasa Cina atau bahasa Inggeris akan diguna pakai.',
    id: 'Dokumen hukum di halaman ini hanya untuk referensi. Jika terdapat perbedaan penafsiran, versi bahasa Mandarin atau bahasa Inggris yang berlaku.',
    vi: 'Tài liệu pháp lý trên trang này chỉ mang tính chất tham khảo. Trong trường hợp có sự khác biệt, bản tiếng Trung hoặc tiếng Anh sẽ được ưu tiên áp dụng.',
    fr: "Ce document juridique est fourni à titre de référence uniquement. En cas de divergence d'interprétation, la version chinoise ou anglaise prévaut.",
    de: 'Dieses Rechtsdokument dient nur als Referenz. Bei Abweichungen ist die chinesische oder englische Fassung maßgeblich.',
    es: 'Este documento legal se proporciona únicamente como referencia. En caso de discrepancia, prevalecerá la versión en chino o en inglés.',
    pt: 'Este documento jurídico é fornecido apenas para referência. Em caso de divergência, prevalecerá a versão em chinês ou inglês.',
    it: 'Questo documento legale è fornito solo a scopo di riferimento. In caso di discrepanza, prevale la versione cinese o inglese.',
    ru: 'Данный юридический документ предоставлен исключительно для справки. В случае расхождений преимущественную силу имеет версия на китайском или английском языке.',
    el: 'Το παρόν νομικό έγγραφο παρέχεται μόνο για αναφορά. Σε περίπτωση ασυμφωνίας, υπερισχύει η κινεζική ή η αγγλική έκδοση.',
    tr: 'Bu sayfadaki yasal belge yalnızca referans amaçlıdır. Herhangi bir uyuşmazlık durumunda Çince veya İngilizce nüsha geçerlidir.',
    nl: 'Dit juridische document is uitsluitend bedoeld ter referentie. In geval van tegenstrijdigheden prevaleert de Chinese of Engelse versie.',
    hi: 'इस पृष्ठ पर दिया गया कानूनी दस्तावेज़ केवल संदर्भ के लिए है। किसी भी विसंगति की स्थिति में चीनी या अंग्रेज़ी संस्करण मान्य होगा।',
    ar: 'تُقدَّم هذه الوثيقة القانونية كمرجع فقط. وفي حال وجود أي تعارض، يُعتد بالنسخة الصينية أو الإنجليزية.',
};

function isLegalDocument(val: unknown): val is LegalDocument {
    if (!val || typeof val !== 'object') return false;
    const doc = val as Record<string, unknown>;
    return (
        typeof doc.title === 'string' &&
        typeof doc.intro === 'string' &&
        Array.isArray(doc.highlights) &&
        Array.isArray(doc.sections)
    );
}

function getBaseLegalDoc(kind: LegalDocKind, base: 'zh' | 'en'): LegalDocument {
    if (SITE_ID === 'intl') {
        if (kind === 'privacy') return base === 'zh' ? privacyIntlZh : privacyIntlEn;
        return base === 'zh' ? termsIntlZh : termsIntlEn;
    }
    if (kind === 'privacy') return base === 'zh' ? privacyZh : privacyEn;
    return base === 'zh' ? termsZh : termsEn;
}

/**
 * Lookup chain:
 *   `<doc>-<slug>` (or `<doc>-intl-<slug>` on intl site) -> (`zh-hant` -> `zh`) -> `en`
 */
export async function loadLegalDoc(
    kind: LegalDocKind,
    lang: Locale
): Promise<{ doc: LegalDocument; referenceNotice?: string }> {
    if (lang === 'zh' || lang === 'en') {
        return { doc: getBaseLegalDoc(kind, lang) };
    }

    const candidates =
        SITE_ID === 'intl'
            ? [`${kind}-intl-${lang}`, `${kind}-${lang}`]
            : [`${kind}-${lang}`];

    for (const fileKey of candidates) {
        const absPath = path.join(process.cwd(), 'content', 'legal', `${fileKey}.ts`);
        if (!fs.existsSync(absPath)) continue;
        try {
            const mod = (await import(`./${fileKey}`)) as Record<string, unknown>;
            const found = [mod.default, ...Object.values(mod)].find(isLegalDocument);
            if (found) {
                return {
                    doc: found,
                    referenceNotice: LEGAL_REFERENCE_NOTICE[lang],
                };
            }
        } catch {
            // Fall through to base locale fallback
        }
    }

    const fallbackBase = toBaseLocale(lang);
    return {
        doc: getBaseLegalDoc(kind, fallbackBase),
        referenceNotice: LEGAL_REFERENCE_NOTICE[lang],
    };
}
