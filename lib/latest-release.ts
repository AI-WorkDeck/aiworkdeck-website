import 'server-only';

import { SITE_ID } from './site-config';

/**
 * 最新桌面端安装包解析。
 *
 * 安装包文件名里带版本号（`AI.Workdeck-0.11.1-arm64.dmg`），所以 GitHub 那条
 * `releases/latest/download/<固定文件名>` 的快捷路径用不了，必须实查一次 release
 * 才能拿到真实资产地址。
 *
 * **下载直链按站点分流**（2026-08-14）：大陆用户打不开 github.com，给他们
 * GitHub 资产直链等于没给。北京 ECS 的更新镜像（桌面仓 deploy/update-mirror-sync.sh）
 * 现在连安装包一起镜像，并产出 `installers/latest.json` 清单：
 * - cn 站：镜像优先（下载走 www.aiworkdeck.com，境内可达），GitHub 兜底
 *   （发版后、cron 同步完成前的窗口期镜像还是旧版）。
 * - intl 站：GitHub 优先（境外直连快，不占北京带宽），镜像兜底。
 *
 * 三条约束决定了 GitHub 路径的写法：
 * - 生产机在北京，api.github.com 时快时慢，**不能让它拖住页面渲染** → 4 秒超时。
 * - 匿名 API 限速 60 次/小时/IP → `revalidate` 一小时，实际一小时一次。
 * - 解析不出来不是致命错误 → 返回 null，调用方回落到 releases 列表页。
 *
 * 镜像路径 `revalidate` 只给 5 分钟：读的是本机 nginx 静态文件，没有限速问题，
 * 发版后 cron 同步完成、官网最迟 5 分钟切到新版直链。
 *
 * 两个 fetch 都挂 'latest-release' tag：镜像同步脚本写完 latest.json 会回调
 * /api/revalidate-release 作废这个 tag，同步完成即切新版直链，不用等 5 分钟
 * 窗口走完（2026-08-19 复盘：同步延迟叠页面缓存窗口，被误判成缓存故障）。
 * revalidate 数值仍保留，是回调缺席时的兜底。
 */

const REPO = 'AI-WorkDeck/aiworkdeck';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** 镜像清单仍读北京 ECS 本机 nginx（新鲜、revalidate 回调直达），下载直链改走
 * dl.aiworkdeck.com（阿里云 CDN，源站 OSS 桶 awd-downloads，dev-board#290）：
 * ECS 出口只有按量带宽，GB 级安装包由 CDN 扛。同步脚本保证「安装包先上 OSS、
 * latest.json 后落地」，所以清单里出现的文件名在 dl 域名下必然可下。 */
const MIRROR_META_BASE = 'https://www.aiworkdeck.com/update/desktop/installers';
const MIRROR_DL_BASE = 'https://dl.aiworkdeck.com/update/desktop/installers';

export const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases/latest`;
export const REPO_URL = `https://github.com/${REPO}`;

export interface DownloadAsset {
    url: string;
    /** 安装包体积（MB，整数）。1.3GB 级别的下载量必须提前告诉用户 */
    sizeMb: number;
}

export interface LatestRelease {
    version: string;
    /** macOS Apple Silicon（M 系列）。项目不出 Intel 包，所以只有这一个 mac 资产 */
    mac: DownloadAsset | null;
    win: DownloadAsset | null;
}

interface NamedAsset {
    name: string;
    size: number;
    /** 资产的下载直链 */
    url: string;
}

/** 两个来源共用的装配：从资产名单挑出 mac / win 安装包 */
function assemble(version: string, assets: NamedAsset[]): LatestRelease {
    const pick = (match: (name: string) => boolean): DownloadAsset | null => {
        const hit = assets.find(a => match(a.name.toLowerCase()));
        return hit
            ? { url: hit.url, sizeMb: Math.round(hit.size / 1048576) }
            : null;
    };
    return {
        version,
        mac: pick(n => n.endsWith('.dmg') && n.includes('arm64')),
        // 补丁包也是 .exe 之外的格式，这里只认安装器命名里的 setup
        win: pick(n => n.endsWith('.exe') && n.includes('setup')),
    };
}

async function fromGithub(): Promise<LatestRelease | null> {
    try {
        const res = await fetch(API_URL, {
            headers: { Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(4000),
            next: { revalidate: 3600, tags: ['latest-release'] },
        });
        if (!res.ok) return null;

        const data: {
            tag_name?: string;
            assets?: { name: string; size: number; browser_download_url: string }[];
        } = await res.json();
        const version = (data.tag_name ?? '').replace(/^v/, '');
        if (!version) return null;

        return assemble(
            version,
            (data.assets ?? []).map(a => ({ name: a.name, size: a.size, url: a.browser_download_url })),
        );
    } catch {
        return null;
    }
}

async function fromMirror(): Promise<LatestRelease | null> {
    try {
        const res = await fetch(`${MIRROR_META_BASE}/latest.json`, {
            signal: AbortSignal.timeout(4000),
            next: { revalidate: 300, tags: ['latest-release'] },
        });
        if (!res.ok) return null;

        const data: { tag?: string; assets?: { name: string; size: number }[] } = await res.json();
        const version = (data.tag ?? '').replace(/^v/, '');
        if (!version) return null;

        return assemble(
            version,
            (data.assets ?? []).map(a => ({
                name: a.name,
                size: a.size,
                url: `${MIRROR_DL_BASE}/${encodeURIComponent(a.name)}`,
            })),
        );
    } catch {
        return null;
    }
}

export async function getLatestRelease(): Promise<LatestRelease | null> {
    if (SITE_ID === 'cn') {
        return (await fromMirror()) ?? (await fromGithub());
    }
    return (await fromGithub()) ?? (await fromMirror());
}
