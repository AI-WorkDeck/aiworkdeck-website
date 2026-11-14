import { NextRequest, NextResponse } from 'next/server';
import { findUserByAccount, findUserById, verifyPassword } from '@/lib/users';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/sessions';
import { gateForUser, SUPPORT_EMAIL } from '@/lib/phone-policy';
import { loginAllowed, recordLoginFailure, clearLoginFailures, clientIp } from '@/lib/login-throttle';
import { grantTrialSafely } from '@/lib/trial';
import { withTransaction } from '@/lib/db';
import { bindCircleFirm } from '@/lib/circle-firms';
import { auditWebsiteLoginFailure } from '@/lib/firm-audit-account';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, password } = body;
    // 「记住我」默认为真：老客户端不带该字段时保持既有 30 天持久行为
    const remember = body.rememberMe !== false;
    if (typeof account !== 'string' || typeof password !== 'string' || !account || !password || password.length > 72) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    // 这条此前没有任何防爆破。只护住 exchange-key 而把这里晾着，
    // 等于攻击者换个 URL 就绕过去了。
    const ip = clientIp(request);
    if (!loginAllowed(account, ip)) {
      return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
    }
    const user = findUserByAccount(account);
    // passwordHash 为空串的是手机号注册的账号，它没有口令。verifyPassword 对空串
    // 会因为拆不出 salt:hash 返回 false，这里不额外分支——但也**不能**因此给出
    // 「该账号只能用手机号登录」之类的提示，那等于确认了号码的存在。
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordLoginFailure(account, ip);
      auditWebsiteLoginFailure(user, 'password', request);
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }
    clearLoginFailures(account);

    // 大陆站补绑期：期限内放行但要前端立刻弹强制绑定；期限后未绑号直接拒登。
    // 拒登发生在**建会话之前**——先建会话再拒等于给了一个能用的凭据。
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
    }

    const session = withTransaction(() => findUserById(user.id)?.passwordHash === user.passwordHash ? createSession(user.id) : null);
    if (!session) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    const { token, expiresAt } = session;
    const latestUser = findUserById(user.id) ?? user;
    // 试用计量 v0.1.1：注册 / 登录时幂等发放（已付费或已有记录则不动；失败不挡登录）
    grantTrialSafely(user.id);
    const res = NextResponse.json({
      user: { id: latestUser.id, username: latestUser.username, displayName: latestUser.displayName, email: latestUser.email },
      mustBindPhone: gate === 'must_bind',
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, remember));
    return res;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}
