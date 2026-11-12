import {cloudState} from '@/lib/postpaid';
import { accountSubscriptionView } from '@/lib/account-subscription-view';
import { subscriptionSnapshot } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { getBalance, getBalanceBreakdown, listLedger } from '@/lib/wallet';
import { getUserCircleFirm } from '@/lib/circle-firms';
import { getBqtQingtianStatus } from '@/lib/bqt-auth';
import { accountBillingFields, refreshBqtSnapshot } from '@/lib/bqt-account';

/**
 * 账户页钱包数据（awd_session Cookie 鉴权，浏览器用）。
 * GET /api/account/wallet?limit=10&offset=0 → { balanceCents, breakdown, total, entries }
 *
 * breakdown 是浏览器专用的补充信息，不进桌面端契约：用户看到的是一个 Credits 总数，
 * 但需要知道其中多少是会过期的奖励、下一笔什么时候到期。
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  // limit/offset 必须是有效整数才采用（limit >= 1，offset >= 0），空串会被 Number 转成 0，不能算有效值。
  const limitRaw = Number(searchParams.get('limit') ?? 10);
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  await refreshBqtSnapshot(user.id);
  const circleFirm = getUserCircleFirm(user.id);
  const bqtQingtian = getBqtQingtianStatus(user.id);
  const { entries, total } = listLedger(user.id, {
    limit: Number.isInteger(limitRaw) && limitRaw >= 1 ? limitRaw : 10,
    offset: Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0,
  });
  return NextResponse.json({
    ...cloudState(user.id),
    balanceCents: getBalance(user.id),
    ...accountBillingFields(user.id),
    subscription: accountSubscriptionView(user.id),
    breakdown: getBalanceBreakdown(user.id),
    ...(circleFirm ? { circleFirm } : {}),
    ...(bqtQingtian ? { bqtQingtian } : {}),
    total,
    entries: entries.map(e => ({
      id: e.id,
      ts: e.ts,
      kind: e.kind,
      amountCents: e.amountCents,
      balanceAfterCents: e.balanceAfterCents,
      subscriptionCents: e.meta?.subscriptionCents ?? 0,
      billedCents: e.meta?.billedCents ?? Math.abs(e.amountCents),
    })),
  });
}
