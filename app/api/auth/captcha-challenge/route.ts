// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import { SmsError } from '@/lib/sms-auth';
import { MailError } from '@/lib/mail-auth';
import { contactFrom, passwordError } from '@/lib/password-flow';
import { issueChallenge } from '@/lib/captcha-challenge';
import { CodeSendBlocked } from '@/lib/code-send-guard';
import { clientIp } from '@/lib/login-throttle';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.purpose !== 'login' && body?.purpose !== 'reset') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const contact = contactFrom(body);
    return NextResponse.json(await issueChallenge({ account: contact.account, purpose: body.purpose }, clientIp(request)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    if (e instanceof CodeSendBlocked) return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
    if (e instanceof SmsError) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
    if (e instanceof MailError) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    return passwordError(e);
  }
}
