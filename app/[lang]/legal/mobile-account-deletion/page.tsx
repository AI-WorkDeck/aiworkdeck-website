import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { MobileAccountDeletion } from '@/components/legal/MobileAccountDeletion';
import { mobileDeletionCopy } from '@/content/legal/mobile-account-deletion';
import { pageAlternates } from '@/lib/page-metadata';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    return {
        title: mobileDeletionCopy(lang).title,
        alternates: pageAlternates(lang, '/legal/mobile-account-deletion'),
    };
}

export default async function MobileAccountDeletionPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    return <MobileAccountDeletion lang={lang} />;
}
