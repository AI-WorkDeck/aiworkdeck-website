import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { MARKETPLACE_TERMS_URL, SAAS_PRICING } from '@/lib/saas-pricing';

/**
 * 市场作者 CTA：平台 15% / 作者 85%（定稿 §4 · MARKETPLACE-TERMS）。
 */
export function MarketplaceAuthorCta({
    lang,
    p,
}: {
    lang: Locale;
    /** dict.pricingPage.marketplaceAuthor */
    p: any;
}) {
    const body = p.body
        .replace('{platform}', String(SAAS_PRICING.marketplacePlatformShare))
        .replace('{author}', String(SAAS_PRICING.marketplaceAuthorShare));

    return (
        <section className="relative overflow-hidden rounded-2xl bg-king-forest-darker bg-gradient-to-br from-king-forest-darker via-king-forest to-king-forest-darker px-6 py-8 text-white md:px-10 md:py-10">
            <div className="texture-grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
                <div className="flex-1">
                    <h2 className="text-xl font-semibold md:text-2xl">{p.title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">{body}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                    <a
                        href={MARKETPLACE_TERMS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-analytics="pricing_marketplace_terms"
                    >
                        <Button className="w-full gap-2 bg-white text-king-forest-darker hover:bg-white/90">
                            {p.ctaTerms}
                            <ArrowUpRight className="h-4 w-4" />
                        </Button>
                    </a>
                    <Link href={`/${lang}/skills/submit`} data-analytics="pricing_marketplace_submit">
                        <Button
                            variant="outline"
                            className="w-full border-white/40 bg-transparent text-white hover:bg-white/10"
                        >
                            {p.ctaSubmit}
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
