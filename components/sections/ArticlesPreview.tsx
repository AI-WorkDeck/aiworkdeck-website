import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/Reveal';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { getArticles } from '@/lib/articles';

interface ArticlesPreviewProps {
    lang: Locale;
    dict: any;
}

/**
 * 首页文章预览区（服务端组件），替代此前的录屏 Showcase（dev-board#507）。
 * 只取最新 3 篇公众号文章，收口链接到 /articles 看全部。
 */
export function ArticlesPreview({ lang, dict }: ArticlesPreviewProps) {
    const t = dict.common.articlesPreview;
    const latest = getArticles().slice(0, 3);

    return (
        <section className="py-16 md:py-20 bg-neutral-gray-pale border-b border-neutral-gray-light/60" id="articles">
            <div className="container mx-auto px-4 md:px-8 flex flex-col items-center text-center mb-14">
                <p className="flex items-center gap-3 text-[11px] tracking-[0.22em] uppercase text-king-forest/70 mb-4">
                    <span className="w-8 h-px bg-king-forest/40" />
                    {t.eyebrow}
                    <span className="w-8 h-px bg-king-forest/40" />
                </p>
                <h2 className="font-display text-[clamp(32px,3.4vw,46px)] font-semibold leading-[1.15] tracking-tight text-neutral-dark-bg mb-4">
                    {t.title}
                </h2>
                <p className="text-lg text-neutral-gray-medium max-w-3xl">{t.desc}</p>
            </div>

            <div className="container mx-auto px-4 md:px-8 max-w-6xl">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    {latest.map((article, i) => (
                        <Reveal key={article.slug} delay={i * 70} className="h-full">
                            <ArticleCard lang={lang} article={article} readLabel={t.readOnWechat} size="compact" />
                        </Reveal>
                    ))}
                </div>
            </div>

            <Reveal>
                <div className="container mx-auto px-4 md:px-8 mt-12 flex justify-center">
                    <Link href={`/${lang}/articles`}>
                        <Button size="lg" className="gap-2 font-semibold shadow-lg shadow-king-forest/15">
                            {t.browseAll}
                            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                        </Button>
                    </Link>
                </div>
            </Reveal>
        </section>
    );
}
