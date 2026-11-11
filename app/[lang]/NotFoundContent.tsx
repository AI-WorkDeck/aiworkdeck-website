'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { i18n, pickLocale, type BaseLocale, type Locale } from '@/i18n-config';

export interface NotFoundCopy {
    code: string;
    title: string;
    body: string;
    home: string;
    marketplace: string;
}

/**
 * 404 正文。**必须是客户端组件**：`not-found.tsx` 拿不到 `params`，
 * 而唯一不打破静态渲染的取语种途径就是 `useParams()`（`headers()` 会把整棵树
 * 拉成动态渲染）。两份文案由服务端一次性传进来，客户端只挑一份，
 * 不会把整本字典打进 bundle。
 */
export function NotFoundContent({
    copy,
}: {
    copy: Record<BaseLocale, NotFoundCopy> & Partial<Record<Locale, NotFoundCopy>>;
}) {
    const params = useParams<{ lang?: string }>();
    const raw = params?.lang;
    const lang: Locale = (i18n.locales as readonly string[]).includes(raw ?? '')
        ? (raw as Locale)
        : i18n.defaultLocale;
    const t = pickLocale(copy, lang);

    return (
        <div className="flex min-h-[60vh] items-center justify-center bg-neutral-gray-pale px-4 py-24">
            <div className="w-full max-w-xl text-center">
                <p className="font-mono text-[13px] tracking-[0.3em] text-king-forest/60">{t.code}</p>
                <h1 className="mt-5 font-display text-3xl font-black tracking-tight text-neutral-dark-bg md:text-4xl">
                    {t.title}
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed text-neutral-gray-medium">{t.body}</p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                        href={`/${lang}`}
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-king-forest px-6 text-[14px] font-bold text-white transition-colors hover:bg-king-forest-darker sm:w-auto"
                    >
                        {t.home}
                    </Link>
                    <Link
                        href={`/${lang}/marketplace`}
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-neutral-gray-light bg-white px-6 text-[14px] font-medium text-neutral-dark-bg transition-colors hover:border-king-forest/30 sm:w-auto"
                    >
                        {t.marketplace}
                    </Link>
                </div>
            </div>
        </div>
    );
}
