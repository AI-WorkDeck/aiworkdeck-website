import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { pickLocale, toBaseLocale, type Locale } from '@/i18n-config';
import type { getDictionary } from '@/get-dictionary';
import { siteConfig } from '@/lib/site-config';
import { publicEntityForRequest } from '@/lib/request-entity';
import { ProductHuntBadge } from '@/components/ProductHuntBadge';
import { getArticles, pickShortTitle } from '@/lib/articles';
import { REPO_URL } from '@/lib/structured-data';
import { communityHomePath } from '@/lib/edition-paths';

interface FooterProps {
    lang: Locale;
    dict: Awaited<ReturnType<typeof getDictionary>>;
}

export async function Footer({ lang, dict }: FooterProps) {
    // 国际站的页脚主体按请求的 Host 取：同一个进程同时服务 workdeck.ai 与
    // aiworkdeck.us，后者要露美国主体（见 lib/request-entity.ts）。
    //
    // **国内站不读 Host 头**，虽然 publicEntityForHost 在 cn 构建下必然返回本站主体。
    // 原因是代价不在取值上：只要渲染期真的调了 `headers()`，整棵 `[lang]` 路由树就
    // 从预渲染退成按请求渲染。国际站认了这个代价（换主体是这件事的目的），国内站
    // 没有理由陪着退。`siteConfig.id` 是构建期常量，cn 的产物里这条分支直接消失。
    const publicEntity =
        siteConfig.id === 'intl'
            ? (await publicEntityForRequest()).entity
            : siteConfig.legalEntity;
    const f = dict.common.footer;
    const nav = dict.common.nav;

    // 四组导航（dev-board#325：站点功能长出了 Skill 广场/榜单/投稿/插件/社区/聊天室/
    // 会员，页脚跟上）。文案能复用 nav 的就复用，不另造一份漂移源。
    const groups: { title: string; links: { href: string; label: string; highlight?: boolean; external?: boolean }[] }[] = [
        {
            title: f.product,
            links: [
                { href: `/${lang}/start`, label: dict.common.webWorkbench.download, highlight: true },
                { href: `/${lang}/workspace`, label: f.features },
                { href: `/${lang}/videos`, label: f.videos },
                { href: communityHomePath(lang), label: f.communityEdition },
                { href: `/${lang}/pricing`, label: f.pricing },
                { href: `/${lang}/deployment`, label: f.deployment },
                { href: `/${lang}/faq`, label: f.faq },
                // 账目公开（dev-board#611）：与定价同组——「为什么收这 20%」与「这 20% 去哪了」是同一个问题的两半
                { href: `/${lang}/transparency`, label: f.transparency },
                // 源码入口（dev-board#508）：此前词典里有一个没人渲染的 f.download 键
                { href: REPO_URL, label: f.sourceGithub, external: true },
                { href: `/${lang}/updates`, label: f.updates },
                // 需求表单已改为全站悬浮按钮弹窗；这条链接借道 query 参数让悬浮件自动弹开
                { href: `${communityHomePath(lang)}?feature-request=1`, label: f.featureRequest },
            ],
        },
        {
            title: dict.marketplacePage.title,
            links: [
                { href: `/${lang}/marketplace`, label: nav.marketplace },
                { href: `/${lang}/marketplace/plugins`, label: f.plugins },
                { href: `/${lang}/marketplace/mcp`, label: dict.marketplacePage.tabMcp },
                { href: `/${lang}/skills/charts`, label: f.charts },
                { href: `/${lang}/skills/submit`, label: nav.submit },
                { href: `/${lang}/plugins/submit`, label: f.submitPlugin },
                { href: `/${lang}/plugins/developer`, label: f.developerCenter },
            ],
        },
        {
            title: nav.community,
            links: [
                { href: `/${lang}/community`, label: f.forum },
                { href: `/${lang}/community/chat`, label: nav.chatroom },
                { href: `/${lang}/membership`, label: f.membership },
                { href: `/${lang}/quiz`, label: f.quiz },
            ],
        },
        {
            title: f.articles,
            // 只留 3 条代表性文章 + 总入口，标题从 data/articles.json 取，不在这里硬编码
            links: [
                ...getArticles()
                    .slice(0, 3)
                    .map(a => ({
                        href: a.url,
                        label: pickShortTitle(a, lang),
                        external: true,
                    })),
                { href: `/${lang}/articles`, label: f.allArticles },
            ],
        },
    ];

    return (
        <footer className="site-footer border-t border-[#d7c5a1]/60 bg-[#efebe1]">
            {/* Main Footer Content */}
            <div className="mx-auto max-w-7xl px-4 md:px-8 py-12 md:py-16">
                <div className="mb-10 flex flex-col gap-3 min-[480px]:flex-row">
                    <Button asChild><Link href={`/${lang}/start`}>{dict.common.webWorkbench.download}</Link></Button>
                </div>
                <div className="flex flex-col lg:flex-row gap-10 lg:gap-12">

                    {/* Brand / Logo Section (Left) */}
                    <div className="lg:w-48 flex flex-col gap-4 shrink-0">
                        <Link href={`/${lang}`} className="flex min-h-11 items-center">
                            <img src="/logo.png" alt="AI WorkDeck" className="h-7 w-auto" />
                        </Link>
                        <p className="text-neutral-gray-medium text-sm leading-relaxed">
                            {dict.common.productTagline}
                        </p>
                        {/* Product Hunt 徽章（dev-board#370）：页脚是 PH 官方建议的第二落点 */}
                        <ProductHuntBadge theme="neutral" />
                    </div>

                    {/* Links Grid (Right) */}
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
                        {groups.map((group) => (
                            <div key={group.title} className="flex min-w-0 flex-col">
                                <h4 className="text-xs font-semibold text-neutral-gray-dark mb-3">{group.title}</h4>
                                {group.links.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        target={link.external ? '_blank' : undefined}
                                        rel={link.external ? 'noopener noreferrer' : undefined}
                                        className={link.highlight
                                            ? 'inline-flex min-h-11 items-center rounded-sm text-king-forest font-medium leading-snug hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest'
                                            : 'inline-flex min-h-11 items-center rounded-sm text-neutral-gray-dark leading-snug hover:text-king-forest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest'}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-gray-light"></div>

            {/* Legal Footer Bar */}
            {/* 宽屏压成一行：左边版权与主体信息，右边法律链接；放不下时左侧自行折行。窄屏仍纵向堆叠。 */}
            <div className="mx-auto max-w-7xl px-4 md:px-8 py-5 lg:py-3">
                <div className="flex flex-col gap-3 text-xs lg:flex-row lg:items-center lg:justify-between lg:gap-8">
                    {/* Copyright + 备案信息：境内服务器面向公众提供服务必须在首页底部标明
                        （《互联网信息服务管理办法》第十二条）。
                        判据是**服务器与域名的备案主体**，不是页面语种——所以 gate 是站点而不是 lang：
                        国内站的 /en 页面照样渲染备案号，国际站的 /zh 页面一个字都不能有
                        （workdeck.ai 是 .ai 域名 + 境外服务器，不可备案，标了就是虚假标注）。 */}
                    <div className="flex flex-col items-start gap-1.5 leading-relaxed lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-0">
                        <p className="text-neutral-gray-medium">
                            {dict.common.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
                        </p>
                        {/* 国际站必须完整露出主体：注册机关登记的法定名 + 注册编号。
                            境外服务（支付、平台入驻等）核验时按登记名逐字比对，
                            只露英文名会对不上「真善美承澤有限公司」这条登记记录。
                            aiworkdeck.us 这个 Host 上露的是美国主体（.us 域名登记在它名下，
                            核验方按域名注册人找运营主体），它没有中文法定名，
                            只渲染英文名——**不要为了版式对齐补一个中文译名**，
                            译名在特拉华州的查册里对不上，等于把这一行作废。
                            法律文本的缔约主体不受这里影响，仍是香港公司。 */}
                        {siteConfig.id === 'intl' ? (
                            <p className="text-neutral-gray-medium">
                                {publicEntity.nameZh
                                    ? (toBaseLocale(lang) === 'zh'
                                        ? `${publicEntity.nameZh}（${publicEntity.nameEn}）`
                                        : `${publicEntity.nameEn}（${publicEntity.nameZh}）`)
                                    : publicEntity.nameEn}
                                {' · '}
                                {pickLocale(publicEntity.registrationLabel, lang)} {publicEntity.registrationNo}
                            </p>
                        ) : (
                            <p className="text-neutral-gray-medium">
                                {siteConfig.showChineseEntityName && toBaseLocale(lang) === 'zh'
                                    ? siteConfig.legalEntity.nameZh
                                    : siteConfig.legalEntity.nameEn}
                            </p>
                        )}
                        {siteConfig.icpFiling && (
                            <Link
                                href="https://beian.miit.gov.cn/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center text-neutral-gray-medium transition-colors hover:text-king-forest"
                            >
                                {siteConfig.icpFiling}
                            </Link>
                        )}
                        {siteConfig.publicSecurityFiling && (
                            <span className="text-neutral-gray-medium">{siteConfig.publicSecurityFiling}</span>
                        )}
                    </div>

                    {/* Legal Links */}
                    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1">
                        {/* 公司页两站都有（国内站只登主体，见 app/[lang]/about/page.tsx）。
                            全站可达是刻意的：支付与平台的合规核验按「网站上的公开来源」取证，
                            只挂在某一页上的公司信息，核验方多半找不到。 */}
                        {(
                            <>
                                <Link
                                    href={`/${lang}/about`}
                                    className="inline-flex min-h-11 items-center rounded-sm text-neutral-gray-dark hover:text-king-forest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest"
                                >
                                    {dict.common.footer.about}
                                </Link>
                                <span className="text-neutral-gray-light">|</span>
                            </>
                        )}
                        <Link
                            href={`/${lang}/legal/privacy`}
                            className="inline-flex min-h-11 items-center rounded-sm text-neutral-gray-dark hover:text-king-forest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest"
                        >
                            {dict.common.footer.privacy}
                        </Link>
                        <span className="text-neutral-gray-light">|</span>
                        <Link
                            href={`/${lang}/legal/terms`}
                            className="inline-flex min-h-11 items-center rounded-sm text-neutral-gray-dark hover:text-king-forest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest"
                        >
                            {dict.common.footer.terms}
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
