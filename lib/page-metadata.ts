import type { Metadata } from 'next';
import { i18n, LOCALE_META, type Locale } from '@/i18n-config';
import { siteConfig, siteConfigOf } from '@/lib/site-config';

/**
 * 页面级 canonical 与 hreflang。
 *
 * ## 为什么不放在布局层
 *
 * 布局层的 metadata 会被**所有子页继承**，而 `app/[lang]/layout.tsx` 的 generateMetadata
 * 只拿得到 `params`，拿不到 pathname——于是它写下的 canonical 只能是 `/{lang}`，
 * 每一个子页都跟着声明自己是首页的副本。线上实测过：`/en/articles`、`/en/skills`、
 * `/en/updates`、`/en/start`、`/en/account` 的 canonical 全部指向 `/en`。
 * 搜索引擎照此办理就是把整站折叠成一页。
 *
 * 让布局拿到路径的唯一办法是从 proxy 塞一个请求头再 `headers()` 读——**不能这么做**：
 * `headers()` 会把整棵树打成动态渲染，全站预渲染（SSG）随之作废。
 * 所以 canonical 下沉到页面，每页显式声明自己是谁。
 *
 * 漏掉某一页的后果是「没有 canonical」，搜索引擎默认自指，是良性退化；
 * 而放在布局里漏掉的后果是「声明自己是首页」，是有害的错误声明。这个方向差别是刻意的。
 *
 * ## crossSite 为什么默认关
 *
 * hreflang 的含义是「同一份内容的另一语种版本」。两站**不是互为镜像**：
 * 法律文本是不同缔约主体、不同适用法的两份文书；公司页只在国际站存在；
 * 账号体系与 Skill 落点两站独立，`/u/{username}` 与 `/skills/{id}` 在另一站多半是 404。
 * 对这些页发跨站 hreflang，轻则指向 404，重则告诉搜索引擎两份不同的合同是同一份文件的翻译。
 * 所以只有两站内容确实等价的营销页才显式打开 `crossSite`。
 *
 * ## 关掉 crossSite 也要有 hreflang
 *
 * `crossSite` 管的是「要不要指向另一个站」，与「本站两个语种要不要互指」是两件事。
 * 从前二者被绑在一起，结果 `/legal/*`、`/skills/{id}`、`/quiz` 这些关掉 crossSite 的页
 * 连同站的 `/en{path}` ↔ `/zh{path}` 一起丢了——而这两个 URL 确确实实是同一份内容的
 * 两个语种，是纯损失。所以非 crossSite 页改为输出同站互指。
 *
 * ## x-default
 *
 * Google 用它回答「语种都不匹配时送去哪」。不给的话没有任何一页是「无语种偏好」的落点。
 * 跨站页指向国际站 `/en{path}`（英文是全球默认受众）；非跨站页指向本站的默认语种，
 * 不越站——本站关掉 crossSite 正是因为另一站没有等价的这一页。
 */
export function pageAlternates(
    lang: Locale,
    path: string,
    opts: { crossSite?: boolean } = {}
): NonNullable<Metadata['alternates']> {
    // 首页传 ''；其余一律以 / 开头，避免拼出 `/enshowcase` 这种只有上线才看得见的错
    if (path !== '' && !path.startsWith('/')) {
        throw new Error(`pageAlternates: path 必须为空串或以 / 开头，收到 ${JSON.stringify(path)}`);
    }

    const alternates: NonNullable<Metadata['alternates']> = {
        canonical: `${siteConfig.origin}/${lang}${path}`,
    };

    const languages: Record<string, string> = {};
    if (opts.crossSite) {
        // 沿用双站既有口径：简体中文读者归国内站，其余语种读者归国际站。
        // 这里刻意**不**再加同语种的另一站 URL，避免 Google 拿到互相冲突的同语种声明。
        for (const locale of i18n.locales) {
            const origin = locale === 'zh' ? siteConfigOf('cn').origin : siteConfigOf('intl').origin;
            languages[LOCALE_META[locale].bcp47] = `${origin}/${locale}${path}`;
        }
        languages['x-default'] = `${siteConfigOf('intl').origin}/en${path}`;
    } else {
        // 只在本站内互指：所有 20 个语种 URL 确实是同一份内容的语种版本
        for (const locale of i18n.locales) {
            languages[LOCALE_META[locale].bcp47] = `${siteConfig.origin}/${locale}${path}`;
        }
        languages['x-default'] = `${siteConfig.origin}/${siteConfig.defaultLocale}${path}`;
    }
    alternates.languages = languages;

    return alternates;
}

/**
 * 后台与个人账户页：不进索引。
 *
 * 这类页面此前继承的是「canonical 指向首页」，比不声明还糟——等于把后台的内容
 * 算到首页头上。robots.txt 是 `Allow: /`，所以拦截只能落在页面自己的 meta 上。
 * `follow` 保留：不索引这一页，但页内指向公开页的链接照常传递。
 */
export const NOINDEX: Metadata['robots'] = { index: false, follow: true };
