import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { pickLocale, type Locale } from '@/i18n-config';
import { listSkills } from '@/lib/skills-store';
import { localizeSkill } from '@/lib/skill-en';
import { SKILL_CATEGORIES, isSkillCategory } from '@/lib/skill-categories';
import { findUserById, toPublicUser } from '@/lib/users';
import { SkillCard } from '@/components/skills/SkillCard';
import { SearchBox } from '@/components/skills/SearchBox';
import { Reveal } from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import { MarketplaceHero } from './MarketplaceHero';
import { pageAlternates } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.marketplacePage.title,
        description: dict.marketplacePage.metaDescription,
        alternates: pageAlternates(lang, '/marketplace', { crossSite: true }),
    };
}

/** Marketplace · Skill 页签（dev-board#327：原 /skills 广场并入） */
export default async function MarketplaceSkillsPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ q?: string; sort?: string; cat?: string }>;
}) {
    const { lang } = await params;
    const { q, sort, cat } = await searchParams;
    const dict = await getDictionary(lang);
    const t = dict.skillsPage;

    const activeSort = sort === 'popular' ? 'popular' : 'newest';
    const activeCat = cat && isSkillCategory(cat) ? cat : undefined;
    const skills = listSkills({ q, sort: activeSort, category: activeCat, featuredFirst: true });
    // 热门触发词：取各 Skill 的首个触发词去重，供搜索框自动轮播打字（EN 页取英文译名）
    const hotTriggers = [...new Set(listSkills({ sort: 'popular' }).map(s => localizeSkill(s, lang).triggers[0]).filter(Boolean))].slice(0, 6);
    // 分类计数（不受当前分类过滤影响）
    const allSkills = listSkills();
    const catCount = (id: string) => allSkills.filter(s => s.category === id).length;

    const buildLink = (next: { sort?: string; cat?: string }) => {
        const p = new URLSearchParams();
        if (q) p.set('q', q);
        const s = next.sort ?? activeSort;
        if (s !== 'newest') p.set('sort', s);
        const c = 'cat' in next ? next.cat : activeCat;
        if (c) p.set('cat', c);
        const qs = p.toString();
        return `/${lang}/marketplace${qs ? `?${qs}` : ''}`;
    };

    return (
        <div className="min-h-screen bg-neutral-gray-pale">
            <MarketplaceHero lang={lang} dict={dict} active="skills">
                <SearchBox
                    lang={lang}
                    defaultValue={q}
                    activeSort={activeSort}
                    suggestions={hotTriggers}
                    placeholder={t.searchPlaceholder}
                />
            </MarketplaceHero>

            {/* 分类页签：编辑式下划线，替代胶囊 */}
            {/* sticky 位在固定导航之下：滚动态导航在所有断点都是 top-4 悬浮岛 + h-16，底边 80px */}
            <div className="border-b border-neutral-gray-light/80 bg-white/70 backdrop-blur-xl sticky top-20 z-30">
                <div className="container mx-auto px-4 md:px-8 max-w-6xl flex items-center justify-between gap-6">
                    <nav className="flex items-center gap-6 md:gap-7 overflow-x-auto py-0 -mb-px">
                        {[{ id: '', label: t.allCategories, n: allSkills.length }, ...SKILL_CATEGORIES.filter(c => catCount(c.id) > 0).map(c => ({ id: c.id, label: pickLocale(c, lang), n: catCount(c.id) }))].map(c => {
                            const active = (activeCat || '') === c.id;
                            return (
                                <Link
                                    key={c.id || 'all'}
                                    href={buildLink({ cat: c.id || undefined })}
                                    className={
                                        active
                                            ? 'flex items-baseline gap-1.5 py-3.5 text-sm font-semibold text-king-forest border-b-2 border-king-forest whitespace-nowrap'
                                            : 'flex items-baseline gap-1.5 py-3.5 text-sm text-neutral-gray-medium hover:text-neutral-dark-bg border-b-2 border-transparent transition-colors whitespace-nowrap'
                                    }
                                >
                                    {c.label}
                                    <span className="text-[10px] font-mono opacity-60">{c.n}</span>
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="hidden md:flex items-center gap-5 flex-shrink-0 text-sm">
                        {[
                            { key: 'newest', label: t.sortNewest },
                            { key: 'popular', label: t.sortPopular },
                        ].map(s => (
                            <Link
                                key={s.key}
                                href={buildLink({ sort: s.key })}
                                className={
                                    activeSort === s.key
                                        ? 'text-king-forest font-semibold'
                                        : 'text-neutral-gray-medium hover:text-neutral-dark-bg transition-colors'
                                }
                            >
                                {s.label}
                            </Link>
                        ))}
                        <span className="w-px h-4 bg-neutral-gray-light" />
                        <Link href={`/${lang}/skills/submit`}>
                            <Button size="sm" className="font-semibold">
                                {t.submit}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* 移动端排序 + 提交 */}
            <div className="md:hidden container mx-auto px-4 pt-5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                    {[
                        { key: 'newest', label: t.sortNewest },
                        { key: 'popular', label: t.sortPopular },
                    ].map(s => (
                        <Link
                            key={s.key}
                            href={buildLink({ sort: s.key })}
                            className={activeSort === s.key ? 'text-king-forest font-semibold' : 'text-neutral-gray-medium'}
                        >
                            {s.label}
                        </Link>
                    ))}
                </div>
                <Link href={`/${lang}/skills/submit`}>
                    <Button size="sm" className="font-semibold">{t.submit}</Button>
                </Link>
            </div>

            {/* Grid */}
            <section className="container mx-auto px-4 md:px-8 max-w-6xl pt-8 md:pt-10 pb-28">
                {skills.length === 0 ? (
                    <div className="max-w-md mx-auto my-16 flex flex-col items-center text-center">
                        <LayoutGrid className="w-10 h-10 mx-auto mb-6 text-neutral-gray-medium/50" strokeWidth={1.25} />
                        <p className="font-display text-lg font-bold text-neutral-dark-bg mb-3 leading-relaxed">{t.empty}</p>
                        <p className="text-sm text-neutral-gray-medium mb-8 leading-7">{t.subtitle}</p>
                        <Button asChild className="font-semibold px-8">
                            <Link href={`/${lang}/skills/submit`}>{t.submit}</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {skills.map((skill, i) => {
                            const author = findUserById(skill.authorId);
                            return (
                                <Reveal key={skill.id} delay={Math.min(i, 8) * 55} className="h-full">
                                    <SkillCard
                                        lang={lang}
                                        dict={dict}
                                        skill={skill}
                                        author={author ? toPublicUser(author) : undefined}
                                    />
                                </Reveal>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
