import { type Locale } from '@/i18n-config';
import { LegalDoc } from '@/components/legal/LegalDoc';
import { loadLegalDoc } from '@/content/legal';
import { mobilePrivacyLinks } from '@/content/legal/mobile-privacy';

export default async function MobileTermsPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const { doc, referenceNotice } = await loadLegalDoc('terms', lang);
    return <LegalDoc doc={doc} referenceNotice={referenceNotice} relatedResources={
        <a className="text-sm text-white underline" href={`/mobile-account/${lang}/privacy`}>{mobilePrivacyLinks(lang).mobile}</a>
    } />;
}
