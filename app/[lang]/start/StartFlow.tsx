'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    ArrowUpRight,
    Check,
    ChevronDown,
    Download,
    Languages,
    Laptop,
    LogIn,
    Monitor,
    Puzzle,
} from 'lucide-react';
import { Locale } from '@/i18n-config';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/Reveal';
import { SITE_ID, siteConfig } from '@/lib/site-config';
import { REPO_URL } from '@/lib/structured-data';
import { interpolate } from '@/components/ui/interpolate';

interface ReleaseAsset {
    url: string;
    sizeMb: number;
}

export interface ReleaseInfo {
    version: string;
    mac: ReleaseAsset | null;
    win: ReleaseAsset | null;
}

interface StartFlowProps {
    lang: Locale;
    dict: any;
    release: ReleaseInfo | null;
    releasesPageUrl: string;
}

/** 「已装好」是用户自述，本地记一笔，免得刷新后又被拽回第一步 */
const INSTALLED_KEY = 'awd:start:installed';

/**
 * Office 插件安装器（签名/公证版，托管在本站对应的插件云后端）。
 * **不是与站点无关的**：托管地址被焙进包内的 manifest，装哪个包就决定了任务窗格
 * 从哪个站加载、用哪个 office.js CDN。此前两站都硬编码国内地址，国际用户装完
 * 整条链路绕回北京（2026-08-29 实测 office.js TTFB 相差约 38 倍）。
 * 实际 URL 由 /api/download 按 addin-mac/addin-win
 * 目标在服务端拼出（同一 addinOrigin 逻辑），这里不再持有直链。
 */
/**
 * WPS 加载项没有安装器：在线加载项，一键安装页写本机 WPS 配置即装即用。
 * WPS 是国内市场的产品线，国际站不提供（新加坡刻意没铺 wps-addin），
 * 所以这个入口按 offersWpsAddin 决定渲不渲染。
 */
const ADDIN_WPS_URL = `${siteConfig.addinOrigin}/wps-addin/install.html`;

const fill = (tpl: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl ?? '');

