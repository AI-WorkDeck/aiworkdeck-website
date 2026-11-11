import type { Metadata } from 'next';
import Link from 'next/link';
import { Locale, LOCALE_META, toBaseLocale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/layout/PageHero';
import { pageAlternates } from '@/lib/page-metadata';
import { MEMBERSHIP_TIERS } from '@/lib/membership';
import { MembershipYourStatus } from './MembershipYourStatus';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.membership.metaTitle,
        description: dict.membership.metaDescription,
        alternates: pageAlternates(lang, '/membership', { crossSite: true }),
    };
}

function tierName(t: { nameZh: string; nameEn: string }, lang: Locale): string {
    return toBaseLocale(lang) === 'zh' ? t.nameZh : t.nameEn;
}

/**
 * 眉标 + 细线，DESIGN.md 版式语言的区块标题写法（复用 account 页 GroupHeading 的思路，
 * 这里页面独立，不跨路由 import 一个未导出的组件）。
 */
function SectionEyebrow({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-px bg-king-forest/40" />
            <span className="text-[11px] tracking-[0.22em] uppercase text-king-forest font-medium">
                {children}
            </span>
        </div>
    );
}

export default async function MembershipPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.membership;

    /**
     * 权益从档位派生，不进 lib/membership 的数据契约（那边只管等级/门槛/赠送比例这些
     * 计费相关的硬事实）。lib/membership.ts 里 level 从 1 起（paralegal=1）：
     * 资深律师(senior, level 4)起新功能优先体验，授薪合伙人(salaried-partner, level 5)起
     * 专属支持通道——写死在这里是因为它是纯展示文案，改动不影响任何计算逻辑。
     */
    function benefitsFor(level: number, bonusPermille: number): string[] {
        const items: string[] = [];
        if (bonusPermille > 0) {
            items.push(t.benefitBonus.replace('{bonus}', String(bonusPermille)));
        }
        if (level >= 4) items.push(t.benefitEarlyAccess);
        if (level >= 5) items.push(t.benefitSupportChannel);
        return items;
    }

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-20">
            {/* 整页一条 max-w-4xl 内容轴：共享 PageHero 与正文同写 container + max-w-4xl + 同样内边距，
                状态卡、算法卡、等级表、脚注与 hero 标题共用同一左缘（dev-board#323 / #876）。 */}
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} size="compact" width="4xl">
                <Button asChild size="sm" className="font-bold">
                    <Link href={`/${lang}/account#wallet`}>{t.ctaTopup}</Link>
                </Button>
            </PageHero>

            <div className="container mx-auto mt-10 max-w-4xl px-4 md:px-8">
                <div>
                <MembershipYourStatus lang={lang} dict={dict} />

                <div className="mb-10 rounded-2xl border border-[#dce2de] bg-white p-6 shadow-[0_12px_32px_-20px_rgba(22,42,33,0.12)] md:p-7">
                    <SectionEyebrow>{t.algoTitle}</SectionEyebrow>
                    <div className="mt-2 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/55 p-4.5">
                            <p className="font-display text-xl font-bold text-king-forest">{t.algoTopup}</p>
                        </div>
                        <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/55 p-4.5">
                            <p className="font-display text-xl font-bold text-king-forest">{t.algoSpend}</p>
                        </div>
                    </div>
                    <p className="mt-3.5 text-xs leading-relaxed text-neutral-gray-medium">{t.algoNote}</p>
                </div>

                <div className="mb-6">
                    <SectionEyebrow>{t.tableTitle}</SectionEyebrow>
                    <p className="mb-4 text-sm text-neutral-gray-medium">{t.generalBenefitNote}</p>
                    <div className="overflow-x-auto rounded-2xl border border-[#dce2de] bg-white shadow-[0_12px_32px_-20px_rgba(22,42,33,0.1)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-gray-light bg-neutral-gray-pale/50 text-left text-xs uppercase tracking-wider text-neutral-gray-medium">
                                    <th className="px-5 py-3.5 font-semibold">{t.colLevel}</th>
                                    <th className="px-5 py-3.5 text-right font-semibold">{t.colThreshold}</th>
                                    <th className="px-5 py-3.5 text-right font-semibold">{t.colBonus}</th>
                                    <th className="px-5 py-3.5 font-semibold">{t.colBenefits}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {MEMBERSHIP_TIERS.map(tier => {
                                    const benefits = benefitsFor(tier.level, tier.bonusPermille);
                                    return (
                                        <tr key={tier.key} className="border-b border-neutral-gray-light/60 transition-colors last:border-0 hover:bg-neutral-gray-pale/35">
                                            <td className="whitespace-nowrap px-5 py-3.5 font-display font-bold text-neutral-dark-bg">
                                                {tierName(tier, lang)}
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                {tier.threshold.toLocaleString(LOCALE_META[lang].bcp47)}
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-mono tabular-nums text-king-forest font-semibold">
                                                {tier.bonusPermille > 0 ? `+${tier.bonusPermille}‰` : '—'}
                                            </td>
                                            <td className="px-5 py-3.5 text-neutral-gray-medium">
                                                {benefits.length > 0 ? benefits.join(' · ') : t.benefitNoneYet}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="text-xs text-neutral-gray-medium leading-relaxed">
                    {t.footerNote}
                </p>
                </div>
            </div>
        </div>
    );
}
