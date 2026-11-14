import { NextRequest, NextResponse } from 'next/server';
import { verifyFirstContact, passwordError, reviewLoginUser } from '@/lib/password-flow';
import { withTransaction } from '@/lib/db';
import { findUserById, type User } from '@/lib/users';
import { findUserByAccount, verifyPassword } from '@/lib/users';
import { countActiveKeys, issueLoginKey } from '@/lib/api-keys';
import { gateForUser, SUPPORT_EMAIL } from '@/lib/phone-policy';
import { loginAllowed, recordLoginFailure, clearLoginFailures, clientIp } from '@/lib/login-throttle';
import { bindCircleFirm } from '@/lib/circle-firms';
import { auditLoginKey, auditWebsiteLoginFailure } from '@/lib/firm-audit-account';

/** Password login issues the existing account key. First-contact OTP only grants a setup ticket. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad_request');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone : '';
  const code = typeof body.code === 'string' ? body.code : '';
  const email = typeof body.email === 'string' ? body.email : '';
  const account = typeof body.account === 'string' ? body.account : '';
  const password = typeof body.password === 'string' ? body.password : '';

  let user: User;
  const isNewUser = false;

  if ((phone || email) && code) {
    try {
      const review = reviewLoginUser(body);
      if (!review) return NextResponse.json(verifyFirstContact(body));
      user = review;
    }
    catch (e) { return passwordError(e); }
  } else if (account && password && password.length <= 72) {
    // 匿名端点 + 验对就发 Key = 无限次数的口令试探口，必须计次。
    // 手机号那条不走这里：验证码自带 5 次作废 + 冷却 + 日配额。
    const ip = clientIp(request);
    if (!loginAllowed(account, ip)) {
      return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
    }
    const found = findUserByAccount(account);
    if (!found || !(await verifyPassword(password, found.passwordHash))) {
      recordLoginFailure(account, ip);
      auditWebsiteLoginFailure(found, 'exchange_key', request);
      // 与账号不存在同一个响应，不透露账号是否存在
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }
    clearLoginFailures(account);
    user = found;
  } else {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // 与浏览器登录同一条闸：大陆站期限后未绑号一律拒，且拒在签发凭据之前。
  // 桌面端拿不到 Key 就连不上账户，等价于拒登。
  const gate = gateForUser(user);
  if (gate === 'blocked') {
    return NextResponse.json(
      { error: 'phone_binding_required', supportEmail: SUPPORT_EMAIL },
      { status: 403 }
    );
  }

  const rawInviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
  if (rawInviteCode) {
    const bindRes = bindCircleFirm(user.id, rawInviteCode);
    if (!bindRes.ok && bindRes.error !== 'already_bound_same') {
      return NextResponse.json(
        { error: bindRes.error === 'already_bound_other' || bindRes.error === 'bqt_member' ? bindRes.error : 'invalid_invite_code' },
        { status: 400 }
      );
    }
    user = findUserById(user.id) ?? user;
  }

  const rawDeviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 64) : '';
  const deviceName = rawDeviceName || null;

  const activeBefore = countActiveKeys(user.id);
  const key = withTransaction(() => {
    if (findUserById(user.id)?.passwordHash !== user.passwordHash) return null;
    return issueLoginKey(user.id, deviceName);
  });
  if (!key) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  auditLoginKey(user, key.info, 'login', activeBefore, request);
  return NextResponse.json({
    key: key.plaintextKey,
    user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email },
    isNewUser,
    // 存量账号还没绑手机号：桌面端据此弹强制补绑，绑定仍在官网完成
    mustBindPhone: gate === 'must_bind',
  });
}
