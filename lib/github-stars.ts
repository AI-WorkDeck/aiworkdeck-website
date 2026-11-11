import 'server-only';
import { REPO_URL } from '@/lib/structured-data';

/**
 * 仓库 Star 数，供导航与首页开源区显示。
 *
 * **永不阻塞渲染**：进程内缓存，过期后后台刷新、本次先返回旧值（首次为 null）。
 * 北京机访问 api.github.com 时通时不通，拿不到就一直是 null，页面只显示「GitHub」
 * 不显示数字——不能因为一个装饰性数字拖慢每一页。匿名 API 每 IP 每小时 60 次，
 * 成功缓存 6 小时、失败 30 分钟后再试，远低于限额。
 */
const OK_TTL_MS = 6 * 3600_000;
const FAIL_TTL_MS = 30 * 60_000;

let cached: { stars: number | null; at: number; ttl: number } | null = null;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
    const repo = REPO_URL.replace('https://github.com/', '');
    try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        const data = res.ok ? ((await res.json()) as { stargazers_count?: unknown }) : null;
        const stars = typeof data?.stargazers_count === 'number' ? data.stargazers_count : null;
        cached = stars === null
            ? { stars: cached?.stars ?? null, at: Date.now(), ttl: FAIL_TTL_MS }
            : { stars, at: Date.now(), ttl: OK_TTL_MS };
    } catch {
        cached = { stars: cached?.stars ?? null, at: Date.now(), ttl: FAIL_TTL_MS };
    } finally {
        inflight = null;
    }
}

export function getGithubStars(): number | null {
    if ((!cached || Date.now() - cached.at > cached.ttl) && !inflight) {
        inflight = refresh();
    }
    return cached?.stars ?? null;
}
