'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Dictionary } from '@/get-dictionary';
import { LOCALE_META, type Locale } from '@/i18n-config';
import { SITE_ID, siteConfigOf, type SiteId } from '@/lib/site-config';
import { BqtAdmin } from './BqtAdmin';
import { CircleAdmin } from './CircleAdmin';

/** 顶部标签：前两个是站点切换；包晴天固定管国内站；Circle 律所两站各有一份，自带站点选择。 */
export type AdminTab = SiteId | 'bqt' | 'circle';
export const ADMIN_TABS: AdminTab[] = ['cn', 'intl', 'bqt', 'circle'];

function siteClient(site: SiteId, copy: Dictionary['adminSites'], lang: Locale) {
    const config = siteConfigOf(site);
    const url = (path: string) => {
        if (path === '/api/admin/login' || site === SITE_ID) return path;
        return `/api/admin/sites/${site}/${path.slice('/api/'.length)}`;
    };
    return {
        site, config, url, copy, locale: LOCALE_META[lang].bcp47,
        fetch: (path: string, init?: RequestInit) => window.fetch(url(path), { ...init, cache: 'no-store' }),
        pageUrl: (path: string) => `${path}?adminSite=${site}`,
        publicUrl: (path: string) => `${config.origin}${path}${path.includes('?') ? '&' : '?'}site=${site}`,
    };
}
const AdminSite = createContext<ReturnType<typeof siteClient> | null>(null);
export function useAdminSite() {
    const value = useContext(AdminSite);
    if (!value) throw new Error('AdminWorkspace required');
    return value;
}

const TAB_CLASS = (active: boolean) =>
    `rounded-lg px-5 py-2 text-sm font-semibold ${active ? 'bg-king-forest text-white' : 'text-neutral-gray-dark hover:bg-neutral-gray-pale'}`;

export function AdminWorkspace({ initialTab, initialCircleSite, sitesOnly = false, copy, lang, children }: {
    initialTab: AdminTab; initialCircleSite: SiteId; copy: Dictionary['adminSites']; lang: Locale; children: ReactNode;
    /** 只有站点切换（如使用统计子页），不出包晴天/Circle 标签。 */
    sitesOnly?: boolean;
}) {
    const [tab, setTab] = useState(initialTab);
    const [circleSite, setCircleSite] = useState(initialCircleSite);
    const site: SiteId = tab === 'bqt' ? 'cn' : tab === 'circle' ? circleSite : tab;
    const client = useMemo(() => siteClient(site, copy, lang), [site, copy, lang]);
    function writeUrl(nextTab: AdminTab, nextCircleSite: SiteId) {
        const url = new URL(window.location.href);
        url.searchParams.set('adminSite', nextTab);
        if (nextTab === 'circle') url.searchParams.set('circleSite', nextCircleSite);
        else url.searchParams.delete('circleSite');
        window.history.replaceState(null, '', url);
    }
    function select(next: AdminTab) {
        if (next === tab) return;
        // Every mounted panel keeps its own target. Old responses cannot fill the new site's forms.
        setTab(next);
        writeUrl(next, circleSite);
    }
    function selectCircleSite(next: SiteId) {
        if (next === circleSite) return;
        setCircleSite(next);
        writeUrl(tab, next);
    }
    // 新标签页拿到 401 时回到本机站点标签登录（口令 cookie 按当前域名生效）。
    const goLogin = () => select(SITE_ID);
    const notice = tab === 'bqt'
        ? copy.bqtNotice
        : tab === 'circle'
            ? copy.circleNotice.replace('{site}', copy[site])
            : copy.notice.replace('{site}', copy[site]).replace('{currency}', client.config.currency);
    return <>
        <section className="mb-8 rounded-xl border border-neutral-gray-light bg-white/80 p-4" aria-label={copy.manage}>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy.choose}>
                {(sitesOnly ? (['cn', 'intl'] as const) : ADMIN_TABS).map(id => <button key={id} type="button" role="tab" aria-selected={tab === id}
                    className={TAB_CLASS(tab === id)} onClick={() => select(id)}>{copy[id]}</button>)}
            </div>
            {tab === 'circle' && (
                <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={copy.circleSite}>
                    <span className="text-xs font-medium tracking-[0.14em] uppercase text-neutral-gray-medium me-1">{copy.circleSite}</span>
                    {(['cn', 'intl'] as const).map(id => <button key={id} type="button" role="radio" aria-checked={circleSite === id}
                        className={`rounded-md border px-3 py-1 text-xs font-medium ${circleSite === id ? 'border-king-forest bg-king-forest/10 text-king-forest' : 'border-neutral-gray-light text-neutral-gray-dark hover:bg-neutral-gray-pale'}`}
                        onClick={() => selectCircleSite(id)}>{copy[id]}</button>)}
                </div>
            )}
            <p className="mt-3 text-sm text-neutral-gray-medium">{notice}</p>
        </section>
        <AdminSite.Provider key={`${tab}:${site}`} value={client}>
            {tab === 'bqt' ? <BqtAdmin onNeedLogin={goLogin} /> : tab === 'circle' ? <CircleAdmin onNeedLogin={goLogin} /> : children}
        </AdminSite.Provider>
    </>;
}
