import { NextRequest, NextResponse } from 'next/server';
import { toBaseLocale } from '@/i18n-config';
import {
    renderQuizCardPng,
    QUIZ_CARD_LAYOUTS, QUIZ_CARD_PALETTES,
    type QuizCardLayout, type QuizCardPalette,
} from '@/lib/quiz-card';
import { QUIZ_TYPE_MAP, sanitizeNickname } from '@/lib/quiz-data';

/**
 * 「法人格」结果卡 PNG（dev-board#329）。结果是公开分享物，不鉴权、不落库：
 * 类型与三维都在 URL 里，同参数永远出同一张图（可转发、可重开）。
 * 参数白名单：非法 typeId 404，维度越界钳到基准值（照抄 /api/cert 的静默回落哲学）。
 */
export const dynamic = 'force-dynamic';

function parseDim(raw: string | null, fallback: number): number {
    if (raw === null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 99 ? n : fallback;
}

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const typeId = sp.get('type') ?? '';
    const type = QUIZ_TYPE_MAP[typeId];
    if (!type) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const lang = toBaseLocale(sp.get('lang') ?? 'zh');
    const dims: [number, number, number] = [
        parseDim(sp.get('a'), type.dims[0]),
        parseDim(sp.get('b'), type.dims[1]),
        parseDim(sp.get('c'), type.dims[2]),
    ];
    const nickname = sanitizeNickname(sp.get('n') ?? '');
    // 样式参数白名单：非法值静默落回默认（照抄 /api/cert）
    const layoutParam = sp.get('layout') ?? 'seal';
    const paletteParam = sp.get('palette') ?? 'forest';
    const layout = (QUIZ_CARD_LAYOUTS as readonly string[]).includes(layoutParam) ? (layoutParam as QuizCardLayout) : 'seal';
    const palette = (QUIZ_CARD_PALETTES as readonly string[]).includes(paletteParam) ? (paletteParam as QuizCardPalette) : 'forest';
    const seqRaw = Number(sp.get('s'));
    const seq = Number.isInteger(seqRaw) && seqRaw >= 1 && seqRaw <= 999999 ? seqRaw : undefined;
    const variant = sp.get('v') === 'biz' ? 'biz' as const : 'peer' as const;

    const png = await renderQuizCardPng({ typeId, dims, nickname: nickname || undefined, lang, layout, palette, seq, variant });
    if (!png) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const headers: Record<string, string> = {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
    };
    if (sp.get('download') === '1') {
        const displayFile =
            lang === 'en'
                ? `Legal Persona - ${type.nameEn}.png`
                : `法人格 - ${type.nameZh}.png`;
        headers['Content-Disposition'] =
            `attachment; filename="AI-WorkDeck-persona-${type.id}.png"; filename*=UTF-8''${encodeURIComponent(displayFile)}`;
    }
    return new NextResponse(new Uint8Array(png), { headers });
}
