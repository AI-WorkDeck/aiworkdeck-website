import { NextRequest, NextResponse } from 'next/server';
import { describeSettleFailure, settleFromChannel } from './settle';
import { getAdapterForChannel } from './index';
import { WebhookVerificationError } from './types';

/**
 * 微信支付 v3 回调的处理（Native 与 APP 支付共用，dev-board#428 从
 * app/api/payment/notify/route.ts 原样抽出）。两条通道的报文格式、验签与解密完全相同，
 * 区别只在用哪个 adapter：它决定结算结果带哪个 channel，settleFromChannel 再拿它与
 * 订单上记的 channel 比对。所以两条通道各有自己的 notify_url，不按报文内容猜通道。
 *
 * 验签与解密都在 adapter 里；本函数只负责把结算结果翻译成微信要的应答。
 * 金额一致性校验与入账统一走 settleFromChannel（唯一入口），不在这里手写。
 */
export async function handleWxpayNotify(request: NextRequest, channel: 'wxpay' | 'wxpay-app') {
  const tag = `[${channel} notify]`;
  try {
    // 必须取原始字节：验签算的是原文的签名，先 json() 再 stringify 回来必然对不上
    const rawBody = await request.text();

    const adapter = getAdapterForChannel(channel)!;

    let settlement;
    try {
      settlement = await adapter.parseWebhook(request.headers, rawBody);
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        console.error(tag, error.message);
        return NextResponse.json({ code: 'FAIL', message: '签名验证失败' }, { status: 401 });
      }
      throw error;
    }

    // 非支付成功的通知（退款、状态变更等）：确认收到，不做任何写
    if (!settlement || !settlement.paid) {
      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    const result = settleFromChannel(settlement);
    if (!result.ok) {
      console.error(
        `${tag} 拒绝结算 ${settlement.outTradeNo}: ${describeSettleFailure(result.reason)}`,
        { channelAmount: settlement.amountMinor, channelCurrency: settlement.currency }
      );
      return NextResponse.json(
        { code: 'FAIL', message: describeSettleFailure(result.reason) },
        { status: result.reason === 'not_found' ? 404 : 400 }
      );
    }

    console.log(
      result.alreadyPaid
        ? `${tag} 重复回调，订单已是已支付: ${settlement.outTradeNo}`
        : `${tag} 订单已更新为已支付: ${settlement.outTradeNo}`
    );

    return NextResponse.json({ code: 'SUCCESS', message: '成功' });
  } catch (error: any) {
    console.error('处理支付回调失败:', error);
    return NextResponse.json({ code: 'FAIL', message: '处理失败' }, { status: 500 });
  }
}
