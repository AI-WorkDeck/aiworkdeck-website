import type { Metadata } from 'next';
import Link from 'next/link';
import { Coins, Crown, Feather, Gem, Plus, TrendingUp } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { computeCharts, type SkillChartRow } from '@/lib/charts';
import { Avatar } from '@/components/user/Avatar';
import { Reveal } from '@/components/motion/Reveal';
import { PageHero } from '@/components/layout/PageHero';
import { Button } from '@/components/ui/button';
import { pageAlternates } from '@/lib/page-metadata';
import { cn } from '@/lib/utils';

/**
 * Skill 榜单页（dev-board#301）：免费/收费/创作者/收益四榜齐发。
 * 冷启动口径（维护者拍板）：不足 10 名的榜位渲染「虚位以待」占位行——
 * 不灌假数据，空位本身就是投稿召唤。收益榜只显示量级区间（隐私裁决见 lib/charts.ts）。
 * 总榜/本周由 ?window=weekly 切换（服务端渲染，无客户端状态）。
 */
export const dynamic = 'force-dynamic';

const TOP_N = 10;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.chartsPage.title,
        description: dict.chartsPage.lead,
        alternates: pageAlternates(lang, '/skills/charts'),
    };
}

export default async function ChartsPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ window?: string }>;
}) {
    const { lang } = await params;
    const { window: win } = await searchParams;
    const weekly = win === 'weekly';
    const dict = await getDictionary(lang);
    const t = dict.chartsPage;

    const charts = computeCharts();
    const freeRows = weekly ? charts.free.weekly : charts.free.all;
    const paidRows = weekly ? charts.paid.weekly : charts.paid.all;

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 全站统一深色刊物式页头（dev-board#328） */}
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.lead} size="compact" width="6xl" />
            <div className="container mx-auto px-4 md:px-8 max-w-6xl pt-10">
                <header className="mb-8">
                    {/* 总榜 / 本周 切换（只作用于两个 Skill 榜）：编辑式下划线（DESIGN.md §四），不用胶囊 */}
                    <nav className="flex items-center justify-end gap-6 border-b border-neutral-gray-light">
                        {[
                            { key: 'all', label: t.windowAll, href: `/${lang}/skills/charts` },
                            { key: 'weekly', label: t.windowWeekly, href: `/${lang}/skills/charts?window=weekly` },
                        ].map(w => (
                            <Link
                                key={w.key}
                                href={w.href}
                                className={cn(
                                    '-mb-px border-b-2 pb-2.5 text-[14px] transition-colors',
                                    (w.key === 'weekly') === weekly
                                        ? 'border-king-forest font-bold text-king-forest'
                                        : 'border-transparent font-medium text-neutral-gray-medium hover:text-neutral-gray-dark'
                                )}
                            >
                                {w.label}
                            </Link>
                        ))}
                    </nav>
                </header>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Reveal>
                        <SkillBoard lang={lang} t={t} icon={TrendingUp} title={t.freeTitle}
                            note={weekly ? t.weeklyNote : t.freeNote} rows={freeRows} valueLabel={t.installs} />
                    </Reveal>
                    <Reveal delay={60}>
                        <SkillBoard lang={lang} t={t} icon={Gem} title={t.paidTitle}
                            note={weekly ? t.weeklyNote : t.paidNote} rows={paidRows} valueLabel={t.purchases} />
                    </Reveal>
                    <Reveal delay={120}>
                        <Board lang={lang} t={t} icon={Feather} title={t.creatorsTitle} note={t.creatorsNote}
                            count={charts.creators.length}>
                            {charts.creators.map(row => (
                                <Row key={row.user.id} rank={row.rank}>
                                    <Link href={`/${lang}/u/${encodeURIComponent(row.user.username)}`}
                                        className="flex min-w-0 flex-1 items-center gap-3 group">
                                        <Avatar userId={row.user.id} displayName={row.user.displayName}
                                            avatarUpdatedAt={row.user.avatarUpdatedAt} size={32} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-bold text-neutral-dark-bg group-hover:text-king-forest">
                                                {row.user.displayName}
                                                {row.founderSeq ? (
                                                    <span className="ml-2 font-mono text-[11px] font-normal text-king-forest-lighter">
                                                        No.{row.founderSeq}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </span>
                                    </Link>
                                    <span className="text-right font-mono text-[13px] text-neutral-gray-medium whitespace-nowrap">
                                        {(t.worksCount as string).replace('{n}', String(row.works))}
                                        <span className="mx-1.5 text-neutral-gray-light">·</span>
                                        {(t.installsCount as string).replace('{n}', String(row.installs))}
                                    </span>
                                </Row>
                            ))}
                        </Board>
                    </Reveal>
                    <Reveal delay={180}>
                        <Board lang={lang} t={t} icon={Coins} title={t.earningsTitle} note={t.earningsNote}
                            count={charts.earnings.length}>
                            {charts.earnings.map(row => (
                                <Row key={row.user.id} rank={row.rank}>
                                    <Link href={`/${lang}/u/${encodeURIComponent(row.user.username)}`}
                                        className="flex min-w-0 flex-1 items-center gap-3 group">
                                        <Avatar userId={row.user.id} displayName={row.user.displayName}
                                            avatarUpdatedAt={row.user.avatarUpdatedAt} size={32} />
                                        <span className="block truncate text-sm font-bold text-neutral-dark-bg group-hover:text-king-forest">
                                            {row.user.displayName}
                                        </span>
                                    </Link>
                                    <span className="rounded-md bg-king-mint-lightest px-2.5 py-1 font-mono text-[12px] font-bold text-king-forest whitespace-nowrap">
                                        {t.tiers[row.tierKey]}
                                    </span>
                                </Row>
                            ))}
                        </Board>
                    </Reveal>
                </div>

                <div className="mt-10 flex flex-col items-center gap-3">
                    <p className="text-[13px] text-neutral-gray-medium">{t.joinHint}</p>
                    <Link href={`/${lang}/skills/submit`}>
                        <Button variant="accent" className="font-bold gap-1.5">
                            <Plus className="w-4 h-4" strokeWidth={1.75} />
                            {t.joinCta}
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}

function SkillBoard({ lang, t, icon: Icon, title, note, rows, valueLabel }: {
    lang: Locale; t: any; icon: any; title: string; note: string;
    rows: SkillChartRow[]; valueLabel: string;
}) {
    return (
        <Board lang={lang} t={t} icon={Icon} title={title} note={note} count={rows.length}>
            {rows.map(row => (
                <Row key={row.skill.id} rank={row.rank}>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-neutral-dark-bg">{row.skill.name}</span>
                        {row.authorUsername ? (
                            <Link href={`/${lang}/u/${encodeURIComponent(row.authorUsername)}`}
                                className="block truncate text-[12px] text-neutral-gray-medium hover:text-king-forest">
                                {row.authorName}
                            </Link>
                        ) : (
                            <span className="block truncate text-[12px] text-neutral-gray-medium">{row.authorName}</span>
                        )}
                    </span>
                    <span className="text-right font-mono text-[13px] text-neutral-gray-medium whitespace-nowrap">
                        {row.value.toLocaleString()} {valueLabel}
                    </span>
                </Row>
            ))}
        </Board>
    );
}

/** 榜卡骨架：不足 TOP_N 的名次渲染「虚位以待」占位行（冷启动裁决：空位即召唤） */
function Board({ lang, t, icon: Icon, title, note, count, children }: {
    lang: Locale; t: any; icon: any; title: string; note: string; count: number; children: React.ReactNode;
}) {
    const empty = Math.max(0, TOP_N - count);
    return (
        <section className="overflow-hidden rounded-xl border border-neutral-gray-light/90 bg-white/65 backdrop-blur-xl">
            <header className="flex items-center justify-between border-b border-neutral-gray-light/80 px-5 py-4">
                <h2 className="flex items-center gap-2.5 font-display text-[17px] font-semibold text-neutral-dark-bg">
                    <Icon className="h-[18px] w-[18px] text-king-forest" strokeWidth={1.75} />
                    {title}
                </h2>
                <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">{note}</span>
            </header>
            <ol>
                {children}
                {empty > 0 && (
                    <li className="flex items-center gap-4 border-b border-neutral-gray-light/50 px-5 py-3 last:border-b-0">
                        <RankNum rank={count + 1} ghost />
                        <Link href={`/${lang}/skills/submit`}
                            className="flex-1 text-[13px] text-neutral-gray-medium hover:text-king-forest transition-colors">
                            {t.emptySlot}
                        </Link>
                    </li>
                )}
            </ol>
        </section>
    );
}

function Row({ rank, children }: { rank: number; children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-4 border-b border-neutral-gray-light/50 px-5 py-3 last:border-b-0">
            <RankNum rank={rank} />
            {children}
        </li>
    );
}

function RankNum({ rank, ghost }: { rank: number; ghost?: boolean }) {
    return (
        <span className={cn(
            'w-8 flex-shrink-0 text-center font-display text-lg font-bold tabular-nums',
            ghost ? 'text-neutral-gray-light'
                : rank === 1 ? 'text-king-forest'
                    : rank <= 3 ? 'text-king-forest-lighter'
                        : 'text-neutral-gray-medium'
        )}>
            {rank === 1 && !ghost ? <Crown className="mx-auto h-5 w-5" strokeWidth={1.75} /> : rank}
        </span>
    );
}
