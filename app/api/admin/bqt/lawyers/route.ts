// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextRequest, NextResponse } from 'next/server';
import { bqtAdminGuard, listBqtLawyers } from '@/lib/bqt-admin';

export const dynamic = 'force-dynamic';

/** 绑定律师列表：?q=（律师 ID / 手机号 / 姓名 / 本站用户名）&page= */
export async function GET(request: NextRequest) {
  const denied = bqtAdminGuard(request);
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  return NextResponse.json(listBqtLawyers({ q: sp.get('q')?.slice(0, 80) ?? undefined, page: Number(sp.get('page')) || 1 }));
}
