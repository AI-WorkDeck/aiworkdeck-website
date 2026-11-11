import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import { PricingPageView } from '@/components/pricing/PricingPageView';
import { JsonLd } from '@/components/seo/JsonLd';
import { faqPageJsonLd } from '@/lib/structured-data';

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
    return {
        title: t.heroTitle,
        description: t.metaDescription,
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

    const faqLd = [
        { q: t.saasFaq.trial.q, a: t.saasFaq.trial.a },
        { q: t.saasFaq.seats.q, a: t.saasFaq.seats.a },
        { q: t.saasFaq.agpl.q, a: t.saasFaq.agpl.a },
        { q: t.saasFaq.refund.q, a: t.saasFaq.refund.a },
        { q: t.saasFaq.regions.q, a: t.saasFaq.regions.a },
    ];

    return (
        <>
            <JsonLd data={faqPageJsonLd(faqLd)} />
            <PricingPageView lang={lang} t={t} />
        </>
    );
}
