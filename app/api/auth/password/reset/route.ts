import { NextRequest, NextResponse } from 'next/server';
import { resetPassword, passwordError } from '@/lib/password-flow';
import { clientIp, loginAllowed, recordLoginFailure, clearLoginFailures } from '@/lib/login-throttle';
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const account = typeof body?.phone === 'string' ? body.phone : typeof body?.email === 'string' ? body.email : '';
  const ip = clientIp(request);
  if (!loginAllowed(account, ip)) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
  try { await resetPassword(body ?? {}); clearLoginFailures(account); return NextResponse.json({ ok: true }); }
  catch (e) { recordLoginFailure(account, ip); return passwordError(e); }
}
