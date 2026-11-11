// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { adminActor, bqtAdminGuard } from '@/lib/bqt-admin';
import { consumeRow, dispatchConsume, reissueConsume, waiveConsume } from '@/lib/bqt-member';

export const dynamic = 'force-dynamic';

/**
 * 处理一笔扣减：
 *   retry   —— pending/sending：用原单号原积分立即重发；
 *   reissue —— failed：律师补足积分后，原单标记放弃、按原积分开新单号并立即发送；
 *   waive   —— failed：放弃，平台承担。
 * 状态不对回 409 invalid_state。
 */
export async function POST(request: NextRequest) {
  const denied = bqtAdminGuard(request);
  if (denied) return denied;
  let body: { requestNo?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const requestNo = typeof body?.requestNo === 'string' ? body.requestNo : '';
  const action = body?.action;
  if (action !== 'retry' && action !== 'reissue' && action !== 'waive') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  const row = requestNo ? consumeRow(requestNo) : undefined;
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const invalid = () => NextResponse.json({ error: 'invalid_state', state: row.state }, { status: 409 });
  const actor = adminActor(request);

  if (action === 'retry') {
    if (row.state !== 'pending' && row.state !== 'sending') return invalid();
    const after = await dispatchConsume(requestNo);
    console.info(`[bqt] admin retry requestNo=${requestNo} by=${actor} -> ${after.state}`);
    return NextResponse.json({ ok: true, row: after });
  }
  if (action === 'waive') {
    if (!waiveConsume(requestNo, actor)) return NextResponse.json({ error: 'invalid_state', state: consumeRow(requestNo)?.state }, { status: 409 });
    return NextResponse.json({ ok: true, row: consumeRow(requestNo) });
  }
  const fresh = reissueConsume(requestNo, actor);
  if (!fresh) return NextResponse.json({ error: 'invalid_state', state: consumeRow(requestNo)?.state }, { status: 409 });
  const sent = await dispatchConsume(fresh.requestNo);
  return NextResponse.json({ ok: true, original: consumeRow(requestNo), row: sent });
}
