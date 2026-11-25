import { toBaseLocale, type Locale } from '@/i18n-config';

/**
 * Tier names for display. nameZh / nameEn come from the API contract (doc/desktop-contract.md, unchanged);
 * zh-hant visitors get the same names in Traditional characters, keyed by tier (POLISH Q12).
 */
const ZH_HANT_TIER_NAMES: Record<string, string> = {
    paralegal: '律師助理',
    associate: '正式律師',
    lead: '主辦律師',
    senior: '資深律師',
    'salaried-partner': '授薪合夥人',
    'equity-partner': '權益合夥人',
    'managing-partner': '管理委員會合夥人',
};

export function tierDisplayName(tier: { key: string; nameZh: string; nameEn: string }, lang: Locale): string {
    if (lang === 'zh-hant') return ZH_HANT_TIER_NAMES[tier.key] ?? tier.nameZh;
    return toBaseLocale(lang) === 'zh' ? tier.nameZh : tier.nameEn;
}
