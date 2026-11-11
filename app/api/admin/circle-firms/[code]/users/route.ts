// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { getCircleFirm, listCircleFirmUsers } from '@/lib/circle-firms';

export const dynamic = 'force-dynamic';

/** 某律所已绑定的用户 + DeepSeek 专用额度剩余（分）。 */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { code } = await context.params;
  const firm = getCircleFirm(decodeURIComponent(code));
  if (!firm) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ firm, users: listCircleFirmUsers(firm.code) });
}