export function StartFlow({ lang, dict, release, releasesPageUrl }: StartFlowProps) {
    const t = dict.startPage;

    const [installed, setInstalled] = useState(false);
    /** null = 跟随算出来的当前步；用户手动点开某步后固定在那一步 */
    const [opened, setOpened] = useState<number | null>(null);
    const requestDownload = (target: string) => {
        // 302 链：/api/download 签发 CDN 限时直链；附件下载不打断当前页
        window.location.assign(`/api/download?target=${target}`);
    };

    useEffect(() => {
        try {
            if (window.localStorage.getItem(INSTALLED_KEY) === '1') setInstalled(true);
        } catch {
            // 隐私模式下 localStorage 会抛，跳过即可，不影响流程
        }
    }, []);

    const markInstalled = (value: boolean) => {
        setInstalled(value);
        setOpened(null);
        try {
            if (value) window.localStorage.setItem(INSTALLED_KEY, '1');
            else window.localStorage.removeItem(INSTALLED_KEY);
        } catch {
            // 同上
        }
    };

    // 第二步（桌面端里登录）官网无从验证，永远不置为已完成——它就是这条路的终点
    const done = [installed, false];
    const current = Math.max(0, done.findIndex(d => !d));
    const active = opened ?? current;

    const steps = [
        { key: 'download', title: t.steps.download.title, icon: Download },
        { key: 'login', title: t.steps.login.title, icon: LogIn },
    ];

    const summary = (index: number): string => {
        if (index === 0 && installed) return t.steps.download.doneSummary;
        if (index === 1) return SITE_ID === 'cn' ? t.steps.login.descPhone : t.steps.login.descEmail;
        return '';
    };

    return (
        <div className="mx-auto max-w-4xl">
            {/* 进度条：一眼知道走到哪、还剩几步 */}
            <Reveal>
                <div className="mb-6 flex items-center gap-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-gray-medium">
                        {fill(t.progress, { current: current + 1, total: steps.length })}
                    </p>
                    <span className="h-px flex-1 bg-neutral-gray-light" />
                    <span className="flex gap-1.5">
                        {steps.map((s, i) => (
                            <span
                                key={s.key}
                                className={cn(
                                    'block h-1.5 w-8 rounded-full transition-colors duration-300',
                                    done[i] ? 'bg-king-forest' : i === current ? 'bg-king-mint' : 'bg-neutral-gray-light'
                                )}
                            />
                        ))}
                    </span>
                </div>
            </Reveal>

            <ol className="relative">
                {steps.map((step, i) => {
                    const isDone = done[i];
                    const isActive = active === i;

                    return (
                        <Reveal key={step.key} delay={i * 60}>
                            <li className="relative grid grid-cols-[2.5rem_1fr] gap-x-4 pb-3 md:grid-cols-[3rem_1fr] md:gap-x-6">
                                {/* 序号与竖线 */}
                                <div className="flex flex-col items-center">
                                    <span
                                        className={cn(
                                            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition-colors duration-300 md:h-11 md:w-11',
                                            isDone
                                                ? 'border-king-forest bg-king-forest text-white'
                                                : isActive
                                                    ? 'border-king-forest bg-king-forest-darker text-white shadow-[0_8px_20px_-6px_rgba(22,42,33,0.45)]'
                                                    : 'border-neutral-gray-light bg-white text-neutral-gray-medium'
                                        )}
                                    >
                                        {isDone ? (
                                            <Check className="h-5 w-5" strokeWidth={2} />
                                        ) : (
                                            <span className="font-display tabular-nums">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                        )}
                                    </span>
                                    {i < steps.length - 1 && (
                                        <span
                                            className={cn(
                                                'mt-2 w-px flex-1 transition-colors duration-300',
                                                isDone ? 'bg-king-forest/40' : 'bg-neutral-gray-light'
                                            )}
                                        />
                                    )}
                                </div>

                                {/* 步骤卡 */}
                                <div
                                    className={cn(
                                        'relative mb-3 overflow-hidden rounded-2xl border transition-all duration-300',
                                        isActive
                                            ? 'border-king-forest/35 bg-white shadow-[0_22px_48px_-20px_rgba(18,58,38,0.22)]'
                                            : 'border-neutral-gray-light/90 bg-white/75 hover:border-king-forest/25 hover:bg-white'
                                    )}
                                >
                                    {isActive && (
                                        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-king-forest via-king-mint to-king-forest" />
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setOpened(isActive ? null : i)}
                                        className="flex w-full items-center gap-3.5 px-5 py-4 text-left md:px-7 md:py-5"
                                    >
                                        <step.icon
                                            className={cn(
                                                'h-5 w-5 flex-shrink-0',
                                                isActive ? 'text-king-forest' : 'text-neutral-gray-medium'
                                            )}
                                            strokeWidth={1.75}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span
                                                className={cn(
                                                    'font-display block text-[17px] font-bold md:text-[19px]',
                                                    isActive || isDone ? 'text-neutral-dark-bg' : 'text-neutral-gray-dark'
                                                )}
                                            >
                                                {step.title}
                                            </span>
                                            {!isActive && summary(i) && (
                                                <span className="mt-1 block line-clamp-1 text-[13px] text-neutral-gray-medium">
                                                    {summary(i)}
                                                </span>
                                            )}
                                        </span>
                                        <ChevronDown
                                            className={cn(
                                                'h-4 w-4 flex-shrink-0 text-neutral-gray-medium transition-transform duration-200',
                                                isActive && 'rotate-180 text-king-forest'
                                            )}
                                            strokeWidth={1.75}
                                        />
                                    </button>

                                    {isActive && (
                                        <div className="border-t border-neutral-gray-light/70 px-5 py-5 md:px-7 md:py-6">
                                            {i === 0 && (
                                                <DownloadStep
                                                    lang={lang}
                                                    t={t.steps.download}
                                                    release={release}
                                                    releasesPageUrl={releasesPageUrl}
                                                    installed={installed}
                                                    onMarkInstalled={markInstalled}
                                                    onDownload={requestDownload}
                                                />
                                            )}
                                            {i === 1 && <LoginStep lang={lang} t={t.steps.login} />}
                                        </div>
                                    )}
                                </div>
                            </li>
                        </Reveal>
                    );
                })}
            </ol>

            {/* 走完之后去哪儿：不要让页面停在一堵墙上 */}
            <Reveal delay={200}>
                <div className="mt-10 border-t border-neutral-gray-light pt-8">
                    <h2 className="font-display mb-4 text-base font-semibold text-neutral-dark-bg">{t.after.title}</h2>
                    <div className="grid gap-3.5 sm:grid-cols-3">
                        {[
                            { ...t.after.skills, href: `/${lang}/marketplace` },
                            { ...t.after.plugins, href: `/${lang}/marketplace/plugins` },
                            { ...t.after.updates, href: `/${lang}/updates` },
                        ].map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="group rounded-xl border border-neutral-gray-light/90 bg-white/85 px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-king-forest/35 hover:bg-white hover:shadow-[0_16px_36px_-18px_rgba(18,58,38,0.22)]"
                            >
                                <p className="font-display flex items-center justify-between gap-1.5 text-[15px] font-bold text-neutral-dark-bg">
                                    {item.title}
                                    <ArrowUpRight
                                        className="h-4 w-4 text-neutral-gray-medium transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-king-forest"
                                        strokeWidth={1.75}
                                    />
                                </p>
                                <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-gray-medium">{item.desc}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </Reveal>
        </div>
    );
}

/* ---------- 第一步：下载 ---------- */

function DownloadStep({
    lang,
    t,
    release,
    releasesPageUrl,
    installed,
    onMarkInstalled,
    onDownload,
}: {
    lang: Locale;
    t: any;
    release: ReleaseInfo | null;
    releasesPageUrl: string;
    installed: boolean;
    onMarkInstalled: (v: boolean) => void;
    onDownload: (target: string) => void;
}) {
    const [detectedOs, setDetectedOs] = useState<'mac' | 'win' | null>(null);

    useEffect(() => {
        const ua = window.navigator.userAgent || '';
        if (/Windows/i.test(ua)) setDetectedOs('win');
        else if (/Macintosh|Mac OS/i.test(ua)) setDetectedOs('mac');
    }, []);

    const platforms = release
        ? [
            { asset: release.mac, label: t.mac, icon: Laptop, target: 'mac' as const },
            { asset: release.win, label: t.win, icon: Monitor, target: 'win' as const },
        ].filter(p => p.asset)
        : [];

    return (
        <>
            {/* 主下载按钮区置顶：高对比深林绿主卡 + 醒目下载动作徽标，一眼即达 */}
            {platforms.length > 0 ? (
                <div className="grid gap-3.5 sm:grid-cols-2">
                    {platforms.map(p => {
                        const isPrimary = detectedOs ? detectedOs === p.target : p.target === 'mac';
                        return (
                            <button
                                key={p.label}
                                type="button"
                                onClick={() => onDownload(p.target)}
                                className={cn(
                                    'group relative flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 md:px-5',
                                    isPrimary
                                        ? 'border-king-forest-darker bg-king-forest-darker text-white shadow-[0_20px_42px_-14px_rgba(22,42,33,0.48)] hover:border-king-forest hover:bg-king-forest'
                                        : 'border-king-forest/30 bg-[#f2f6f4] text-neutral-dark-bg shadow-[0_10px_28px_-14px_rgba(22,42,33,0.16)] hover:border-king-forest hover:bg-white'
                                )}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span
                                        className={cn(
                                            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
                                            isPrimary
                                                ? 'bg-white/12 text-king-mint'
                                                : 'bg-king-forest/10 text-king-forest group-hover:bg-king-forest/15'
                                        )}
                                    >
                                        <p.icon className="h-5 w-5" strokeWidth={1.75} />
                                    </span>
                                    <span className="min-w-0">
                                        <span
                                            className={cn(
                                                'block text-[14px] font-bold leading-snug sm:whitespace-nowrap md:text-[15px]',
                                                isPrimary ? 'text-white' : 'text-neutral-dark-bg'
                                            )}
                                        >
                                            {p.label}
                                        </span>
                                        <span
                                            className={cn(
                                                'mt-1 block font-mono text-[11.5px]',
                                                isPrimary ? 'text-white/75' : 'text-neutral-gray-medium'
                                            )}
                                        >
                                            {release?.version ? `v${release.version} · ` : ''}
                                            {fill(t.sizeHint, { size: p.asset!.sizeMb })}
                                        </span>
                                    </span>
                                </div>
                                <span
                                    className={cn(
                                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
                                        isPrimary
                                            ? 'bg-king-mint text-king-forest-darker shadow-sm'
                                            : 'bg-king-forest text-white shadow-sm'
                                    )}
                                >
                                    <Download className="h-4.5 w-4.5" strokeWidth={2.2} />
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <a href={releasesPageUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="default" size="lg" className="gap-2 bg-king-forest font-bold text-white hover:bg-king-forest-darker">
                        <Download className="h-4 w-4" strokeWidth={2} />
                        {t.fallback}
                        <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                </a>
            )}

            {/* 某个平台这一版没出包时必须说破 */}
            {release && (!release.mac || !release.win) && (
                <p className="mt-3 text-[12px] text-neutral-gray-medium">
                    {fill(t.missingPlatform, {
                        platform: release.mac ? t.win : t.mac,
                        version: release.version,
                    })}{' '}
                    <a
                        href={releasesPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-king-forest hover:underline"
                    >
                        {t.allReleases}
                    </a>
                </p>
            )}

            {/* 版本、开源协议与多语言说明合流为单行规格条，详细说明收进折叠抽屉 */}
            <details className="group mt-3.5 rounded-xl border border-neutral-gray-light/85 bg-neutral-gray-pale/60 px-4 py-2.5">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[12px] text-neutral-gray-medium [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {release && (
                            <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-dark-bg shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                                {fill(t.versionHint, { version: release.version })}
                            </span>
                        )}
                        {release?.mac && <span>{t.macNote}</span>}
                        <span className="text-neutral-gray-light">·</span>
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-king-forest hover:underline"
                        >
                            AGPL-3.0 {t.openSourceRepo}
                        </a>
                        <span className="text-neutral-gray-light">·</span>
                        <Link href={`/${lang}/faq#pricing`} className="font-medium text-king-forest hover:underline">
                            {t.openSourcePricing}
                        </Link>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Link href={`/${lang}/updates`} className="font-semibold text-king-forest hover:underline">
                            {t.whatsNew}
                        </Link>
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-neutral-gray-medium transition-transform duration-200 group-open:rotate-180" />
                    </div>
                </summary>

                <div className="mt-2.5 space-y-2 border-t border-neutral-gray-light/70 pt-2.5 text-[12px] leading-relaxed text-neutral-gray-medium">
                    <p>
                        {interpolate(t.openSourceNote, {
                            repo: (
                                <a
                                    href={REPO_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-king-forest hover:underline"
                                >
                                    {t.openSourceRepo}
                                </a>
                            ),
                            pricing: (
                                <Link href={`/${lang}/faq#pricing`} className="font-medium text-king-forest hover:underline">
                                    {t.openSourcePricing}
                                </Link>
                            ),
                        })}
                    </p>
                    <p>{t.desc}</p>
                    <p className="flex items-start gap-2">
                        <Languages className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-king-forest" strokeWidth={1.75} />
                        <span>{t.bilingualNote}</span>
                    </p>
                </div>
            </details>

            {/* Office / WPS 插件（选装）：单行横条摆放下载按钮，长文说明收进折叠抽屉 */}
            <details className="group mt-3 rounded-xl border border-neutral-gray-light/90 bg-white px-4 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-2">
                        <Puzzle className="h-4 w-4 flex-shrink-0 text-king-forest" strokeWidth={1.75} />
                        <span className="text-[13.5px] font-bold text-neutral-dark-bg">{t.addinTitle}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={e => {
                                e.preventDefault();
                                onDownload('addin-mac');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-king-forest/40 bg-king-mint-lightest/40 px-3 py-1.5 text-[12px] font-semibold text-king-forest transition-colors hover:border-king-forest hover:bg-king-forest hover:text-white"
                        >
                            <Laptop className="h-3.5 w-3.5" strokeWidth={1.75} />
                            {t.addinMac}
                        </button>
                        <button
                            type="button"
                            onClick={e => {
                                e.preventDefault();
                                onDownload('addin-win');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-king-forest/40 bg-king-mint-lightest/40 px-3 py-1.5 text-[12px] font-semibold text-king-forest transition-colors hover:border-king-forest hover:bg-king-forest hover:text-white"
                        >
                            <Monitor className="h-3.5 w-3.5" strokeWidth={1.75} />
                            {t.addinWin}
                        </button>
                        {siteConfig.offersWpsAddin && (
                            <a
                                href={ADDIN_WPS_URL}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-king-forest/40 bg-king-mint-lightest/40 px-3 py-1.5 text-[12px] font-semibold text-king-forest transition-colors hover:border-king-forest hover:bg-king-forest hover:text-white"
                            >
                                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                                {t.addinWps}
                            </a>
                        )}
                        <ChevronDown className="ml-1 h-3.5 w-3.5 flex-shrink-0 text-neutral-gray-medium transition-transform duration-200 group-open:rotate-180" />
                    </div>
                </summary>
                <div className="mt-2.5 space-y-1.5 border-t border-neutral-gray-light/70 pt-2.5 text-[12px] leading-relaxed text-neutral-gray-medium">
                    <p>{t.addinDesc}</p>
                    <p>{t.addinNote}</p>
                </div>
            </details>

            <div className="mt-4 flex items-center justify-end border-t border-neutral-gray-light/70 pt-3.5">
                {installed ? (
                    <button
                        type="button"
                        onClick={() => onMarkInstalled(false)}
                        className="text-[13px] font-medium text-neutral-gray-medium transition-colors hover:text-king-forest"
                    >
                        {t.undo}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onMarkInstalled(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-king-mint-lightest px-3.5 py-1.5 text-[13px] font-semibold text-king-forest transition-colors hover:bg-king-mint/40"
                    >
                        {t.skip}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                )}
            </div>
        </>
    );
}

/* ---------- 第二步：桌面端里登录 ---------- */

function LoginStep({ lang, t }: { lang: Locale; t: any }) {
    // 大陆站用手机号验证码，国际站用邮箱验证码——两站的桌面端首屏登录方式不同
    const isPhone = SITE_ID === 'cn';

    return (
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-center">
            <div>
                <p className="text-sm leading-relaxed text-neutral-gray-dark">
                    {isPhone ? t.descPhone : t.descEmail}
                </p>
                <p className="mt-4 rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/60 px-4 py-3 text-[12.5px] leading-relaxed text-neutral-gray-medium">
                    {t.note}{' '}
                    <Link href={`/${lang}/account`} className="font-semibold text-king-forest hover:underline">
                        {t.accountLink}
                    </Link>
                </p>
            </div>

            {/* 桌面端登录页的静态摹本：带原生窗口标题栏，让用户在软件里一眼认出该往哪儿填 */}
            <div
                aria-hidden
                className="overflow-hidden rounded-xl border border-neutral-gray-light bg-white shadow-[0_14px_34px_-18px_rgba(22,42,33,0.18)]"
            >
                <div className="flex items-center gap-1.5 border-b border-neutral-gray-light/80 bg-neutral-gray-pale px-3.5 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-gray-light" />
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-gray-light" />
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-gray-light" />
                    <span className="ml-2 font-mono text-[10px] text-neutral-gray-medium">AI WorkDeck Desktop</span>
                </div>
                <div className="px-5 py-5 text-center">
                    <p className="font-display text-base font-bold text-neutral-dark-bg">AI WorkDeck</p>
                    <p className="mt-0.5 text-[11.5px] text-neutral-gray-medium">{t.mockSubtitle}</p>
                    <div className="mt-4 flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg border border-neutral-gray-light bg-neutral-gray-pale px-3 py-2 text-left">
                            <span className="font-mono text-[11.5px] text-neutral-gray-medium">
                                {isPhone ? t.phonePlaceholder : t.emailPlaceholder}
                            </span>
                        </div>
                        <div className="flex-shrink-0 rounded-lg border border-king-forest/30 bg-king-mint-lightest/50 px-3 py-2 text-[11.5px] font-semibold text-king-forest">
                            {t.sendCode}
                        </div>
                    </div>
                    <div className="mt-2.5 rounded-lg border border-neutral-gray-light bg-neutral-gray-pale px-3 py-2 text-left">
                        <span className="font-mono text-[11.5px] text-neutral-gray-medium">{t.codePlaceholder}</span>
                    </div>
                    <div className="mt-2.5 rounded-lg bg-king-forest px-3 py-2 text-[12.5px] font-bold text-white">
                        {t.button}
                    </div>
                </div>
            </div>
        </div>
    );
}
