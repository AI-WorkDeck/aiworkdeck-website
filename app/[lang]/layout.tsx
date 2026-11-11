import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Inter, Instrument_Serif, Noto_Serif_SC } from 'next/font/google';
import '../globals.css';
import '../website-design.css';
import '../workspace-tour.css';
import '../ide-home.css';
import { i18n, isLocale, LOCALE_META, type Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { Suspense } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { FeatureRequestWidget } from '@/components/FeatureRequestWidget';
import { siteConfig } from '@/lib/site-config';
import { JsonLd } from '@/components/seo/JsonLd';
import { organizationJsonLd, webSiteJsonLd } from '@/lib/structured-data';
import { getGithubStars } from '@/lib/github-stars';

const inter = Inter({ subsets: ['latin'], variable: '--font-interface' });
// 首页「纸与墨」展示字体（官网升级/01-诊断与方案.md）：西文 Instrument Serif，
// 中文宋体用 Noto Serif SC。中文字体不预加载——按 unicode-range 分片，只下载标题用到的字。
const displaySerif = Instrument_Serif({ subsets: ['latin', 'latin-ext'], weight: '400', style: ['normal', 'italic'], variable: '--font-display-serif' });
const displaySerifCjk = Noto_Serif_SC({ weight: ['500', '600'], variable: '--font-display-serif-cjk', preload: false });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const resolvedLang: Locale = isLocale(lang) ? lang : i18n.defaultLocale;
  const dict = await getDictionary(resolvedLang);
  const seo = dict.common.seo;
  return {
    // 裸品牌名做 title 是零区分度的（"workdeck" 已被西班牙 Workdeck Solutions SL
    // 等实体占据）。default 换成带品类词的首页标题，template 让子页自报的短标题
    // 统一挂上品牌后缀——各页因此**不再自己拼 " · AI WorkDeck"**，拼了就是双重后缀。
    title: {
      default: seo.homeTitle,
      template: '%s · AI WorkDeck',
    },
    // productTagline 是产品口号（还留给各处 UI 用），不是给搜索引擎的自述：
    // 它一个品类词都没有。这里改用 seo.homeDescription。
    description: seo.homeDescription,
    // 社交与 IM 分享卡片。图是静态 public/og.png（scripts/gen-og.mjs 一次性生成）——
    // 生产机 1.8G 内存，不用 ImageResponse 每次请求现渲染。
    //
    // 这里刻意**不写** title / description / url：布局层的 openGraph 对象会被子页整体继承
    // （不是逐字段合并），写了首页标题，分享 /marketplace 出来的卡片就还是首页标题。
    // 留空让 Next 按各页自己解析出的 title / description 回填。
    openGraph: {
      type: 'website',
      siteName: 'AI WorkDeck',
      locale: LOCALE_META[resolvedLang].ogLocale,
      images: ['/og.png'],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og.png'],
    },
    // 双站：两站内容高度相似但**不是**互为镜像（不同缔约主体、不同币种、不同适用法）。
    // 所以用 hreflang 互指、canonical 指向自己，而不是把国际站 canonical 到国内站——
    // 后者会让搜索引擎把国际站的页面整体判成重复内容丢弃，而两站服务不同法域的用户，
    // 都需要被独立索引。（改造前新加坡机是纯镜像，nginx 那条 canonical 头是当时的正确做法，
    // 已随 doc/nginx-workdeck-ai.conf 一并移除。）
    // metadataBase 留在这里：它与路径无关，且相对 URL 要靠它解析。
    metadataBase: new URL(siteConfig.origin),
    // 360 浏览器双内核：默认走「极速模式」（Chromium），别落进 IE 兼容内核。
    // 2026-09-16 线上实测（dev-board#705）：Windows 360 浏览器在 /zh/account 切到 Trident/7.0
    // （IE11）内核后，Next 16 + React 19 的页面直接崩，360 弹「此网页出现问题已为您自动恢复」，
    // 验证码按钮永远点不动；同一台机切回 Chromium 内核发码、登录都正常。
    // 官方文档 browser.360.cn/se/help/kernel.html：读到 renderer=webkit 立即切极速内核，
    // 并对整个二级域名生效；优先级低于用户手动切换。force-rendering 是社区通行的补充写法，
    // 官方文档未列，无副作用，一并声明。
    other: { renderer: 'webkit', 'force-rendering': 'webkit' },
    // canonical 与 hreflang **不在这里给**：布局层的 metadata 会被所有子页继承，
    // 而布局拿不到 pathname，写在这里的 canonical 只能是 `/{lang}`，
    // 于是每个子页都声明自己是首页的副本。改由各页调 `pageAlternates()` 自报家门，
    // 理由与 hreflang 的适用边界写在 lib/page-metadata.ts。
  };
}

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

/**
 * `[lang]` 只认 en / zh，别的一律 404。
 *
 * 修的是一个真实的收录事故：middleware 的 matcher 把图片扩展名排除在 locale
 * 重定向之外，于是 `/foo.png`、浏览器必发的 `/apple-touch-icon.png` 这类路径
 * 直接落到本路由，`foo.png` 被当成 `[lang]`，getDictionary 静默回落默认字典，
 * 结果是**返回 200 的整份首页副本、canonical 还自指**——无限重复内容。
 * 顺带也修掉 `<html lang="foo.png">` 这个非法 BCP-47 标签。
 *
 * 两道一起上，因为单独任何一道都不够：
 * - `dynamicParams = false` 只管得住**预渲染**的子路由（/about、/legal/*、
 *   /membership 这些 SSG 页）。首页与广场等 13 处 `force-dynamic` 页不进预渲染
 *   清单，Next 照样按请求渲染——本地实测 `/foo.png` 仍是 200 首页。
 * - 所以在布局里再显式校验一次；布局是 `[lang]` 下每个页面的必经之路。
 */
export const dynamicParams = false;

function assertLocale(lang: string): asserts lang is Locale {
  if (!(i18n.locales as readonly string[]).includes(lang)) notFound();
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  assertLocale(lang);
  const dict = await getDictionary(lang);
  const githubStars = getGithubStars();

  const meta = LOCALE_META[lang];

  return (
    <html lang={meta.bcp47} dir={meta.dir} className="scroll-smooth">
      <body className={`site-shell ${inter.className} ${inter.variable} ${displaySerif.variable} ${displaySerifCjk.variable}`}>
        {/* 实体锚点：全站每页都发，告诉搜索引擎与 AI「AI WorkDeck 是谁、官网是哪个」。
            页面级的 SoftwareApplication / Skill 节点由各页自己补。 */}
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={webSiteJsonLd(lang)} />
        <div className="flex min-h-screen flex-col">
          <Navbar lang={lang} dict={dict} githubStars={githubStars} />
          <a href="#main-content" className="skip-link">{dict.common.skipToContent}</a>
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer lang={lang} dict={dict} />
        </div>
        {/* 全站悬浮「提交需求」按钮（admin 下组件自行隐藏）。
            Suspense 是 useSearchParams 的硬要求：不包会让整棵静态页树退回 CSR。 */}
        <Suspense fallback={null}>
          <FeatureRequestWidget lang={lang} t={dict.featureRequestPage} />
        </Suspense>
      </body>
    </html>
  );
}
