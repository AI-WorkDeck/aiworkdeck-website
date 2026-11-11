import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { listSchools } from '@/lib/schools';

/**
 * 校徽代理（dev-board#307）：直链各校 favicon 命中率太低（2026-08-31 抽查国内高校
 * 裸域/ www 域多为超时或 404），改为服务端惰性抓取：抓学校首页解析 <link rel=icon>
 * 真实地址 → 拉图 → sharp 重编码 → data/school-icons/ 落盘缓存，此后全走缓存。
 *
 * 安全边界（SSRF 防线）：
 * - domain 必须在院校名录（lib/schools.json）白名单内，任意外部域一律 404；
 * - 只走 https，跟随重定向后最终 host 必须仍以该 domain 结尾；
 * - 图 512KB 上限、5s 超时；ICO 原样缓存（sharp 不认 ICO 输入），其余一律 sharp
 *   栅格化重编码为 PNG（顺带消掉 SVG 脚本面）。
 * - 抓取失败写 negative cache（.miss 文件，1 天内不再重试），防止每次页面渲染都去打学校官网。
 */
export const dynamic = 'force-dynamic';

const ICON_DIR = path.join(process.cwd(), 'data', 'school-icons');
const MISS_TTL_MS = 24 * 3600_000;
const MAX_BYTES = 512 * 1024;

function iconPaths(domain: string) {
    const safe = domain.replace(/[^a-z0-9.-]/g, '');
    return {
        png: path.join(ICON_DIR, `${safe}.png`),
        ico: path.join(ICON_DIR, `${safe}.ico`),
        miss: path.join(ICON_DIR, `${safe}.miss`),
    };
}

async function fetchCapped(url: string): Promise<{ buf: Buffer; contentType: string; finalUrl: string } | null> {
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (AIWorkDeck school icon fetcher)' },
        });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_BYTES) return null;
        return { buf, contentType: res.headers.get('content-type') ?? '', finalUrl: res.url };
    } catch {
        return null;
    }
}

function hostAllowed(url: string, domain: string): boolean {
    try {
        const h = new URL(url).hostname;
        return h === domain || h.endsWith(`.${domain}`);
    } catch {
        return false;
    }
}

/** 从首页 HTML 里挑 icon 链接（rel 含 icon 的 link；相对路径按页面 URL 解析） */
function extractIconHref(html: string, baseUrl: string): string | null {
    const links = html.match(/<link\b[^>]*>/gi) ?? [];
    for (const tag of links) {
        if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue;
        const m = tag.match(/href=["']([^"']+)["']/i);
        if (!m) continue;
        try {
            return new URL(m[1], baseUrl).toString();
        } catch { /* 继续找下一个 */ }
    }
    return null;
}

async function acquireIcon(domain: string): Promise<{ file: string; contentType: string } | null> {
    const p = iconPaths(domain);
    // 逐个候选页找 icon 声明；都没有再兜底试 /favicon.ico
    const candidates: string[] = [];
    for (const origin of [`https://www.${domain}`, `https://${domain}`]) {
        const page = await fetch(origin, {
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (AIWorkDeck school icon fetcher)' },
        }).catch(() => null);
        if (page?.ok && hostAllowed(page.url, domain)) {
            const html = (await page.text().catch(() => '')).slice(0, 200_000);
            const href = extractIconHref(html, page.url);
            if (href) candidates.push(href);
            candidates.push(new URL('/favicon.ico', page.url).toString());
            break;
        }
    }
    candidates.push(`https://www.${domain}/favicon.ico`, `https://${domain}/favicon.ico`);

    for (const url of candidates) {
        if (!url.startsWith('https://') || !hostAllowed(url, domain)) continue;
        const got = await fetchCapped(url);
        if (!got || !hostAllowed(got.finalUrl, domain)) continue;
        const isIco = /\.ico(\?|$)/i.test(url) || got.contentType.includes('icon') || got.buf.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
        fs.mkdirSync(ICON_DIR, { recursive: true });
        if (isIco) {
            fs.writeFileSync(p.ico, got.buf);
            return { file: p.ico, contentType: 'image/x-icon' };
        }
        try {
            const png = await sharp(got.buf, { limitInputPixels: 10_000_000 })
                .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
            fs.writeFileSync(p.png, png);
            return { file: p.png, contentType: 'image/png' };
        } catch { /* 不是 sharp 能认的图，试下一个候选 */ }
    }
    return null;
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ domain: string }> }) {
    const { domain: raw } = await ctx.params;
    const domain = decodeURIComponent(raw).toLowerCase();
    // 白名单：只有名录内的域名可抓，任何别的输入直接 404（SSRF 防线）
    if (!listSchools().some(s => s.domain === domain)) {
        return new NextResponse(null, { status: 404 });
    }

    const p = iconPaths(domain);
    for (const [file, type] of [[p.png, 'image/png'], [p.ico, 'image/x-icon']] as const) {
        if (fs.existsSync(file)) {
            return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
                headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' },
            });
        }
    }
    if (fs.existsSync(p.miss) && Date.now() - fs.statSync(p.miss).mtimeMs < MISS_TTL_MS) {
        return new NextResponse(null, { status: 404 });
    }

    const got = await acquireIcon(domain);
    if (!got) {
        try {
            fs.mkdirSync(ICON_DIR, { recursive: true });
            fs.writeFileSync(p.miss, '');
        } catch { /* negative cache 失败无碍 */ }
        return new NextResponse(null, { status: 404 });
    }
    try { fs.rmSync(p.miss, { force: true }); } catch { /* 无碍 */ }
    return new NextResponse(new Uint8Array(fs.readFileSync(got.file)), {
        headers: { 'Content-Type': got.contentType, 'Cache-Control': 'public, max-age=86400' },
    });
}
