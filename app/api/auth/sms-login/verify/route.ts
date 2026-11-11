import { grantTrialSafely } from '@/lib/trial';
import { phoneIsAccount } from '@/lib/phone-policy';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/sessions';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirstContact, passwordError, reviewLoginUser } from '@/lib/password-flow';
export async function POST(request: NextRequest) {
  if (!phoneIsAccount()) return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  try {
    const review = reviewLoginUser(body ?? {});
    if (review) {
      const session = createSession(review.id);
      grantTrialSafely(review.id);
      const response = NextResponse.json({ user: { id: review.id, username: review.username, displayName: review.displayName, email: review.email } });
      response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, body.rememberMe !== false));
      return response;
    }
    return NextResponse.json(verifyFirstContact(body ?? {}));
  }
  catch (e) { return passwordError(e); }
}
