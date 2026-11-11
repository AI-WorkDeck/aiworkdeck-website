import { NextRequest, NextResponse } from 'next/server';
import { getAward, BADGE_DEFS } from '@/lib/badges';
import { toBaseLocale } from '@/i18n-config';
import {
    renderCertificatePng,
    CERT_LAYOUTS, CERT_PALETTES,
    type CertLayout, type CertPalette,
} from '@/lib/certificate';

/**
 * 徽章证书 PNG（dev-board#300）。证书是公开的分享物（用户本来就要发朋友圈），
 * 不做鉴权；URL 主键是 8 字节随机 hex，不可枚举。
 * ?download=1 走附件下载；?lang=en 出英文版（默认按本站语言）。
 * 内容随作品名/展示名可变，不做强缓存。
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const award = getAward(id);
    if (!award) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const lang = toBaseLocale(request.nextUrl.searchParams.get('lang') ?? 'zh');
    // 样式参数白名单（dev-board#309）：非法值静默落回默认，不报错
    const layoutParam = request.nextUrl.searchParams.get('layout') ?? 'seal';
    const paletteParam = request.nextUrl.searchParams.get('palette') ?? 'forest';
    const layout = (CERT_LAYOUTS as readonly string[]).includes(layoutParam) ? (layoutParam as CertLayout) : 'seal';
    const palette = (CERT_PALETTES as readonly string[]).includes(paletteParam) ? (paletteParam as CertPalette) : 'forest';
    const png = await renderCertificatePng(award, lang, layout, palette);
    if (!png) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const headers: Record<string, string> = {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
    };
    if (request.nextUrl.searchParams.get('download') === '1') {
        const def = BADGE_DEFS[award.badgeId];
        const displayFile =
            lang === 'en'
                ? `AI WorkDeck Certificate - ${def.nameEn}.png`
                : `AI WorkDeck 证书 - ${def.nameZh}.png`;
        headers['Content-Disposition'] =
            `attachment; filename="AI-WorkDeck-${def.id}.png"; filename*=UTF-8''${encodeURIComponent(displayFile)}`;
    }
    return new NextResponse(new Uint8Array(png), { headers });
}
