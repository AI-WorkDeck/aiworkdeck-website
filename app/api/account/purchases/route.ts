import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { listUserPurchases, earningsSummary } from '@/lib/purchases';
import { getSkill } from '@/lib/skills-store';
import { localizeSkill } from '@/lib/skill-en';
import { getPlugin } from '@/lib/plugins-store';
import { getFeatureProduct } from '@/lib/products';

export const dynamic = 'force-dynamic';

/**
 * 账户页「我的已购」与「创作者收益」（会话 cookie 鉴权，PR-W3）。
 * GET → { purchases: [...], earnings: { totalCents, pendingCents, settledCents } }
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const purchases = listUserPurchases(user.id).map(p => ({
    itemType: p.itemType,
    itemId: p.itemId,
    itemName: resolveItemName(p.itemType, p.itemId, 'zh'),
    itemNameEn: resolveItemName(p.itemType, p.itemId, 'en'),
    priceCents: p.priceCents,
    orderId: p.orderId,
    createdAt: p.createdAt,
  }));
  return NextResponse.json({ purchases, earnings: earningsSummary(user.id) });
}

/** 展示名按当前库存解析；条目已下架时退回 id */
function resolveItemName(itemType: string, itemId: string, lang: 'zh' | 'en' = 'zh'): string {
  if (itemType === 'skill') {
    const skill = getSkill(itemId);
    if (!skill) return itemId;
    return lang === 'en' ? localizeSkill(skill, 'en').name : skill.name;
  }
  if (itemType === 'plugin') return getPlugin(itemId)?.name ?? itemId;
  const product = getFeatureProduct(itemId);
  if (!product) return itemId;
  return lang === 'en' ? product.nameEn : product.name;
}
