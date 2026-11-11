import { NextRequest, NextResponse } from 'next/server';
import { findUserById, isDeletedUser } from '@/lib/users';
import { setupForVerifiedUser, passwordError } from '@/lib/password-flow';
import { redeemWxTicket } from '@/lib/wx-mini';

/**
 * 兼容旧小程序换号票据，仅兑换首次设密挑战（dev-board#305、#1299）。
 *
 * /api/auth/wx-phone 建号成功后回给小程序的一次性票据在这里兑现：
 * 无密码账号获得一次性 setupToken，设密并完成密码登录后才有正式会话。
 * 已有密码账号返回 password_login_required，不再用票据登录。旧票据 10 分钟一次性，
 * 无效/过期/重放一律同一句 invalid_ticket，不区分。
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let ticket: string;
  try {
    const body = await request.json();
    ticket = typeof body?.ticket === 'string' ? body.ticket : '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const userId = ticket ? redeemWxTicket(ticket) : null;
  const user = userId ? findUserById(userId) : undefined;
  if (!user || isDeletedUser(user)) {
    return NextResponse.json({ error: 'invalid_ticket' }, { status: 401 });
  }

  try { return NextResponse.json(setupForVerifiedUser(user, user.phone || user.email)); }
  catch (e) { return passwordError(e); }
}
