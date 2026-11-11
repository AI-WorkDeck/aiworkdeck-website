import type { Metadata } from 'next';
import { pickLocale, toBaseLocale, type Locale } from '@/i18n-config';
import { SITE_ID, siteConfig, US_SITE_ORIGIN } from '@/lib/site-config';
import { publicEntityForRequest } from '@/lib/request-entity';
import {
    ABOUT_COPY,
    ABOUT_COPY_CN,
    ABOUT_COPY_US,
    CN_REGISTRY_URL,
    DE_REGISTRY_URL,
    HK_REGISTRY_URL,
    formatIncorporationDate,
} from '@/content/about/company';
import { PageHero } from '@/components/layout/PageHero';
import { pageAlternates } from '@/lib/page-metadata';

/**
 * 公司页：登载运营主体与授权代表，供支付/平台/供应商的合规核验当「公开来源」引用。
 *
 * 国内站（2026-11 起）只登主体本身：名称、统一社会信用代码、住所、联系邮箱——都已在站内
 * 法律文本公开、可在国家企业信用信息公示系统核对。代表人角色没有据以登载的登记文件，
 * **国内站不渲染人员一节**——这页的价值就在于每一条都能在登记机关对上，宁可没有，不可写不准。
 *
 * 同一个国际站进程挂着两个域名，这页按请求的 Host 换主体：
 * workdeck.ai 登香港公司、公司注册处；aiworkdeck.us 登美国公司、特拉华州州务卿。
 * 核验方是按**域名注册人**回溯运营主体的，.us 域名登记在美国公司名下却只登香港公司，
 * 这页就白登了。缔约主体不随之变——法律文本仍是香港公司，见 lib/site-config.ts。
 * 代价是这页从 SSG 退成按请求渲染（读了 Host 头），它本来也不在热路径上。
 *
 * 服务端组件、零 JS：核验方常常是抓静态 HTML 的爬虫或人工点开看，
 * 关键事实不能等客户端渲染。
 */

function copyFor(lang: Locale, isUs: boolean) {
    const copy = SITE_ID === 'cn' ? ABOUT_COPY_CN : isUs ? ABOUT_COPY_US : ABOUT_COPY;
    return pickLocale(copy, lang);
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    // generateMetadata 同样能读 Host：标题与描述要跟着页面上登的主体走，
    // 否则 .us 上的分享卡片会说是香港公司。
    const { isUs } = await publicEntityForRequest();
    const copy = copyFor(lang, isUs);
    return {
        title: copy.title,
        description: copy.intro.slice(0, 160),
        // 不发跨站 hreflang：两站登的是不同主体，不是同一页的译本。
        // canonical 在 .us 上也仍指 workdeck.ai：两个域名是同一份内容的别名，
        // 各自自指等于告诉搜索引擎「这里有两份一模一样的站」。
        alternates: pageAlternates(lang, '/about'),
    };
}

