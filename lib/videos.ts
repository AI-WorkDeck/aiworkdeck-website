// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Locale } from '@/i18n-config';

/**
 * 官网视频目录：宣传片（多语种配音）与操作教程（中文）。
 *
 * 文件托管在 OSS 桶 awd-downloads 的 videos/ 前缀，经 CDN dl.aiworkdeck.com 分发。
 * CDN 开了 type A URL 鉴权（签名 1 小时有效），所以页面里**不直接写 CDN 链接**，
 * 而是写 /api/video?id=…：点播放时才由服务端签名并 302，标签页开再久也不会拿到过期链接。
 * 源片与转码脚本见 /Users/Shared/claude-work/官网升级/（tools/encode.sh）。
 *
 * 标题、简介等文案在字典 videosPage.episodes.<id>，这里只放与语言无关的事实。
 */

export const VIDEO_CDN_BASE = 'https://dl.aiworkdeck.com/videos';

/** 宣传片有配音的语种；其余语种回落英文版 */
const PROMO_LOCALES = ['zh', 'en', 'de', 'es', 'fr', 'ja', 'ms', 'ar'] as const;
export const PROMO_DURATION_SEC = 133;

export function promoVideoId(lang: Locale): string {
    const base = lang === 'zh-hant' ? 'zh' : lang;
    return `promo-${(PROMO_LOCALES as readonly string[]).includes(base) ? base : 'en'}`;
}

export type EpisodeSeries = 'start' | 'lit' | 'team' | 'ext';
export const EPISODE_SERIES: EpisodeSeries[] = ['start', 'lit', 'team', 'ext'];

export interface Episode {
    /** 与 CDN 文件名一致：videos/<id>.mp4 / .jpg */
    id: string;
    series: EpisodeSeries;
    durationSec: number;
    /**
     * CDN 上的文件名（不含扩展名），缺省等于 id。成片重渲后换新文件名（如 `ep-team-02-r2`），
     * 而不是覆盖原文件：CDN 缓存一天，上传凭据无权刷新缓存，覆盖会让访客看到旧版。
     */
    file?: string;
}

export const EPISODES: Episode[] = [
    { id: 'ep-start-01', series: 'start', durationSec: 119 },
    { id: 'ep-start-02', series: 'start', durationSec: 124 },
    { id: 'ep-start-03', series: 'start', durationSec: 98 },
    { id: 'ep-start-04', series: 'start', durationSec: 76 },
    { id: 'ep-lit-01', series: 'lit', durationSec: 108 },
    { id: 'ep-lit-02', series: 'lit', durationSec: 87 },
    { id: 'ep-lit-03', series: 'lit', durationSec: 78 },
    { id: 'ep-lit-04', series: 'lit', durationSec: 100 },
    { id: 'ep-lit-05', series: 'lit', durationSec: 93 },
    { id: 'ep-lit-06', series: 'lit', durationSec: 93 },
    { id: 'ep-lit-07', series: 'lit', durationSec: 71 },
    { id: 'ep-lit-08', series: 'lit', durationSec: 81 },
    { id: 'ep-lit-09', series: 'lit', durationSec: 124 },
    { id: 'ep-lit-10', series: 'lit', durationSec: 98 },
    { id: 'ep-lit-11', series: 'lit', durationSec: 81 },
    { id: 'ep-team-01', series: 'team', durationSec: 116 },
    { id: 'ep-team-02', series: 'team', durationSec: 76, file: 'ep-team-02-r2' },
    { id: 'ep-team-03', series: 'team', durationSec: 158 },
    { id: 'ep-ext-01', series: 'ext', durationSec: 90 },
    { id: 'ep-ext-02', series: 'ext', durationSec: 106 },
];

/** 首页精选：先讲「为什么是工作台」，再挑诉讼主线里最直观的几集 */
export const FEATURED_EPISODE_IDS = ['ep-start-02', 'ep-lit-04', 'ep-lit-09', 'ep-lit-10', 'ep-lit-05', 'ep-team-01'];

const KNOWN_IDS = new Set<string>([
    ...PROMO_LOCALES.map(l => `promo-${l}`),
    ...EPISODES.map(e => e.id),
]);

export function isKnownVideoId(id: string): boolean {
    return KNOWN_IDS.has(id);
}

/** id → CDN 文件名（宣传片与未重渲的集，文件名就是 id） */
export function videoFileFor(id: string): string {
    return EPISODES.find(e => e.id === id)?.file ?? id;
}

export function videoSrc(id: string): string {
    return `/api/video?id=${encodeURIComponent(id)}`;
}

export function posterSrc(id: string): string {
    return `/api/video?id=${encodeURIComponent(id)}&kind=poster`;
}

export function formatDuration(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

export function findEpisode(id: string): Episode | undefined {
    return EPISODES.find(e => e.id === id);
}

/** 同系列的集，按目录顺序 */
export function seriesEpisodes(series: EpisodeSeries): Episode[] {
    return EPISODES.filter(e => e.series === series);
}

/** 系列内的集号（1 起） */
export function episodeNumber(ep: Episode): number {
    return seriesEpisodes(ep.series).indexOf(ep) + 1;
}

export function episodePath(lang: string, id: string): string {
    return `/${lang}/videos/${id}`;
}
