import { ArrowUpRight, ChevronDown, Globe } from 'lucide-react';
import { Locale, toBaseLocale } from '@/i18n-config';
import { siteConfig, crossSiteUrl } from '@/lib/site-config';
import type { getDictionary } from '@/get-dictionary';

/**
 * 账户页顶部的站点归属说明。
 *
 * 两站账户体系完全独立（见 lib/site-config.ts 头注），而两个站长得一模一样——
 * 不写破的话，在国内站注册完、跑到国际站登录的人只会看到「用户名或密码不正确」，
 * 从而认定是故障。所以**登录态与未登录态都要挂这一条**：未登录的人正要注册，
 * 更需要先知道自己在哪儿注册。
 *
 * 刻意不做成与下面五张分区卡同规格的白卡：它不是一件可操作的功能，
 * 撞了级别只会把真正要做的事（拿一把账户 Key）往下挤。
 */
export async function SiteNotice({ lang, dict }: { lang: Locale; dict: Awaited<ReturnType<typeof getDictionary>> }) {
    const t = dict.authPage;
    const zh = toBaseLocale(lang) === 'zh';
    const otherName = zh ? siteConfig.otherSite.labelZh : siteConfig.otherSite.labelEn;
    const sn = dict.accountPage.siteNotice;

    return (
        <aside className="mb-6 flex gap-3 rounded-xl border border-king-forest/15 bg-king-forest-lightest/30 p-4" aria-label={sn.ariaLabel}>
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-king-forest" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-neutral-gray-dark">
                <details className="group">
                    <summary className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest [&::-webkit-details-marker]:hidden">
                        <span>{sn.summary}</span>{' '}
                        <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-king-forest">
                            {sn.detailsToggle}
                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                        </span>
                    </summary>
                    <div className="mt-2 space-y-3 border-t border-king-forest/10 pt-3">
                        <p>{sn.detail1}</p>
                        <p>{sn.detail2}</p>
                        <a href={crossSiteUrl(siteConfig.otherSite.id, `/${lang}/account`)} className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-king-forest hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest">
                            {(t.siteNoticeLink ?? '').replaceAll('{other}', otherName)}
                            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        </a>
                    </div>
                </details>
            </div>
        </aside>
    );
}
