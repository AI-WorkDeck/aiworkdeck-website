import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { PageHero } from '@/components/layout/PageHero';
import { CountUp } from '@/components/motion/CountUp';
import { listSkills } from '@/lib/skills-store';
import { listStorePlugins } from '@/lib/store-plugins';
import { cn } from '@/lib/utils';

/**
 * Marketplace 三个页签（Skill / Plugin / MCP）共用的页头（dev-board#327）：
 * 同一眉标、标题、统计条与页签条，只有插槽内容（搜索框 / 行动按钮）随页签变——
 * 让访客切页签时确信自己还在同一个地方。统计数自己取数，两页零传参保持一致。
 */
export function MarketplaceHero({
    lang,
    dict,
    active,
    children,
}: {
    lang: Locale;
    dict: any;
    active: 'skills' | 'plugins' | 'mcp';
    children?: React.ReactNode;
}) {
    const t = dict.marketplacePage;
    const st = dict.skillsPage;
    const allSkills = listSkills();
    const contributorCount = new Set(allSkills.map(s => s.authorId)).size;
    // 插件数 = 商店里实际列出的插件（同 id 多版本只算一个）
    const pluginCount = listStorePlugins().length;

    const tabs = (
        <div className="flex items-start justify-between gap-6">
        <nav className="flex items-center gap-8 overflow-x-auto">
            {[
                { key: 'skills', href: `/${lang}/marketplace`, label: t.tabSkills },
                { key: 'plugins', href: `/${lang}/marketplace/plugins`, label: t.tabPlugins },
                { key: 'mcp', href: `/${lang}/marketplace/mcp`, label: t.tabMcp },
            ].map(tab => (
                <Link
                    key={tab.key}
                    href={tab.href}
                    aria-current={active === tab.key ? 'page' : undefined}
                    className={cn(
                        'pb-3.5 text-sm border-b-2 transition-colors',
                        active === tab.key
                            ? 'text-ink font-semibold border-pine'
                            : 'text-ink-muted border-transparent hover:text-ink',
                    )}
                >
                    {tab.label}
                </Link>
            ))}
        </nav>
        {active === 'skills' && (
            <Link
                href={`/${lang}/skills/charts`}
                className="flex shrink-0 items-center gap-1.5 pb-3.5 text-sm font-semibold text-pine hover:underline underline-offset-4"
            >
                <TrendingUp className="w-4 h-4" strokeWidth={1.75} />
                {st.chartsLink}
            </Link>
        )}
        </div>
    );

    return (
        <PageHero
            eyebrow={t.eyebrow}
            title={t.heroTitle}
            subtitle={t[active === 'skills' ? 'skillDescription' : active === 'plugins' ? 'pluginDescription' : 'mcpDescription']}
            watermark={t.watermark}
            size="compact"
            width="6xl"
            tabs={tabs}
        >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
                <div className="min-w-0 md:flex-1">{children}</div>
                {active !== 'mcp' && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
                    <span className="flex items-baseline gap-1.5">
                        <CountUp value={allSkills.length} className="font-semibold text-[22px] text-ink" />
                        {st.statSkills}
                    </span>
                    <span className="w-px h-4 bg-neutral-gray-light hidden sm:block" />
                    <span className="flex items-baseline gap-1.5">
                        <CountUp value={pluginCount} className="font-semibold text-[22px] text-ink" />
                        {t.statPlugins}
                    </span>
                    <span className="w-px h-4 bg-neutral-gray-light hidden sm:block" />
                    <span className="flex items-baseline gap-1.5">
                        <CountUp value={contributorCount} className="font-semibold text-[22px] text-ink" />
                        {st.statContributors}
                    </span>
                </div>}
            </div>
        </PageHero>
    );
}
