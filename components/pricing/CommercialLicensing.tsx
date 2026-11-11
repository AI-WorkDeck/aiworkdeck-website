import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PerkList } from '@/components/pricing/PerkList';
import { interpolate } from '@/components/ui/interpolate';
import { siteConfig } from '@/lib/site-config';
import { PRICING } from '@/lib/pricing';
import { REPO_URL } from '@/lib/structured-data';

/**
 * 机构商业授权：内部使用 + OEM 两张卡、按人数分档的年费表、创始客户计划、页脚小字。
 *
 * 原先整块长在首页的 Pricing 区里（dev-board#509 之前）。首页需要的只是「多少钱」的一句话，
 * 而这一段是给要签合同的人看的——搬到定价页，首页换成一行摘要。
 * 价格数字仍然只有 lib/pricing.ts 一个来源，词典里只有模板。
 */

const COMMERCIAL_LICENSE_URL = `${REPO_URL}/blob/master/legal/COMMERCIAL-LICENSE.md`;
const LICENSING_FAQ_URL = `${REPO_URL}#licensing-faq-for-law-firms`;

function mailtoWithSubject(subject: string) {
    return `mailto:${siteConfig.legalEntity.contactEmail}?subject=${encodeURIComponent(subject)}`;
}

export function CommercialLicensing({ p, leading }: {
    p: any;
    /** 排在两张授权卡前面的卡（FAQ 价格一览里放社区版卡），三张同排 */
    leading?: React.ReactNode;
}) {
    return (
        <>
            <div className={`grid grid-cols-1 items-stretch gap-5 md:grid-cols-2${leading ? ' lg:grid-cols-3' : ''}`}>
                {leading}
                {/* 商业授权 · 内部使用（推荐档） */}
                <Card className="relative flex flex-col overflow-hidden rounded-xl border border-king-forest/60 shadow-[0_18px_40px_-18px_rgba(46,90,80,0.3)]">
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-king-forest/70 to-transparent" />
                    <div className="absolute right-0 top-0 rounded-bl-lg bg-king-forest px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white">
                        {p.internal.badge}
                    </div>
                    <CardHeader>
                        <CardTitle className="text-xl text-king-forest">{p.internal.title}</CardTitle>
                        <div className="mt-2 text-2xl font-semibold text-neutral-dark-bg">
                            {p.internal.price.replace('{price}', PRICING.internalBase)}
                        </div>
                        <p className="text-sm text-neutral-gray-medium">{p.internal.desc}</p>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <PerkList perks={[p.internal.perk1, p.internal.perk2, p.internal.perk3, p.internal.perk4]} />
                    </CardContent>
                    <CardFooter>
                        <a href={mailtoWithSubject(p.internal.mailSubject)} className="w-full">
                            <Button className="w-full gap-2 bg-king-forest hover:bg-king-forest/90">
                                <Mail className="h-4 w-4" /> {p.internal.cta}
                            </Button>
                        </a>
                    </CardFooter>
                </Card>

                {/* OEM · 再分发授权 */}
                <Card className="flex flex-col rounded-xl border border-neutral-gray-light/90 transition-all duration-300 hover:border-king-forest/25 hover:shadow-[0_18px_40px_-18px_rgba(46,90,80,0.25)]">
                    <CardHeader>
                        <CardTitle className="text-xl">{p.oem.title}</CardTitle>
                        <div className="mt-2 text-2xl font-semibold text-neutral-dark-bg">
                            {p.oem.price.replace('{price}', PRICING.oemBase)}
                        </div>
                        <p className="text-sm text-neutral-gray-medium">{p.oem.desc}</p>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <PerkList perks={[p.oem.perk1, p.oem.perk2, p.oem.perk3, p.oem.perk4]} />
                    </CardContent>
                    <CardFooter>
                        <a href={mailtoWithSubject(p.oem.mailSubject)} className="w-full">
                            <Button className="w-full gap-2 bg-neutral-dark-bg text-white shadow-md hover:bg-neutral-dark-bg/90">
                                <Mail className="h-4 w-4" /> {p.oem.cta}
                            </Button>
                        </a>
                    </CardFooter>
                </Card>
            </div>

            {/* 内部商业授权档位表 */}
            <div className="mt-10">
                <h4 className="mb-4 text-base font-semibold text-neutral-dark-bg">
                    {p.tiers.title}
                </h4>
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                    <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b-2 border-neutral-gray-light">
                                <th className="py-2.5 pr-5 font-medium text-neutral-gray-medium">{p.tiers.colSize}</th>
                                <th className="py-2.5 pr-5 font-medium text-neutral-gray-medium">{p.tiers.colFee}</th>
                                <th className="py-2.5 font-medium text-neutral-gray-medium">{p.tiers.colNote}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {p.tiers.rows.map((row: { size: string; note: string }, i: number) => {
                                const isLast = i === p.tiers.rows.length - 1;
                                const feeTemplate = isLast ? p.tiers.feePerYearFrom : p.tiers.feePerYear;
                                return (
                                    <tr key={i} className="border-b border-neutral-gray-light/70 align-top">
                                        <td className="py-3 pr-5 text-neutral-gray-dark">{row.size}</td>
                                        <td className="whitespace-nowrap py-3 pr-5 font-semibold text-neutral-dark-bg">
                                            {feeTemplate.replace('{fee}', PRICING.tierFees[i])}
                                        </td>
                                        <td className="py-3 text-neutral-gray-medium">{row.note}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-xs text-neutral-gray-medium">
                    {p.tiers.note.replace('{rate}', PRICING.perPersonDay)}
                </p>
            </div>

            {/* 创始客户计划横幅 */}
            <div className="relative mt-10 overflow-hidden rounded-xl bg-king-forest-darker bg-gradient-to-br from-king-forest-darker via-king-forest to-king-forest-darker">
                <div className="texture-grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" />
                <div className="relative flex flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:px-10">
                    <div className="flex-1">
                        <p className="mb-3 text-lg font-semibold text-white">{p.founding.title}</p>
                        <p className="text-sm leading-relaxed text-white/80">{p.founding.body}</p>
                    </div>
                    <div className="shrink-0">
                        <a href={mailtoWithSubject(p.founding.mailSubject)}>
                            <Button className="gap-2 bg-white text-king-forest-darker shadow-md hover:bg-white/90">
                                <Mail className="h-4 w-4" /> {p.founding.cta}
                            </Button>
                        </a>
                    </div>
                </div>
            </div>

            {/* 页脚小字。居中不走 <p> 的 mx-auto：用户浏览器里有扩展会覆盖 p 标签的
                margin（dev-board#342，/membership 那次同一特征），父级 text-align +
                inline-block 的居中不吃这一套，正常浏览器下渲染完全一致。 */}
            <div className="mt-8 text-center">
                <p className="inline-block max-w-4xl text-center text-xs leading-relaxed text-neutral-gray-medium">
                    {interpolate(p.footnote.text, {
                        license: (
                            <a
                                href={COMMERCIAL_LICENSE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-king-forest underline underline-offset-2 hover:text-king-forest/80"
                            >
                                {p.footnote.licenseLabel}
                            </a>
                        ),
                        faq: (
                            <a
                                href={LICENSING_FAQ_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-king-forest underline underline-offset-2 hover:text-king-forest/80"
                            >
                                {p.footnote.faqLabel}
                            </a>
                        ),
                    })}
                </p>
            </div>
        </>
    );
}
