import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Reveal } from '@/components/motion/Reveal';
import { signupGrantDisplay, signupGrantLine } from '@/lib/signup-grant-display';
import { PRO_INTRO_MONTHS, SAAS_PRICING } from '@/lib/saas-pricing';
import { siteConfig } from '@/lib/site-config';

/**
 * 首页定价摘要（dev-board#509）。
 *
 * 2026-10-09：主 CTA 改指独立 `/{lang}/pricing`（不再 faq#pricing）。
 * `id="pricing"` 必须留着：站外与历史链接里的 `/#pricing` 都锚在这里。
 */
export function PricingTeaser({ lang, dict }: { lang: Locale; dict: any }) {
    const p = dict.common.pricing;
    const grant = signupGrantDisplay(lang);
    const grantLine = grant ? signupGrantLine(grant, dict.common.grant) : null;
    const isWxpay = siteConfig.paymentChannel === 'wxpay';
    const introOfferLine = isWxpay && p.teaser.introOffer
        ? p.teaser.introOffer
            .replace('{intro}', SAAS_PRICING.proIntroMonthly)
            .replace('{standard}', SAAS_PRICING.proMonthly)
            .replace('{months}', String(PRO_INTRO_MONTHS))
        : null;

    return (
        <section id="pricing" className="scroll-mt-20 bg-white py-16">
            <div className="container mx-auto px-4 md:px-8">
                <Reveal>
                    <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                        <p className="mb-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-king-forest/70">
                            <span className="h-px w-8 bg-king-forest/40" />
                            {p.eyebrow}
                            <span className="h-px w-8 bg-king-forest/40" />
                        </p>
                        <h2 className="font-display text-[clamp(32px,3.4vw,46px)] font-semibold leading-[1.15] tracking-tight text-neutral-dark-bg">
                            {p.title}
                        </h2>
                        <p className="mt-4 text-base text-neutral-gray-medium md:text-lg">{p.teaser.line}</p>
                        {introOfferLine && <p className="mt-2 text-sm font-semibold text-king-forest">{introOfferLine}</p>}
                        {grantLine && <p className="mt-1.5 text-sm font-medium text-king-forest">{grantLine}</p>}

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link href={`/${lang}/pricing`}>
                                <span className="group inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-king-forest px-6 text-[15px] font-bold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-king-forest/90 sm:w-auto">
                                    {p.teaser.primary}
                                    <ArrowRight
                                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                                        strokeWidth={1.75}
                                    />
                                </span>
                            </Link>
                            <Link href={`/${lang}/start`}>
                                <span className="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-lg border border-neutral-gray-light bg-white px-6 text-[15px] font-bold text-neutral-dark-bg transition-all duration-200 hover:border-king-forest/40 sm:w-auto">
                                    {p.teaser.secondary}
                                </span>
                            </Link>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
