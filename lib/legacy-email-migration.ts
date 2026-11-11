import { NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from './sessions';
import { phoneIsAccount } from './phone-policy';
import { normalizeEmail, verifyCode, MailError } from './mail-auth';
import { bindVerifiedEmail, verifiedEmailBindError, type User } from './users';
import { withTransaction } from './db';
import { PasswordFlowError } from './password-flow';

export const LEGACY_EMAIL_SCENE = 'legacy_email_bind';
/** Bind each OTP to the authenticated phone account as well as the email and purpose. */
export const legacyEmailScene = (userId: string) => `${LEGACY_EMAIL_SCENE}:${userId}`;

export function requireLegacyEmailUser(request: Request): User {
  if (!phoneIsAccount()) throw new PasswordFlowError('legacy_email_not_supported', 400);
  let token = '';
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const at = part.indexOf('=');
    if (at >= 0 && part.slice(0, at).trim() === SESSION_COOKIE) {
      try { token = decodeURIComponent(part.slice(at + 1).trim()); } catch { /* invalid cookie */ }
      break;
    }
  }
  const user = getUserByToken(token);
  if (!user) throw new PasswordFlowError('unauthorized', 401);
  if (!user.phone || !user.passwordHash) throw new PasswordFlowError('phone_password_required', 403);
  return user;
}

export function validateLegacyEmail(user: User, raw: unknown): string {
  const email = normalizeEmail(typeof raw === 'string' ? raw : '');
  const error = verifiedEmailBindError(user.id, email);
  if (error) throw new PasswordFlowError(error, error === 'phone_password_required' ? 403 : 409);
  return email;
}

export function completeLegacyEmail(request: Request, raw: unknown, code: unknown): void {
  // Returning failures commits the wrong-code attempt counter; throwing inside would roll it back.
  const error = withTransaction(() => {
    let user: User;
    let email: string;
    try { user = requireLegacyEmailUser(request); email = validateLegacyEmail(user, raw); }
    catch (e) { return e; }
    try { verifyCode(legacyEmailScene(user.id), email, typeof code === 'string' ? code : ''); }
    catch (e) { return e; }
    const bindError = bindVerifiedEmail(user.id, email);
    return bindError ? new PasswordFlowError(bindError, 409) : null;
  });
  if (error) throw error;
}

export function legacyEmailError(error: unknown) {
  if (error instanceof PasswordFlowError) return NextResponse.json({ error: error.code }, { status: error.status });
  if (error instanceof MailError) return NextResponse.json({ error: 'invalid_code_or_email' }, { status: 400 });
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}
