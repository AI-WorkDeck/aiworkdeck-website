'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Download, RotateCcw, Share2, Smartphone } from 'lucide-react';
import { Locale, toBaseLocale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import {
    QUIZ_QUESTIONS, QUIZ_TYPE_MAP, QUIZ_TYPES,
    computeQuizResult, sanitizeNickname, type QuizResultData,
} from '@/lib/quiz-data';
import { PALETTE_SWATCHES } from '../cert/[id]/CertStylePicker';

/** 结果卡布局（与 lib/quiz-card.ts QUIZ_CARD_LAYOUTS 同序；词典标签复用 certPage.layouts） */
const CARD_LAYOUTS = ['seal', 'editorial', 'grand'] as const;

/**
 * 「法人格」答题流程（dev-board#329）。
 *
 * - 计分全在客户端，答案不上传（结果页免责声明如实写）。
 * - 昵称放在答完之后再要（沉没成本防流失，网易云 H5 验证过的顺序），且可跳过。
 * - 登录用户出结果时自动存到个人主页；未登录给注册 CTA——沉淀动作放测后不放测前。
 * - 无任何「分享解锁/分享得利」设计（微信利诱分享红线，lib/badges.ts 同款不变式）。
 */

type Stage = 'intro' | 'quiz' | 'nick' | 'result';

function track(ev: string, extra?: Record<string, string>) {
    try {
        void fetch('/api/quiz/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ev, ...extra }),
            keepalive: true,
        });
    } catch { /* 埋点尽力而为 */ }
}

