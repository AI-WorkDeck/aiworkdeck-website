// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Dictionary } from '@/get-dictionary';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { siteConfig } from '@/lib/site-config';

/** The original policy effective date is retained; this date records this factual revision only. */
export const COMPANY_INFORMATION_REVISED_ON = '2026-11-16';

export function companyLegalContent(copy: Dictionary['companyEntity'], lang: Locale) {
    const e = siteConfig.legalEntity;
    const zh = toBaseLocale(lang) === 'zh';
    const values: Record<string, string> = {
        company: zh ? `${e.nameZh}（${e.nameEn}）` : `${e.nameEn} (${e.nameZh})`,
        number: e.registrationNo,
        address: zh ? e.registeredAddress.zh : e.registeredAddress.en,
        email: e.contactEmail,
        site: siteConfig.host,
        otherSite: siteConfig.otherSite.host,
        date: COMPANY_INFORMATION_REVISED_ON,
    };
    const fill = (text: string, extra: Record<string, string> = {}) =>
        text.replace(/\{([a-zA-Z]+)\}/g, (token, key: string) => extra[key] ?? values[key] ?? token);
    return {
        operator: fill(copy.identity, { role: copy.operator }),
        controller: fill(copy.identity, { role: copy.controller }),
        separateServices: fill(copy.separateServices),
        crossBorder: copy.crossBorder,
        controllerHosting: copy.controllerHosting,
        revision: fill(copy.revision),
        financialRetention: copy.financialRetention,
        mobileHosting: siteConfig.id === 'intl' ? copy.mobileHostingIntl : copy.mobileHostingCn,
    };
}
