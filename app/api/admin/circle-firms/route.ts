// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { adminActor } from '@/lib/bqt-admin';
import {
  createCircleFirm,
  isValidCircleCode,
  listCircleFirmsAdmin,
  normalizeCircleCode,
  parseCircleFirmPatch,
  updateCircleFirm,
} from '@/lib/circle-firms';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  return NextResponse.json({ firms: listCircleFirmsAdmin() });
}

/** 新建律所。code 规范化为大写；name/country/suffix 必填；margin 默认 1.0（不加价）。 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  const body = await readBody(request);
  if (!body) return bad('bad_request');
  const code = typeof body.code === 'string' ? normalizeCircleCode(body.code) : '';
  if (!isValidCircleCode(code)) return bad('invalid_code');
  for (const key of ['name', 'country', 'suffix'] as const) {
    if (body[key] === undefined) return bad(`invalid_${key}`);
  }
  const parsed = parseCircleFirmPatch(body);
  if (!parsed.ok) return bad(parsed.error);
  const res = createCircleFirm(code, parsed.patch);
  if (!res.ok) return bad(res.error, 409);
  // 没有 Circle 改动留痕表，先进服务日志。
  console.info(`[circle-firms] create code=${code} by=${adminActor(request)} ${JSON.stringify(parsed.patch)}`);
  return NextResponse.json({ ok: true, firm: res.firm, firms: listCircleFirmsAdmin() });
}

/** 修改律所：name / country / suffix / marginMultiplier / freeDeepseekCents / enabled / expiresAt（null 清除）。 */
export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  const body = await readBody(request);
  if (!body) return bad('bad_request');
  const code = typeof body.code === 'string' ? normalizeCircleCode(body.code) : '';
  if (!code) return bad('missing_code');
  const { code: _code, ...fields } = body;
  const parsed = parseCircleFirmPatch(fields);
  if (!parsed.ok) return bad(parsed.error);
  const firm = updateCircleFirm(code, parsed.patch);
  if (!firm) return bad('not_found', 404);
  console.info(`[circle-firms] update code=${code} by=${adminActor(request)} ${JSON.stringify(parsed.patch)}`);
  return NextResponse.json({ ok: true, firm, firms: listCircleFirmsAdmin() });
}
