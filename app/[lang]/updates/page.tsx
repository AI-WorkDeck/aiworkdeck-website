import type { Metadata } from 'next';
import { pickLocale, type Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { RefreshCw, Package, ShieldCheck, WifiOff, ChevronDown, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHero } from '@/components/layout/PageHero';
import Link from 'next/link';
import { RELEASES } from '@/content/releases';
import { REPO_URL } from '@/lib/structured-data';
import { pageAlternates } from '@/lib/page-metadata';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.updatesPage.title,
        description: dict.updatesPage.metaDescription,
        alternates: pageAlternates(lang, '/updates', { crossSite: true }),
    };
}

// 版本与更新说明（增量更新设计 docs/INCREMENTAL_UPDATE_DESIGN.md §10）：
// 0.X.Y 版本规则——小版本应用内补丁自动更新，大版本官网全量安装包。
export default async function UpdatesPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.updatesPage;

    const sections = [
        { icon: RefreshCw, data: t.minor },
        { icon: Package, data: t.major },
        { icon: WifiOff, data: t.offline },
        { icon: ShieldCheck, data: t.integrity },
    ];

    const releases = RELEASES.map(r => 'contentKey' in r
        ? { ...r, ...t[r.contentKey] }
        : { ...r, headline: pickLocale(r.headline, lang), items: r.items.map(item => pickLocale(item, lang)) });
    const latest = releases[0];
    const featuredReleases = releases.slice(0, 3);
    const archivedReleases = releases.slice(3);

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-20">
            {/* 全站统一深色刊物式页头（dev-board#328） */}
            <PageHero
                eyebrow={t.eyebrow}
                title={t.heroLatest.replace('{version}', latest.version).replace('{date}', latest.date)}
                subtitle={latest.headline}
                size="compact"
                width="4xl"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href={`/${lang}/start`}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f3b34] px-5 text-sm font-bold text-[#f6f4ee] shadow-sm transition-colors hover:bg-[#17302a]"
                    >
                        <Download className="h-4 w-4" strokeWidth={2} />
                        {dict.common.nav.download}
                    </Link>
                    <Link
                        href={`${REPO_URL}/releases`}
                        target="_blank"
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#e3dccb] bg-[#fffdf8] px-4 text-sm font-medium text-[#1f3b34] transition-colors hover:border-[#c9bd9f] hover:bg-white"
                    >
                        {t.releasesLink} ↗
                    </Link>
                </div>
            </PageHero>

            <div className="container mx-auto max-w-4xl px-4 pt-10 md:px-8">
                <div>
                    <div className="mb-3 flex items-center gap-3">
                        <span className="h-px w-6 bg-king-forest/60" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-king-forest">
                            {t.history.eyebrow}
                        </span>
                    </div>
                    <h2 className="font-display mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                        {t.history.title}
                    </h2>

                    {/* 最新 3 个版本完整展开，首版突出 LATEST 标记 */}
                    <div className="space-y-4">
                        {featuredReleases.map((r, idx) => (
                            <Card
                                key={r.version}
                                variant="outline"
                                className={
                                    idx === 0
                                        ? 'relative overflow-hidden rounded-2xl border-king-forest/45 bg-white shadow-[0_18px_42px_-20px_rgba(32,63,56,0.22)]'
                                        : 'rounded-2xl border-[#dce2de] bg-white'
                                }
                            >
                                {idx === 0 && (
                                    <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-king-forest via-king-mint to-king-forest" />
                                )}
                                <CardHeader className="pb-3">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <CardTitle className="font-mono text-lg font-bold tabular-nums text-neutral-dark-bg">
                                            v{r.version}
                                        </CardTitle>
                                        {idx === 0 && (
                                            <span className="rounded-full bg-king-forest px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-white">
                                                LATEST
                                            </span>
                                        )}
                                        <span className="font-mono text-xs tabular-nums text-neutral-gray-medium">
                                            {r.date}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-sm font-semibold text-neutral-dark-bg">
                                        {r.headline}
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-2">
                                        {r.items.map((item, i) => (
                                            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-neutral-gray-medium">
                                                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-king-forest/60" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* 历史版本收进紧凑手风琴时间轴，避免页面被数千像素日志拉得过长 */}
                    {archivedReleases.length > 0 && (
                        <div className="mt-5 divide-y divide-neutral-gray-light/80 rounded-2xl border border-[#dce2de] bg-white px-5 md:px-6">
                            {archivedReleases.map(r => (
                                <details key={r.version} className="group py-4">
                                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
                                            <span className="font-mono text-sm font-bold tabular-nums text-neutral-dark-bg">
                                                v{r.version}
                                            </span>
                                            <span className="font-mono text-xs tabular-nums text-neutral-gray-medium">
                                                {r.date}
                                            </span>
                                            <span className="font-medium text-neutral-gray-dark">
                                                {r.headline}
                                            </span>
                                        </div>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-gray-medium transition-transform duration-200 group-open:rotate-180" />
                                    </summary>
                                    <ul className="mt-3 space-y-2 border-t border-neutral-gray-light/60 pt-3">
                                        {r.items.map((item, i) => (
                                            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-neutral-gray-medium">
                                                <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-king-forest/50" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            ))}
                        </div>
                    )}
                </div>

                <p className="mt-6 text-xs text-neutral-gray-medium">
                    {t.releasesHint}{' '}
                    <Link
                        href="https://github.com/AI-WorkDeck/aiworkdeck/releases"
                        target="_blank"
                        className="font-semibold text-king-forest hover:underline"
                    >
                        {t.releasesLink}
                    </Link>
                </p>

                {/* 更新机制说明：版本号规则 + 四个机制块 */}
                <div className="mt-14">
                    <div className="mb-3 flex items-center gap-3">
                        <span className="h-px w-6 bg-king-forest/60" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-king-forest">
                            {t.mechanicsTitle}
                        </span>
                    </div>
                    <p className="mb-5 text-sm text-neutral-gray-medium">{t.subtitle}</p>
                    <Card variant="outline" className="mb-5 rounded-2xl border-[#dce2de] bg-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">{t.scheme.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3.5">
                            <p className="text-sm leading-relaxed text-neutral-gray-medium">{t.scheme.body}</p>
                            <div className="rounded-xl border border-neutral-gray-light bg-neutral-gray-pale p-3.5 text-center font-mono text-sm font-bold tracking-[0.25em] text-neutral-dark-bg">
                                0 . X . Y
                            </div>
                            <div className="grid gap-3 text-sm text-neutral-gray-medium md:grid-cols-2">
                                <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/40 p-3.5">{t.scheme.majorHint}</div>
                                <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/40 p-3.5">{t.scheme.minorHint}</div>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="grid gap-4 md:grid-cols-2">
                        {sections.map(({ icon: Icon, data }) => (
                            <Card key={data.title} variant="outline" className="rounded-2xl border-[#dce2de] bg-white">
                                <CardHeader className="pb-2.5">
                                    <CardTitle className="flex items-center gap-2.5 text-base font-bold text-neutral-dark-bg">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-king-mint-lightest text-king-forest">
                                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                                        </span>
                                        {data.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm leading-relaxed text-neutral-gray-medium">{data.body}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
