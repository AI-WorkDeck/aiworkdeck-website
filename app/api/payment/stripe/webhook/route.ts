import { NextRequest, NextResponse } from 'next/server';
import {
  describeSettleFailure,
  getAdapterForChannel,
  settleFromChannel,
  WebhookVerificationError,
} from '@/lib/payments';

/**
 * Stripe webhook 入账端点（国际站）。
 *
 * ## HTTP 状态码在这里是重试指令，不是文档
 *
 * Stripe 对任何非 2xx 应答会**持续重试最长 3 天**（指数退避）。所以状态码要按
 * 「这个错重试有没有用」来选，而不是按「错在哪一类」：
 *
 * - 订单不存在 / 金额不符 / 币种不符 / 通道不符 → **200**。
 *   这些都是终局性的：重试 3 天不会让订单突然出现、也不会让金额突然对上，
 *   只会把告警刷成噪音、把 Stripe 后台的 webhook 端点标成不健康。
 *   落 error 日志、不结算、拖着等人工核查——**这是故意的**：宁可让一笔真实支付
 *   卡在 pending 等人来看，也不能拿一笔对不上的支付去发货发钱。
 * - 验签失败 → 400。伪造或配置错，重试同样没用，但绝不能应答 2xx 让它以为收下了。
 * - 未预期异常（数据库不可用等）→ 500。这类才是瞬时故障，正是重试要救的场景。
 * - 其它事件类型 → 200 且不做任何写。
 *
 * Checkout 同步完成和异步到账共用一条入账路径，必须已付且通过订单校验。
 * settleFromChannel 的事务幂等保证重投和乱序事件不会重复入账。
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    // 必须是未经解析的原始字节：constructEvent 算的是原文 HMAC，
    // request.json() 之后再 stringify 回来的报文验签必然失败
    rawBody = await request.text();
  } catch (error) {
    console.error('[stripe webhook] 读取请求体失败:', error);
    return NextResponse.json({ received: false }, { status: 500 });
  }

  const adapter = getAdapterForChannel('stripe')!;

  let settlement;
  try {
    settlement = await adapter.parseWebhook(request.headers, rawBody);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      console.error('[stripe webhook]', error.message);
      return NextResponse.json({ received: false, error: 'invalid_signature' }, { status: 400 });
    }
    console.error('[stripe webhook] 解析事件失败:', error);
    return NextResponse.json({ received: false }, { status: 500 });
  }

  // 非入账事件，或异步付款尚未到账：确认收下，不做任何写
  if (!settlement || !settlement.paid) {
    return NextResponse.json({ received: true });
  }

  let result;
  try {
    result = settleFromChannel(settlement);
  } catch (error) {
    // 落库失败属于瞬时故障，交给 Stripe 重试
    console.error(`[stripe webhook] 结算 ${settlement.outTradeNo} 异常:`, error);
    return NextResponse.json({ received: false }, { status: 500 });
  }

  if (!result.ok) {
    console.error(
      `[stripe webhook] 拒绝结算 ${settlement.outTradeNo}: ${describeSettleFailure(result.reason)}`,
      {
        channelAmount: settlement.amountMinor,
        channelCurrency: settlement.currency,
        transactionId: settlement.transactionId,
      }
    );
    // 终局性错误一律 200：见文件头。不结算，等人工。
    return NextResponse.json({ received: true, settled: false, reason: result.reason });
  }

  console.log(
    result.alreadyPaid
      ? `[stripe webhook] 重复投递，订单已是已支付: ${settlement.outTradeNo}`
      : `[stripe webhook] 订单已更新为已支付: ${settlement.outTradeNo}`
  );

  return NextResponse.json({ received: true, settled: true });
}
