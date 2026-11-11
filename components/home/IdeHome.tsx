import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Minus, Star } from 'lucide-react';
import { i18n, LOCALE_META, pickLocale, toBaseLocale, type Locale } from '@/i18n-config';
import type { getDictionary } from '@/get-dictionary';
import { RELEASES } from '@/content/releases';
import { REPO_URL } from '@/lib/structured-data';
import { getGithubStars } from '@/lib/github-stars';
import {
    EPISODES,
    FEATURED_EPISODE_IDS,
    PROMO_DURATION_SEC,
    formatDuration,
    posterSrc,
    promoVideoId,
    videoSrc,
    episodePath,
} from '@/lib/videos';
import { VideoPoster, type VideoPosterCopy } from '@/components/home/VideoPoster';

type Dict = Awaited<ReturnType<typeof getDictionary>>;

/**
 * 首页「律师的 IDE」（官网升级 2026-11，方向 A「纸与墨」，用户批准）。
 * 定位与文案对齐整体介绍视频 T99：律师的 IDE → 对话框是命令行 → 以案为单位 / 答案有出处 / 全程留痕。
 * 设计与取舍见 DESIGN.md「首页 · 纸与墨」与 /Users/Shared/claude-work/官网升级/01-诊断与方案.md。
 */

const PILLAR_IMAGES: Record<'zh' | 'en', { src: string; w: number; h: number; fit?: 'contain' | 'zoom' }[]> = {
    // 教程系列真实界面（虚构案件）：AI 核查结论旁的文书 / 手机现场采集与电脑卷宗 / 插件市场
    zh: [
        { src: '/images/home/pillar-case-zh.webp', w: 1800, h: 1012 },
        { src: '/images/home/pillar-field-zh.webp', w: 1800, h: 1125 },
        { src: '/images/home/pillar-market-zh.webp', w: 1800, h: 1012 },
    ],
    // 英文界面暂缺同场景截图，先用已有的真实英文界面图（待补拍，见方案文档）：
    // 第二张放大首屏图左侧的「Mobile capture · Warehouse visit」卷宗目录
    en: [
        { src: '/images/home/hero-en.webp', w: 2400, h: 1500 },
        { src: '/images/home/hero-en.webp', w: 2400, h: 1500, fit: 'zoom' },
        { src: '/images/feature-plugins-en.png', w: 2500, h: 940, fit: 'contain' },
    ],
};

/** 首屏真实界面：中英文用信息更完整的诉讼演示图，其余语种用该语种原生界面截图（同一三栏布局） */
export function heroImageFor(lang: Locale): { src: string; w: number; h: number } {
    if (lang === 'zh') return { src: '/images/home/hero-zh.webp', w: 2400, h: 1500 };
    if (lang === 'en') return { src: '/images/home/hero-en.webp', w: 2400, h: 1500 };
    return { src: `/images/hero-workspace-${lang}-native.png`, w: 2698, h: 1662 };
}

export function videoCopyFor(dict: Dict): VideoPosterCopy {
    const h = dict.home.ide.hero;
    return { closeLabel: h.closeVideo, loading: h.videoLoading, error: h.videoError, retry: h.videoRetry };
}

