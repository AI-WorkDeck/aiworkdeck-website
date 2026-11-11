import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminCookieOptions, getAdminToken, verifyAdminToken } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!getAdminToken()) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 503 });
  }
  let token = '';
  try {
    const body = await request.json();
    token = String(body.token || '');
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
