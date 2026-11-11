import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
  earningsByCreator,
  listRecentPurchases,
  settleCreatorEarnings,
} from '@/lib/purchases';
import { listFeatureProducts, getFeatureProduct } from '@/lib/products';
import { getSkill } from '@/lib/skills-store';
import { getPlugin } from '@/lib/plugins-store';
import { findUserById } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * 管理后台「收益结算」与「商品与购买」数据（PR-W3）。
 * GET → { purchases: 近 50 笔, earnings: 按创作者聚合, products: feature 商品定价 }
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const purchases = listRecentPurchases(50).map(p => ({
    id: p.id,
    itemType: p.itemType,
    itemId: p.itemId,
    itemName: resolveItemName(p.itemType, p.itemId),
    priceCents: p.priceCents,
    creatorShareCents: p.creatorShareCents,
    platformShareCents: p.platformShareCents,
    buyer: findUserById(p.userId)?.username ?? p.userId,
    creator: p.creatorUserId ? findUserById(p.creatorUserId)?.username ?? p.creatorUserId : null,
    createdAt: p.createdAt,
  }));
  return NextResponse.json({
    purchases,
    earnings: earningsByCreator(),
    products: listFeatureProducts().map(p => ({
      key: p.key,
      name: p.name,
      priceCents: p.priceCents,
      defaultPriceCents: p.defaultPriceCents,
    })),
  });
}

/**
 * 标记某创作者全部待结算收益为已结算（人工转账后操作）。
 * settleNote 必填（转账凭证说明）；lib 层同一事务写 admin_audit 留痕。
 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const creatorUserId = typeof body.creatorUserId === 'string' ? body.creatorUserId : '';
    const settleNote = typeof body.settleNote === 'string' ? body.settleNote.trim() : '';
    if (!creatorUserId) {
      return NextResponse.json({ error: 'creator_required' }, { status: 400 });
    }
    if (!settleNote || settleNote.length > 500) {
      return NextResponse.json({ error: 'settle_note_required' }, { status: 400 });
    }
    const result = settleCreatorEarnings(creatorUserId, settleNote);
    if (result.settledCount === 0) {
      return NextResponse.json({ error: 'nothing_to_settle' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}

function resolveItemName(itemType: string, itemId: string): string {
  if (itemType === 'skill') return getSkill(itemId)?.name ?? itemId;
  if (itemType === 'plugin') return getPlugin(itemId)?.name ?? itemId;
  return getFeatureProduct(itemId)?.name ?? itemId;
}
