import Link from 'next/link';
import { ArrowUpRight, Download } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { SkillEntry } from '@/lib/skills-store';
import { categoryLabel } from '@/lib/skill-categories';
import { localizeSkill, localizeDisplayName } from '@/lib/skill-en';
import { CategoryIcon } from '@/components/skills/CategoryIcon';
import { PublicUser } from '@/lib/users';

interface SkillCardProps {
    lang: Locale;
    dict: any;
    skill: SkillEntry;
    author?: PublicUser;
}

/**
 * 广场卡片：编辑排版风——衬线题名 + 引号触发词 + 细线分隔，
 * 图标从分类推导（全站不渲染 emoji）。
 */
export function SkillCard({ lang, dict, skill: rawSkill, author }: SkillCardProps) {
    const t = dict.skillsPage;
    const skill = localizeSkill(rawSkill, lang);
    const cat = categoryLabel(skill.category, lang);
    const authorName = localizeDisplayName(author, lang);
    return (
        <Link href={`/${lang}/skills/${skill.id}`} className="block group h-full">
            <article className="relative h-full bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl p-6 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-king-forest/25 hover:shadow-[0_18px_40px_-18px_rgba(18,58,38,0.25)]">
                {/* hover 时顶部浮起一条品牌色细线 */}
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-king-forest/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <header className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2 text-[11px] tracking-[0.14em] uppercase text-neutral-gray-medium">
                            <CategoryIcon category={skill.category} className="w-3.5 h-3.5 text-king-forest/70" />
                            <span>{cat || t.uncategorized}</span>
                            {skill.featured && (
                                <>
                                    <span className="w-px h-3 bg-neutral-gray-light" />
                                    <span className="text-king-forest font-semibold">{t.featured}</span>
                                </>
                            )}
                        </div>
                        <h3 className="font-display text-xl font-semibold text-neutral-dark-bg leading-snug group-hover:text-king-forest transition-colors duration-300 truncate">
                            {skill.name}
                        </h3>
                        <p className="mt-1 text-[11px] font-mono text-neutral-gray-medium/80 truncate">
                            {skill.id} · v{skill.version}
                        </p>
                    </div>
                    <ArrowUpRight
                        className="w-4 h-4 flex-shrink-0 mt-1 text-neutral-gray-medium/0 group-hover:text-king-forest transition-all duration-300 -translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0"
                        strokeWidth={1.75}
                    />
                </header>

                <p className="text-sm text-neutral-gray-medium leading-relaxed line-clamp-2 mb-5">
                    {skill.description}
                </p>

                {/* 触发词：引号排版，替代满屏胶囊 */}
                <p className="text-[13px] leading-relaxed text-king-forest/80 mb-6">
                    {skill.triggers.slice(0, 3).map(trigger => `${dict.common.quotes.open}${trigger}${dict.common.quotes.close}`).join(' ')}
                    {skill.triggers.length > 3 && (
                        <span className="text-neutral-gray-medium/70"> +{skill.triggers.length - 3}</span>
                    )}
                </p>

                <footer className="mt-auto pt-4 border-t border-neutral-gray-light/70 flex items-center justify-between text-xs text-neutral-gray-medium">
                    <span className="truncate">{authorName || 'Unknown'}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                        <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                        {skill.downloads} {t.downloads}
                    </span>
                </footer>
            </article>
        </Link>
    );
}
