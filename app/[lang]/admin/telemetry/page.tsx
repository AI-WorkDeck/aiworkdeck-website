import { getDictionary } from '@/get-dictionary';
import { isLocale, i18n } from '@/i18n-config';
import { AdminWorkspace } from '../AdminWorkspace';
import { SITE_ID } from '@/lib/site-config';
import type { Metadata } from 'next';
import { TelemetryDashboard } from './TelemetryDashboard';
import { NOINDEX } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';

/** 不进索引，同 /admin。 */
export const metadata: Metadata = { robots: NOINDEX };

/** 使用统计看板（维护者后台子页；鉴权在 API 层与面板内完成） */
export default async function TelemetryPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ adminSite?: string }> }) {
    const { lang: requestedLang } = await params;
    const lang = isLocale(requestedLang) ? requestedLang : i18n.defaultLocale;
    const { adminSites } = await getDictionary(lang);
    const { adminSite } = await searchParams;
    const initialSite = adminSite === 'cn' || adminSite === 'intl' ? adminSite : SITE_ID;
    return (
        <div className="relative min-h-screen bg-neutral-gray-pale pt-28 pb-24 overflow-hidden">
            {/* 与 /admin 同一层品牌光晕，两个页面切换时底色不跳 */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-king-forest-lightest/70 to-transparent"
            />
            <div className="relative container mx-auto px-4 md:px-8 max-w-7xl">
                <AdminWorkspace initialTab={initialSite} initialCircleSite={SITE_ID} sitesOnly copy={adminSites} lang={lang}><TelemetryDashboard /></AdminWorkspace>
            </div>
        </div>
    );
}
