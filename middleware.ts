import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
    extractGeoCountry,
    i18n,
    LANG_COOKIE,
    matchCountryToLocale,
    matchLanguageTagToLocale,
} from './i18n-config';
import Negotiator from 'negotiator';
import { SITE_ID } from '@/lib/site-config';
import { isWishPath, WISH_URL } from '@/lib/wish-link';

export function resolveRequestLocale(request: NextRequest): string {
    const cookieLang = request.cookies.get(LANG_COOKIE)?.value;
    if (cookieLang && cookieLang !== 'system') {
        const matchedCookie = matchLanguageTagToLocale(cookieLang);
        if (matchedCookie) return matchedCookie;
    }

    // When no explicit cookie is set (first-time visitor), prioritize Geo-IP country routing
    // (CF-IPCountry / X-Vercel-IP-Country / CloudFront-Viewer-Country / Ali-Cdn-Real-Country / X-Geo-Country).
    // If cookieLang === 'system', the user explicitly asked to follow browser/OS system language first.
    if (cookieLang !== 'system') {
        const geoCountry = extractGeoCountry(request.headers);
        const geoLocale = matchCountryToLocale(geoCountry);
        if (geoLocale) return geoLocale;
    }

    const negotiatorHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

    const languages = new Negotiator({ headers: negotiatorHeaders }).languages();
    for (const lang of languages) {
        const matched = matchLanguageTagToLocale(lang);
        if (matched) return matched;
    }

    // Fallback to Geo-IP even under 'system' if Accept-Language had no match
    const fallbackGeo = matchCountryToLocale(extractGeoCountry(request.headers));
    if (fallbackGeo) return fallbackGeo;

    return i18n.defaultLocale;
}

/**
 * 插件跨域（Office 任务窗格等浏览器环境调用官网 API 时需要 CORS）。
 * 只对 /api/account/* 与 /api/license/verify-key 生效，配置驱动：
 * 环境变量 PLUGIN_ALLOWED_ORIGINS（逗号分隔的完整 Origin，如
 * "https://addin.example.com,https://localhost:3000"）。
 * 未配置（默认）= 不放开，行为与从前完全一致；不做全站 CORS。
 */
const CORS_API_PREFIXES = ['/api/account/', '/api/license/verify-key'];

function pluginAllowedOrigins(): string[] {
    return (process.env.PLUGIN_ALLOWED_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function handleApiCors(request: NextRequest): NextResponse {
    const origin = request.headers.get('origin');
    const allowed = origin !== null && pluginAllowedOrigins().includes(origin);

    if (request.method === 'OPTIONS') {
        if (!allowed) {
            // 未配置或来源不在白名单：不由中间件应答，交回路由层（与现状一致）。
            return NextResponse.next();
        }
        return new NextResponse(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '86400',
                'Vary': 'Origin',
            },
        });
    }

    const response = NextResponse.next();
    if (allowed) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Vary', 'Origin');
    }
    return response;
}

/**
 * 不带语言前缀的页面：桌面端按固定 URL 嵌入，语言走 `?lang=` 查询参数。
 * 被 locale 重定向补成 `/zh/captcha-embed` 会落进 `[lang]` 路由 404，
 * 而且 iframe 里跟随的每一跳都是桌面端登录页上的一次白屏。
 */
const LOCALE_FREE_PAGES = ['/captcha-embed', '/mobile-account', '/web', '/app'];

/** 跨站链接带的参数：?site=<id>。命中即种 cookie；手机公开页面保留参数。 */
const SITE_COOKIE = 'awd_site';

