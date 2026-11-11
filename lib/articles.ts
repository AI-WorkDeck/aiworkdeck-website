import articlesData from '@/data/articles.json';
import { toBaseLocale, type Locale } from '@/i18n-config';

/**
 * 公众号（微信 Official Account）文章清单，替代此前的录屏 Showcase（dev-board#507）。
 * 手工维护于 data/articles.json，新文章发布后在数组头部加一条，newest first。
 */
export interface Article {
    slug: string;
    title: string;
    titleEn: string;
    summary: string;
    summaryEn: string;
    titles?: Partial<Record<Locale, string>>;
    summaries?: Partial<Record<Locale, string>>;
    /** YYYY-MM-DD */
    publishedAt: string;
    /** 公众号原文链接，卡片整体跳转到这里 */
    url: string;
    /** /images/articles/ 下的封面图路径 */
    cover: string;
    source: 'wechat';
}

export function getArticles(): Article[] {
    return articlesData as Article[];
}

export function pickTitle(article: Article, lang: Locale): string {
    if (article.titles?.[lang]) return article.titles[lang]!;
    return toBaseLocale(lang) === 'en' ? article.titleEn : article.title;
}

export function pickSummary(article: Article, lang: Locale): string {
    if (article.summaries?.[lang]) return article.summaries[lang]!;
    return toBaseLocale(lang) === 'en' ? article.summaryEn : article.summary;
}

// 页脚栏位窄，标题是完整长句放不下——取首个分隔符之前的短句；
// 找不到分隔符（如纯疑问句）时按语种给一个长度上限截断。
const SHORT_TITLE_BREAK = /[:：，,]|\.\s/;

export function pickShortTitle(article: Article, lang: Locale): string {
    const title = pickTitle(article, lang);
    const match = title.match(SHORT_TITLE_BREAK);
    if (match && match.index !== undefined && match.index >= 4) {
        return title.slice(0, match.index);
    }
    const max = toBaseLocale(lang) === 'zh' ? 18 : 44;
    return title.length > max ? `${title.slice(0, max)}…` : title;
}
