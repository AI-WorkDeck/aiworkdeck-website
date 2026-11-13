import type { Metadata } from 'next';
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';
import { ArrowUpRight, ChevronDown, Globe } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { getLatestRelease, RELEASES_PAGE_URL } from '@/lib/latest-release';
import { getSessionUser } from '@/lib/sessions';
import { codeChannelReady } from '@/lib/login-channel';
import { captchaClientConfig } from '@/lib/captcha';
import { bqtScanEnabled } from '@/lib/bqt-auth';
import { SITE_ID, siteConfig, isUsHost, crossSiteUrl } from '@/lib/site-config';
import { wxStartEnabled } from '@/lib/wx-mini';
import { PageHero } from '@/components/layout/PageHero';
import { StartFlow } from './StartFlow';
import { MobileStart } from './MobileStart';
import { MobileAppSection } from './MobileAppSection';
import { pageAlternates } from '@/lib/page-metadata';

/** 来源统计（dev-board#304）：作者主页 CTA 带 ref=u-<username>，落地记一笔评估转化 */
function logStartRef(ref: string, mobile: boolean) {
    try {
        fs.appendFileSync(
            path.join(process.cwd(), 'data', 'start-refs.jsonl'),
            JSON.stringify({ at: new Date().toISOString(), ref: ref.slice(0, 64), mobile }) + '\n'
        );
    } catch { /* 统计尽力而为 */ }
}

// release 拉取需要新鲜度，不能被静态化
export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.startPage.title,
        description: dict.startPage.lead,
        alternates: pageAlternates(lang, '/start', { crossSite: true }),
    };
}

export default async function StartPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { lang } = await params;
    const query = await searchParams;
    const ref = typeof query.ref === 'string' ? query.ref : query.ref?.[0];
    const setupQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (key === 'site' || value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) setupQuery.append(key, item);
    }
    const setupPath = `/${lang}/start${setupQuery.size ? `?${setupQuery}` : ''}`;
    const dict = await getDictionary(lang);
    const t = dict.startPage;

    // 移动端形态（dev-board#304）：手机装不了桌面软件，落点换成「注册留资 + 回电脑」
    const requestHeaders = await headers();
    const ua = requestHeaders.get('user-agent') ?? '';
    const currentHost = SITE_ID === 'intl' && isUsHost(requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'))
        ? 'www.aiworkdeck.us'
        : siteConfig.host;
    const isMobile = /iPhone|Android|Mobile/i.test(ua);
    // 微信内（dev-board#305）：未登录分支可打开小程序，再走统一验证与设密流程。
    // 只认手机微信——桌面微信 UA 也带 MicroMessenger，但那是电脑，走桌面流程。
    const isWeChat = isMobile && /MicroMessenger/i.test(ua);
    if (ref) logStartRef(ref, isMobile);

    const release = await getLatestRelease();
    // 移动端注册流程需要登录态与验证码/发码通道配置，服务端算好传给 MobileStart
    const user = await getSessionUser();

    // 手机 UA 先看到手机 App 区块；桌面 UA 把它放在桌面下载流程之后
    const mobileApp = <MobileAppSection t={t.mobileApp} ua={ua} showQr={!isMobile} />;

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 全站统一深色刊物式页头（dev-board#328）。转化页用 compact 档，尽快见到正文 */}
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={isMobile ? t.mobileSubtitle : t.lead} size="compact" width="4xl" />
            <div className="container mx-auto px-4 md:px-8 max-w-4xl pt-7 md:pt-8">

                {/* 先确认该用哪个站，再走两步——精简为单行状态条，把首屏焦点彻底让给下载主按钮 */}
                <SiteChoice t={t.siteChoice} currentHost={currentHost} setupPath={setupPath} />

                {isMobile && mobileApp}

                {isMobile ? (
                    <MobileStart
                        lang={lang}
                        dict={dict}
                        loggedIn={!!user}
                        email={user?.email || null}
                        desktopUrl={`https://${currentHost}/${lang}/start`}
                        captcha={captchaClientConfig()}
                        codeChannelReady={codeChannelReady()}
                        bqtEnabled={bqtScanEnabled()}
                        wxStart={isWeChat && wxStartEnabled()}
                        startRef={ref ?? ''}
                    />
                ) : (
                    <StartFlow
                        lang={lang}
                        dict={dict}
                        release={release}
                        releasesPageUrl={RELEASES_PAGE_URL}
                    />
                )}

                {!isMobile && mobileApp}

                {/* 网页版：只在下载页作为「装不了软件」时的次要选项，并如实标出代价 */}
                {!isMobile && (
                    <p className="mt-8 mb-16 text-[13.5px] leading-relaxed text-neutral-gray-medium">
                        {t.webFallback.text}{' '}
                        <a href={`/web/?lang=${lang}`} className="font-semibold text-king-forest underline decoration-[#d7c5a1] underline-offset-4 hover:decoration-king-forest">{t.webFallback.link}</a>
                    </p>
                )}
            </div>
        </div>
    );
}

/** Region and edition are separate choices; switching region keeps the setup destination. */
function SiteChoice({ t, currentHost, setupPath }: { t: Awaited<ReturnType<typeof getDictionary>>['startPage']['siteChoice']; currentHost: string; setupPath: string }) {
    const intl = SITE_ID === 'intl';
    return (
        <section className="mb-5 rounded-xl border border-[#dce2de] bg-white/95 px-4 py-2.5 shadow-[0_2px_12px_-4px_rgba(22,42,33,0.06)]" aria-label={t.ariaLabel}>
            <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-sm [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-king-mint-lightest text-king-forest">
                            <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </span>
                        <span className="font-semibold text-neutral-dark-bg">
                            {t.editionPrefix} · {intl ? t.regionIntl : t.regionMainland}
                        </span>
                        <span className="rounded-md border border-neutral-gray-light/80 bg-neutral-gray-pale px-2 py-0.5 font-mono text-[11px] text-neutral-gray-medium">
                            {currentHost}
                        </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-king-forest hover:text-king-forest-darker">
                        {t.whichSiteQuestion}
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
                    </span>
                </summary>
                <div className="mt-3 border-t border-neutral-gray-light/80 pt-3 text-xs leading-relaxed text-neutral-gray-medium">
                    <p className="mb-2.5 text-neutral-gray-dark">
                        {t.accountNote}
                    </p>
                    <ul className="space-y-1.5">
                        <li><strong className="font-medium text-neutral-gray-dark">www.aiworkdeck.com</strong> — {t.cnSiteDesc}</li>
                        <li><strong className="font-medium text-neutral-gray-dark">www.workdeck.ai</strong> — {t.intlSiteDesc}</li>
                        <li><strong className="font-medium text-neutral-gray-dark">www.aiworkdeck.us</strong> — {t.usSiteDesc}</li>
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-gray-light/60 pt-3">
                        <p className="text-[11.5px] text-neutral-gray-medium">
                            {t.domainLoginNote}
                        </p>
                        <a href={crossSiteUrl(siteConfig.otherSite.id, setupPath)} className="inline-flex items-center gap-1 text-xs font-semibold text-king-forest hover:underline">
                            {intl ? t.continueSetupMainland : t.continueSetupIntl}
                            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </a>
                    </div>
                </div>
            </details>
        </section>
    );
}
