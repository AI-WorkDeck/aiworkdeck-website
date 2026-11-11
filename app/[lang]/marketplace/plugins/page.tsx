import type { Metadata } from 'next';
import Link from 'next/link';
import {
    Blocks,
    ShieldCheck,
    Wrench,
    Download,
    FileSearch,
    Users,
    AudioLines,
    Check,
    Code2,
} from 'lucide-react';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { listPlugins, getPluginDisplay } from '@/lib/plugins-store';
import { OFFICIAL_PLUGINS, type OfficialPlugin } from '@/lib/official-plugins';
import { listFeatureProducts } from '@/lib/products';
import { hasEntitlement } from '@/lib/purchases';
import { getSessionUser } from '@/lib/sessions';
import { bqtChargeTarget } from '@/lib/bqt-member';
import { Reveal } from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import { BuyButton } from '@/components/purchase/BuyButton';
import { formatPrice } from '@/lib/price';
import { MarketplaceHero } from '../MarketplaceHero';
import { pageAlternates } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';

const OFFICIAL_ICONS: Record<OfficialPlugin['icon'], typeof FileSearch> = {
    FileSearch,
    Users,
    ShieldCheck,
    AudioLines,
};

/** 统一卡片模板（DESIGN.md §五，SkillCard 为准）——替换掉旧插件页自成一派的 rounded-2xl */
const CARD =
    'relative h-full rounded-xl bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 p-6 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-king-forest/25 hover:shadow-[0_18px_40px_-18px_rgba(18,58,38,0.25)]';

/** 区块题头：衬线标题 + 右侧小注（与会员页/广场一致的编辑排版） */
function SectionHead({ title, tag }: { title: string; tag?: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-dark-bg">{title}</h2>
            {tag ? <span className="text-xs text-neutral-gray-medium">{tag}</span> : null}
        </div>
    );
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: `${dict.pluginsPage.title} · ${dict.marketplacePage.title}`,
        description: dict.pluginsPage.metaDescription,
        alternates: pageAlternates(lang, '/marketplace/plugins', { crossSite: true }),
    };
}

