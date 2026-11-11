import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import { siteConfig } from '@/lib/site-config';
import {
    EPISODES,
    episodeNumber,
    episodePath,
    findEpisode,
    formatDuration,
    posterSrc,
    seriesEpisodes,
    videoSrc,
} from '@/lib/videos';
import { VideoPoster } from '@/components/home/VideoPoster';
import { videoCopyFor } from '@/components/home/IdeHome';

type Params = Promise<{ lang: Locale; id: string }>;

export function generateStaticParams() {
    return EPISODES.map(e => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { lang, id } = await params;
    const ep = findEpisode(id);
    if (!ep) return {};
    const t = (await getDictionary(lang)).videosPage;
    const title = t.episodes[ep.id as keyof typeof t.episodes];
    return {
        title,
        description: `${t.series[ep.series]} · ${title} — ${t.lead}`,
        alternates: pageAlternates(lang, `/videos/${ep.id}`, { crossSite: true }),
    };
}

/** 单集页：每集一个可分享、可被搜索的地址（宣传片与全集列表在 /videos）。 */
export default async function EpisodePage({ params }: { params: Params }) {
    const { lang, id } = await params;
    const ep = findEpisode(id);
    if (!ep) notFound();
    const dict = await getDictionary(lang);
    const t = dict.videosPage;
    const title = (e: typeof ep) => t.episodes[e.id as keyof typeof t.episodes];
    const siblings = seriesEpisodes(ep.series);
    const idx = siblings.indexOf(ep);
    const prev = siblings[idx - 1];
    const next = siblings[idx + 1];
    const n = episodeNumber(ep);
    const others = siblings.filter(e => e !== ep);
    const videoCopy = videoCopyFor(dict);

    // 机器可读：让搜索引擎把这页认成一条视频（缩略图与播放地址都走本站 /api/video）
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: title(ep),
        description: `${t.series[ep.series]} · ${title(ep)}`,
        thumbnailUrl: `${siteConfig.origin}${posterSrc(ep.id)}`,
        contentUrl: `${siteConfig.origin}${videoSrc(ep.id)}`,
        uploadDate: '2026-11-05',
        duration: `PT${Math.floor(ep.durationSec / 60)}M${ep.durationSec % 60}S`,
        inLanguage: 'zh-CN',
    };

    return (
        <div className="ide-home">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <section className="ide-hero ide-episode-hero">
                <div className="ide-wrap">
                    <Link href={`/${lang}/videos#${ep.series}`} className="ide-text-link ide-episode-back">
                        <ArrowLeft aria-hidden size={15} className="rtl:-scale-x-100" />{t.backToAll}
                    </Link>
                    <p className="ide-eyebrow">{t.episodeEyebrow.replace('{series}', t.series[ep.series]).replace('{n}', String(n))} · {formatDuration(ep.durationSec)}</p>
                    <h1 className="ide-display ide-h2">{title(ep)}</h1>
                    {toBaseLocale(lang) !== 'zh' && <p className="ide-note">{t.langNote}</p>}
                </div>
                <div className="ide-wrap ide-videos-promo">
                    <div className="ide-window">
                        <div className="ide-window-bar" aria-hidden><span /><span /><span /></div>
                        <VideoPoster src={videoSrc(ep.id)} label={t.play} duration={formatDuration(ep.durationSec)} videoLabel={title(ep)} copy={videoCopy}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- 封面经 /api/video 302 到 CDN 签名链接 */}
                            <img src={posterSrc(ep.id)} alt="" width={1280} height={720} className="ide-window-img" />
                        </VideoPoster>
                    </div>
                    <nav className="ide-episode-nav" aria-label={t.moreInSeries}>
                        {prev ? (
                            <Link href={episodePath(lang, prev.id)} className="ide-episode-step">
                                <span className="ide-episode-meta"><ArrowLeft aria-hidden size={13} className="rtl:-scale-x-100" /> {t.prev}</span>
                                <span className="ide-episode-title">{title(prev)}</span>
                            </Link>
                        ) : <span />}
                        {next ? (
                            <Link href={episodePath(lang, next.id)} className="ide-episode-step is-next">
                                <span className="ide-episode-meta">{t.next} <ArrowRight aria-hidden size={13} className="rtl:-scale-x-100" /></span>
                                <span className="ide-episode-title">{title(next)}</span>
                            </Link>
                        ) : <span />}
                    </nav>
                </div>
            </section>

            {others.length > 0 && (
                <section className="ide-section ide-series">
                    <div className="ide-wrap">
                        <div className="ide-section-head">
                            <h2 className="ide-display ide-h3">{t.moreInSeries.replace('{series}', t.series[ep.series])}</h2>
                            <Link href={`/${lang}/videos`} className="ide-text-link">{t.backToAll}<ArrowRight aria-hidden size={15} className="rtl:-scale-x-100" /></Link>
                        </div>
                        <ul className="ide-episodes">
                            {others.map(e => (
                                <li key={e.id}>
                                    <Link href={episodePath(lang, e.id)} className="ide-episode-link">
                                        <span className="ide-episode-media ide-episode-thumb">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- 同上 */}
                                            <img src={posterSrc(e.id)} alt="" loading="lazy" width={1280} height={720} />
                                        </span>
                                        <span className="ide-episode-meta">{t.episodeEyebrow.replace('{series}', t.series[e.series]).replace('{n}', String(episodeNumber(e)))} · {formatDuration(e.durationSec)}</span>
                                        <span className="ide-episode-title">{title(e)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            )}
        </div>
    );
}
