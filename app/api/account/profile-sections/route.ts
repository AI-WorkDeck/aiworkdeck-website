import { NextRequest, NextResponse } from 'next/server';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';
import { getSessionUser } from '@/lib/sessions';
import { saveProfileSections, QR_MAX_BYTES, saveWechatQr, deleteWechatQr } from '@/lib/profile-sections';

/**
 * 简历模块保存 + 微信二维码上传/删除（dev-board#303）。只能写自己的。
 * 错误文案不含「登录/未授权/请先」（桌面端掉线判定子串）。
 */
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const body = await request.json();
        const sections = saveProfileSections(user.id, body.sections);
        return NextResponse.json({ sections });
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const lang = resolveRequestLocale(request);
    let buffer: Buffer;
    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: 'no_file', message: pickLangText(lang, '没有收到图片', 'No image received') },
                { status: 400 }
            );
        }
        if (file.size > QR_MAX_BYTES) {
            return NextResponse.json(
                {
                    error: 'too_large',
                    message: pickLangText(
                        lang,
                        `图片超过 ${QR_MAX_BYTES / 1024 / 1024} MB 上限`,
                        `Image exceeds the ${QR_MAX_BYTES / 1024 / 1024} MB limit`
                    ),
                },
                { status: 400 }
            );
        }
        buffer = Buffer.from(await file.arrayBuffer());
    } catch {
        return NextResponse.json(
            { error: 'bad_request', message: pickLangText(lang, '上传失败，请重试', 'Upload failed. Please try again.') },
            { status: 400 }
        );
    }
    const { error } = await saveWechatQr(user.id, buffer);
    if (error) {
        return NextResponse.json(
            {
                error,
                message:
                    error === 'too_large'
                        ? pickLangText(lang, '图片过大', 'Image is too large')
                        : pickLangText(lang, '这个文件不是可以识别的图片', 'This file is not a recognizable image'),
            },
            { status: 400 }
        );
    }
    return NextResponse.json({ ok: true });
}

export async function DELETE() {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    deleteWechatQr(user.id);
    return NextResponse.json({ ok: true });
}
