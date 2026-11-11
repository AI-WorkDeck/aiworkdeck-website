import { NextRequest, NextResponse } from 'next/server';
import { requireLegacyEmailUser, validateLegacyEmail, legacyEmailScene, legacyEmailError } from '@/lib/legacy-email-migration';
import { sendCode, mailEnabled, MailError } from '@/lib/mail-auth';
import { verifyCaptcha, CaptchaRejected } from '@/lib/captcha';
import { clientIp } from '@/lib/login-throttle';
import { CodeSendBlocked } from '@/lib/code-send-guard';

export async function POST(request: NextRequest) {
  try {
    const user = requireLegacyEmailUser(request);
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
    const email = validateLegacyEmail(user, body?.email);
    if (!mailEnabled()) return NextResponse.json({ error: 'mail_not_configured' }, { status: 503 });
    await verifyCaptcha(typeof body?.captchaToken === 'string' ? body.captchaToken : '', clientIp(request));
    // CAPTCHA is asynchronous: the session may have expired or been revoked in the meantime.
    const current = requireLegacyEmailUser(request);
    validateLegacyEmail(current, email);
    await sendCode(legacyEmailScene(current.id), email, clientIp(request));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CaptchaRejected) return NextResponse.json({ error: 'captcha_failed' }, { status: 403 });
    if (e instanceof CodeSendBlocked) return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
    if (e instanceof MailError) return NextResponse.json({ error: 'code_send_failed', message: e.message }, { status: 400 });
    return legacyEmailError(e);
  }
}
