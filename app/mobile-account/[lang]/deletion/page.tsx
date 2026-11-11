import { type Locale } from '@/i18n-config';
import { MobileAccountDeletion } from '@/components/legal/MobileAccountDeletion';

export default async function MobileDeletionPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    return <MobileAccountDeletion lang={lang} mobileOnly />;
}
