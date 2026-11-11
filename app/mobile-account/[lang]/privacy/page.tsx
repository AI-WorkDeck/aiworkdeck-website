import { type Locale } from '@/i18n-config';
import { LegalDoc } from '@/components/legal/LegalDoc';
import { mobilePrivacy, mobilePrivacyLinks } from '@/content/legal/mobile-privacy';
import { loadLegalDoc } from '@/content/legal';
import { crossSiteUrl, siteConfig } from '@/lib/site-config';

export default async function MobilePrivacyPage({ params, searchParams }: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ scope?: string }>;
}) {
    const { lang } = await params;
    const { scope } = await searchParams;
    const { doc, referenceNotice } = scope === 'general'
        ? await loadLegalDoc('privacy', lang)
        : { doc: mobilePrivacy(lang), referenceNotice: undefined };
    const links = mobilePrivacyLinks(lang);
    return <LegalDoc doc={doc} referenceNotice={referenceNotice} relatedResources={
        <nav aria-label={links.related} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white">
            <a className="underline" href={`/mobile-account/${lang}/deletion`}>{links.deletion}</a>
            <a className="underline" href={`/mobile-account/${lang}/privacy${scope === 'general' ? '' : '?scope=general'}`}>{scope === 'general' ? links.mobile : links.general}</a>
            <a className="underline" href={crossSiteUrl(siteConfig.otherSite.id, `/mobile-account/${lang}/privacy`)}>{links.other}</a>
        </nav>
    } />;
}
