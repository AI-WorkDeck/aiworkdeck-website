// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { adminActor, bqtAdminGuard, bqtAdminOverview } from '@/lib/bqt-admin';
import { updateBqtSettings, type BqtSettingsPatch } from '@/lib/bqt-member';

export const dynamic = 'force-dynamic';

/** 设置 + 连接状态（不含密钥）+ 改动留痕 + 扣减统计。 */
export async function GET(request: NextRequest) {
  const denied = bqtAdminGuard(request);
  if (denied) return denied;
  return NextResponse.json(bqtAdminOverview());
}

/**
 * 改设置。字段都可选：tunnelEnabled / grantProRights 为布尔；centsPerPoint / marginMultiplier 为数字或 null。
 * 错误码：invalid_*（400）、ratio_required / env_missing（409，开通道的前置条件不满足）。
 */
export async function PATCH(request: NextRequest) {
  const denied = bqtAdminGuard(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const patch: BqtSettingsPatch = {};
  const fail = (error: string) => NextResponse.json({ error }, { status: 400 });
  for (const key of ['tunnelEnabled', 'grantProRights'] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') return fail(key === 'tunnelEnabled' ? 'invalid_tunnel_enabled' : 'invalid_grant_pro_rights');
    patch[key] = body[key];
  }
  for (const [key, error] of [['centsPerPoint', 'invalid_cents_per_point'], ['marginMultiplier', 'invalid_margin']] as const) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== 'number') return fail(error);
    patch[key] = body[key] as number | null;
  }
  if (Object.keys(patch).length === 0) return fail('empty_patch');
  const res = updateBqtSettings(patch, adminActor(request));
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.error.startsWith('invalid_') ? 400 : 409 });
  }
  return NextResponse.json({ ok: true, ...bqtAdminOverview() });
}
