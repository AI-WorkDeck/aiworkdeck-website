'use client';

import type { Locale } from '@/i18n-config';
import { ArrowUpRight } from 'lucide-react';
import { type Article, pickSummary, pickTitle } from '@/lib/articles';

interface ArticleCardProps {
    lang: Locale;
    article: Article;
    readLabel: string;
    /** compact = 首页预览区用的小卡；default = /articles 列表页 */
    size?: 'default' | 'compact';
}

/**
 * 公众号文章卡：整卡可点，新标签页跳到微信公众号原文。
 * 模板与 SkillCard 同款（DESIGN.md §五）。
 */
export function ArticleCard({ lang, article, readLabel, size = 'default' }: ArticleCardProps) {
    const title = pickTitle(article, lang);
    const summary = pickSummary(article, lang);

    return (
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="group block h-full">
            <article className="relative h-full flex flex-col overflow-hidden rounded-xl border border-neutral-gray-light/90 bg-white/65 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-king-forest/25 hover:shadow-[0_18px_40px_-18px_rgba(18,58,38,0.25)]">
                <span className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-king-forest/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative aspect-video w-full overflow-hidden border-b border-neutral-gray-light/60 bg-neutral-gray-pale">
                    <img
                        src={article.cover}
                        alt={title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>

                <div className={size === 'compact' ? 'flex flex-1 flex-col p-5' : 'flex flex-1 flex-col p-6'}>
                    <p className="mb-3 font-mono text-[12px] tabular-nums text-neutral-gray-medium">
                        {article.publishedAt}
                    </p>
                    <h3 className="font-display text-lg font-semibold leading-snug text-neutral-dark-bg transition-colors group-hover:text-king-forest">
                        {title}
                    </h3>
                    <p className="mb-6 mt-4 flex-1 text-sm leading-7 text-neutral-gray-medium line-clamp-3">
                        {summary}
                    </p>
                    <p className="mt-auto flex items-center gap-1.5 border-t border-neutral-gray-light/70 pt-4 text-[13px] font-medium text-king-forest">
                        {readLabel}
                        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </p>
                </div>
            </article>
        </a>
    );
}
