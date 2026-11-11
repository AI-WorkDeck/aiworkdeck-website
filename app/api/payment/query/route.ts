import {beginPaymentReview,endPaymentReview} from '@/lib/postpaid';
import { NextRequest, NextResponse } from 'next/server';
import { getOrder, Order } from '@/lib/orders';
import { getSessionUser } from '@/lib/sessions';
import { resolveKeyUser } from '@/lib/account-auth';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';
import { describeSettleFailure, getAdapterForChannel, settleFromChannel } from '@/lib/payments';
import { getDb } from '@/lib/db';

/**
 * 通道回查限频：同一订单号最短间隔内只出站回查一次，
 * 其余请求直接返回本地状态，防止匿名刷接口打通道。
 */
const CHANNEL_QUERY_MIN_INTERVAL_MS = 2000;
const lastChannelQueryAt = new Map<string, number>();

/** 响应瘦身：只回前端轮询需要的字段，不泄露 payerOpenid/userId/idempotencyKey。
 *  既有四字段口径不变（verify-payments 锁 keys）；仅 paid+subscription 追加
 *  skuId / paidAt / expiresAt 供 Pro 成功页插值，仍不回 userId。 */
function publicOrder(order: Order) {
  const base: {
    outTradeNo: string;
    status: Order['status'];
    amount: number;
    kind: Order['kind'];
    skuId?: string | null;
    paidAt?: string | null;
    expiresAt?: string | null;
  } = {
    outTradeNo: order.outTradeNo,
    status: order.status,
    amount: order.amount,
    kind: order.kind,
  };
  if (order.status === 'paid' && order.kind === 'subscription') {
    // 只读服务端权威值，不在此按天数自算：
    // 1) entitlements('pro').expiresAt（含续购顺延后的当前到期）；2) 本单履约 pro_payment.periodEnd。
    let expiresAt: string | null = null;
    try {
      const db = getDb();
      if (order.userId) {
        const ent = db
          .prepare("SELECT expiresAt FROM entitlements WHERE userId = ? AND feature = 'pro'")
          .get(order.userId) as { expiresAt: string | null } | undefined;
        expiresAt = ent?.expiresAt ?? null;
      }
      if (!expiresAt) {
        const row = db
          .prepare('SELECT periodEnd FROM pro_payment WHERE outTradeNo = ?')
          .get(order.outTradeNo) as { periodEnd: string } | undefined;
        expiresAt = row?.periodEnd ?? null;
      }
    } catch {
      expiresAt = null;
    }
    base.skuId = order.skuId ?? null;
    base.paidAt = order.paidAt ?? null;
    base.expiresAt = expiresAt;
  }
  return base;
}

export async function GET(request: NextRequest) {
  const lang = resolveRequestLocale(request);
  try {
    const { searchParams } = new URL(request.url);
    const outTradeNo = searchParams.get('outTradeNo');

    if (!outTradeNo) {
      return NextResponse.json(
        { error: pickLangText(lang, '订单号不能为空', 'Order number is required') },
        { status: 400 }
      );
    }

    // 查询本地订单
    const localOrder = getOrder(outTradeNo);
    if (!localOrder) {
      return NextResponse.json(
        { error: pickLangText(lang, '订单不存在', 'Order not found') },
        { status: 404 }
      );
    }

    // 属主校验：登录用户创建的订单只有本人可查；匿名打赏订单凭订单号查询。
    // 桌面端用 awdk_ Bearer 轮询自己下的充值单，与网页 Cookie 会话并行（先 Bearer 后 Cookie）。
    if (localOrder.userId) {
      const user = resolveKeyUser(request) ?? (await getSessionUser());
      if (!user || user.id !== localOrder.userId) {
        return NextResponse.json({ error: pickLangText(lang, '订单不存在', 'Order not found') }, { status: 404 });
      }
    }

    // 如果已经支付，直接返回
    if (localOrder.status === 'paid') {
      return NextResponse.json({
        success: true,
        order: publicOrder(localOrder),
      });
    }

    // 限频：间隔内不出站回查，直接回本地状态
    const now = Date.now();
    const last = lastChannelQueryAt.get(outTradeNo) ?? 0;
    if (now - last < CHANNEL_QUERY_MIN_INTERVAL_MS) {
      return NextResponse.json({
        success: true,
        order: publicOrder(localOrder),
      });
    }
    lastChannelQueryAt.set(outTradeNo, now);
    // 防 Map 无界增长：超过 1000 条时清掉过期项
    if (lastChannelQueryAt.size > 1000) {
      for (const [key, ts] of lastChannelQueryAt) {
        if (now - ts >= CHANNEL_QUERY_MIN_INTERVAL_MS) lastChannelQueryAt.delete(key);
      }
    }

    // 按**订单上记录的通道**取 adapter：订单已落库，认订单比认请求稳
    const adapter = getAdapterForChannel(localOrder.channel);
    if (!adapter) {
      console.error(`[payment query] 订单 ${outTradeNo} 的通道未知: ${localOrder.channel}`);
      return NextResponse.json({ success: true, order: publicOrder(localOrder) });
    }

    // 官方回查（内部已对通道响应验签，验签失败会抛错）
    if(localOrder.userId)beginPaymentReview(localOrder.userId,outTradeNo);
    const settlement = await adapter.queryCharge(outTradeNo);
    if(localOrder.userId&&settlement&&!settlement.paid)endPaymentReview(localOrder.userId,outTradeNo);

    // 只在通道确认支付成功后写状态；校验与入账统一走 settleFromChannel
    if (settlement?.paid) {
      const result = settleFromChannel(settlement);
      if (!result.ok) {
        // 与 webhook 路径同口径：对不上一律不结算，留人工核查（防御纵深）
        console.error(
          `[payment query] 拒绝结算 ${outTradeNo}: ${describeSettleFailure(result.reason)}`,
          { channelAmount: settlement.amountMinor, channelCurrency: settlement.currency }
        );
        return NextResponse.json(
          { error: pickLangText(lang, '订单待人工核查', 'Order requires manual verification') },
          { status: 409 }
        );
      }

      const order = getOrder(outTradeNo);
      return NextResponse.json({
        success: true,
        order: order ? publicOrder(order) : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      order: publicOrder(localOrder),
    });
  } catch (error: any) {
    console.error('查询订单失败:', error);
    return NextResponse.json(
      { error: pickLangText(lang, '查询订单失败', 'Failed to query order'), message: error.message },
      { status: 500 }
    );
  }
}
