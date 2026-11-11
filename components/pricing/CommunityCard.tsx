import Link from 'next/link';
import { Download } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PerkList } from '@/components/pricing/PerkList';

/**
 * 社区版卡片。
 *
 * 第四条权益有两种写法：活动在窗口内时写实际赠额（`perk4Grant` + 赠额句），
 * 否则回落到不含具体金额的 `perk4`。金额与截止日一律来自 lib/signup-grant-display，
 * 不在词典里写死——写死的那一刻起，官网与实际发放就开始漂移。
 */
export function CommunityCard({
    lang,
    p,
    grantLine,
}: {
    lang: Locale;
    /** dict.common.pricing.community */
    p: any;
    grantLine: string | null;
}) {
    const perk4 = grantLine ? p.perk4Grant.replace('{grant}', grantLine) : p.perk4;

    return (
        <Card className="flex flex-col rounded-xl border border-neutral-gray-light/90 transition-all duration-300 hover:border-king-forest/25 hover:shadow-[0_18px_40px_-18px_rgba(46,90,80,0.25)]">
            <CardHeader>
                <CardTitle className="text-xl">{p.title}</CardTitle>
                <div className="mt-2 text-2xl font-semibold text-neutral-dark-bg">{p.price}</div>
                <p className="text-sm text-neutral-gray-medium">{p.desc}</p>
            </CardHeader>
            <CardContent className="flex-1">
                <PerkList perks={[p.perk1, p.perk2, p.perk3, perk4]} />
            </CardContent>
            <CardFooter>
                {/* 免费档走引导页：直接外跳 GitHub 资产列表会把人丢在站外 */}
                <Link href={`/${lang}/start`} className="w-full">
                    <Button className="w-full gap-2 bg-neutral-dark-bg text-white shadow-md hover:bg-neutral-dark-bg/90">
                        <Download className="h-4 w-4" /> {p.cta}
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
