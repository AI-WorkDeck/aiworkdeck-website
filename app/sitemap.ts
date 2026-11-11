import { EPISODES } from '@/lib/videos';
import type { MetadataRoute } from 'next';
import { i18n, LOCALE_META } from '@/i18n-config';
import { SITE_ID, siteConfig } from '@/lib/site-config';
import { listSkills } from '@/lib/skills-store';
import { listPosts } from '@/lib/forum';

/**
 * sitemap.xml。
 *
 * 在此之前全站没有 sitemap，robots.txt 也没有 `Sitemap:` 行——生产日志显示
 * Googlebot 只抓过 `/en`、`/zh` 和 robots.txt，几十个 Skill 详情页一个都没爬到。
 *
 * ## 只列应当被索引的 URL
 *
 * 已 NOINDEX 的页（account、admin、cert、各 submit 页、community/chat、community/new）
 * 一条都不进：sitemap 是「请来抓这些」的主动声明，把 noindex 页放进去等于自相矛盾，
 * Search Console 会按覆盖率错误报。`/u/{username}` 也不进——零作品的主页现在是
 * NOINDEX，有没有作品要逐个用户查，收益不抵这次遍历。
 *
 * ## 为什么按请求生成而不是构建期
 *
 * Skill 与社区帖存在 data/（skills.json 与 SQLite），构建机上没有这两份数据；
 * 构建期生成会产出一份只有静态路由的 sitemap，然后一直到下次发版都不会更新。
 * 全站页面本来就是 force-dynamic，这里多一次读盘可以忽略。
 */
export const dynamic = 'force-dynamic';

/** 双语静态路由。`''` 是首页。 */
const STATIC_PATHS: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '', priority: 1, changeFrequency: 'weekly' },
    { path: '/start', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/deployment', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/workspace', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/faq', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/transparency', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/marketplace', priority: 0.9, changeFrequency: 'daily' },
    { path: '/marketplace/plugins', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/marketplace/mcp', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/plugins/develop', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/skills/charts', priority: 0.6, changeFrequency: 'daily' },
    { path: '/community', priority: 0.7, changeFrequency: 'daily' },
    { path: '/articles', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/updates', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/videos', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/membership', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/quiz', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/legal/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/terms', priority: 0.3, changeFrequency: 'yearly' },
];

/** 同站 20 语种互指 + x-default，与 lib/page-metadata.ts 的非 crossSite 分支同口径。 */
function languagesOf(path: string): Record<string, string> {
    const languages: Record<string, string> = {};
    for (const locale of i18n.locales) {
        languages[LOCALE_META[locale].bcp47] = `${siteConfig.origin}/${locale}${path}`;
    }
    languages['x-default'] = `${siteConfig.origin}/${siteConfig.defaultLocale}${path}`;
    return languages;
}

function entry(
    path: string,
    lang: string,
    opts: { priority?: number; changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency']; lastModified?: string | Date } = {}
): MetadataRoute.Sitemap[number] {
    return {
        url: `${siteConfig.origin}/${lang}${path}`,
        alternates: { languages: languagesOf(path) },
        ...opts,
    };
}

export default function sitemap(): MetadataRoute.Sitemap {
    const paths = [...STATIC_PATHS];
    // 视频单集页（lib/videos.ts）
    for (const e of EPISODES) paths.push({ path: `/videos/${e.id}`, priority: 0.5, changeFrequency: 'yearly' });
    // 公司页两站都有（国内站只登主体）；社区版落地页只在国际站
    paths.push({ path: '/about', priority: 0.4, changeFrequency: 'yearly' });
    if (SITE_ID === 'intl') {
        paths.push({ path: '/community-edition', priority: 0.9, changeFrequency: 'weekly' });
    }

    const items: MetadataRoute.Sitemap = [];
    for (const p of paths) {
        for (const lang of i18n.locales) {
            items.push(entry(p.path, lang, { priority: p.priority, changeFrequency: p.changeFrequency }));
        }
    }

    for (const skill of listSkills()) {
        for (const lang of i18n.locales) {
            items.push(
                entry(`/skills/${skill.id}`, lang, {
                    priority: 0.7,
                    changeFrequency: 'monthly',
                    lastModified: skill.updatedAt,
                })
            );
        }
    }

    // 只列公开可见的帖子：listPosts 默认已排除软删与隐藏帖，limit 给大一点兜住增长
    for (const post of listPosts({ limit: 1000 }).posts) {
        for (const lang of i18n.locales) {
            items.push(
                entry(`/community/post/${post.id}`, lang, {
                    priority: 0.5,
                    changeFrequency: 'weekly',
                    lastModified: post.lastActivityAt,
                })
            );
        }
    }

    return items;
}
