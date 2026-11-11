// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { bqtAdminGuard, bqtConsumeStats, listBqtConsumes, parseConsumeFilter } from '@/lib/bqt-admin';

export const dynamic = 'force-dynamic';

/** 扣减台账：?state=pending|sending|succeeded|failed|waived|attention &q=（用户 id / 律师 id / 单号）&from=&to=（上海日期）&page= */
export async function GET(request: NextRequest) {
  const denied = bqtAdminGuard(request);
  if (denied) return denied;
  return NextResponse.json({ ...listBqtConsumes(parseConsumeFilter(request.nextUrl.searchParams)), stats: bqtConsumeStats() });
}
