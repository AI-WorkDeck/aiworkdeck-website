import { collectAutoFigures } from '@/lib/transparency-auto';
import {
    currentPeriod,
    listReports,
    summarizeReport,
    type Receipt,
    type ReportSummary,
    type TransparencyReportData,
} from '@/lib/transparency';
import { listReceipts } from '@/lib/transparency';
import { SITE_ID, siteConfigOf } from '@/lib/site-config';

/**
 * 公开账目的取数（页面与 `/api/transparency` 共用一份）。
 *
 * **国内站是唯一真源**：账目主体、捐赠、凭证都在大陆这边，国际站只是把同一份
 * 报表展示出来（见 `loadPublicTransparency`）。两边各存一份会立刻漂移——
 * 同一笔捐款在两个站显示不同金额，这一页就彻底没有意义了。
 */

export interface PublicReport {
    period: string;
    publishedAt: string | null;
    updatedAt: string;
    data: TransparencyReportData;
    summary: ReportSummary;
    receipts: Array<Pick<Receipt, 'id' | 'mime' | 'caption' | 'fileName'>>;
}

export interface LiveCounters {
    usersTotal: number | null;
    installsTotal: number | null;
    installsActive: number | null;
    downloads: number | null;
}

export interface PublicTransparency {
    reports: PublicReport[];
    live: LiveCounters;
}

const LIVE_TTL_MS = 3600_000;
let liveCache: { at: number; value: LiveCounters } | null = null;

/**
 * 实时计数。**缓存一小时**：每次取数都会打 GitHub Releases 接口，
 * 匿名限速 60 次/小时/IP，不缓存的话一个刷新键就能把额度打光，
 * 然后所有人都看不到下载量。
 */
export async function liveCounters(): Promise<LiveCounters> {
    if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) return liveCache.value;
    const { merged } = await collectAutoFigures(currentPeriod(), { includeRemote: true });
    const value: LiveCounters = {
        usersTotal: merged.metrics.usersTotal.value,
        installsTotal: merged.metrics.installsTotal.value,
        installsActive: merged.metrics.installsActive.value,
        downloads: merged.metrics.downloads.value,
    };
    liveCache = { at: Date.now(), value };
    return value;
}

/** 本站库里的公开数据。草稿永远不在其中。 */
export async function getPublicTransparency(): Promise<PublicTransparency> {
    const reports = listReports({ publishedOnly: true }).map((r) => ({
        period: r.period,
        publishedAt: r.publishedAt,
        updatedAt: r.updatedAt,
        data: r.data,
        summary: summarizeReport(r.data),
        receipts: listReceipts(r.period).map((x) => ({
            id: x.id,
            mime: x.mime,
            caption: x.caption,
            fileName: x.fileName,
        })),
    }));
    return { reports, live: await liveCounters() };
}

/**
 * 页面用的取数：国际站向国内站要，拿不到回落本站库。
 *
 * 回落不是摆设——新加坡机拨不通北京时，这一页应当显示「本站已知的那部分」，
 * 而不是整页报错。国际站库里通常没有已发布报表，于是退化成只剩实时计数，
 * 这正是能诚实交付的最大信息量。
 */
export async function loadPublicTransparency(): Promise<PublicTransparency> {
    if (SITE_ID !== 'intl') return getPublicTransparency();
    try {
        const res = await fetch(`${siteConfigOf('cn').origin}/api/transparency`, {
            signal: AbortSignal.timeout(5000),
            next: { revalidate: 3600, tags: ['transparency'] },
        });
        if (res.ok) {
            const json = (await res.json()) as PublicTransparency;
            if (Array.isArray(json?.reports)) return json;
        }
    } catch {
        // 落到本站库
    }
    return getPublicTransparency();
}
