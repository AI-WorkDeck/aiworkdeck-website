import { NextRequest, NextResponse } from 'next/server';
import { requireLegacyEmailUser, completeLegacyEmail, legacyEmailError } from '@/lib/legacy-email-migration';
import { loginAllowed, recordLoginFailure, clearLoginFailures, clientIp } from '@/lib/login-throttle';

export async function POST(request: NextRequest) {
  try {
    const user = requireLegacyEmailUser(request);
    const bucket = `legacy-email:${user.id}`;
    const ip = clientIp(request);
    if (!loginAllowed(bucket, ip)) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
    try {
      completeLegacyEmail(request, body?.email, body?.code);
      clearLoginFailures(bucket);
      return NextResponse.json({ ok: true });
    } catch (e) { recordLoginFailure(bucket, ip); return legacyEmailError(e); }
  } catch (e) { return legacyEmailError(e); }
}
