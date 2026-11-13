'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    i18n,
    LANG_COOKIE,
    Locale,
    LOCALE_META,
    LOCALE_PICKER_LABELS,
    matchLanguageTagToLocale,
} from '@/i18n-config';
import type { getDictionary } from '@/get-dictionary';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Heart, CodeXml, ChevronDown, Globe, Check, Search, Star } from 'lucide-react';
import { SupportDialog } from '@/components/SupportDialog';
import { GithubStarCount } from '@/components/layout/GithubStarCount';
import { NavAuth } from '@/components/layout/NavAuth';
import { REPO_URL } from '@/lib/structured-data';

// Donations use the configured payment channel and do not require an account.
const showSupport = true;
const linkStyle = 'inline-flex min-h-11 items-center rounded-md px-2 2xl:px-3 text-sm font-medium text-neutral-gray-dark transition-colors hover:text-king-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest focus-visible:ring-offset-2';

function setLangCookie(value: string) {
    if (typeof document === 'undefined') return;
    document.cookie = `${LANG_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function readLangCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
}

function detectBrowserLocale(): Locale {
    if (typeof navigator !== 'undefined') {
        const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
        for (const tag of candidates) {
            const matched = matchLanguageTagToLocale(tag);
            if (matched) return matched;
        }
    }
    return i18n.defaultLocale;
}

interface NavbarProps {
    lang: Locale;
    dict: Awaited<ReturnType<typeof getDictionary>>;
    /** 服务端缓存的仓库 Star 数；拿不到时为 null，按钮只显示「GitHub」 */
    githubStars: number | null;
}

export function Navbar({ lang, dict, githubStars }: NavbarProps) {
    const pathname = usePathname();
    return <NavbarContent key={pathname} lang={lang} dict={dict} githubStars={githubStars} pathname={pathname} />;
}

function NavbarContent({ lang, dict, githubStars, pathname }: NavbarProps & { pathname: string }) {
    const router = useRouter();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isExploreOpen, setIsExploreOpen] = useState(false);
    const [isLangOpen, setIsLangOpen] = useState(false);
    const [isMobileLangOpen, setIsMobileLangOpen] = useState(false);
    const [langQuery, setLangQuery] = useState('');
    const [activeOptionIdx, setActiveOptionIdx] = useState(-1);
    const [isSupportOpen, setIsSupportOpen] = useState(false);
    const [cookieMode, setCookieMode] = useState<string | null>(null);
    const mobileToggle = useRef<HTMLButtonElement>(null);
    const exploreToggle = useRef<HTMLButtonElement>(null);
    const exploreContainer = useRef<HTMLDivElement>(null);
    const langToggle = useRef<HTMLButtonElement>(null);
    const langContainer = useRef<HTMLDivElement>(null);
    const langSearchRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const nav = dict.common.nav;
    const pickerLabels = LOCALE_PICKER_LABELS[lang];
    const currentMeta = LOCALE_META[lang];
    const communityLabel = nav.communityEdition;

    useEffect(() => {
        setCookieMode(readLangCookie());
    }, [lang]);

    const filteredLocales = useMemo(() => {
        const q = langQuery.trim().toLowerCase();
        if (!q) return i18n.locales;
        return i18n.locales.filter(code => {
            const m = LOCALE_META[code];
            return (
                code.toLowerCase().includes(q) ||
                m.nativeName.toLowerCase().includes(q) ||
                m.englishName.toLowerCase().includes(q) ||
                m.bcp47.toLowerCase().includes(q)
            );
        });
    }, [langQuery]);

    const redirectedPathName = (locale: string) => {
        const segments = (pathname || `/${lang}`).split('/');
        segments[1] = locale;
        return segments.join('/');
    };
    const closeMenus = () => {
        setIsMobileMenuOpen(false);
        setIsExploreOpen(false);
        setIsLangOpen(false);
        setIsMobileLangOpen(false);
        setLangQuery('');
        setActiveOptionIdx(-1);
    };
    const selectLocale = (choice: Locale | 'system') => {
        setLangCookie(choice);
        setCookieMode(choice);
        const targetLocale = choice === 'system' ? detectBrowserLocale() : choice;
        closeMenus();
        const target = redirectedPathName(targetLocale);
        router.push(`${target}${window.location.search}${window.location.hash}`);
    };

    useEffect(() => {
        if (isLangOpen) {
            setLangQuery('');
            setActiveOptionIdx(-1);
            requestAnimationFrame(() => {
                langSearchRef.current?.focus();
            });
        }
    }, [isLangOpen]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (isMobileMenuOpen) mobileToggle.current?.focus();
            if (isExploreOpen) exploreToggle.current?.focus();
            if (isLangOpen) langToggle.current?.focus();
            setIsMobileMenuOpen(false);
            setIsExploreOpen(false);
            setIsLangOpen(false);
            setIsMobileLangOpen(false);
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!exploreContainer.current?.contains(event.target as Node)) setIsExploreOpen(false);
            if (!langContainer.current?.contains(event.target as Node)) setIsLangOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [isMobileMenuOpen, isExploreOpen, isLangOpen]);

    // 两个下拉菜单的 onBlur 只在 relatedTarget 存在且落在菜单外时关闭：Safari/WebKit 点击按钮不给焦点，
    // relatedTarget 为 null，若照样关闭，菜单会在 click 之前消失、选项永远点不中（2026-11-06 线上语言切换失灵）。
    // 鼠标/触摸点到菜单外由上面的 pointerdown 监听关闭。
    const totalOptions = 1 + filteredLocales.length;
    const handleLangKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = activeOptionIdx + 1 < totalOptions ? activeOptionIdx + 1 : 0;
            setActiveOptionIdx(next);
            optionRefs.current[next]?.focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = activeOptionIdx - 1 >= 0 ? activeOptionIdx - 1 : totalOptions - 1;
            setActiveOptionIdx(prev);
            optionRefs.current[prev]?.focus();
        }
    };

    const navLinks = [
        { href: `/${lang}/workspace`, label: nav.product },
        { href: `/${lang}/marketplace`, label: nav.marketplace },
        { href: `/${lang}/pricing`, label: nav.pricing },
        { href: `/${lang}/community`, label: nav.community },
        { href: `/${lang}/faq`, label: nav.faq },
    ];
    const exploreLinks = [
        { href: `/${lang}/deployment`, label: nav.deployment },
        { href: `/${lang}/skills/submit`, label: nav.submit },
        { href: `/${lang}/community/chat`, label: nav.chatroom },
        { href: `/${lang}/articles`, label: nav.articles },
        { href: `/${lang}/videos`, label: nav.videos },
        { href: REPO_URL, label: nav.github, external: true },
    ];
    const openSupport = () => {
        closeMenus();
        setIsSupportOpen(true);
    };

    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-king-forest/10 bg-white/95 backdrop-blur-xl" data-site-header>
            <div className="mx-auto flex h-18 max-w-[1440px] items-center gap-3 px-4 md:px-8">
                <Link href={`/${lang}`} className="flex min-h-11 shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest" aria-label={nav.homeAria}>
                    <img src="/logo.png" alt="AI WorkDeck" className="h-7 w-auto" />
                </Link>
                <span className={cn("max-w-20 shrink-0 border-s border-king-forest/15 ps-3 text-xs font-medium text-king-forest min-[360px]:max-w-none", showSupport && "hidden lg:block")}>
                    {communityLabel}
                </span>

                <nav aria-label={nav.mainNavAria} className="ms-auto hidden items-center gap-1 xl:flex">
                    {navLinks.map(link => (
                        <Link key={link.href} href={link.href} onClick={closeMenus} className={cn(linkStyle, 'whitespace-nowrap')} aria-current={pathname === link.href ? 'page' : undefined}>
                            {link.label}
                        </Link>
                    ))}
                    <div ref={exploreContainer} className="relative" onBlur={event => {
                        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setIsExploreOpen(false);
                    }}>
                        <button ref={exploreToggle} type="button" className={cn(linkStyle, 'gap-1')} aria-expanded={isExploreOpen} aria-controls="explore-navigation" onClick={() => setIsExploreOpen(!isExploreOpen)}>
                            {nav.explore}
                            <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 transition-transform', isExploreOpen && 'rotate-180')} />
                        </button>
                        {isExploreOpen && (
                            <div id="explore-navigation" className="absolute end-0 top-full mt-2 w-56 rounded-xl border border-king-forest/10 bg-white p-2 shadow-lg shadow-king-forest/5">
                                {exploreLinks.map(link => (
                                    <Link key={link.href} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined} className={cn(linkStyle, 'w-full gap-2 px-3 hover:bg-neutral-gray-pale')} onClick={closeMenus}>
                                        {link.external && <CodeXml aria-hidden className="h-4 w-4" />}{link.label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </nav>

                <div className="ms-auto flex shrink-0 items-center gap-1 xl:ms-0 xl:gap-2">
                    {showSupport && <button type="button" className={cn(linkStyle, 'hidden gap-2 xl:inline-flex')} onClick={openSupport}><Heart aria-hidden className="h-4 w-4" />{nav.donate}</button>}
                    <div
                        ref={langContainer}
                        className="relative"
                        onKeyDown={handleLangKeyDown}
                        onBlur={event => {
                            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setIsLangOpen(false);
                        }}
                    >
                        <button
                            ref={langToggle}
                            type="button"
                            className={cn(linkStyle, 'gap-1.5 px-2 md:px-3')}
                            aria-label={pickerLabels.ariaLabel}
                            aria-expanded={isLangOpen}
                            aria-haspopup="listbox"
                            aria-controls="language-picker-menu"
                            onClick={() => setIsLangOpen(open => !open)}
                        >
                            <Globe aria-hidden className="h-4 w-4 shrink-0" />
                            <span className="hidden sm:inline">{currentMeta.nativeName}</span>
                            <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 transition-transform', isLangOpen && 'rotate-180')} />
                        </button>
                        {isLangOpen && (
                            <div
                                id="language-picker-menu"
                                role="listbox"
                                aria-label={pickerLabels.ariaLabel}
                                className="absolute end-0 top-full mt-2 w-64 rounded-xl border border-king-forest/10 bg-white p-2 shadow-lg shadow-king-forest/5"
                            >
                                <div className="relative mb-1.5">
                                    <Search aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-gray-medium" />
                                    <input
                                        ref={langSearchRef}
                                        type="text"
                                        value={langQuery}
                                        onChange={e => {
                                            setLangQuery(e.target.value);
                                            setActiveOptionIdx(-1);
                                        }}
                                        placeholder={pickerLabels.searchPlaceholder}
                                        aria-label={pickerLabels.searchPlaceholder}
                                        className="h-9 w-full rounded-lg border border-king-forest/15 bg-neutral-gray-pale/50 ps-8 pe-2.5 text-xs text-neutral-dark-bg placeholder:text-neutral-gray-medium focus:border-king-forest focus:bg-white focus:outline-none"
                                    />
                                </div>
                                <div className="max-h-72 overflow-y-auto">
                                    <button
                                        ref={el => { optionRefs.current[0] = el; }}
                                        type="button"
                                        role="option"
                                        aria-selected={cookieMode === 'system'}
                                        onClick={() => selectLocale('system')}
                                        className="flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs font-medium text-neutral-gray-dark transition-colors hover:bg-neutral-gray-pale focus-visible:bg-neutral-gray-pale focus-visible:outline-none"
                                    >
                                        <span>{pickerLabels.followSystem}</span>
                                        {cookieMode === 'system' && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-king-forest" />}
                                    </button>
                                    <div className="my-1 border-t border-king-forest/10" />
                                    {filteredLocales.length === 0 ? (
                                        <p className="px-2.5 py-3 text-center text-xs text-neutral-gray-medium">
                                            {pickerLabels.noResults}
                                        </p>
                                    ) : (
                                        filteredLocales.map((code, idx) => {
                                            const meta = LOCALE_META[code];
                                            const isCurrent = code === lang;
                                            return (
                                                <button
                                                    key={code}
                                                    ref={el => { optionRefs.current[idx + 1] = el; }}
                                                    type="button"
                                                    role="option"
                                                    aria-selected={isCurrent}
                                                    lang={meta.bcp47}
                                                    dir={meta.dir}
                                                    onClick={() => selectLocale(code)}
                                                    className={cn(
                                                        'flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs transition-colors hover:bg-neutral-gray-pale focus-visible:bg-neutral-gray-pale focus-visible:outline-none',
                                                        isCurrent ? 'font-semibold text-king-forest' : 'text-neutral-gray-dark'
                                                    )}
                                                >
                                                    <span>{meta.nativeName}</span>
                                                    {isCurrent && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-king-forest" />}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="hidden xl:block [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:justify-center [&_a]:rounded-md [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-king-forest"><NavAuth lang={lang} onDark={false} signInLabel={nav.signIn} /></div>
                </div>

                <div className="hidden shrink-0 items-center gap-2 md:flex">
                    {/* 开源项目的导航右上放 GitHub 与 Star 数（官网升级：首页此前首屏没有任何 GitHub 入口）。
                        在线试用仍在首页 Hero 与手机菜单里，这里只留一个主行动。 */}
                    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label={nav.starAria} className="inline-flex h-9 items-center gap-2 rounded-lg border border-king-forest/15 bg-white px-3 text-[13px] font-medium text-neutral-dark-bg transition-colors hover:border-king-forest/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest focus-visible:ring-offset-2">
                        <Star aria-hidden className="h-3.5 w-3.5" />
                        GitHub
                        <GithubStarCount initial={githubStars} bcp47={currentMeta.bcp47} className="border-s border-king-forest/15 ps-2 font-mono text-[12px] text-king-forest" />
                    </a>
                    <Button asChild size="sm"><Link href={`/${lang}/start`}>{nav.download}</Link></Button>
                </div>

                {showSupport && <button type="button" onClick={openSupport} aria-label={nav.donateAria} title={nav.donateAria} className={cn(linkStyle, 'hidden min-w-11 shrink-0 justify-center gap-2 md:max-xl:inline-flex')}><Heart aria-hidden className="h-4 w-4" /><span className="hidden min-[360px]:inline">{nav.donate}</span></button>}
                <Button asChild size="sm" className="shrink-0 md:hidden"><Link href={`/${lang}/start`}>{nav.download}</Link></Button>
                <button ref={mobileToggle} type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-king-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest xl:hidden" aria-label={isMobileMenuOpen ? nav.closeNavAria : nav.openNavAria} aria-expanded={isMobileMenuOpen} aria-controls="mobile-navigation" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                    {isMobileMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
                </button>
            </div>

            {isMobileMenuOpen && (
                <nav id="mobile-navigation" aria-label={nav.mobileNavAria} className="absolute inset-x-0 top-18 max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-king-forest/10 bg-white px-4 pb-6 pt-2 shadow-lg shadow-king-forest/5 xl:hidden">
                    {/* 网页版降为 /start 页的次要选项（首次加载约 100MB、AI 需登录，不适合作为首印象入口） */}
                    <div className="mb-3 border-b border-king-forest/10 pb-4">
                        <Button asChild className="w-full"><Link href={`/${lang}/start`} onClick={closeMenus}>{dict.common.webWorkbench.download}</Link></Button>
                    </div>
                    {navLinks.map(link => <Link key={link.href} href={link.href} onClick={closeMenus} className={cn(linkStyle, 'flex w-full px-2')}>{link.label}</Link>)}
                    {showSupport && <button type="button" onClick={openSupport} className={cn(linkStyle, 'flex w-full gap-2 px-2 md:hidden')}><Heart aria-hidden className="h-4 w-4" />{nav.donate}</button>}
                    <div className="my-2 border-t border-king-forest/10 pt-2">
                        {exploreLinks.map(link => <Link key={link.href} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined} onClick={closeMenus} className={cn(linkStyle, 'flex w-full px-2')}>{link.label}</Link>)}
                    </div>
                    <div className="border-t border-king-forest/10 pt-2">
                        <button
                            type="button"
                            className={cn(linkStyle, 'flex w-full justify-between px-2')}
                            aria-label={pickerLabels.ariaLabel}
                            aria-expanded={isMobileLangOpen}
                            onClick={() => setIsMobileLangOpen(open => !open)}
                        >
                            <span className="inline-flex items-center gap-2">
                                <Globe aria-hidden className="h-4 w-4 shrink-0" />
                                <span>{currentMeta.nativeName}</span>
                            </span>
                            <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform', isMobileLangOpen && 'rotate-180')} />
                        </button>
                        {isMobileLangOpen && (
                            <div className="mt-1 rounded-xl border border-king-forest/10 bg-neutral-gray-pale/40 p-2">
                                <div className="relative mb-2">
                                    <Search aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-gray-medium" />
                                    <input
                                        type="text"
                                        value={langQuery}
                                        onChange={e => setLangQuery(e.target.value)}
                                        placeholder={pickerLabels.searchPlaceholder}
                                        aria-label={pickerLabels.searchPlaceholder}
                                        className="h-9 w-full rounded-lg border border-king-forest/15 bg-white ps-8 pe-2.5 text-xs text-neutral-dark-bg placeholder:text-neutral-gray-medium focus:border-king-forest focus:outline-none"
                                    />
                                </div>
                                <div className="grid max-h-60 grid-cols-1 gap-0.5 overflow-y-auto min-[420px]:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => selectLocale('system')}
                                        className="flex min-h-9 items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs font-medium text-neutral-gray-dark transition-colors hover:bg-white min-[420px]:col-span-2"
                                    >
                                        <span>{pickerLabels.followSystem}</span>
                                        {cookieMode === 'system' && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-king-forest" />}
                                    </button>
                                    {filteredLocales.map(code => {
                                        const meta = LOCALE_META[code];
                                        const isCurrent = code === lang;
                                        return (
                                            <button
                                                key={code}
                                                type="button"
                                                lang={meta.bcp47}
                                                dir={meta.dir}
                                                onClick={() => selectLocale(code)}
                                                className={cn(
                                                    'flex min-h-9 items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs transition-colors hover:bg-white',
                                                    isCurrent ? 'font-semibold text-king-forest' : 'text-neutral-gray-dark'
                                                )}
                                            >
                                                <span>{meta.nativeName}</span>
                                                {isCurrent && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-king-forest" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <Link href={`/${lang}/account`} onClick={closeMenus} className={cn(linkStyle, 'flex w-full')}>{nav.signInAccount}</Link>
                    </div>
                </nav>
            )}
            {showSupport && <SupportDialog open={isSupportOpen} onOpenChange={setIsSupportOpen} t={dict.supportDialog} />}
        </header>
    );
}
