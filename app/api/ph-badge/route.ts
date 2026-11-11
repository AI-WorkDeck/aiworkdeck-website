import { NextRequest, NextResponse } from 'next/server';

/**
 * Product Hunt 徽章代理（dev-board#370 复测问题）。
 *
 * 徽章原是 api.producthunt.com 的外链 SVG，境内浏览器直连不通（2026-09-02 维护者本机实测
 * 6.6s 后报错），前端的「加载失败自动收起」一触发，国内站首屏与页脚就都看不见徽章。
 * 两台 ECS 出口都能拿到（北京 ECS 实测 200 / 1.1s），所以改为服务端中转：
 * - 每个主题内存缓存 60s（票数要跟着发布日实时走，不能缓太久）；
 * - 上游失败先回上一份成功结果（最长 1 天），再没有就出一张**不带票数**的静态版——
 *   票数不知道就不画，绝不画一个假「0」。
 *
 * 安全边界：theme 白名单；上游只认 image/svg+xml 且 ≤ 64KB；SVG 里出现 <script 或
 * on*= 事件属性一律拒收（全站 CSP 的 script-src 带 'unsafe-inline'，靠响应头挡不住
 * 直接打开这个地址的场景，所以在内容层面拦）。
 */
export const dynamic = 'force-dynamic';

const POST_ID = '1238385';
const THEMES = ['light', 'neutral', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const FRESH_MS = 60_000;
const STALE_MAX_MS = 24 * 3600_000;
const MAX_BYTES = 64 * 1024;

/** 与官方三套主题同色：[描边, 底色, 前景] */
const PALETTE: Record<Theme, [string, string, string]> = {
    light: ['#FF6154', '#FFFFFF', '#FF6154'],
    neutral: ['#D9E1EC', '#FFFFFF', '#4B587C'],
    dark: ['#221D21', '#221D21', '#EEF2FF'],
};

const cache = new Map<Theme, { svg: string; at: number }>();

/** 官方徽章去掉票数的静态版：布局、字号、P 形标志与官方 SVG 一致，只少右侧箭头与数字 */
function fallbackSvg(theme: Theme): string {
    const [stroke, bg, fg] = PALETTE[theme];
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="250" height="54" viewBox="0 0 250 54" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
    <rect stroke="${stroke}" stroke-width="1" fill="${bg}" x="0.5" y="0.5" width="249" height="53" rx="10"></rect>
    <text font-family="Helvetica-Bold, Helvetica" font-size="9" font-weight="bold" fill="${fg}"><tspan x="53" y="20">FIND US ON</tspan></text>
    <text font-family="Helvetica-Bold, Helvetica" font-size="21" font-weight="bold" fill="${fg}"><tspan x="52" y="40">Product Hunt</tspan></text>
    <g transform="translate(11, 12)"><path d="M31,15.5 C31,24.0603917 24.0603917,31 15.5,31 C6.93960833,31 0,24.0603917 0,15.5 C0,6.93960833 6.93960833,0 15.5,0 C24.0603917,0 31,6.93960833 31,15.5" fill="${fg}"></path><path d="M17.4329412,15.9558824 L17.4329412,15.9560115 L13.0929412,15.9560115 L13.0929412,11.3060115 L17.4329412,11.3060115 L17.4329412,11.3058824 C18.7018806,11.3058824 19.7305882,12.3468365 19.7305882,13.6308824 C19.7305882,14.9149282 18.7018806,15.9558824 17.4329412,15.9558824 M17.4329412,8.20588235 L17.4329412,8.20601152 L10.0294118,8.20588235 L10.0294118,23.7058824 L13.0929412,23.7058824 L13.0929412,19.0560115 L17.4329412,19.0560115 L17.4329412,19.0558824 C20.3938424,19.0558824 22.7941176,16.6270324 22.7941176,13.6308824 C22.7941176,10.6347324 20.3938424,8.20588235 17.4329412,8.20588235" fill="${bg}"></path></g>
  </g>
</svg>`;
}

async function fetchUpstream(theme: Theme): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=${POST_ID}&theme=${theme}`,
            { signal: AbortSignal.timeout(5000), cache: 'no-store' }
        );
        if (!res.ok) return null;
        if (!(res.headers.get('content-type') ?? '').includes('svg')) return null;
        const text = await res.text();
        if (text.length === 0 || text.length > MAX_BYTES || !text.includes('<svg')) return null;
        if (/<script|\son[a-z]+\s*=/i.test(text)) return null;
        return text;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const raw = req.nextUrl.searchParams.get('theme');
    const theme: Theme = (THEMES as readonly string[]).includes(raw ?? '') ? (raw as Theme) : 'light';

    const now = Date.now();
    const hit = cache.get(theme);
    let svg: string;
    let source: 'fresh' | 'cached' | 'stale' | 'fallback';

    if (hit && now - hit.at < FRESH_MS) {
        svg = hit.svg;
        source = 'cached';
    } else {
        const fetched = await fetchUpstream(theme);
        if (fetched) {
            cache.set(theme, { svg: fetched, at: now });
            svg = fetched;
            source = 'fresh';
        } else if (hit && now - hit.at < STALE_MAX_MS) {
            svg = hit.svg;
            source = 'stale';
        } else {
            svg = fallbackSvg(theme);
            source = 'fallback';
        }
    }

    return new NextResponse(svg, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
            'X-Content-Type-Options': 'nosniff',
            'X-PH-Badge-Source': source,
        },
    });
}
