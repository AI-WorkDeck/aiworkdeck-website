import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import { PricingPageView } from '@/components/pricing/PricingPageView';
import { JsonLd } from '@/components/seo/JsonLd';
import { faqPageJsonLd } from '@/lib/structured-data';
import { PRO_INTRO_MONTHS, SAAS_PRICING } from '@/lib/saas-pricing';
import { siteConfig, SITE_ID } from '@/lib/site-config';

/**
 * 独立订阅定价页（定稿 v2）。
 * 取消 → faq#pricing 的 permanentRedirect；Credits 用量说明仍在 /faq#pricing。
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.pricingPage;
    const heroPrice = siteConfig.paymentChannel === 'wxpay' ? SAAS_PRICING.proIntroMonthly : SAAS_PRICING.proMonthly;
    const intl = SITE_ID === 'intl';
    return {
        title: intl ? t.heroTitleIntl : t.heroTitle.replace('{price}', heroPrice),
        description: intl ? t.metaDescriptionIntl : t.metaDescription,
        alternates: pageAlternates(lang, '/pricing', { crossSite: true }),
    };
}

export default async function PricingPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.pricingPage;
    const formatIntro = (text: string) => text
        .replace('{months}', String(PRO_INTRO_MONTHS))
        .replace('{intro}', SAAS_PRICING.proIntroMonthly)
        .replace('{standard}', SAAS_PRICING.proMonthly);

    const intl = SITE_ID === 'intl';
    const faqLd = [
        ...(t.saasFaq.intro && !intl ? [{ q: formatIntro(t.saasFaq.intro.q), a: formatIntro(t.saasFaq.intro.a) }] : []),
        ...(intl ? [] : [{ q: t.saasFaq.trial.q, a: t.saasFaq.trial.a }]),
        ...(intl ? [] : [{ q: t.saasFaq.seats.q, a: t.saasFaq.seats.a }]),
        { q: t.saasFaq.agpl.q, a: t.saasFaq.agpl.a },
        { q: t.saasFaq.refund.q, a: t.saasFaq.refund.a },
        { q: t.saasFaq.regions.q, a: t.saasFaq.regions.a },
    ];

    return (
        <>
            <JsonLd data={faqPageJsonLd(faqLd)} />
            <PricingPageView lang={lang} t={t} grantLabels={dict.common?.grant} />
        </>
    );
}