/**
 * 跨站逃生门。
 *
 * 国际站的 nginx 对**境内访客**默认 301 回国内站——那是商业默认（境内用户应当在
 * 国内站以人民币交易）。但「注册在国际站、人在境内」是完全合理的场景，
 * 而 /start 与账户页上那条「去另一个站」的链接对这类用户会被 301 弹回来，
 * 变成一个点不动的死链。
 *
 * 所以约定：跨站链接一律带 `?site=<目标站>`。nginx 见到 `$arg_site=intl` 放行一次，
 * 中间件在这里把它固化成 cookie（nginx 后续按 cookie 放行），再重定向到干净地址——
 * 参数留在地址栏里会被复制转发，而它是「我要留在这个站」的个人选择，不该跟着链接跑。
 * 手机注册和公开法律页面供商店审核抓取，抓取器可能不保存 cookie，因此直接渲染并保留参数。
 */
function handleSiteOptIn(request: NextRequest) {
    const wanted = request.nextUrl.searchParams.get('site');
    if (wanted !== SITE_ID) return null;
    const url = request.nextUrl.clone();
    const pathname = url.pathname;
    const mobilePage = pathname === '/mobile-account' || pathname.startsWith('/mobile-account/') ||
        i18n.locales.some(locale => pathname === `/${locale}/legal/mobile-privacy` ||
            pathname === `/${locale}/legal/mobile-account-deletion`);
    if (!mobilePage) url.searchParams.delete('site');
    const response = mobilePage ? NextResponse.next() : NextResponse.redirect(url);
    response.cookies.set(SITE_COOKIE, SITE_ID, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
    });
    return response;
}

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Relay verifies the serving deployment before displaying any remote admin data.
    if (pathname.startsWith('/api/admin/') || pathname.startsWith('/api/community/') || pathname.startsWith('/api/transparency/')) {
        const response = NextResponse.next();
        response.headers.set('X-AWD-Admin-Site', SITE_ID);
        return response;
    }

    // API 分支：只做 CORS，绝不做 locale 重定向
    if (CORS_API_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) {
        return handleApiCors(request);
    }

    // 许愿短链（见 lib/wish-link.ts）：不补语种前缀，直接 307 到 GitHub 预填页
    if (isWishPath(pathname, i18n.locales)) {
        return NextResponse.redirect(WISH_URL, 307);
    }

    const optIn = handleSiteOptIn(request);
    if (optIn) return optIn;

    if (LOCALE_FREE_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
        return NextResponse.next();
    }

    // Check if there is any supported locale in the pathname
    const pathnameIsMissingLocale = i18n.locales.every(
        (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    );

    // Redirect if there is no locale
    if (pathnameIsMissingLocale) {
        const locale = resolveRequestLocale(request);

        // e.g. incoming request is /products
        // The new URL is now /en-US/products
        //
        // 尾斜杠要在这里去掉：`/` 直接拼会得到 `/zh/`，Next 的 trailingSlash 规范化
        // 再 308 到 `/zh`——爬虫每访问一次首页要走两跳，而 Google 对跳转链的耐心有限。
        const suffix = pathname === '/' ? '' : pathname;
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}${suffix}`;
        const response = NextResponse.redirect(url);
        const geoCountry = extractGeoCountry(request.headers);
        if (geoCountry) {
            response.headers.set('X-Geo-Country', geoCountry);
        }
        response.headers.set('X-Detected-Locale', locale);
        return response;
    }
}

// Matcher ignoring `/_next/` and `/api/`（例外：下面两组 API 路径进中间件做插件 CORS）
// robots.txt / sitemap.xml / llms.txt / og.png 排除在外：这四个都没有语言版本，
// 被 locale 重定向后爬虫只能拿到 307（`/sitemap.xml` 从前就是 307 → `/zh/sitemap.xml` → 404）。
// og.png 其实已被下面的图片扩展名规则兜住，仍显式列出——它是分享卡片的唯一图源，
// 将来有人改那条扩展名正则时，这一行是提醒。
export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|og.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)',
        '/api/admin/:path*',
        '/api/community/:path*',
        '/api/transparency/:path*',
        '/api/account/:path*',
        '/api/license/verify-key',
    ],
};
