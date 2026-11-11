// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { bqtScanEnabled } from '@/lib/bqt-auth';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createBqtScanSession } from '@/lib/bqt-auth';
import { phoneIsAccount } from '@/lib/phone-policy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!bqtScanEnabled()) return NextResponse.json({ error: 'service_unavailable', code: 1, msg: 'service_unavailable' }, { status: 503 });
  if (!phoneIsAccount()) {
    return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  }

  const session = createBqtScanSession();
  const qrDataUrl = await QRCode.toDataURL(session.qrContent, { width: 220, margin: 1 });
  return NextResponse.json({ ...session, qrDataUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
