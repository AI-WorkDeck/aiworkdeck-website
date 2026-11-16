import { LOCALE_META, toBaseLocale, type Locale } from '@/i18n-config';
import type { Dictionary } from '@/get-dictionary';
import type { SitePublicEntity } from '@/lib/site-config';

export const CN_REGISTRY_URL = 'https://www.gsxt.gov.cn/';

/** All domains use the same company record; language comes from the site dictionary. */
export function companyAboutCopy(dictionary: Dictionary, lang: Locale, entity: SitePublicEntity) {
    const copy = dictionary.companyEntity.about;
    const company = toBaseLocale(lang) === 'zh' ? entity.nameZh : entity.nameEn;
    return { ...copy, intro: copy.intro.replace('{company}', company) };
}

export function formatIncorporationDate(iso: string, lang: Locale): string {
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(LOCALE_META[lang].bcp47, {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(date);
}
