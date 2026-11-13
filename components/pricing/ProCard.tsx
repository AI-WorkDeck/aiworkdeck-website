import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PerkList } from '@/components/pricing/PerkList';
import { PRO_INTRO_MONTHS, SAAS_PRICING, SUBSCRIPTION_LIMITS } from '@/lib/saas-pricing';
import { ProCheckout } from '@/components/pricing/ProCheckout';
import { isProPurchaseEnabled } from '@/lib/pro-purchase-flag';
import { siteConfig } from '@/lib/site-config';

/**
 * 个人 Pro 主推卡。
 * 国内站突出首 3 月 ¥9.9/月 体验价 + 正价 ¥149/月 划线；国际站保持不可购并说明中国区人民币可购。
 */
export function ProCard({ lang, p }: { lang: Locale; /** dict.pricingPage.pro */ p: any }) {
    const isWxpay = siteConfig.paymentChannel === 'wxpay';
    const allowance = p.perk1.replace('{monthlyCredits}', String(SUBSCRIPTION_LIMITS.monthlyCents / 100))
        .replace('{weeklyCredits}', String(SUBSCRIPTION_LIMITS.weeklyCents / 100));
    const introPriceLine = p.price.replace('{monthly}', SAAS_PRICING.proIntroMonthly);
    const standardPriceLine = p.price.replace('{monthly}', SAAS_PRICING.proMonthly);
    const introNote = p.introNote
        ?.replace('{months}', String(PRO_INTRO_MONTHS))
        .replace('{intro}', SAAS_PRICING.proIntroMonthly)
        .replace('{standard}', SAAS_PRICING.proMonthly);
    const badgeLabel = isWxpay && p.introBadge ? p.introBadge : p.badge;
    const ctaLabel = isWxpay && p.ctaIntro
        ? p.ctaIntro.replace('{price}', SAAS_PRICING.proIntroMonthly)
        : p.ctaSecondary;

    return (
        <Card className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-king-forest bg-white shadow-[0_24px_52px_-20px_rgba(32,63,56,0.3)]">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-king-forest via-king-mint to-king-forest" />
            {badgeLabel && (
                <div className="absolute right-0 top-1.5 rounded-bl-lg bg-king-forest px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                    {badgeLabel}
                </div>
            )}
            <CardHeader className="border-b border-neutral-gray-light/70 pb-5">
                <CardTitle className="text-lg font-bold text-king-forest">{p.title}</CardTitle>
                <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
                    <span className="font-display text-3xl font-bold tracking-tight text-neutral-dark-bg">
                        {isWxpay ? introPriceLine : standardPriceLine}
                    </span>
                    {isWxpay && (
                        <span className="text-base font-medium text-neutral-gray-medium line-through">
                            {standardPriceLine}
                        </span>
                    )}
                </div>
                {isWxpay && introNote && (
                    <p className="mt-1.5 text-xs font-medium text-king-forest">{introNote}</p>
                )}
                {!isWxpay && p.intlNote && (
                    <p className="mt-1.5 text-xs text-neutral-gray-medium">{p.intlNote}</p>
                )}
                {/* data-legal-pending: 试用协议措辞待 Zewei/counsel */}
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-gray-medium" data-legal-pending="zewei-counsel">
                    {p.trial}
                </p>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 pt-6">
                <PerkList perks={[allowance, p.perk2, p.perk3, p.perk4]} />
                <p className="border-t border-neutral-gray-light/60 pt-4 text-xs leading-relaxed text-neutral-gray-medium">{p.excludes}</p>
            </CardContent>
            <CardFooter className="flex flex-col gap-2.5 pt-2">
                <ProCheckout
                    lang={lang}
                    ctaLabel={ctaLabel}
                    labels={p.checkout}
                    purchaseEnabled={isProPurchaseEnabled()}
                />
                <Link href={`/${lang}/start`} className="w-full" data-analytics="pricing_pro_trial">
                    <Button variant="outline" className="w-full gap-2 border-king-forest/40 font-semibold text-king-forest hover:bg-king-mint-lightest/50">
                        <Sparkles className="h-4 w-4" /> {p.ctaPrimary}
                    </Button>
                </Link>
                <p className="text-center text-[11px] leading-relaxed text-neutral-gray-medium">{p.footnote}</p>
            </CardFooter>
        </Card>
    );
}
