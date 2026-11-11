import { NextRequest, NextResponse } from 'next/server';
import { contactFrom, passwordError } from '@/lib/password-flow';
import { sendCode as sendSms, SCENE_PASSWORD_RESET, smsEnabled, SmsError } from '@/lib/sms-auth';
import { sendCode as sendMail, mailEnabled, MailError } from '@/lib/mail-auth';
import { verifyCaptcha, CaptchaRejected } from '@/lib/captcha';
import { CodeSendBlocked } from '@/lib/code-send-guard';
import { clientIp } from '@/lib/login-throttle';
import { resolveRequestLocale } from '@/lib/api-locale';
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const lang = resolveRequestLocale(request, body?.lang);
  try {
    const contact = contactFrom(body ?? {});
    if (contact.kind === 'phone' ? !smsEnabled() : !mailEnabled()) return NextResponse.json({ error: contact.kind === 'phone' ? 'sms_not_configured' : 'mail_not_configured' }, { status: 503 });
    await verifyCaptcha(typeof body.captchaToken === 'string' ? body.captchaToken : '', clientIp(request), { account: contact.account, purpose: 'reset' });
    // Same response and delivery for existing/unknown identities; reset never creates an account.
    if (contact.kind === 'phone') await sendSms(SCENE_PASSWORD_RESET, contact.account, clientIp(request), lang);
    else await sendMail(SCENE_PASSWORD_RESET, contact.account, clientIp(request));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CaptchaRejected) return NextResponse.json({ error: 'captcha_failed' }, { status: 403 });
    if (e instanceof CodeSendBlocked) return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
    if (e instanceof SmsError || e instanceof MailError) return NextResponse.json({ error: 'code_send_failed', message: e.message }, { status: 400 });
    return passwordError(e);
  }
}
