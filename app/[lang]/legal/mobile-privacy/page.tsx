import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { LegalDoc } from '@/components/legal/LegalDoc';
import { mobilePrivacy, mobilePrivacyLinks } from '@/content/legal/mobile-privacy';
import { pageAlternates } from '@/lib/page-metadata';
import { crossSiteUrl, siteConfig } from '@/lib/site-config';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const doc = mobilePrivacy(lang);
    return { title: doc.title, description: doc.intro.slice(0, 160), alternates: pageAlternates(lang, '/legal/mobile-privacy') };
}

export default async function MobilePrivacyPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const links = mobilePrivacyLinks(lang);
    return <LegalDoc doc={mobilePrivacy(lang)} relatedResources={
        <nav aria-label={links.related} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white">
            <a className="underline" href={`/${lang}/legal/mobile-account-deletion`}>{links.deletion}</a>
            <a className="underline" href={`/${lang}/legal/privacy`}>{links.general}</a>
            <a className="underline" href={crossSiteUrl(siteConfig.otherSite.id, `/${lang}/legal/mobile-privacy`)}>{links.other}</a>
        </nav>
    } />;
}
