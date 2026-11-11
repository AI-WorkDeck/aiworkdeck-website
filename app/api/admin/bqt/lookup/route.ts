// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { bqtAdminGuard } from '@/lib/bqt-admin';
import { BqtUnavailableError, fetchBqtEntitlement, formatPoints } from '@/lib/bqt-member';

export const dynamic = 'force-dynamic';

/**
 * 测试连接 / 查律师：对包晴天只读查一次权益（成功会刷新本地快照），不扣积分。
 * 包晴天不可用时回 424 + reason（不用 5xx：后台跨站代理会把 5xx 吞成 relay_unavailable）。
 */
export async function POST(request: NextRequest) {
  const denied = bqtAdminGuard(request);
  if (denied) return denied;
  let lawyerId = '';
  try {
    const body = await request.json();
    lawyerId = typeof body?.lawyerId === 'string' ? body.lawyerId.trim() : typeof body?.lawyerId === 'number' ? String(body.lawyerId) : '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!/^\d{1,19}$/.test(lawyerId)) return NextResponse.json({ error: 'invalid_lawyer_id' }, { status: 400 });
  const started = Date.now();
  try {
    const e = await fetchBqtEntitlement(lawyerId);
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started, entitlement: { ...e, points: formatPoints(e.usablePointsHundredths) } });
  } catch (err) {
    const reason = err instanceof BqtUnavailableError ? err.reason : 'unknown';
    return NextResponse.json({ error: 'bqt_unavailable', reason, latencyMs: Date.now() - started }, { status: 424 });
  }
}
