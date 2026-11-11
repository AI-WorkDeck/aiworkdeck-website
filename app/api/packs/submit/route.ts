import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { createPackDraft, PACK_LIMITS } from '@/lib/packs-store';
import { packErrorMessage } from '@/lib/pack-messages';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';

export const dynamic = 'force-dynamic';

/**
 * 原生资源包提交第一步：收 manifest 草案，建 pending 提交，返回 uploadToken。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §8.1。
 *
 * 这一步只收 JSON（几 KB）。实物走 PUT /api/packs/upload 流式落盘，
 * 最后 POST /api/packs/finalize 触发受理检查——**全程不碰 formData()**。
 *
 * body: { manifest: object | string, note?: string }
 */
export async function POST(request: NextRequest) {
    const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    let lang = resolveRequestLocale(request);
    let body: { manifest?: unknown; note?: string; lang?: unknown };
    try {
        body = await request.json();
        lang = resolveRequestLocale(request, body?.lang);
    } catch {
        return NextResponse.json(
            { error: 'bad_request', message: pickLangText(lang, '请求体不是合法 JSON', 'Request body is not valid JSON') },
            { status: 400 }
        );
    }

    // manifest 允许直接贴文本（提交页就是个文本域），这里替提交者解一次
    let manifest = body.manifest;
    if (typeof manifest === 'string') {
        try {
            manifest = JSON.parse(manifest);
        } catch {
            return NextResponse.json(
                { error: 'manifest_invalid', message: pickLangText(lang, 'manifest 不是合法 JSON', 'manifest is not valid JSON') },
                { status: 400 }
            );
        }
    }

    const { draft, error, detail } = createPackDraft(manifest, { id: user.id, username: user.username }, {
        note: body.note,
    });
    if (error || !draft) {
        return NextResponse.json({ error, message: packErrorMessage(error, detail, lang) }, { status: 400 });
    }
    return NextResponse.json({
        token: draft.token,
        id: draft.id,
        version: draft.version,
        files: draft.files,
        totalSize: draft.totalSize,
        expiresInMs: PACK_LIMITS.draftTtlMs,
    });
}
