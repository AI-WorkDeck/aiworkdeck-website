import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDb, withTransaction } from './db';
import { findUserById, findUserByAccount, findUserByPhone, findOrCreateByPhone, findOrCreateByEmail, hashPassword, isDeletedUser, type User } from './users';
import { phoneIsAccount } from './phone-policy';
import { emailIsAccount } from './mail-policy';
import { verifyCode as verifySms, SCENE_SIGNIN, SCENE_PASSWORD_RESET, normalizePhone, SmsError } from './sms-auth';
import { verifyCode as verifyMail, normalizeEmail, MailError } from './mail-auth';
import { grantSignupBonus } from './signup-grant';
import { reviewCodeAccepts } from './review-account';
import { logVerifiedSignupReferral } from './signup-referral';
import { bindCircleFirm, validateCircleFirmCode } from './circle-firms';

const SETUP_TTL_MS = 10 * 60 * 1000;
const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export class PasswordFlowError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function passwordError(error: unknown) {
  if (error instanceof PasswordFlowError) return NextResponse.json({ error: error.code }, { status: error.status });
  if (error instanceof SmsError || error instanceof MailError) return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}
export function contactFrom(body: Record<string, unknown>) {
  if (typeof body.phone === 'string' && body.phone) {
    if (!phoneIsAccount()) throw new PasswordFlowError('sms_not_supported_on_site');
    return { kind: 'phone' as const, account: normalizePhone(body.phone) };
  }
  if (typeof body.email === 'string' && body.email) {
    if (!emailIsAccount()) throw new PasswordFlowError('mail_not_supported_on_site');
    return { kind: 'email' as const, account: normalizeEmail(body.email) };
  }
  throw new PasswordFlowError('missing_fields');
}
export function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw new PasswordFlowError('invalid_password');
}
export function setupForVerifiedUser(user: User, account: string) {
  return withTransaction(db => {
    const current = findUserById(user.id);
    if (!current || isDeletedUser(current)) throw new PasswordFlowError('invalid_credentials', 401);
    if (current.passwordHash) throw new PasswordFlowError('password_login_required', 409);
    const setupToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SETUP_TTL_MS;
    db.prepare('DELETE FROM password_setup_ticket WHERE userId = ? OR expiresAt <= ?').run(user.id, Date.now());
    db.prepare('INSERT INTO password_setup_ticket(tokenHash,userId,account,expiresAt) VALUES(?,?,?,?)').run(digest(setupToken), user.id, account, expiresAt);
    return { passwordSetupRequired: true, setupToken, expiresAt, account };
  });
}
/** Existing store-review exception requires BOTH configured identity AND exact fixed code.
 * Never call this from setup/reset/bind. Ordinary delivered OTP does not enable it. */
export function reviewLoginUser(body: Record<string, unknown>): User | null {
  const contact = contactFrom(body);
  if (!reviewCodeAccepts(contact.account, typeof body.code === 'string' ? body.code : '')) return null;
  const found = contact.kind === 'phone' ? findOrCreateByPhone(contact.account) : findOrCreateByEmail(contact.account);
  if (found.created) { try { grantSignupBonus(found.user.id); } catch { /* retain review account provisioning */ } }
  return found.user;
}
export function verifyFirstContact(body: Record<string, unknown>) {
  const contact = contactFrom(body);
  const rawInviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
  if (rawInviteCode) {
    const check = validateCircleFirmCode(rawInviteCode);
    if (!check.ok) throw new PasswordFlowError('invalid_invite_code', 400);
  }
  const code = typeof body.code === 'string' ? body.code : '';
  const normalized = contact.kind === 'phone' ? verifySms(SCENE_SIGNIN, contact.account, code) : verifyMail(SCENE_SIGNIN, contact.account, code);
  const { user, created } = contact.kind === 'phone' ? findOrCreateByPhone(normalized) : findOrCreateByEmail(normalized);
  if (created) { try { grantSignupBonus(user.id); } catch { /* grant remains retryable */ } }
  if (rawInviteCode) {
    const bindRes = bindCircleFirm(user.id, rawInviteCode);
    if (!bindRes.ok && bindRes.error !== 'already_bound_same') {
      throw new PasswordFlowError(bindRes.error === 'already_bound_other' ? 'already_bound_other' : 'invalid_invite_code', 400);
    }
  }
  const challenge = setupForVerifiedUser(user, normalized);
  logVerifiedSignupReferral(body.ref, created, user.id);
  return challenge;
}
export async function completeSetup(body: Record<string, unknown>) {
  assertPassword(body.password);
  const rawInviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
  if (rawInviteCode) {
    const check = validateCircleFirmCode(rawInviteCode);
    if (!check.ok) throw new PasswordFlowError('invalid_invite_code', 400);
  }
  const token = typeof body.setupToken === 'string' ? body.setupToken : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PasswordFlowError('invalid_setup_token', 401);
  const hashedToken = digest(token);
  // Check before costly scrypt; final transaction rechecks after the asynchronous hash.
  if (!getDb().prepare('SELECT 1 FROM password_setup_ticket WHERE tokenHash = ? AND expiresAt > ?').get(hashedToken, Date.now())) throw new PasswordFlowError('invalid_setup_token', 401);
  const passwordHash = await hashPassword(body.password);
  let targetUserId = '';
  withTransaction(db => {
    const ticket = db.prepare('SELECT userId FROM password_setup_ticket WHERE tokenHash = ? AND expiresAt > ?').get(hashedToken, Date.now()) as { userId: string } | undefined;
    const user = ticket && findUserById(ticket.userId);
    if (!ticket || !user || isDeletedUser(user) || user.passwordHash) throw new PasswordFlowError('invalid_setup_token', 401);
    targetUserId = user.id;
    db.prepare('INSERT INTO password_credential(userId,passwordHash,version) VALUES(?,?,1)').run(user.id, passwordHash);
    db.prepare('DELETE FROM password_setup_ticket WHERE userId = ?').run(user.id);
    db.prepare('UPDATE api_keys SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL').run(new Date().toISOString(), user.id);
  });
  if (rawInviteCode && targetUserId) {
    bindCircleFirm(targetUserId, rawInviteCode);
  }
}
export async function resetPassword(body: Record<string, unknown>) {
  assertPassword(body.password);
  const contact = contactFrom(body);
  const code = typeof body.code === 'string' ? body.code : '';
  if (!/^\d{6}$/.test(code)) throw new PasswordFlowError('invalid_code', 401);
  const passwordHash = await hashPassword(body.password);
  // Return failures instead of throwing inside the transaction: failed-code counters must commit.
  const error = withTransaction(db => {
    try {
      if (contact.kind === 'phone') verifySms(SCENE_PASSWORD_RESET, contact.account, code);
      else verifyMail(SCENE_PASSWORD_RESET, contact.account, code);
    } catch (e) { return e; }
    const user = contact.kind === 'phone' ? findUserByPhone(contact.account) : findUserByAccount(contact.account);
    if (!user) return new PasswordFlowError('invalid_code', 401);
    if (contact.kind === 'email') findOrCreateByEmail(contact.account);
    db.prepare(`INSERT INTO password_credential(userId,passwordHash,version) VALUES(?,?,1)
      ON CONFLICT(userId) DO UPDATE SET passwordHash=excluded.passwordHash, version=password_credential.version+1`).run(user.id, passwordHash);
    db.prepare('DELETE FROM password_setup_ticket WHERE userId = ?').run(user.id);
    db.prepare('UPDATE api_keys SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL').run(new Date().toISOString(), user.id);
    return null;
  });
  if (error) throw error;
}
