import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getTrialBalance } from '@/lib/trial';

export const dynamic = 'force-dynamic';

/**
 * 试用余额（Bearer awdk_，与 /api/account/ledger 等桌面端点同一鉴权）。
 * 契约见 doc/desktop-contract.md「GET /api/account/trial」。
 * 官网是权威：桌面端只缓存与展示，不在本机判定或扣减。
 */
export async function GET(request: NextRequest) {
  const user = resolveKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getTrialBalance(user.id));
}