export function QuizFlow({ lang, t, tStyle, from, loggedIn, username, completes, typeCounts }: {
    lang: Locale;
    t: any;
    /** 样式选择器标签，复用 certPage 词典（布局/配色名两边一致） */
    tStyle: any;
    from: string;
    loggedIn: boolean;
    username: string;
    completes: number;
    /** 各类型已解锁人数（页面加载时点的服务端统计，用于「全网第 N 位」与热榜） */
    typeCounts: Record<string, number>;
}) {
    const [stage, setStage] = useState<Stage>('intro');
    const [qIndex, setQIndex] = useState(0);
    const [answers, setAnswers] = useState<number[]>([]);
    const [nickname, setNickname] = useState('');
    const [result, setResult] = useState<QuizResultData | null>(null);
    const [saved, setSaved] = useState(false);
    const [imgLoading, setImgLoading] = useState(true);
    const [layout, setLayout] = useState<(typeof CARD_LAYOUTS)[number]>('seal');
    const [palette, setPalette] = useState<(typeof PALETTE_SWATCHES)[number]['id']>('forest');
    // 文案版本（dev-board#329 维护者洞察：有人把卡分享给客户看）：
    // peer=同行梗版（苦劳自嘲），biz=客户名片版（专业定位句）。仅执业池显示切换
    const [variant, setVariant] = useState<'peer' | 'biz'>('peer');
    // 系统分享面板（Web Share API Level 2）：手机上一步把结果卡发进微信/存进相册。
    // 「长按保存」计不到数，这颗按钮是保存行为唯一可测的入口
    const [canShareFile, setCanShareFile] = useState(false);
    useEffect(() => {
        try {
            const probe = new File([''], 'probe.png', { type: 'image/png' });
            setCanShareFile(!!navigator.canShare?.({ files: [probe] }));
        } catch { /* 老浏览器没有 File 构造器或 canShare，走下载按钮 */ }
    }, []);

    const zh = toBaseLocale(lang) === 'zh';
    const total = QUIZ_QUESTIONS.length;

    const start = () => {
        track('start', from ? { from } : undefined);
        setStage('quiz');
    };

    const answer = (choice: number) => {
        const next = [...answers, choice];
        setAnswers(next);
        if (qIndex + 1 < total) {
            setQIndex(qIndex + 1);
        } else {
            setStage('nick');
        }
    };

    const finish = () => {
        const r = computeQuizResult(answers);
        setResult(r);
        setImgLoading(true);
        setStage('result');
        track('complete', { typeId: r.typeId, ...(nickname ? { n: nickname } : {}) });
        if (loggedIn) {
            void fetch('/api/quiz/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ typeId: r.typeId, dims: r.dims }),
            }).then(res => setSaved(res.ok)).catch(() => { });
        }
    };

    const retake = () => {
        setStage('quiz');
        setQIndex(0);
        setAnswers([]);
        setResult(null);
        setSaved(false);
    };

    if (stage === 'intro') {
        return (
            <div className="rounded-xl border border-neutral-gray-light bg-white p-8 text-center">
                {completes > 0 && (
                    <p className="mb-4 text-[13px] text-neutral-gray-medium">
                        {(t.statLine as string).replace('{n}', String(completes))}
                    </p>
                )}
                <Button variant="accent" className="h-12 w-full max-w-xs gap-2 text-[15px] font-bold" onClick={start}>
                    {t.start}
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Button>
                {/* 人格图鉴预告（dev-board#329 维护者追加）：让人先看到「有什么可解锁」 */}
                <p className="mt-7 text-[12px] uppercase tracking-[0.2em] text-king-forest/80">
                    {(t.introTypes as string).replace('{n}', String(QUIZ_TYPES.filter(x => x.pool !== 'egg').length))}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {QUIZ_TYPES.filter(x => x.pool !== 'egg').map(x => (
                        <span key={x.id}
                            className="rounded-full border border-neutral-gray-light px-2.5 py-0.5 text-[11.5px] text-neutral-gray-medium">
                            {zh ? x.nameZh : x.nameEn}
                        </span>
                    ))}
                    <span className="rounded-full border border-dashed border-king-forest/40 px-2.5 py-0.5 text-[11.5px] text-king-forest/80">
                        {t.hiddenChip}
                    </span>
                </div>
                <p className="mx-auto mt-6 max-w-sm text-[12px] leading-relaxed text-neutral-gray-medium">{t.disclaimer}</p>
            </div>
        );
    }

    if (stage === 'quiz') {
        const q = QUIZ_QUESTIONS[qIndex];
        return (
            <div key={qIndex} className="rounded-xl border border-neutral-gray-light bg-white p-6 md:p-8">
                <p className="text-[12px] uppercase tracking-[0.2em] text-king-forest/80">
                    {(t.remain as string).replace('{n}', String(total - qIndex))}
                </p>
                <h2 className="mt-3 font-display text-xl font-semibold leading-relaxed text-neutral-dark-bg md:text-2xl">
                    {zh ? q.zh : q.en}
                </h2>
                <div className="mt-6 flex flex-col gap-3">
                    {q.options.map((opt, i) => (
                        <button key={i} type="button" onClick={() => answer(i)}
                            className="rounded-lg border border-neutral-gray-light bg-white px-5 py-3.5 text-left text-[14.5px] leading-relaxed text-neutral-gray-dark transition-colors hover:border-king-forest/60 hover:bg-king-forest/[0.04] hover:text-neutral-dark-bg">
                            {zh ? opt.zh : opt.en}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (stage === 'nick') {
        return (
            <div className="rounded-xl border border-neutral-gray-light bg-white p-6 text-center md:p-8">
                <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.nickTitle}</h2>
                <p className="mt-2 text-[13px] text-neutral-gray-medium">{t.nickHint}</p>
                <input
                    value={nickname}
                    onChange={e => setNickname(sanitizeNickname(e.target.value))}
                    placeholder={t.nickPlaceholder}
                    maxLength={12}
                    className="mx-auto mt-5 block h-11 w-full max-w-xs rounded-lg border border-neutral-gray-light bg-white px-4 text-center text-[15px] text-neutral-dark-bg outline-none transition-shadow focus:ring-2 focus:ring-king-mint"
                />
                <Button variant="accent" className="mt-5 h-12 w-full max-w-xs gap-2 text-[15px] font-bold" onClick={finish}>
                    {t.generate}
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Button>
            </div>
        );
    }

    // result
    const type = result ? QUIZ_TYPE_MAP[result.typeId] : undefined;
    if (!result || !type) return null;
    // 「全网第 N 位解锁」：页面加载时点的该类型完成数 +1。并发下会撞号，
    // 参与感编号不是台账，可接受；卡面同号由 &s= 带给出图 API
    const unlockSeq = (typeCounts[result.typeId] ?? 0) + 1;
    const hotTop = Object.entries(typeCounts)
        .filter(([id]) => QUIZ_TYPE_MAP[id])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    const qs = `type=${result.typeId}&a=${result.dims[0]}&b=${result.dims[1]}&c=${result.dims[2]}` +
        `&layout=${layout}&palette=${palette}&s=${unlockSeq}${variant === 'biz' ? '&v=biz' : ''}` +
        `${nickname ? `&n=${encodeURIComponent(nickname)}` : ''}${zh ? '' : '&lang=en'}`;

    const shareCard = async () => {
        track('share', { typeId: result.typeId, v: variant, ...(nickname ? { n: nickname } : {}) });
        try {
            const blob = await (await fetch(`/api/quiz/card?${qs}`)).blob();
            const file = new File([blob], `${t.shareFilePrefix || 'legal-persona'}-${result.typeId}.png`, { type: 'image/png' });
            await navigator.share({ files: [file] });
        } catch { /* 用户取消或不支持：静默，下载按钮仍在 */ }
    };

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="text-center">
                <p className="text-[13px] uppercase tracking-[0.22em] text-king-forest/80">
                    {t.resultEyebrow}
                    <span className="ml-2 font-display text-[15px] font-black normal-case tracking-normal text-neutral-dark-bg">
                        {zh ? type.nameZh : type.nameEn}
                    </span>
                </p>
                <p className="mt-2 text-[13px] text-neutral-gray-dark">
                    {(t.unlockLine as string).replace('{n}', String(unlockSeq))}
                </p>
                {completes >= 10 && hotTop.length >= 3 && (
                    <p className="mt-1 text-[12px] text-neutral-gray-medium">
                        {t.hotLine}
                        {hotTop.map(([id, n]) =>
                            `${zh ? QUIZ_TYPE_MAP[id].nameZh : QUIZ_TYPE_MAP[id].nameEn} ×${n}`
                        ).join(' · ')}
                    </p>
                )}
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={`/api/quiz/card?${qs}`}
                alt={zh ? type.nameZh : type.nameEn}
                width={540} height={720}
                onLoad={() => setImgLoading(false)}
                className={`w-full max-w-[420px] rounded-lg shadow-[0_30px_80px_-24px_rgba(46,90,80,0.45)] transition-opacity duration-200 ${imgLoading ? 'opacity-60' : 'opacity-100'}`}
            />
            <p className="-mt-2 flex items-center gap-1.5 text-[12.5px] text-neutral-gray-medium md:hidden">
                <Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t.mobileSaveHint}
            </p>

            {/* 保存/分享动作紧贴结果图（dev-board#329：原来被样式选择器隔开，主 CTA 掉出首屏） */}
            <div className="flex w-full max-w-[420px] flex-col gap-3">
                {canShareFile && (
                    <Button variant="accent" className="h-12 w-full gap-2 font-bold" onClick={() => void shareCard()}>
                        <Share2 className="h-4 w-4" strokeWidth={1.75} />
                        {t.shareBtn}
                    </Button>
                )}
                <a href={`/api/quiz/card?${qs}&download=1`} className="block"
                    onClick={() => track('download', { typeId: result.typeId, v: variant, ...(nickname ? { n: nickname } : {}) })}>
                    <Button variant={canShareFile ? 'outline' : 'accent'}
                        className={`h-12 w-full gap-2 font-bold ${canShareFile ? 'border-king-forest text-king-forest' : ''}`}>
                        <Download className="h-4 w-4" strokeWidth={1.75} />
                        {t.download}
                    </Button>
                </a>
            </div>

            {/* 样式自选（与证书同权，dev-board#329 维护者拍板）：布局三式 + 12 配色 */}
            <div className="w-full max-w-[420px] rounded-xl border border-neutral-gray-light bg-white p-4">
                {type.bizZh && (
                    <>
                        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.variantLabel}</p>
                        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-neutral-gray-light bg-white p-1">
                            {(['peer', 'biz'] as const).map(v => (
                                <button key={v} type="button"
                                    onClick={() => { if (v !== variant) { setImgLoading(true); setVariant(v); } }}
                                    className={`rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                                        v === variant ? 'bg-king-forest text-white' : 'text-neutral-gray-medium hover:text-neutral-gray-dark'
                                    }`}>
                                    {v === 'peer' ? t.variantPeer : t.variantBiz}
                                </button>
                            ))}
                        </div>
                    </>
                )}
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{tStyle.layoutLabel}</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-neutral-gray-light bg-white p-1">
                    {CARD_LAYOUTS.map(l => (
                        <button key={l} type="button"
                            onClick={() => { if (l !== layout) { setImgLoading(true); setLayout(l); } }}
                            className={`rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                                l === layout ? 'bg-king-forest text-white' : 'text-neutral-gray-medium hover:text-neutral-gray-dark'
                            }`}>
                            {tStyle.layouts[l]}
                        </button>
                    ))}
                </div>
                <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">
                    {tStyle.paletteLabel}
                    <span className="ml-2 font-bold normal-case tracking-normal text-neutral-dark-bg">
                        {tStyle.palettes[palette]}
                    </span>
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                    {PALETTE_SWATCHES.map(p => (
                        <button key={p.id} type="button" aria-label={tStyle.palettes[p.id]} title={tStyle.palettes[p.id]}
                            onClick={() => { if (p.id !== palette) { setImgLoading(true); setPalette(p.id); } }}
                            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
                                p.id === palette ? 'scale-110' : ''
                            }`}
                            style={{ backgroundColor: p.swatch, borderColor: p.id === palette ? p.ring : 'rgba(0,0,0,0.12)' }}>
                            {p.id === palette && (
                                <Check className="h-3.5 w-3.5" strokeWidth={2.5}
                                    style={{ color: p.light ? 'var(--neutral-gray-dark)' : 'var(--neutral-white)' }} />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex w-full max-w-[420px] flex-col gap-3">
                {/* 产品桥（dev-board#329 维护者反馈「扫完就完了」）：放在测后情绪高点，
                    用刚测出的类型说一句「被看懂」的产品话术，把测试流量接进产品认知 */}
                <div className="overflow-hidden rounded-xl bg-king-forest-darker text-white">
                    <div className="bg-gradient-to-br from-king-forest-darker via-king-forest to-king-forest-darker p-5">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-king-mint/80">{t.bridge.eyebrow}</p>
                        <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/90">
                            {zh ? type.pitchZh : type.pitchEn}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                            <Link href={`/${lang}/start?ref=quiz-${result.typeId}`}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-king-mint px-4 text-[13px] font-bold text-king-forest-darker transition-colors hover:bg-king-mint-lighter">
                                {t.bridge.start}
                                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
                            </Link>
                            <Link href={`/${lang}/articles`} className="text-[13px] font-medium text-king-mint hover:underline">
                                {t.bridge.articles}
                            </Link>
                            <Link href={`/${lang}/marketplace`} className="text-[13px] font-medium text-king-mint hover:underline">
                                {t.bridge.marketplace}
                            </Link>
                        </div>
                        {!loggedIn && (
                            <p className="mt-3.5 border-t border-white/10 pt-3 text-[12px] leading-relaxed">
                                <Link href={`/${lang}/start?ref=quiz-save-${result.typeId}`}
                                    className="text-white/70 underline decoration-white/30 underline-offset-2 transition-colors hover:text-king-mint">
                                    {t.saveCta}
                                </Link>
                            </p>
                        )}
                    </div>
                </div>

                {loggedIn && saved && (
                    <p className="flex items-center justify-center gap-1.5 text-[13px] text-king-forest">
                        <Check className="h-4 w-4" strokeWidth={2} />
                        {t.savedToProfile}
                        <Link href={`/${lang}/u/${encodeURIComponent(username)}`} className="font-bold hover:underline">
                            {t.viewProfile}
                        </Link>
                    </p>
                )}

                <button type="button" onClick={retake}
                    className="mx-auto inline-flex items-center gap-1.5 text-[13px] text-neutral-gray-medium transition-colors hover:text-king-forest">
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.retake}
                </button>
            </div>

            <p className="max-w-sm text-center text-[12px] leading-relaxed text-neutral-gray-medium">{t.disclaimer}</p>
        </div>
    );
}
