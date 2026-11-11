import { type Locale } from '@/i18n-config';
import { PageHero } from '@/components/layout/PageHero';
import { crossSiteUrl, siteConfig } from '@/lib/site-config';
import { mobileDeletionCopy } from '@/content/legal/mobile-account-deletion';

export function MobileAccountDeletion({ lang, mobileOnly = false }: { lang: Locale; mobileOnly?: boolean }) {
    const copy = mobileDeletionCopy(lang);
    const email = siteConfig.legalEntity.contactEmail;
    const mailto = `mailto:${email}?subject=${encodeURIComponent(copy.subject)}`;
    return <div className="min-h-screen bg-neutral-gray-pale pb-24">
        <PageHero size="compact" width="6xl" eyebrow={copy.eyebrow} title={copy.title}
            subtitle={copy.operator} />
        <article className="container mx-auto max-w-3xl space-y-8 px-4 py-10 text-[15px] leading-relaxed text-neutral-gray-dark md:px-8">
            <section className="space-y-4 rounded-xl border border-king-forest/25 bg-white p-6">
                <h2 className="text-xl font-semibold">{copy.requestTitle}</h2>
                <p>{copy.requestBody}</p>
                <a href={mailto} className="inline-block rounded-lg bg-king-forest px-5 py-3 font-medium text-white">{copy.requestAction}</a>
                <p>{copy.requestDetails}</p>
                <p>{copy.response}</p>
            </section>
            <section className="space-y-3">
                <h2 className="text-xl font-semibold">{copy.inAppTitle}</h2>
                <p>{copy.inAppBody}</p>
            </section>
            <section className="space-y-3">
                <h2 className="text-xl font-semibold">{copy.scopeTitle}</h2>
                <ul className="list-disc space-y-3 ps-5">
                    <li>{copy.scopeMobile}</li>
                    <li>{copy.scopeRetained}</li>
                    <li>{copy.scopeLocal}</li>
                </ul>
            </section>
            <section className="space-y-3">
                <h2 className="text-xl font-semibold">{copy.regionTitle}</h2>
                <p>{copy.regionBody}</p>
                <div className="flex flex-wrap gap-5 text-king-forest underline">
                    <a href={mobileOnly ? `/mobile-account/${lang}/privacy` : `/${lang}/legal/mobile-privacy`}>{copy.mobilePrivacyLink}</a>
                    <a href={mobileOnly ? `/mobile-account/${lang}/privacy?scope=general` : `/${lang}/legal/privacy`}>{copy.generalPrivacyLink}</a>
                    <a href={crossSiteUrl(siteConfig.otherSite.id, mobileOnly ? `/mobile-account/${lang}/deletion` : `/${lang}/legal/mobile-account-deletion`)}>{copy.otherRegionLink}</a>
                </div>
            </section>
        </article>
    </div>;
}
