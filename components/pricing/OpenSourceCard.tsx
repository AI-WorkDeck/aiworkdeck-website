import Link from 'next/link';
import { Download, Wallet } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PerkList } from '@/components/pricing/PerkList';
import { LICENSE_URL } from '@/lib/structured-data';
import { COMMERCIAL_LICENSE_URL } from '@/lib/saas-pricing';
import { formatSiteAmount } from '@/lib/site-config';

/** 按需使用方案：本地免费起步、充值和功能解锁，保留开源许可入口。 */
export function OpenSourceCard({ lang, p }: { lang: Locale; /** dict.pricingPage.openSource */ p: any }) {
    return (
        <Card className="flex flex-col rounded-2xl border border-[#dce2de] bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-king-forest/35 hover:shadow-[0_20px_44px_-20px_rgba(32,63,56,0.2)]">
            <CardHeader className="border-b border-neutral-gray-light/70 pb-5">
                <CardTitle className="text-lg font-bold text-neutral-dark-bg">{p.title}</CardTitle>
                <div className="mt-2.5 font-display text-3xl font-bold tracking-tight text-neutral-dark-bg">{p.price}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-gray-medium">{p.desc}</p>
            </CardHeader>
            <CardContent className="flex-1 space-y-5 pt-6">
                <PerkList perks={[p.perk1, p.perk2.replace('{topup}', formatSiteAmount(10000)), p.perk3, p.perk4]} />
                <p className="border-t border-neutral-gray-light/60 pt-4 text-xs leading-relaxed text-neutral-gray-medium">
                    <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-king-forest hover:underline">AGPL-3.0</a>
                    {' · '}<a href={COMMERCIAL_LICENSE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-king-forest hover:underline">{p.agplLegalLink}</a>
                </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-2.5 pt-2 sm:flex-row">
                <Link href={`/${lang}/start`} className="w-full">
                    <Button className="w-full gap-2 bg-neutral-dark-bg font-bold text-white shadow-sm hover:bg-neutral-dark-bg/90">
                        <Download className="h-4 w-4" /> {p.ctaPrimary}
                    </Button>
                </Link>
                <Link href={`/${lang}/account`} className="w-full">
                    <Button variant="outline" className="w-full gap-2 border-neutral-gray-light font-semibold">
                        <Wallet className="h-4 w-4" /> {p.ctaSecondary}
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