export default async function AboutPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const { entity, isUs } = await publicEntityForRequest();
    const copy = copyFor(lang, isUs);
    const isCn = SITE_ID === 'cn';
    const registryUrl = isCn ? CN_REGISTRY_URL : isUs ? DE_REGISTRY_URL : HK_REGISTRY_URL;
    const siteOrigin = isUs ? US_SITE_ORIGIN : siteConfig.origin;

    const facts: Array<{ label: string; value: string; href?: string }> = [
        { label: copy.labels.nameEn, value: entity.nameEn },
    ];
    // 没有中文法定名称的主体（美国公司）**不渲染这一行**，而不是渲染一个空值：
    // 空着的「注册中文名称」会被核验方读成「登记里有中文名但我们没写」。
    if (entity.nameZh) {
        facts.push({ label: copy.labels.nameZh, value: entity.nameZh });
    }
    facts.push({ label: pickLocale(entity.registrationLabel, lang), value: entity.registrationNo });
    if (entity.incorporatedOn) {
        const sep = toBaseLocale(lang) === 'en' ? ', ' : '，';
        facts.push({
            label: copy.labels.incorporated,
            value: `${formatIncorporationDate(entity.incorporatedOn, lang)}${sep}${copy.incorporationPlace}`,
        });
    }
    facts.push(
        { label: copy.labels.registeredOffice, value: pickLocale(entity.registeredAddress, lang) },
        { label: copy.labels.website, value: siteOrigin, href: siteOrigin },
        { label: copy.labels.contact, value: entity.contactEmail, href: `mailto:${entity.contactEmail}` }
    );

    // schema.org 的 PostalAddress 要拆成字段，而 registeredAddress 是整行文本，
    // 拆不出来——所以两个主体各写一份，字段值与上面那一行**同源同文**，
    // 不允许出现「版面写 A、JSON-LD 写 B」。
    const postalAddress = isCn
        ? { '@type': 'PostalAddress', addressLocality: 'Beijing', addressCountry: 'CN' }
        : isUs
        ? {
              '@type': 'PostalAddress',
              streetAddress: '8 The Green, STE A',
              addressLocality: 'Dover',
              addressRegion: 'DE',
              postalCode: '19901',
              addressCountry: 'US',
          }
        : {
              '@type': 'PostalAddress',
              streetAddress: 'Room 721A, 7/F, Star House, 3 Salisbury Road',
              addressLocality: 'Tsim Sha Tsui, Kowloon',
              addressRegion: 'Hong Kong',
              addressCountry: 'HK',
          };
    // 人的头衔按公开档案给：香港有董事登记，特拉华州公开档案上只有发起人。
    const person = isUs
        ? { name: 'Zewei Han', alternateName: '韩泽伟', jobTitle: 'Founder and Incorporator' }
        : { name: 'Zewei Han', alternateName: '韓澤偉', jobTitle: 'Founder and Director' };

    // 机器可读的同一组事实：核验方的自动化流程读 schema.org 比读版面可靠
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'AI WorkDeck',
        legalName: entity.nameEn,
        ...(entity.nameZh ? { alternateName: entity.nameZh } : {}),
        url: siteOrigin,
        logo: `${siteOrigin}/logo.png`,
        email: entity.contactEmail,
        ...(entity.incorporatedOn ? { foundingDate: entity.incorporatedOn } : {}),
        identifier: {
            '@type': 'PropertyValue',
            name: isCn ? 'Unified Social Credit Code' : isUs ? 'Delaware File Number' : 'Hong Kong Company Registration Number',
            value: entity.registrationNo,
        },
        address: postalAddress,
        // 国内站没有可据以登载的人员登记文件：不发 founder / employee
        ...(isCn ? {} : {
            founder: { '@type': 'Person', name: person.name, alternateName: person.alternateName },
            employee: [
                {
                    '@type': 'Person',
                    name: person.name,
                    alternateName: person.alternateName,
                    jobTitle: person.jobTitle,
                },
            ],
        }),
    };

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* 全站统一深色刊物式页头（dev-board#328） */}
            <PageHero eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.intro} size="compact" width="3xl" />

            <div className="container mx-auto px-4 md:px-8 max-w-3xl pt-2">

                {/* 授权代表：核验方要找的就是这一段，放在主体资料之前（国内站没有，整节不渲染） */}
                {copy.people.length > 0 && <section id="people" className="mt-14 scroll-mt-28">
                    <h2 className="font-display mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                        {copy.peopleTitle}
                    </h2>
                    <div className="flex flex-col gap-5">
                        {copy.people.map(person => (
                            <article
                                key={person.name}
                                className="rounded-xl border border-neutral-gray-light/90 bg-white p-6 md:p-8"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <h3 className="font-display text-xl font-semibold text-neutral-dark-bg">
                                        {person.name}
                                    </h3>
                                    <span className="text-[15px] text-neutral-gray-medium">{person.nameAlt}</span>
                                </div>
                                <p className="mt-1.5 text-[13px] uppercase tracking-[0.14em] text-king-forest">
                                    {person.role}
                                </p>
                                <div className="mt-5 flex flex-col gap-4">
                                    {person.paragraphs.map((text, i) => (
                                        <p key={i} className="text-[15px] leading-[1.95] text-neutral-gray-dark">
                                            {text}
                                        </p>
                                    ))}
                                </div>
                                <p className="mt-6 border-t border-neutral-gray-light pt-4 text-[13px] text-neutral-gray-medium">
                                    {copy.contactLabel}
                                    {' · '}
                                    <a
                                        href={`mailto:${entity.contactEmail}`}
                                        className="text-king-forest transition-colors hover:underline"
                                    >
                                        {entity.contactEmail}
                                    </a>
                                </p>
                            </article>
                        ))}
                    </div>
                </section>}

                <section id="company" className="mt-14 scroll-mt-28">
                    <h2 className="font-display mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                        {copy.companyTitle}
                    </h2>
                    <dl className="rounded-xl border border-neutral-gray-light/90 bg-white">
                        {facts.map(fact => (
                            <div
                                key={fact.label}
                                className="flex flex-col gap-1 border-b border-neutral-gray-light/70 px-6 py-4 last:border-b-0 sm:flex-row sm:gap-6 md:px-8"
                            >
                                <dt className="text-[13px] leading-[1.9] text-neutral-gray-medium sm:w-56 sm:flex-shrink-0">
                                    {fact.label}
                                </dt>
                                <dd className="min-w-0 flex-1 text-[15px] leading-[1.9] text-neutral-gray-dark">
                                    {fact.href ? (
                                        <a
                                            href={fact.href}
                                            className="text-king-forest transition-colors hover:underline"
                                        >
                                            {fact.value}
                                        </a>
                                    ) : (
                                        fact.value
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section id="verify" className="mt-14 scroll-mt-28">
                    <h2 className="font-display mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                        {copy.registryTitle}
                    </h2>
                    <div className="border-l-2 border-king-forest bg-king-forest-lightest/40 py-5 pl-5 pr-4">
                        <p className="text-[15px] leading-[1.95] text-neutral-gray-dark">{copy.registryText}</p>
                        <p className="mt-4">
                            <a
                                href={registryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[14px] text-king-forest transition-colors hover:underline"
                            >
                                {copy.registryLinkLabel}
                            </a>
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
