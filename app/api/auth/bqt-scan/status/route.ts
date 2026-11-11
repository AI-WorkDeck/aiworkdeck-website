// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { bqtScanEnabled } from '@/lib/bqt-auth';
import { phoneIsAccount } from '@/lib/phone-policy';
import { NextRequest, NextResponse } from 'next/server';
import { pollBqtScanSession } from '@/lib/bqt-auth';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/sessions';
import { issueLoginKey } from '@/lib/api-keys';
import { grantTrialSafely } from '@/lib/trial';
import { withTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!bqtScanEnabled()) return NextResponse.json({ error: 'service_unavailable', code: 1, msg: 'service_unavailable' }, { status: 503 });
  if (!phoneIsAccount()) return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  const { searchParams } = new URL(request.url);
  const qrid = searchParams.get('qrid') ?? '';
  const issueKey = searchParams.get('issueKey') === '1';
  const rawDeviceName = (searchParams.get('deviceName') ?? '').trim().slice(0, 64);

  const res = pollBqtScanSession(qrid, request.headers.get('X-Bqt-Poll-Token') || request.headers.get('authorization')?.replace(/^Bearer /, '') || '');
  if (res.status !== 'confirmed') {
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
  }

  const user = res.user;
  grantTrialSafely(user.id);

  if (issueKey) {
    const key = withTransaction(() => issueLoginKey(user.id, rawDeviceName || null));
    return NextResponse.json(
      {
        status: 'confirmed',
        key: key.plaintextKey,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
        },
        qingtian: res.qingtian,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const session = createSession(user.id);
  const response = NextResponse.json(
    {
      status: 'confirmed',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
      },
      qingtian: res.qingtian,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, true));
  return response;
}
