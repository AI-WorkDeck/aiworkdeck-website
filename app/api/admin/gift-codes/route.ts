import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
  generateGiftCodes,
  listAvailableGiftCodes,
  listGiftCodes,
  normalizeCode,
  revokeGiftCode,
  GiftCodeKind,
  MAX_BATCH,
} from '@/lib/gift-codes';
import { listFeatureProducts } from '@/lib/products';

export const dynamic = 'force-dynamic';

/** 生成/撤销都是钱相关操作，createdBy 固定记为 admin（后台只有单一维护者口令）。 */
const OPERATOR = 'admin';

const PAGE_LIMIT = 200;

/**
 * GET → { codes, stats, features }（features 供生成表单下拉）
 * GET ?export=available → { codes: string[] } 全部未核销码，不受列表分页限制。
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (request.nextUrl.searchParams.get('export') === 'available') {
    return NextResponse.json({ codes: listAvailableGiftCodes() });
  }
  const { codes, stats } = listGiftCodes(PAGE_LIMIT);
  return NextResponse.json({
    codes,
    stats,
    // 列表只有最新 PAGE_LIMIT 行，而 stats 是全表口径：前端要据此提示截断
    pageLimit: PAGE_LIMIT,
    features: listFeatureProducts().map(p => ({ key: p.key, name: p.name })),
  });
}

/** POST { count, kind, amountCents?, feature?, note } → { codes: string[] } */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const kind = body.kind === 'entitlement' ? 'entitlement' : 'recharge';
  const result = generateGiftCodes({
    count: Number(body.count),
    kind: kind as GiftCodeKind,
    amountCents: body.amountCents === undefined ? undefined : Number(body.amountCents),
    feature: typeof body.feature === 'string' ? body.feature : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
    createdBy: OPERATOR,
  });
  if ('error' in result) {
    const messages: Record<string, string> = {
      invalid_count: `数量需为 1 到 ${MAX_BATCH} 之间的整数`,
      invalid_amount: '面额需为 0.01 到 10000 元之间的金额',
      invalid_feature: '权益名不在可赠送清单内（功能解锁 SKU / 已上架的 Skill 或插件）',
    };
    return NextResponse.json({ error: result.error, message: messages[result.error] }, { status: 400 });
  }
  return NextResponse.json(result);
}

/** PATCH { code } → 撤销未核销的码 */
export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let code: string | null = null;
  try {
    code = normalizeCode((await request.json())?.code);
  } catch {
    code = null;
  }
  if (!code) {
    return NextResponse.json({ error: 'code_required' }, { status: 400 });
  }
  if (!revokeGiftCode(code, OPERATOR)) {
    return NextResponse.json(
      { error: 'not_revocable', message: '该码不存在，或已被核销/已撤销' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
