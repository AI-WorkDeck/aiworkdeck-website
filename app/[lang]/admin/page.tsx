import { getDictionary } from '@/get-dictionary';
import { isLocale, i18n } from '@/i18n-config';
import { AdminWorkspace, type AdminTab } from './AdminWorkspace';
import { SITE_ID } from '@/lib/site-config';
import type { Metadata } from 'next';
import { AdminPanel } from './AdminPanel';
import { NOINDEX } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';

/** 不进索引：后台无导航入口，而 robots.txt 是 `Allow: /`，拦截只能落在页面自己的 meta 上。 */
export const metadata: Metadata = { robots: NOINDEX };

/** 维护者后台（无导航入口，直接访问 /zh/admin；鉴权在 API 层与面板内完成） */
export default async function AdminPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ adminSite?: string; circleSite?: string }> }) {
    const { lang: requestedLang } = await params;
    const lang = isLocale(requestedLang) ? requestedLang : i18n.defaultLocale;
    const { adminSites } = await getDictionary(lang);
    const { adminSite, circleSite } = await searchParams;
    const initialTab: AdminTab = ['cn', 'intl', 'bqt', 'circle'].includes(adminSite ?? '') ? adminSite as AdminTab : SITE_ID;
    const initialCircleSite = circleSite === 'cn' || circleSite === 'intl' ? circleSite : SITE_ID;
    return (
        <div className="relative min-h-screen bg-neutral-gray-pale pt-28 pb-24 overflow-hidden">
            {/* 顶部一层极淡的品牌光晕，把大面积灰底从「后台工具」拉回官网的质感 */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-king-forest-lightest/70 to-transparent"
            />
            <div className="relative container mx-auto px-4 md:px-8 max-w-7xl">
                <AdminWorkspace initialTab={initialTab} initialCircleSite={initialCircleSite} copy={adminSites} lang={lang}><AdminPanel bailianManaged={adminSites.bailianManaged} /></AdminWorkspace>
            </div>
        </div>
    );
}
