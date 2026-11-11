import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import {
    EPISODES,
    EPISODE_SERIES,
    PROMO_DURATION_SEC,
    formatDuration,
    posterSrc,
    promoVideoId,
    videoSrc,
    episodePath,
} from '@/lib/videos';
import { VideoPoster } from '@/components/home/VideoPoster';
import { heroImageFor, videoCopyFor } from '@/components/home/IdeHome';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.videosPage.metaTitle,
        description: dict.videosPage.metaDescription,
        alternates: pageAlternates(lang, '/videos', { crossSite: true }),
    };
}

/** 视频教程：宣传片（按语种配音）+ 全部操作教程，按系列分组。视频经 /api/video 点播时现签 CDN 链接。 */
export default async function VideosPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.videosPage;
    const videoCopy = videoCopyFor(dict);
    const heroImage = heroImageFor(lang);

    return (
        <div className="ide-home">
            <section className="ide-hero ide-videos-hero">
                <div className="ide-wrap">
                    <p className="ide-eyebrow">{t.eyebrow}</p>
                    <h1 className="ide-display ide-h2">{t.title}</h1>
                    <p className="ide-body">{t.lead}</p>
                    <p className="ide-note">{t.langNote}</p>
                </div>
                <div className="ide-wrap ide-videos-promo">
                    <div className="ide-window">
                        <VideoPoster src={videoSrc(promoVideoId(lang))} label={dict.home.ide.hero.watch} duration={formatDuration(PROMO_DURATION_SEC)} videoLabel={dict.home.ide.hero.videoAria} copy={videoCopy}>
                            <Image src={heroImage.src} alt={dict.home.ide.hero.imageAlt} width={heroImage.w} height={heroImage.h} priority sizes="(min-width: 1160px) 1080px, 100vw" className="ide-window-img" />
                        </VideoPoster>
                    </div>
                    <p className="ide-episode-title">{t.promoTitle}</p>
                    <p className="ide-note">{t.promoBody}</p>
                </div>
            </section>

            {EPISODE_SERIES.map(series => {
                const eps = EPISODES.filter(e => e.series === series);
                return (
                    <section key={series} id={series} className="ide-section ide-series">
                        <div className="ide-wrap">
                            <div className="ide-section-head">
                                <h2 className="ide-display ide-h3">{t.series[series]}</h2>
                                <span className="ide-episode-meta">{t.episodeCount.replace('{count}', String(eps.length))}</span>
                            </div>
                            <ul className="ide-episodes">
                                {eps.map(ep => {
                                    const title = t.episodes[ep.id as keyof typeof t.episodes];
                                    return (
                                        <li key={ep.id}>
                                            <VideoPoster src={videoSrc(ep.id)} label={`${t.play} · ${title}`} duration={formatDuration(ep.durationSec)} videoLabel={title} copy={videoCopy} variant="card" className="ide-episode-media">
                                                {/* eslint-disable-next-line @next/next/no-img-element -- 封面经 /api/video 302 到 CDN 签名链接 */}
                                                <img src={posterSrc(ep.id)} alt="" loading="lazy" width={1280} height={720} />
                                            </VideoPoster>
                                            <p className="ide-episode-meta">{t.series[series]} {ep.id.slice(-2)} · {formatDuration(ep.durationSec)}</p>
                                            <p className="ide-episode-title"><Link href={episodePath(lang, ep.id)}>{title}</Link></p>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
