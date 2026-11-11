import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { deleteAccount } from '@/lib/account-deletion';
import { resolveRequestLocale } from '@/lib/api-locale';

/**
 * 自助注销账户。
 *
 * ## 为什么挂在 /api/auth/ 而不是 /api/account/
 *
 * `middleware.ts` 的 `CORS_API_PREFIXES` 含 `/api/account/`：配了
 * `PLUGIN_ALLOWED_ORIGINS` 的域名可以跨域调那底下的任何端点。
 * 「删除整个账户」不该暴露在插件的 CORS 面上，所以放在没开跨域的 /api/auth/ 下，
 * 与 login / logout 同一组。**挪回 /api/account/ 就等于给它开了跨域。**
 *
 * ## 契约
 *
 * `POST { confirmUsername: string }`
 * - 401 `{ error: 'unauthorized' }`
 * - 400 `{ error: 'confirm_mismatch' }`      用户名与当前账户不符
 * - 409 `{ error: 'has_pending_balance' | 'has_unsettled_earnings' | 'has_pending_allocation', message }`
 * - 503 `{ error: 'ai_key_disable_failed', message }`  远端 AI 通道作废失败，未做任何改动，可重试
 * - 200 `{ ok: true, deletedAt, notes: string[] }` 并清 awd_session
 *
 * message 一律面向用户，且**不得含「登录」「未授权」「请先」**——桌面端 api.js
 * 拿这三个子串当掉线信号，会直接清掉本地会话。
 */
export async function POST(request: NextRequest) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let confirmUsername: unknown;
  let explicitLang: unknown;
  try {
    const parsed = await request.json();
    confirmUsername = parsed?.confirmUsername;
    explicitLang = parsed?.lang;
  } catch {
    confirmUsername = undefined;
  }
  const lang = resolveRequestLocale(request, explicitLang);
  // 逐字相符，大小写敏感；只容忍首尾空白（手机键盘常带一个尾随空格，
  // 因此把人永久挡在注销门外，比这点宽容危险得多）。
  const typed = typeof confirmUsername === 'string' ? confirmUsername.trim() : '';
  if (!typed || typed !== user.username) {
    return NextResponse.json({ error: 'confirm_mismatch' }, { status: 400 });
  }

  const result = await deleteAccount(user.id, lang);

  if ('blocked' in result) {
    return NextResponse.json({ error: result.blocked, message: result.message }, { status: 409 });
  }
  if ('keyDisableFailed' in result) {
    return NextResponse.json(
      { error: 'ai_key_disable_failed', message: result.message },
      { status: 503 }
    );
  }

  const res = NextResponse.json({ ok: true, deletedAt: result.deletedAt, notes: result.notes });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
