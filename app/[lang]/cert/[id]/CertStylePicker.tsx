'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Download, Smartphone } from 'lucide-react';
import { Locale, toBaseLocale } from '@/i18n-config';
import { Button } from '@/components/ui/button';

/**
 * 证书查看器（dev-board#309）：三布局 x 五配色自选 + 下载。
 *
 * 布局裁决（2026-08-31 维护者反馈返工）：大屏（24/27 寸）下选择器与下载按钮
 * 垂直堆在图下方，首屏根本看不见，而左右都是空的——改为 lg 起左图右控两栏，
 * 全部操作首屏可见；窄屏保持竖排，并提示「长按图片保存」（微信内原生行为，
 * 图片未做任何阻止，长按即可存图/转发）。
 */

const LAYOUTS = ['seal', 'editorial', 'ticket', 'grand', 'sticker', 'bold'] as const;
/* 色点样本导出给法人格结果卡选择器复用（dev-board#329）。
   这里是 lib/certificate.ts PALETTES 的**手抄副本**——certificate.ts 带 'server-only'，
   本文件是客户端组件，导不进来。契约（东方清雅换代 dev-board#731 一并复核过）：
     swatch === PALETTES[id].bg[1]   ring === PALETTES[id].metal   light === PALETTES[id].light
   改配色两边必须一起改，改完对拍一遍再提交。 */
export const PALETTE_SWATCHES = [
    { id: 'forest', swatch: '#18302A', ring: '#89A8A0', light: false },
    { id: 'nightgold', swatch: '#2D281A', ring: '#D7C5A1', light: false },
    { id: 'navy', swatch: '#181F2F', ring: '#BFAC88', light: false },
    { id: 'paper', swatch: '#F1EFE7', ring: '#7E6439', light: true },
    { id: 'plum', swatch: '#2B1A2D', ring: '#C2B18E', light: false },
    { id: 'sakura', swatch: '#F5E6E9', ring: '#894D59', light: true },
    { id: 'sakuranight', swatch: '#2D1A21', ring: '#CD98AA', light: false },
    { id: 'lavender', swatch: '#EBE6F5', ring: '#68538D', light: true },
    { id: 'starlit', swatch: '#1D192E', ring: '#9D95C6', light: false },
    { id: 'mintcream', swatch: '#E6F5F0', ring: '#447967', light: true },
    { id: 'teal', swatch: '#192A2E', ring: '#8BB2BB', light: false },
    { id: 'sunset', swatch: '#2E1F19', ring: '#C89C89', light: false },
] as const;

export function CertStylePicker({ lang, t, certId, badgeName, seq, awardedTo, profileHref }: {
    lang: Locale;
    t: any;
    certId: string;
    badgeName: string;
    seq?: number;
    awardedTo: string;
    profileHref: string;
}) {
    const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>('seal');
    const [palette, setPalette] = useState<(typeof PALETTE_SWATCHES)[number]['id']>('forest');
    const [loading, setLoading] = useState(false);

    const qs = `layout=${layout}&palette=${palette}${toBaseLocale(lang) === 'en' ? '&lang=en' : ''}`;
    const imgSrc = `/api/cert/${certId}?${qs}`;
    const downloadHref = `/api/cert/${certId}?${qs}&download=1`;

    return (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
            {/* 左：证书图（大屏吸顶，滚动时始终可见） */}
            <div className="lg:sticky lg:top-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    key={imgSrc}
                    src={imgSrc}
                    alt={badgeName}
                    width={540}
                    height={720}
                    onLoad={() => setLoading(false)}
                    className={`mx-auto w-full max-w-[560px] rounded-lg shadow-[0_30px_80px_-24px_rgba(46,90,80,0.45)] transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}
                />
                {/* 窄屏（多为手机/微信内）：长按图片即可保存转发 */}
                <p className="mt-4 flex items-center justify-center gap-1.5 text-[12.5px] text-neutral-gray-medium lg:hidden">
                    <Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.mobileSaveHint}
                </p>
            </div>

            {/* 右：信息与全部操作（大屏首屏全见） */}
            <div className="flex flex-col gap-6">
                <div>
                    <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-king-forest/70">{t.eyebrow}</p>
                    <h1 className="font-display text-2xl font-semibold text-neutral-dark-bg md:text-3xl">
                        {badgeName}
                        {seq ? <span className="text-king-forest-lighter"> · No.{seq}</span> : null}
                    </h1>
                    <p className="mt-2 text-sm text-neutral-gray-medium">{awardedTo}</p>
                </div>

                <div>
                    <p className="mb-2.5 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.layoutLabel}</p>
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-neutral-gray-light bg-white p-1">
                        {LAYOUTS.map(l => (
                            <button key={l} type="button"
                                onClick={() => { if (l !== layout) { setLoading(true); setLayout(l); } }}
                                className={`rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                                    l === layout ? 'bg-king-forest text-white' : 'text-neutral-gray-medium hover:text-neutral-gray-dark'
                                }`}>
                                {t.layouts[l]}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    {/* 12 色圆点缩小换行排布（维护者 2026-08-31：色多之后圆点要小），
                        逐色标签取消改 title 提示，选中色名字挂在标题行 */}
                    <p className="mb-2.5 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">
                        {t.paletteLabel}
                        <span className="ml-2 font-bold normal-case tracking-normal text-neutral-dark-bg">
                            {t.palettes[palette]}
                        </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                        {PALETTE_SWATCHES.map(p => (
                            <button key={p.id} type="button" aria-label={t.palettes[p.id]} title={t.palettes[p.id]}
                                onClick={() => { if (p.id !== palette) { setLoading(true); setPalette(p.id); } }}
                                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
                                    p.id === palette ? 'scale-110' : ''
                                }`}
                                style={{ backgroundColor: p.swatch, borderColor: p.id === palette ? p.ring : 'rgba(0,0,0,0.12)' }}>
                                {p.id === palette && (
                                    <Check className="h-3.5 w-3.5" strokeWidth={2.5}
                                        style={{ color: p.light ? '#2B2A26' : '#FCFBF7' }} />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <a href={downloadHref} className="block">
                    <Button variant="accent" className="w-full gap-2 font-bold">
                        <Download className="h-4 w-4" strokeWidth={1.75} />
                        {t.download}
                    </Button>
                </a>

                <p className="text-[13px] leading-relaxed text-neutral-gray-medium">{t.shareHint}</p>

                <Link href={profileHref}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-king-forest hover:underline">
                    {t.viewProfile}
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Link>
            </div>
        </div>
    );
}
