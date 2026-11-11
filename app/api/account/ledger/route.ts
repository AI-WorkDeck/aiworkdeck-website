import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { listLedger } from '@/lib/wallet';

/**
 * 桌面端账本流水（Bearer awdk_ 鉴权）。契约见总 Spec §9。
 * GET /api/account/ledger?limit=50 → { entries: [{ ts, kind, amountCents, meta }] }
 */
export async function GET(request: NextRequest) {
  const user = resolveKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  // limit 必须是 >=1 的整数才采用，否则回落默认值。
  // 注意 Number('') === 0、Number.isInteger(0) === true，空参/0 都不能算有效值。
  const limitRaw = Number(searchParams.get('limit') ?? 50);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? limitRaw : 50;
  const { entries } = listLedger(user.id, { limit });
  return NextResponse.json({
    entries: entries.map(e => ({
      ts: e.ts,
      kind: e.kind,
      amountCents: e.amountCents,
      meta: e.meta,
    })),
  });
}
