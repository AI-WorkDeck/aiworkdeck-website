import { NextRequest, NextResponse } from 'next/server';
import { pickLocale } from '@/i18n-config';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';
import { setAvatarStamp } from '@/lib/users';
import { saveAvatar, deleteAvatar, AVATAR_MAX_BYTES, type AvatarError } from '@/lib/avatars';

/**
 * 头像上传与删除（`awd_session` Cookie 或 `Bearer awdk_`，见 lib/account-auth.ts）。
 *
 * 两类调用方：官网账户页 ProfileDialog（浏览器 Cookie）与桌面端「个人设置」经本地后端
 * 透传（Bearer）。头像的权威源是官网，桌面端上传必须落到这里（dev-board#565）。
 *
 * 目标文件由凭据解析出的 userId 拼出，**只能写自己那一份**。
 * 图片一律经 sharp 重编码后落盘，理由见 lib/avatars.ts。
 *
 * 错误文案不含「登录」「未授权」「请先」（桌面端拿这三个子串判掉线）。
 */
export const dynamic = 'force-dynamic';

const MESSAGES: Record<AvatarError, { zh: string; en: string }> = {
  too_large: {
    zh: `图片超过 ${AVATAR_MAX_BYTES / 1024 / 1024} MB 上限`,
    en: `Image exceeds the ${AVATAR_MAX_BYTES / 1024 / 1024} MB limit`,
  },
  unsupported_format: {
    zh: '只接受 JPG、PNG、WebP、GIF、AVIF、HEIC 格式的图片',
    en: 'Only JPG, PNG, WebP, GIF, AVIF, and HEIC images are accepted',
  },
  invalid_image: {
    zh: '这个文件不是可以识别的图片',
    en: 'This file is not a recognizable image',
  },
};

export async function POST(request: NextRequest) {
  const user = resolveSessionOrKeyUser(request);
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
    // 体积在读进内存之前先拦一次，别为了报一个「超限」把 50MB 收完
    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json(
        { error: 'too_large', message: pickLocale(MESSAGES.too_large, lang) },
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

  const { stamp, error } = await saveAvatar(user.id, buffer);
  if (error || !stamp) {
    const entry = MESSAGES[error as AvatarError];
    return NextResponse.json(
      { error, message: entry ? pickLocale(entry, lang) : pickLangText(lang, '保存失败', 'Failed to save') },
      { status: 400 }
    );
  }

  // 先落文件再记戳：反过来的话，写盘失败会留下一个指向空文件的戳，头像变裂图
  setAvatarStamp(user.id, stamp);
  return NextResponse.json({ avatarUpdatedAt: stamp });
}

export async function DELETE(request: NextRequest) {
  const user = resolveSessionOrKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // 先清戳再删文件：中间失败只会留下一个读不到的孤儿文件（下次上传直接覆盖），
  // 而不是一个指向已删文件的戳
  setAvatarStamp(user.id, null);
  deleteAvatar(user.id);
  // 回 null 而不是 { ok: true }：与 POST 同形状，消费方拿到的永远是「现在的戳」，
  // 删完不用再多问一次 /me。
  return NextResponse.json({ avatarUpdatedAt: null });
}
