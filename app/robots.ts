import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

/**
 * robots.txt。
 *
 * 取代原来的静态 `public/robots.txt`（两行，`User-agent: * / Allow: /`）：
 * 两站的 `Sitemap:` 行必须指向各自的 origin，静态文件做不到按站分叉。
 *
 * ## 为什么要把 AI 爬虫一个个列出来
 *
 * `User-agent: *` 已经隐式允许它们了，显式列一遍不改变权限，改变的是**声明**：
 * 一部分 AI 抓取方按「有没有针对本 UA 的规则」判断站点态度，而生产日志里
 * GPTBot / ClaudeBot / OAI-SearchBot / PerplexityBot 的抓取量本来就很大。
 * 同时这份名单也是将来要收紧时唯一的改动点——现在不写，将来要临时拼。
 *
 * Disallow 三处：后台、个人账户（都已在页面 meta 上 noindex，这里是第二道）、
 * `/api/`。`/api/` 下有 registry 与 gateway 这类给桌面端用的接口，不是给爬虫读的。
 */
const DISALLOW = ['/en/admin', '/zh/admin', '/en/account', '/zh/account', '/api/'];

/** 显式声明欢迎的抓取方：AI 搜索 6 家 + 传统搜索 3 家。 */
const NAMED_BOTS = [
    'OAI-SearchBot',
    'GPTBot',
    'ChatGPT-User',
    'PerplexityBot',
    'ClaudeBot',
    'Claude-SearchBot',
    'Google-Extended',
    'Bingbot',
    'Applebot',
];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            { userAgent: '*', allow: '/', disallow: DISALLOW },
            ...NAMED_BOTS.map(userAgent => ({ userAgent, allow: '/', disallow: DISALLOW })),
        ],
        sitemap: `${siteConfig.origin}/sitemap.xml`,
    };
}
