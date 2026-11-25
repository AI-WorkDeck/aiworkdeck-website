import type { Metadata } from 'next';
import { pickLocale, type Locale } from '@/i18n-config';
import { siteConfig, US_SITE_ORIGIN } from '@/lib/site-config';
import { publicEntityForRequest } from '@/lib/request-entity';
import { companyAboutCopy, CN_REGISTRY_URL, formatIncorporationDate } from '@/content/about/company';
import { getDictionary } from '@/get-dictionary';
import { PageHero } from '@/components/layout/PageHero';
import { pageAlternates } from '@/lib/page-metadata';

/** Company registration details shared by all service regions and domain aliases. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const { entity } = await publicEntityForRequest();
    const copy = companyAboutCopy(await getDictionary(lang), lang, entity);
    return {
        title: copy.title,
        description: copy.intro.slice(0, 160),
        // 保留既有分站 URL 与 canonical 策略。
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
    const copy = companyAboutCopy(await getDictionary(lang), lang, entity);
    const registryUrl = CN_REGISTRY_URL;
    const siteOrigin = isUs ? US_SITE_ORIGIN : siteConfig.origin;

    const facts: Array<{ label: string; value: string; href?: string }> = [
        { label: copy.labels.nameEn, value: entity.nameEn },
    ];
    if (entity.nameZh) {
        facts.push({ label: copy.labels.nameZh, value: entity.nameZh });
    }
    facts.push({ label: pickLocale(entity.registrationLabel, lang), value: entity.registrationNo });
    if (entity.incorporatedOn) {
        facts.push({
            label: copy.labels.incorporated,
            value: formatIncorporationDate(entity.incorporatedOn, lang),
        });
    }
    facts.push(
        { label: copy.registrationAuthority, value: pickLocale(entity.registrationAuthority, lang) },
        { label: copy.legalRepresentative, value: pickLocale(entity.legalRepresentative, lang) },
        { label: copy.labels.registeredOffice, value: pickLocale(entity.registeredAddress, lang) },
        { label: copy.labels.website, value: siteOrigin, href: siteOrigin },
        { label: copy.labels.contact, value: entity.contactEmail, href: `mailto:${entity.contactEmail}` }
    );

    const postalAddress = {
        '@type': 'PostalAddress',
        streetAddress: entity.registeredAddress.en,
        addressLocality: 'Beijing',
        addressCountry: 'CN',
    };

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
            name: entity.registrationLabel.en,
            value: entity.registrationNo,
        },
        address: postalAddress,
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

                <section id="company" className="mt-14 scroll-mt-28">
                    <h2 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
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
                    <h2 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                        {copy.registryLinkLabel}
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
