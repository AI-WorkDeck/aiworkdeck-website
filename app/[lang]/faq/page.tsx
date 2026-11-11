import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ArrowUpRight, Gift } from 'lucide-react';
import { Locale, toBaseLocale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { PageHero } from '@/components/layout/PageHero';
import { JsonLd } from '@/components/seo/JsonLd';
import { faqPageJsonLd, REPO_URL } from '@/lib/structured-data';
import { pageAlternates } from '@/lib/page-metadata';
import { siteConfig, SITE_ID } from '@/lib/site-config';
import { communityFaq } from '@/lib/community-faq';
import { signupGrantDisplay, signupGrantLine } from '@/lib/signup-grant-display';

// Pricing includes the current, time-limited signup grant.
export const dynamic = 'force-dynamic';

/** 上游服务商官方价格页。键与词典 `pricingPage.vendors.items[].key` 一一对应。只给链接不复述单价：价目会变，复述只会过时。 */
const VENDOR_URLS: Record<string, string> = {
    openrouter: 'https://openrouter.ai/models',
    aliyunOcr: 'https://help.aliyun.com/zh/ocr/product-overview/product-billing/',
    tingwu: 'https://help.aliyun.com/zh/tingwu/pricing-and-billing-rules',
    // 企查查开放平台价格面议，没有公开价目页，链到平台首页
    qcc: 'https://openapi.qcc.com/',
    pkulaw: 'https://mcp.pkulaw.com/apis',
    bocha: 'https://open.bochaai.com/',
    tushare: 'https://tushare.pro/document/1?doc_id=13',
};

/** 默认展开的问答：存储第一问与「开源为什么收费」 */
const OPEN_BY_DEFAULT = new Set(['local-storage', 'why']);

interface FaqEntry {
    id: string;
    q: string;
    /** 纯文本答案，也是 FAQPage JSON-LD 的 Answer；段落用空行分隔 */
    a: string;
    href?: string;
    linkLabel?: string;
    /** 答案需要列表或链接时的可见正文；给了就替代 `a` 的段落渲染，`a` 仍须是同一内容的纯文本 */
    body?: React.ReactNode;
}

type PricingDict = Awaited<ReturnType<typeof getDictionary>>['pricingPage'];

/**
 * 「怎么收费？」一节的问答。页面与 JSON-LD 共用这一份——结构化数据与可见文本不一致是富结果处罚项。
 * 充值那条按站点分叉：国内站微信支付，国际站 Stripe。
 */
function pricingFaqItems(t: PricingDict, lang: Locale): FaqEntry[] {
    const f = t.faq;
    const vendors: { key: string; name: string; note?: string }[] = t.vendors.items;
    return [
        { id: 'why', q: t.why.title, a: t.why.steps.map(step => `${step.title}${t.why.stepJoiner ?? '. '}${step.body}`).join(' ') },
        { id: 'community-license', ...f.community },
        { id: 'topup', q: f.topup.q, a: siteConfig.paymentChannel === 'stripe' ? f.topup.aStripe : f.topup.aWxpay },
        { id: 'negotiate', ...f.negotiate },
        { id: 'self-build', ...f.selfHost },
        { id: 'accounts', q: f.transparency.q, a: f.transparency.a, linkLabel: f.transparency.linkLabel, href: `/${lang}/transparency` },
        {
            id: 'vendor-prices',
            q: f.vendors.q,
            a: `${f.vendors.a} ${vendors.map(v => (v.note ? `${v.name} (${v.note})` : v.name)).join(t.vendors.listJoiner ?? ', ')}`,
        },
    ];
}

function FaqList({ items }: { items: FaqEntry[] }) {
    return (
        <div className="divide-y divide-neutral-gray-light rounded-2xl border border-neutral-gray-light bg-white px-5 md:px-8">
            {items.map(item => (
                <details key={item.id} id={item.id} className="group scroll-mt-24 py-5" open={OPEN_BY_DEFAULT.has(item.id)}>
                    <summary className="flex min-h-8 cursor-pointer list-none items-start justify-between gap-5 text-base font-medium text-neutral-dark-bg marker:content-none">
                        {item.q}<Plus aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-king-forest transition-transform group-open:rotate-45" />
                    </summary>
                    <div className="mt-4 max-w-3xl space-y-3 text-sm leading-7 text-neutral-gray-medium">
                        {item.body ?? item.a.split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                        {item.href && <Link href={item.href} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-king-forest underline underline-offset-4">{item.linkLabel}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link>}
                    </div>
                </details>
            ))}
        </div>
    );
}

const answerLink = 'inline-flex min-h-11 items-center gap-1.5 font-medium text-king-forest underline underline-offset-4';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const t = communityFaq(lang);
    return { title: t.title, description: t.subtitle, alternates: pageAlternates(lang, '/faq', { crossSite: true }) };
}

export default async function FaqPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const t = communityFaq(lang);
    const dict = await getDictionary(lang);
    const pricing = dict.pricingPage;
    const grant = signupGrantDisplay(lang);
    const grantLine = grant ? signupGrantLine(grant, dict.common.grant) : null;
    const vendors: { key: string; name: string; note?: string }[] = pricing.vendors.items;

    const pricingItems = pricingFaqItems(pricing, lang).map((item): FaqEntry => {
        if (item.id === 'why') {
            return {
                ...item,
                body: (
                    <>
                        {pricing.why.steps.map(step => (
                            <p key={step.title}>
                                <span className="font-medium text-neutral-dark-bg">{step.title}{pricing.why.stepJoiner}</span>
                                {step.body}
                            </p>
                        ))}
                        <p><a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={answerLink}>{pricing.why.repoCta}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a></p>
                        {/* 赠额限时：活动没开或已过窗口时整块不渲染 */}
                        {grantLine && (
                            <div className="flex items-start gap-3 rounded-xl border border-king-forest/20 bg-king-mint-lightest/60 px-4 py-3">
                                <Gift aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-king-forest" strokeWidth={1.5} />
                                <p className="text-neutral-gray-dark">
                                    <span className="font-medium text-neutral-dark-bg">{pricing.why.grantTitle}</span>
                                    {toBaseLocale(lang) === 'zh' ? '：' : ' — '}
                                    {grantLine}
                                </p>
                            </div>
                        )}
                        <p><Link href={`/${lang}/transparency`} className={answerLink}>{pricing.why.transparencyLine}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></p>
                    </>
                ),
            };
        }
        if (item.id === 'vendor-prices') {
            return {
                ...item,
                body: (
                    <>
                        <p>{pricing.faq.vendors.a}</p>
                        <ul className="divide-y divide-neutral-gray-light border-y border-neutral-gray-light">
                            {vendors.map(v => (
                                <li key={v.key} className="flex flex-wrap items-center justify-between gap-x-4">
                                    <span className="py-2 text-neutral-gray-dark">
                                        {v.name}
                                        {v.note && <span className="ml-2 text-xs text-neutral-gray-medium">{v.note}</span>}
                                    </span>
                                    <a href={VENDOR_URLS[v.key]} target="_blank" rel="noopener noreferrer" className={answerLink}>
                                        {pricing.vendors.linkLabel}<ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </>
                ),
            };
        }
        return item;
    });

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-20">
            <JsonLd data={faqPageJsonLd([...t.sections.flatMap(section => section.items), ...pricingItems])} />
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} width="5xl">
                <nav aria-label={t.navigation} className="flex flex-wrap gap-2 text-sm">
                    {t.sections.map((section, idx) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e3dccb] bg-[#fffdf8] px-4 text-xs font-medium text-[#2a3a33] transition-colors hover:border-[#c9bd9f] hover:bg-white"
                        >
                            <span className="font-mono text-[10.5px] text-[#7a6234]">{String(idx + 1).padStart(2, '0')}</span>
                            {section.title}
                        </a>
                    ))}
                    <a
                        href="#pricing"
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e3dccb] bg-[#fffdf8] px-4 text-xs font-medium text-[#2a3a33] transition-colors hover:border-[#c9bd9f] hover:bg-white"
                    >
                        <span className="font-mono text-[10.5px] text-[#7a6234]">{String(t.sections.length + 1).padStart(2, '0')}</span>
                        {t.pricingTitle}
                    </a>
                </nav>
                <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-[#5c655f]">{dict.communityFaq.scope}</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <Link href={`/${lang}/legal/privacy`} className="inline-flex min-h-11 items-center text-king-forest underline underline-offset-4">{t.privacy}</Link>
                    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-king-forest underline underline-offset-4">{pricing.why.repoCta}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a>
                </div>
            </PageHero>
            <div className="container mx-auto max-w-5xl px-4 pt-4 md:px-8">
                {t.sections.map((section, index) => (
                    <section key={section.id} id={section.id} className="scroll-mt-24 py-6 md:py-7">
                        <div className="mb-4 flex items-center gap-3">
                            <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-king-mint-lightest font-mono text-xs font-bold tabular-nums text-king-forest">
                                {String(index + 1).padStart(2, '0')}
                            </span>
                            <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-dark-bg md:text-2xl">{section.title}</h2>
                        </div>
                        <FaqList items={section.items} />
                    </section>
                ))}
                <aside className="my-7 rounded-2xl bg-king-forest-darker p-6 text-white shadow-[0_18px_42px_-20px_rgba(22,42,33,0.4)] md:p-8" aria-labelledby="deployment-title">
                    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-king-mint">{t.deploymentEyebrow}</p>
                            <h2 id="deployment-title" className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t.deploymentTitle}</h2>
                            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-white/80">{t.deploymentBody}</p>
                        </div>
                        <a href={`/${lang}/deployment`} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-king-forest-darker transition-colors hover:bg-king-mint-lightest">
                            {t.deploymentPlanCta}
                            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                        </a>
                    </div>
                </aside>
                <section id="pricing" className="scroll-mt-24 py-6 md:py-7">
                    <div className="mb-4 flex items-center gap-3">
                        <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-king-mint-lightest font-mono text-xs font-bold tabular-nums text-king-forest">
                            {String(t.sections.length + 1).padStart(2, '0')}
                        </span>
                        <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-dark-bg md:text-2xl">{t.pricingTitle}</h2>
                    </div>
                    <p className="mb-6 max-w-3xl text-sm leading-7 text-neutral-gray-medium">{dict.communityFaq.pricingIntro}</p>
                    <p className="mb-6 max-w-3xl text-sm leading-7 text-neutral-gray-medium">
                        <Link
                            href={`/${lang}/pricing`}
                            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-king-forest underline underline-offset-4"
                        >
                            {dict.pricingPage.subscriptionCrossLinkLabel}
                            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                    </p>
                    <FaqList items={pricingItems} />
                    <div id="prices" className="mt-10 scroll-mt-24 rounded-2xl border border-neutral-gray-light bg-white px-6 py-8">
                        <h3 className="mb-3 text-lg font-semibold text-neutral-dark-bg">{dict.pricingPage.faqPricesBriefTitle}</h3>
                        <p className="max-w-3xl text-sm leading-7 text-neutral-gray-medium">{dict.pricingPage.faqPricesBriefBody}</p>
                        <div className="mt-4 flex flex-wrap gap-4 text-sm">
                            <Link href={`/${lang}/pricing`} className="font-medium text-king-forest underline underline-offset-4">
                                {dict.pricingPage.subscriptionCrossLinkLabel}
                            </Link>
                            <a
                                href={`mailto:${siteConfig.legalEntity.contactEmail}?subject=${encodeURIComponent(dict.pricingPage.commercialBrief.mailSubject)}`}
                                className="font-medium text-king-forest underline underline-offset-4"
                            >
                                {dict.pricingPage.faqPricesBriefCta}
                            </a>
                        </div>
                    </div>
                </section>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-gray-light pt-6 text-sm">
                    <Link href={`/${lang}/legal/privacy`} className="inline-flex min-h-11 items-center text-king-forest underline underline-offset-4">{t.privacy}</Link>
                    <Link href={`/${lang}/start`} className="inline-flex min-h-11 items-center text-king-forest underline underline-offset-4">{t.start}</Link>
                </div>
            </div>
        </div>
    );
}
