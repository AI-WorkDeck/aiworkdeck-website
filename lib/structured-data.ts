import { LOCALE_META, type Locale } from '@/i18n-config';
import { siteConfig } from '@/lib/site-config';

/**
 * JSON-LD 载荷的唯一产地（渲染在 components/seo/JsonLd.tsx）。
 *
 * 红线：**这里的每一个字段都必须能在页面可见文本或公开事实里找到出处**。
 * 结构化数据与页面内容不一致是 Google 明令的富结果处罚项，而对 AI 搜索来说
 * 更糟——被引用的是这份 JSON，编出来的用户数、客户名会原样进模型答案。
 * 所以只写：许可证、支持平台、免费档、仓库与 Product Hunt 地址这类硬事实，
 * 不写任何数量、评分、客户名。
 */

/** 仓库与发布位置：站内已在 Hero / Pricing / updates 里以可见链接出现过。 */
export const REPO_URL = 'https://github.com/AI-WorkDeck/aiworkdeck';
export const PRODUCT_HUNT_URL = 'https://www.producthunt.com/posts/ai-workdeck';
/** AGPLv3：定价区与 README 都以可见文本写着「AGPLv3 开源」。 */
export const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

const ORG_ID = `${siteConfig.origin}/#organization`;
const SITE_ID_URL = `${siteConfig.origin}/#website`;

/** 品牌实体。`@id` 固定，供同页其他节点（WebSite / SoftwareApplication）引用。 */
export function organizationJsonLd(): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': ORG_ID,
        name: 'AI WorkDeck',
        url: siteConfig.origin,
        logo: `${siteConfig.origin}/icon.png`,
        // 实体消歧的关键：裸品牌词 "workdeck" 被多家同名公司占据，
        // sameAs 是告诉搜索引擎「此 AI WorkDeck 即彼 GitHub 仓库」的唯一办法。
        sameAs: [REPO_URL, PRODUCT_HUNT_URL],
    };
}

export function webSiteJsonLd(lang: Locale): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': SITE_ID_URL,
        name: 'AI WorkDeck',
        url: `${siteConfig.origin}/${lang}`,
        inLanguage: LOCALE_META[lang].bcp47,
        publisher: { '@id': ORG_ID },
    };
}

/**
 * 产品本体。`offers` 表达的是**社区版免费**这一件事（价格 0），
 * 不是「全站免费」——AI 等服务按用量计费，那部分不在这个节点里声明。
 */
export function softwareApplicationJsonLd(
    lang: Locale,
    opts: { name: string; description: string }
): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: opts.name,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Legal AI workspace',
        operatingSystem: 'Windows, macOS',
        description: opts.description,
        url: `${siteConfig.origin}/${lang}`,
        downloadUrl: `${siteConfig.origin}/${lang}/start`,
        license: LICENSE_URL,
        softwareHelp: REPO_URL,
        inLanguage: LOCALE_META[lang].bcp47,
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: siteConfig.currency,
        },
        publisher: { '@id': ORG_ID },
    };
}

/** Skill 详情页：一条 Skill 是本产品套件里的一个组件，不是独立软件。 */
export function skillJsonLd(
    lang: Locale,
    opts: { id: string; name: string; description: string; version: string }
): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: opts.name,
        description: opts.description,
        softwareVersion: opts.version,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Legal AI Skill',
        applicationSuite: 'AI WorkDeck',
        operatingSystem: 'Windows, macOS',
        url: `${siteConfig.origin}/${lang}/skills/${opts.id}`,
        isPartOf: { '@id': SITE_ID_URL },
        publisher: { '@id': ORG_ID },
    };
}

/**
 * FAQPage：只给**页面上确实可见**的问答。
 *
 * Google 的 FAQ 富结果要求答案与页面内容逐字一致，AI 搜索则会把这段 JSON 直接当答案抄，
 * 所以调用方必须传渲染在页面上的同一份数组（见 app/[lang]/faq/page.tsx 的
 * `pricingFaqItems`），不许为结构化数据另写一份「更好听」的答案。
 */
export function faqPageJsonLd(items: { q: string; a: string }[]): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map(item => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
    };
}
