import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { PageHero } from '@/components/layout/PageHero';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { getArticles } from '@/lib/articles';
import { pageAlternates } from '@/lib/page-metadata';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.articlesPage.title,
        description: dict.articlesPage.metaDescription,
        alternates: pageAlternates(lang, '/articles', { crossSite: true }),
    };
}

// 替代此前的录屏 Showcase（dev-board#507）：录屏维护成本高、8 个视频 142MB，
// 换成团队在公众号发的产品实录文章，整卡跳去公众号原文阅读。
export default async function ArticlesPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.articlesPage;
    const articles = getArticles();

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-14">
            {/* 全站统一深色刊物式页头（dev-board#328） */}
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} width="5xl" />

            <div className="container mx-auto px-4 md:px-8 max-w-5xl pt-12">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {articles.map((article) => (
                        <ArticleCard key={article.slug} lang={lang} article={article} readLabel={t.readOnWechat} />
                    ))}
                </div>

                <p className="mt-10 text-sm text-neutral-gray-medium">{t.sourceNote}</p>
            </div>
        </div>
    );
}
