import { NextRequest, NextResponse } from 'next/server';
import { pickLocale } from '@/i18n-config';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';
import { updateProfile, BIO_MAX, DISPLAY_NAME_MAX } from '@/lib/users';

/**
 * 改个人资料（`awd_session` Cookie 或 `Bearer awdk_`，见 lib/account-auth.ts）。
 * PATCH /api/account/profile  { displayName?, bio? } → { displayName, bio }
 *
 * 两类调用方：官网账户页 ProfileDialog（浏览器 Cookie）与桌面端「个人设置」经本地后端
 * 透传（Bearer）。展示名的权威源是官网，桌面端改名必须落到这里，否则两边各存一份
 * 立刻分叉（dev-board#565）。Bearer 优先于 Cookie，理由见 resolveSessionOrKeyUser。
 *
 * 目标用户取自凭据，**不接受请求里的 userId**——那等于让任何登录用户改别人的资料。
 *
 * 错误文案刻意不含「登录」「未授权」「请先」三个子串：桌面端
 * frontend/src/services/api.js 用它们判掉线并清会话，撞上就会莫名其妙地把人踢下线。
 */
const MESSAGES: Record<string, { zh: string; en: string }> = {
  invalid_display_name: {
    zh: `昵称不能为空，且不超过 ${DISPLAY_NAME_MAX} 个字`,
    en: `Display name cannot be empty and must be at most ${DISPLAY_NAME_MAX} characters`,
  },
  bio_too_long: {
    zh: `简介不超过 ${BIO_MAX} 个字`,
    en: `Bio must be at most ${BIO_MAX} characters`,
  },
  not_found: {
    zh: '账户不存在',
    en: 'Account not found',
  },
};

export async function PATCH(request: NextRequest) {
  const user = resolveSessionOrKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const lang = resolveRequestLocale(request);

  let body: { displayName?: unknown; bio?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: pickLangText(lang, '提交内容无法解析', 'Invalid request payload') },
      { status: 400 }
    );
  }

  // 只有明确是字符串才当作「要改这个字段」；缺省与非字符串一律视为不改。
  const displayName = typeof body.displayName === 'string' ? body.displayName : undefined;
  const bio = typeof body.bio === 'string' ? body.bio : undefined;
  if (displayName === undefined && bio === undefined) {
    return NextResponse.json(
      { error: 'bad_request', message: pickLangText(lang, '没有要修改的内容', 'Nothing to update') },
      { status: 400 }
    );
  }

  const { user: updated, error } = updateProfile(user.id, { displayName, bio });
  if (error || !updated) {
    const entry = MESSAGES[error ?? ''];
    return NextResponse.json(
      { error, message: entry ? pickLocale(entry, lang) : pickLangText(lang, '保存失败', 'Failed to save') },
      { status: 400 }
    );
  }
  // 只回这次可能被改动的两个字段。桌面端要的是「改完之后是什么」，
  // 不需要整份 PublicUser；bio 恒为字符串（未设置为空串），键不随有无浮动。
  return NextResponse.json({ displayName: updated.displayName, bio: updated.bio ?? '' });
}
