import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { sendCode, smsEnabled, normalizePhone, SmsError, SCENE_BIND } from '@/lib/sms-auth';
import { findUserByPhone } from '@/lib/users';
import { phoneIsAccount } from '@/lib/phone-policy';
import { clientIp } from '@/lib/login-throttle';
import { CodeSendBlocked } from '@/lib/code-send-guard';
import { verifyCaptcha, CaptchaRejected } from '@/lib/captcha';
import { resolveRequestLocale } from '@/lib/api-locale';

/** 给待绑定的手机号发验证码。需已登录。 */
export async function POST(request: NextRequest) {
  if (!phoneIsAccount()) {
    return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  }
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!smsEnabled()) {
    return NextResponse.json({ error: 'sms_not_configured' }, { status: 503 });
  }

  let phone: string;
  let captchaToken: string;
  let lang = resolveRequestLocale(request);
  try {
    const body = await request.json();
    phone = typeof body?.phone === 'string' ? body.phone : '';
    captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : '';
    lang = resolveRequestLocale(request, body?.lang);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    // 人机验证放最前：晚于「号码被占」检查的话，这个端点就成了一个
    // 不用解验证码就能问「这个号注册过没」的探针。
    await verifyCaptcha(captchaToken, clientIp(request));
    const normalized = normalizePhone(phone, lang);
    // 占用检查放在**发码之前**：否则用户收了码、填对了，才被告知号码被占，
    // 白白烧一条短信也白等一轮。
    const holder = findUserByPhone(normalized);
    if (holder && holder.id !== user.id) {
      return NextResponse.json({ error: 'phone_taken' }, { status: 409 });
    }
    await sendCode(SCENE_BIND, normalized, clientIp(request), lang);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 三类失败三个码，客户端处置不同：403 你没过人机验证 / 429 你太快了 / 400 你填的东西不对
    if (e instanceof CaptchaRejected) {
      // 刻意不带 message：抛出点在 lib/captcha.ts 只有一句英文，中文站用户会看到英文报错。
      // 不带就让浏览器端回落到词典文案；桌面端对 captcha_failed 本就无视上游 message。
      return NextResponse.json({ error: 'captcha_failed' }, { status: 403 });
    }
    if (e instanceof CodeSendBlocked) {
      return NextResponse.json({ error: 'too_many_requests', message: e.message }, { status: 429 });
    }
    if (e instanceof SmsError) {
      return NextResponse.json({ error: 'sms_send_failed', message: e.message }, { status: 400 });
    }
    console.error('[sms/bind/send-code] 未预期错误:', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
