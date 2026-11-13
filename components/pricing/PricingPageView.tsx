import Link from 'next/link';
import { PRO_INTRO_MONTHS, SAAS_PRICING, SUBSCRIPTION_LIMITS } from '@/lib/saas-pricing';
import { siteConfig } from '@/lib/site-config';
import { ArrowUpRight } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { PageHero } from '@/components/layout/PageHero';
import { OpenSourceCard } from '@/components/pricing/OpenSourceCard';
import { ProCard } from '@/components/pricing/ProCard';
import { TeamCard } from '@/components/pricing/TeamCard';
import { CommercialBrief } from '@/components/pricing/CommercialBrief';
import { MarketplaceAuthorCta } from '@/components/pricing/MarketplaceAuthorCta';
import { PricingFaq, type PricingFaqItem } from '@/components/pricing/PricingFaq';
import { PricingClickTracker } from '@/components/pricing/PricingClickTracker';

/**
 * 独立定价页编排（定稿结构）：
 * Hero → 三卡 → 商业授权简述 → 市场作者 CTA → FAQ5 → Credits 互链脚注
 */
export function PricingPageView({
    lang,
    t,
    grantLabels,
}: {
    lang: Locale;
    /** dict.pricingPage */
    t: any;
    grantLabels?: any;
}) {
    const isWxpay = siteConfig.paymentChannel === 'wxpay';
    const heroPrice = isWxpay ? SAAS_PRICING.proIntroMonthly : SAAS_PRICING.proMonthly;
    const formatAllowance = (text: string) => text.replace('{monthlyCredits}', String(SUBSCRIPTION_LIMITS.monthlyCents / 100))
        .replace('{weeklyCredits}', String(SUBSCRIPTION_LIMITS.weeklyCents / 100));
    const formatIntro = (text: string) => text
        .replace('{months}', String(PRO_INTRO_MONTHS))
        .replace('{intro}', SAAS_PRICING.proIntroMonthly)
        .replace('{standard}', SAAS_PRICING.proMonthly);
    const faqItems: PricingFaqItem[] = [
        ...(t.saasFaq.intro ? [{ id: 'intro', q: formatIntro(t.saasFaq.intro.q), a: formatIntro(t.saasFaq.intro.a) }] : []),
        { id: 'allowance', q: t.saasFaq.allowance.q, a: formatAllowance(t.saasFaq.allowance.a) },
        { id: 'storage', q: t.saasFaq.storage.q, a: t.saasFaq.storage.a },
        { id: 'trial', q: t.saasFaq.trial.q, a: t.saasFaq.trial.a, legalPending: true },
        { id: 'seats', q: t.saasFaq.seats.q, a: t.saasFaq.seats.a },
        { id: 'agpl', q: t.saasFaq.agpl.q, a: t.saasFaq.agpl.a, legalPending: true },
        { id: 'refund', q: t.saasFaq.refund.q, a: t.saasFaq.refund.a, legalPending: true },
        { id: 'regions', q: t.saasFaq.regions.q, a: t.saasFaq.regions.a },
    ];

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-20">
            <PricingClickTracker lang={lang} />
            <PageHero
                eyebrow={t.eyebrow}
                title={t.heroTitle.replace('{price}', heroPrice)}
                subtitle={isWxpay && t.heroSubtitleIntro ? formatIntro(t.heroSubtitleIntro) : t.heroSubtitle}
                size="compact"
                width="6xl"
            />

            <div className="container mx-auto max-w-6xl px-4 md:px-8">
                <section className="mt-9 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3" aria-label={t.cardsAria}>
                    <div className="order-2 flex lg:order-1 [&>*]:w-full"><OpenSourceCard lang={lang} p={t.openSource} grantLabels={grantLabels} /></div>
                    <div className="order-1 flex lg:order-2 [&>*]:w-full"><ProCard lang={lang} p={t.pro} /></div>
                    <div className="order-3 flex [&>*]:w-full"><TeamCard lang={lang} p={t.team} /></div>
                </section>

                <div className="mt-10 space-y-6">
                    <CommercialBrief p={t.commercialBrief} />
                    <Link href={`/${lang}/deployment`} className="group flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-king-forest/25 bg-king-mint-lightest/65 px-6 py-4.5 text-sm font-semibold text-king-forest transition-all duration-200 hover:-translate-y-0.5 hover:border-king-forest hover:bg-king-mint-lightest hover:shadow-[0_12px_28px_-14px_rgba(32,63,56,0.2)]">
                        <span>{typeof t.deploymentBanner === 'string' ? t.deploymentBanner : t.deploymentBanner?.title}</span>
                        <ArrowUpRight className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                    </Link>
                    <MarketplaceAuthorCta lang={lang} p={t.marketplaceAuthor} />
                    <div className="pt-4">
                        <PricingFaq title={t.saasFaq.title} items={faqItems} />
                    </div>
                </div>

                {t.heroAside && (
                    <p
                        className="mt-10 max-w-3xl text-sm leading-relaxed text-neutral-gray-medium"
                        data-legal-pending="zewei-counsel"
                    >
                        {t.heroAside}
                    </p>
                )}
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-gray-medium">
                    {t.creditsCrossLink.before}{' '}
                    <Link
                        href={`/${lang}/faq#pricing`}
                        className="inline-flex items-center gap-1 font-medium text-king-forest underline underline-offset-4"
                    >
                        {t.creditsCrossLink.label}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </p>
            </div>
        </div>
    );
}