function GithubMark({ size = 16 }: { size?: number }) {
    return (
        <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}

export function IdeHome({ lang, dict }: { lang: Locale; dict: Dict }) {
    const t = dict.home.ide;
    const v = dict.videosPage;
    const base = toBaseLocale(lang);
    const stars = getGithubStars();
    const latest = RELEASES[0];
    const localeCount = i18n.locales.length;
    const bcp47 = LOCALE_META[lang].bcp47;
    const dateFmt = new Intl.DateTimeFormat(LOCALE_META[lang].bcp47, { year: 'numeric', month: 'short', day: 'numeric' });
    const changelog = RELEASES.slice(0, 3).map(r => ({
        version: r.version,
        date: dateFmt.format(new Date(`${r.date}T00:00:00`)),
        headline: 'contentKey' in r ? dict.updatesPage[r.contentKey].headline : pickLocale(r.headline, lang),
    }));
    const featured = FEATURED_EPISODE_IDS.map(id => EPISODES.find(e => e.id === id)!);
    const pillarImages = PILLAR_IMAGES[base];
    const heroImage = heroImageFor(lang);
    const videoCopy = videoCopyFor(dict);

    return (
        <div className="ide-home">
            {/* ── Hero ── */}
            <section className="ide-hero">
                <div className="ide-wrap ide-hero-copy">
                    <div className="ide-badges">
                        <span className="ide-pill">{t.hero.openSource}</span>
                        <Link href={`/${lang}/updates`} className="ide-pill ide-pill-accent">
                            {t.hero.releaseBadge.replace('{version}', latest.version)}
                            <ArrowRight aria-hidden size={13} className="rtl:-scale-x-100" />
                        </Link>
                    </div>
                    <p className="ide-brand">AI WorkDeck</p>
                    <h1 className="ide-display ide-h1">{t.hero.title}</h1>
                    <p className="ide-display ide-tagline">{t.hero.tagline}</p>
                    <p className="ide-lead">{t.hero.lead}</p>
                    <div className="ide-ctas">
                        <Link href={`/${lang}/start`} className="ide-btn ide-btn-primary">
                            {t.hero.download}
                            <ArrowRight aria-hidden size={16} className="rtl:-scale-x-100" />
                        </Link>
                        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="ide-btn ide-btn-ghost">
                            <GithubMark />
                            {t.hero.star}
                            {stars !== null && <span className="ide-btn-count">{stars.toLocaleString(bcp47)}</span>}
                        </a>
                    </div>
                    <p className="ide-meta">
                        {t.hero.meta.replace('{count}', String(localeCount))}
                    </p>
                </div>

                <div className="ide-wrap-wide">
                    <div className="ide-stage">
                        {/* 截图本身不镜像，标注位置跟随截图（物理方向），RTL 下也保持 ltr */}
                        <ol className="ide-zones" aria-hidden dir="ltr">
                            <li style={{ insetInlineStart: '4%' }}><span>1</span>{t.hero.zoneCase}</li>
                            <li style={{ insetInlineStart: '42%' }}><span>2</span>{t.hero.zoneDoc}</li>
                            <li style={{ insetInlineStart: '81%' }}><span>3</span>{t.hero.zoneAi}</li>
                        </ol>
                        <div className="ide-window">
                            <div className="ide-window-bar" aria-hidden><span /><span /><span /></div>
                            <VideoPoster
                                src={videoSrc(promoVideoId(lang))}
                                label={t.hero.watch}
                                duration={formatDuration(PROMO_DURATION_SEC)}
                                videoLabel={t.hero.videoAria}
                                copy={videoCopy}
                            >
                                <Image
                                    src={heroImage.src}
                                    alt={t.hero.imageAlt}
                                    width={heroImage.w}
                                    height={heroImage.h}
                                    priority
                                    sizes="(min-width: 1320px) 1240px, 100vw"
                                    className="ide-window-img"
                                />
                            </VideoPoster>
                        </div>
                    </div>
                </div>

                <div className="ide-wrap">
                    <dl className="ide-facts">
                        <div><dt>{t.facts.license}</dt><dd>AGPLv3</dd></div>
                        <div><dt>{t.facts.languages}</dt><dd>{localeCount}</dd></div>
                        <div><dt>{t.facts.platforms}</dt><dd>{t.facts.platformsValue}</dd></div>
                        <div><dt>{t.facts.local}</dt><dd>{t.facts.localValue}</dd></div>
                        {stars !== null && <div><dt>{t.facts.stars}</dt><dd>{stars.toLocaleString(bcp47)}</dd></div>}
                    </dl>
                </div>
            </section>

            {/* ── 为什么是 IDE ── */}
            <section className="ide-section ide-why">
                <div className="ide-wrap">
                    <p className="ide-eyebrow">{t.why.eyebrow}</p>
                    <h2 className="ide-display ide-h2">{t.why.title}</h2>
                    <p className="ide-body ide-why-body">{t.why.body}</p>
                    <div className="ide-compare">
                        <div className="ide-compare-col is-chat">
                            <h3>{t.why.chatTitle}</h3>
                            <ul>{t.why.chatPoints.map((p: string) => <li key={p}><Minus aria-hidden size={16} />{p}</li>)}</ul>
                        </div>
                        <div className="ide-compare-col is-ide">
                            <h3>{t.why.ideTitle}</h3>
                            <ul>{t.why.idePoints.map((p: string) => <li key={p}><Check aria-hidden size={16} />{p}</li>)}</ul>
                        </div>
                    </div>
                    <p className="ide-note">{t.why.note}</p>
                </div>
            </section>

            {/* ── 三件事 ── */}
            <section className="ide-section ide-pillars">
                <div className="ide-wrap">
                    <p className="ide-eyebrow">{t.pillars.eyebrow}</p>
                    <h2 className="ide-display ide-h2">{t.pillars.title}</h2>
                    {t.pillars.items.map((item: { title: string; body: string; alt: string }, i: number) => (
                        <div key={item.title} className={`ide-row${i % 2 ? ' is-reverse' : ''}`}>
                            <div className="ide-row-text">
                                <span className="ide-row-num">{String(i + 1).padStart(2, '0')}</span>
                                <h3 className="ide-display ide-h3">{item.title}</h3>
                                <p className="ide-body">{item.body}</p>
                            </div>
                            <div className={`ide-shot${pillarImages[i].fit ? ` is-${pillarImages[i].fit}` : ''}`}>
                                <Image
                                    src={pillarImages[i].src}
                                    alt={item.alt}
                                    width={pillarImages[i].w}
                                    height={pillarImages[i].h}
                                    sizes="(min-width: 1024px) 680px, 100vw"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── 视频教程 ── */}
            <section className="ide-section ide-videos">
                <div className="ide-wrap">
                    <div className="ide-section-head">
                        <div>
                            <p className="ide-eyebrow">{t.videos.eyebrow}</p>
                            <h2 className="ide-display ide-h2">{t.videos.title}</h2>
                            <p className="ide-body">{t.videos.body.replace('{count}', String(EPISODES.length))}</p>
                            {base !== 'zh' && <p className="ide-note">{t.videos.langNote}</p>}
                        </div>
                        <Link href={`/${lang}/videos`} className="ide-text-link">
                            {t.videos.all}<ArrowRight aria-hidden size={15} className="rtl:-scale-x-100" />
                        </Link>
                    </div>
                    <ul className="ide-episodes">
                        {featured.map(ep => (
                            <li key={ep.id}>
                                <VideoPoster
                                    src={videoSrc(ep.id)}
                                    label={`${v.play} · ${v.episodes[ep.id as keyof typeof v.episodes]}`}
                                    duration={formatDuration(ep.durationSec)}
                                    videoLabel={v.episodes[ep.id as keyof typeof v.episodes]}
                                    copy={videoCopy}
                                    variant="card"
                                    className="ide-episode-media"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- 封面经 /api/video 302 到 CDN 签名链接，Next Image 优化器拿不到 */}
                                    <img src={posterSrc(ep.id)} alt="" loading="lazy" width={1280} height={720} />
                                </VideoPoster>
                                <p className="ide-episode-meta">{v.series[ep.series]} · {formatDuration(ep.durationSec)}</p>
                                <p className="ide-episode-title"><Link href={episodePath(lang, ep.id)}>{v.episodes[ep.id as keyof typeof v.episodes]}</Link></p>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ── 开源 ── */}
            <section className="ide-section ide-open">
                <div className="ide-wrap ide-open-grid">
                    <div>
                        <p className="ide-eyebrow">{t.openSource.eyebrow}</p>
                        <h2 className="ide-display ide-h2">{t.openSource.title}</h2>
                        <p className="ide-body">{t.openSource.body}</p>
                        <div className="ide-ctas ide-ctas-start">
                            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="ide-btn ide-btn-light">
                                <Star aria-hidden size={16} />{t.openSource.star}
                            </a>
                            <a href={`${REPO_URL}/blob/master/.github/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" className="ide-btn ide-btn-outline-light">
                                {t.openSource.contributing}<ArrowUpRight aria-hidden size={15} />
                            </a>
                        </div>
                    </div>
                    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="ide-repo">
                        <span className="ide-repo-name"><GithubMark size={18} />AI-WorkDeck / aiworkdeck</span>
                        <span className="ide-repo-stats">
                            {stars !== null && <span><Star aria-hidden size={14} /> {stars.toLocaleString(bcp47)} {t.openSource.stars}</span>}
                            <span>{t.openSource.license} AGPL-3.0</span>
                            <span>{t.openSource.latest} v{latest.version}</span>
                        </span>
                        <span className="ide-repo-term" dir="ltr">
                            <span className="ide-repo-term-label">{t.openSource.runFromSource}</span>
                            <code>$ git clone https://github.com/AI-WorkDeck/aiworkdeck</code>
                        </span>
                    </a>
                </div>
            </section>

            {/* ── 更新日志 ── */}
            <section className="ide-section ide-changelog">
                <div className="ide-wrap">
                    <div className="ide-section-head">
                        <div>
                            <p className="ide-eyebrow">{t.changelog.eyebrow}</p>
                            <h2 className="ide-display ide-h2">{t.changelog.title}</h2>
                        </div>
                        <Link href={`/${lang}/updates`} className="ide-text-link">
                            {t.changelog.all}<ArrowRight aria-hidden size={15} className="rtl:-scale-x-100" />
                        </Link>
                    </div>
                    <ol className="ide-log">
                        {changelog.map(r => (
                            <li key={r.version}>
                                <span className="ide-log-v">v{r.version} · {r.date}</span>
                                <p>{r.headline}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>
        </div>
    );
}

/** 收尾：放在文章与定价之后，作为整页最后一屏 */
export function IdeFinal({ lang, dict }: { lang: Locale; dict: Dict }) {
    const t = dict.home.ide.final;
    return (
        <section className="ide-home ide-final-wrap">
            <div className="ide-wrap">
                <div className="ide-final">
                    <h2 className="ide-display ide-final-title">{t.line1}<br /><em>{t.line2}</em></h2>
                    <div className="ide-ctas">
                        <Link href={`/${lang}/start`} className="ide-btn ide-btn-primary">{t.download}<ArrowRight aria-hidden size={16} className="rtl:-scale-x-100" /></Link>
                        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="ide-btn ide-btn-ghost"><Star aria-hidden size={16} />{t.star}</a>
                    </div>
                </div>
            </div>
        </section>
    );
}
