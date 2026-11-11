import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { listEntitlements } from '@/lib/purchases';
import { refreshBqtSnapshot } from '@/lib/bqt-account';

/**
 * 桌面端权益同步（Bearer awdk_ 鉴权）。契约见总 Spec §9，逐字对齐：
 * GET /api/account/entitlements → { entitlements: [{ feature, purchasedAt, orderId, expiresAt }] }
 *
 * expiresAt（string | null，2026-10-10 追加）：NULL = 永久；个人 Pro 等限时权益为到期时间。
 * 只加不改：旧字段原样保留，旧版桌面端忽略新字段即可。已过期的权益不会出现在列表里。
 */
export async function GET(request: NextRequest) {
  const user = resolveKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // 包晴天有效会员的 Pro 权益读快照，先刷新（失败沿用旧快照）
  await refreshBqtSnapshot(user.id);
  return NextResponse.json({
    entitlements: listEntitlements(user.id).map(e => ({
      feature: e.feature,
      purchasedAt: e.createdAt,
      orderId: e.orderId,
      expiresAt: e.expiresAt ?? null,
    })),
  });
}
