import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { SITE_ID } from '@/lib/site-config';
import { resolveAppLink } from '@/lib/mobile-stores';
import { PageHero } from '@/components/layout/PageHero';
import { MobileAppSection } from '../start/MobileAppSection';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return { title: dict.startPage.mobileApp.title, robots: { index: false } };
}

/** Landing for the smart /app link when the device can't be sent straight to a store. */
export default async function GetAppPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const t = (await getDictionary(lang)).startPage.mobileApp;
    const ua = (await headers()).get('user-agent') ?? '';
    const decision = resolveAppLink(ua, SITE_ID);
    const wechatBlocked = decision.kind === 'choose' && decision.wechatBlocked;
    // Desktop browsers land here from the /app smart link; offer them the desktop app too.
    const onComputer = !/iPhone|iPad|Android|Mobile/i.test(ua);
    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <PageHero eyebrow="AI WorkDeck" title={t.title} size="compact" width="4xl" />
            <div className="container mx-auto px-4 md:px-8 max-w-4xl pt-7 md:pt-8">
                {wechatBlocked && (
                    <p className="mb-5 rounded-xl border border-neutral-gray-light bg-white p-4 text-sm text-neutral-gray-dark">{t.wechatHint}</p>
                )}
                <MobileAppSection t={t} ua={ua} showQr hideTitle />
                {onComputer && (
                    <p className="mt-6 text-sm text-neutral-gray-dark">
                        {t.desktopHint}{' '}
                        <Link href={`/${lang}/start`} className="font-semibold text-king-forest underline underline-offset-4">{t.desktopLink}</Link>
                    </p>
                )}
            </div>
        </div>
    );
}