/** Marketplace · 插件页签（dev-board#327：原 /plugins 并入） */
export default async function MarketplacePluginsPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.pluginsPage;
    const en = toBaseLocale(lang) === 'en';
    const me = await getSessionUser();
    // 包晴天律师（积分通道开着）：购买按钮改为扣包晴天积分
    const bqtPoints = !!me && !!bqtChargeTarget(me.id);
    const featureProducts = listFeatureProducts().map(p => ({
        ...p,
        owned: !!me && hasEntitlement(me.id, p.key),
    }));
    // 只展示审核通过的版本；同 id 多版本时取最新发布的那个
    const approved = listPlugins({ status: 'approved' });
    const latest = new Map<string, (typeof approved)[number]>();
    for (const p of approved) {
        const prev = latest.get(p.id);
        if (!prev || (p.publishedAt ?? '') > (prev.publishedAt ?? '')) latest.set(p.id, p);
    }
    const plugins = [...latest.values()].map(p => ({ ...p, ...getPluginDisplay(p, lang) })).sort(
        (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
    );

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <MarketplaceHero lang={lang} dict={dict} active="plugins">
                {/* 纸面行动区：墨色主按钮 + 纸白描边次按钮（同社区页） */}
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href={`/${lang}/plugins/develop`}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1f3b34] px-5 text-[13.5px] font-bold text-[#f6f4ee] shadow-sm transition-colors hover:bg-[#17302a]"
                    >
                        <Code2 className="h-4 w-4" strokeWidth={2} />
                        {t.develop}
                    </Link>
                    <Link
                        href={`/${lang}/plugins/submit`}
                        className="inline-flex h-10 items-center rounded-lg border border-[#e3dccb] bg-[#fffdf8] px-5 text-[13.5px] font-medium text-[#1f3b34] transition-colors hover:border-[#c9bd9f] hover:bg-white"
                    >
                        {t.submit}
                    </Link>
                </div>
            </MarketplaceHero>

            <div className="container mx-auto max-w-6xl px-4 md:px-8">
                {/* 官方插件：随桌面端发布、左栏常驻，不走在线分发。
                    放在最前是让访客先看懂「插件」在产品里长什么样。 */}
                <Reveal delay={80}>
                    <div className="mt-12">
                        <SectionHead title={t.officialTitle} tag={t.officialTag} />
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-gray-dark">
                            {t.officialIntro}
                        </p>
                    </div>
                </Reveal>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                    {OFFICIAL_PLUGINS.map((p, i) => {
                        const Icon = OFFICIAL_ICONS[p.icon];
                        return (
                            <Reveal key={p.key} delay={120 + i * 55} className="h-full">
                                <article className={CARD}>
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-king-mint-light text-king-forest">
                                            <Icon className="h-5 w-5" strokeWidth={1.75} />
                                        </span>
                                        <h3 className="font-display text-lg font-semibold text-neutral-dark-bg">
                                            {en ? p.nameEn : p.name}
                                        </h3>
                                    </div>
                                    <p className="mt-4 text-sm leading-relaxed text-neutral-gray-dark">
                                        {en ? p.summaryEn : p.summary}
                                    </p>
                                    <ul className="mt-4 space-y-2">
                                        {(en ? p.highlightsEn : p.highlights).map((h) => (
                                            <li key={h} className="flex gap-2.5 text-sm text-neutral-gray-dark">
                                                <Check
                                                    className="mt-1 h-3.5 w-3.5 shrink-0 text-king-forest/70"
                                                    strokeWidth={2.5}
                                                />
                                                <span className="leading-relaxed">{h}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            </Reveal>
                        );
                    })}
                </div>

                {/* 社区插件：真正的分发区，排在功能解锁（商业区）之前 */}
                <Reveal delay={140}>
                    <div className="mt-14">
                        <SectionHead
                            title={t.communityTitle}
                            tag={
                                <Link
                                    href={`/${lang}/plugins/develop`}
                                    className="underline-offset-4 hover:text-king-forest hover:underline"
                                >
                                    {t.howToDevelop}
                                </Link>
                            }
                        />
                    </div>
                </Reveal>

                {plugins.length === 0 ? (
                    <Reveal delay={180}>
                        <div className="mt-6 rounded-xl border border-dashed border-neutral-gray-light bg-white/60 px-6 py-16 text-center">
                            <Blocks className="mx-auto mb-5 h-10 w-10 text-king-forest/40" strokeWidth={1.5} />
                            <p className="font-display text-lg font-bold text-neutral-dark-bg">{t.emptyTitle}</p>
                            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-neutral-gray-dark">
                                {t.emptyBody}
                            </p>
                            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                                <Link href={`/${lang}/plugins/develop`}>
                                    <Button className="font-semibold px-7">{t.guide}</Button>
                                </Link>
                                <a href="/api/plugins/template" download>
                                    <Button variant="outline" className="font-semibold px-7">
                                        <Download className="mr-2 h-4 w-4" strokeWidth={2} />
                                        {t.template}
                                    </Button>
                                </a>
                            </div>
                        </div>
                    </Reveal>
                ) : (
                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                        {plugins.map((p, i) => (
                            <Reveal key={p.id} delay={180 + i * 55} className="h-full">
                                <article className={CARD}>
                                    <header className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            {/* 微标签行：签名状态用图标+小字承载语义，不做彩色胶囊 */}
                                            <p className="mb-2 flex items-center gap-1.5 text-[11px] tracking-[0.14em] uppercase text-king-forest/80">
                                                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                                                {t.signed}
                                            </p>
                                            <h3 className="truncate font-display text-xl font-semibold text-neutral-dark-bg">
                                                {p.name}
                                            </h3>
                                            <p className="mt-1 text-[11px] font-mono text-neutral-gray-medium/80 truncate">
                                                v{p.version} · {p.author}
                                            </p>
                                        </div>
                                        {(p.priceCents ?? 0) > 0 && (
                                            <span className="shrink-0 font-display text-lg font-bold text-king-forest">
                                                {formatPrice(p.priceCents!)}
                                            </span>
                                        )}
                                    </header>

                                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-neutral-gray-dark">
                                        {p.description}
                                    </p>

                                    {/* 工具数与权限自述：细字排版替代满屏胶囊（DESIGN.md §一.2） */}
                                    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-neutral-gray-medium">
                                        <span className="inline-flex items-center gap-1">
                                            <Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />
                                            {p.tools.length} {t.toolsSuffix}
                                        </span>
                                        {p.permissions.map((perm) => (
                                            <span key={perm} className="inline-flex items-center gap-2">
                                                <span className="text-neutral-gray-light">·</span>
                                                {(t.permissions as Record<string, string>)[perm] ?? perm}
                                            </span>
                                        ))}
                                    </p>

                                    <footer className="mt-5 flex items-center gap-1.5 border-t border-neutral-gray-light/70 pt-4 text-xs text-neutral-gray-medium">
                                        <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                                        {p.downloads} {t.installsSuffix}
                                        {p.publishedAt && (
                                            <span className="ml-auto">
                                                {new Date(p.publishedAt).toLocaleDateString(en ? 'en-US' : 'zh-CN')}
                                            </span>
                                        )}
                                    </footer>
                                    {(p.priceCents ?? 0) > 0 && (
                                        <div className="mt-4">
                                            <BuyButton
                                                lang={lang}
                                                labels={dict.purchase}
                                                skuId={`plugin:${p.id}`}
                                                priceCents={p.priceCents!}
                                                itemName={p.name}
                                                owned={!!me && hasEntitlement(me.id, `plugin:${p.id}`)}
                                                loggedIn={!!me}
                                                bqtPoints={bqtPoints}
                                                compact
                                            />
                                        </div>
                                    )}
                                </article>
                            </Reveal>
                        ))}
                    </div>
                )}

                {/* 功能解锁 SKU（PR-W3）：桌面端本地小功能的一次性解锁，购买后写入账户权益，
                    桌面端连接账户（awdk_ Key）即生效。 */}
                <Reveal delay={200}>
                    <div className="mt-14">
                        <SectionHead title={t.featureTitle} tag={t.featureTag} />
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-gray-dark">
                            {t.featureIntro}
                        </p>
                    </div>
                </Reveal>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                    {featureProducts.map((p, i) => (
                        <Reveal key={p.key} delay={240 + i * 55} className="h-full">
                            <article className={`${CARD} flex flex-col`}>
                                <div className="flex items-start justify-between gap-4">
                                    <h3 className="font-display text-lg font-semibold text-neutral-dark-bg">
                                        {en ? p.nameEn : p.name}
                                    </h3>
                                    <span className="shrink-0 font-display text-lg font-bold text-king-forest">
                                        {formatPrice(p.priceCents)}
                                    </span>
                                </div>
                                <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-gray-dark">
                                    {en ? p.descriptionEn : p.description}
                                </p>
                                <div className="mt-5 border-t border-neutral-gray-light/70 pt-4">
                                    <BuyButton
                                        lang={lang}
                                        labels={dict.purchase}
                                        skuId={`feature:${p.key}`}
                                        priceCents={p.priceCents}
                                        itemName={en ? p.nameEn : p.name}
                                        owned={p.owned}
                                        loggedIn={!!me}
                                        bqtPoints={bqtPoints}
                                        compact
                                    />
                                </div>
                            </article>
                        </Reveal>
                    ))}
                </div>

                <Reveal delay={260}>
                    <p className="mt-12 text-center text-xs leading-relaxed text-neutral-gray-medium">
                        {t.footNote}
                    </p>
                </Reveal>
            </div>
        </div>
    );
}
