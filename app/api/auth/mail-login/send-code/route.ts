import { findUserByAccount } from '@/lib/users';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail, sendCode, mailEnabled, MailError, SCENE_SIGNIN } from '@/lib/mail-auth';
import { emailIsAccount } from '@/lib/mail-policy';
import { clientIp } from '@/lib/login-throttle';
import { CodeSendBlocked } from '@/lib/code-send-guard';
import { verifyCaptcha, CaptchaRejected } from '@/lib/captcha';

/**
 * 邮箱免密登录/注册：发验证码。形状与 `sms-login/send-code` 逐条对应。
 *
 * 信封走**官网自己的约定**（HTTP 状态码 + `{ error }`），不抄桌面仓 Java 那套
 * `{ code: 0|1 }`——`app/api/auth/*` 全是前者，一个目录里混两套信封才是真的坑。
 *
 * **对未注册的地址也发**：注册与登录合一，所以不存在「该邮箱是否注册过」的枚举面。
 * 是否新用户只在 verify 成功后才透露。
 */
export async function POST(request: NextRequest) {
  if (!emailIsAccount()) {
    // 大陆站：端点存在但不提供该能力（那边账号本体是手机号）。刻意不是 404——
    // 404 会让人以为路由写错了，排查方向整个偏掉。与 sms-login 在 intl 上的做法对称。
    return NextResponse.json({ error: 'mail_not_supported_on_site' }, { status: 400 });
  }
  if (!mailEnabled()) {
    return NextResponse.json({ error: 'mail_not_configured' }, { status: 503 });
  }

  let email: string;
  let captchaToken: string;
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email : '';
    captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    // 人机验证在**发送之前**：没过就不该产生任何外发调用，也不该占配额
    await verifyCaptcha(captchaToken, clientIp(request), { account: normalizeEmail(email), purpose: 'login' });
    if (findUserByAccount(normalizeEmail(email))?.passwordHash) return NextResponse.json({ error: 'password_login_required' }, { status: 409 });
    await sendCode(SCENE_SIGNIN, email, clientIp(request));
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
    if (e instanceof MailError) {
      return NextResponse.json({ error: 'mail_send_failed', message: e.message }, { status: 400 });
    }
    console.error('[mail-login/send-code] 未预期错误:', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
