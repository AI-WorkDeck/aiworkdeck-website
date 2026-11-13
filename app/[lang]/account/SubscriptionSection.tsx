// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from 'next/link';
import { LOCALE_META, type Locale } from '@/i18n-config';
import type { EntitlementRow } from '@/lib/purchases';
import { SAAS_PRICING, PRO_INTRO_MONTHS } from '@/lib/saas-pricing';
import { ProCheckout, type ProIntroOfferState } from '@/components/pricing/ProCheckout';

/** The desktop subscription link lands here; keep purchase separate from wallet top-ups. */
export function SubscriptionSection({ lang, dict, entitlement, paymentChannel, purchaseEnabled, bqtMember = false, introOffer }: {
    lang: Locale;
    dict: any;
    entitlement: EntitlementRow | null;
    paymentChannel: string;
    purchaseEnabled: boolean;
    /** 包晴天律师（积分通道开着）：Pro 随包晴天会员，本站不卖 */
    bqtMember?: boolean;
    introOffer?: ProIntroOfferState;
}) {
    const t = dict.accountPage.subscription;
    const p = dict.pricingPage.pro;
    const introEligible = introOffer ? introOffer.eligible : true;
    const remaining = introOffer?.remainingMonths ?? PRO_INTRO_MONTHS;
    const total = introOffer?.totalMonths ?? PRO_INTRO_MONTHS;
    const expiry = entitlement?.expiresAt
        ? new Date(entitlement.expiresAt).toLocaleDateString(LOCALE_META[lang].bcp47, {
            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai',
        }) : null;

    return (
        <section id="subscription" aria-labelledby="subscription-title" className="scroll-mt-28 mt-8 rounded-xl border border-king-forest/30 bg-white p-6 md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 id="subscription-title" className="text-xl font-semibold text-neutral-dark-bg">{t.title}</h2>
                        <span className="rounded-full bg-king-mint-lightest px-3 py-1 text-sm text-king-forest">
                            {entitlement ? t.active : t.inactive}
                        </span>
                    </div>
                    {entitlement && <p className="text-sm text-king-forest">
                        {expiry ? t.expires.replace('{date}', expiry) : t.permanent}
                        {entitlement.orderId === 'bqt-member' && <> · {t.bqtSource}</>}
                    </p>}
                    <p className="max-w-2xl text-sm leading-relaxed text-neutral-gray-medium">{t.description}</p>
                    {paymentChannel === 'wxpay' && <p className="text-sm text-neutral-gray-medium">{p.trial}</p>}
                </div>
                <div className="w-full shrink-0 space-y-3 md:w-64">
                    {bqtMember ? <ProCheckout lang={lang} ctaLabel={t.renew} labels={{ ...p.checkout, bqtRenewHint: t.bqtRenewHint }} bqtMember />
                    : paymentChannel === 'wxpay' ? <>
                        <div className="flex flex-wrap items-baseline gap-2">
                            <p className="text-xl font-semibold text-neutral-dark-bg">
                                {p.price.replace('{monthly}', introEligible ? SAAS_PRICING.proIntroMonthly : SAAS_PRICING.proMonthly)}
                            </p>
                            {introEligible && (
                                <span className="text-sm text-neutral-gray-medium line-through">
                                    {p.price.replace('{monthly}', SAAS_PRICING.proMonthly)}
                                </span>
                            )}
                        </div>
                        {introEligible && t.introEligible && (
                            <p className="text-xs font-medium text-king-forest">
                                {t.introEligible.replace('{remaining}', String(remaining)).replace('{total}', String(total))}
                            </p>
                        )}
                        <ProCheckout
                            lang={lang}
                            ctaLabel={entitlement ? t.renew : p.ctaSecondary}
                            labels={p.checkout}
                            purchaseEnabled={purchaseEnabled}
                            introOffer={introOffer}
                        />
                        {purchaseEnabled && <p className="text-sm text-neutral-gray-medium">{t.payment}</p>}
                    </> : <p className="text-sm leading-relaxed text-neutral-gray-medium">{t.unavailable}</p>}
                    <Link href={`/${lang}/pricing`} className="inline-block text-sm font-medium text-king-forest hover:underline">{t.details}</Link>
                </div>
            </div>
        </section>
    );
}
