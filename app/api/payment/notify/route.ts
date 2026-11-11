import { NextRequest, NextResponse } from 'next/server';
import {
  describeSettleFailure,
  getAdapterForChannel,
  settleFromChannel,
  WebhookVerificationError,
} from '@/lib/payments';

/**
 * 微信支付回调。
 *
 * 验签与解密都在 wxpay-adapter 里；本路由只负责把结算结果翻译成微信要的应答。
 * 金额一致性校验与入账统一走 settleFromChannel（唯一入口），不在这里手写。
 */
export async function POST(request: NextRequest) {
  try {
    // 必须取原始字节：验签算的是原文的签名，先 json() 再 stringify 回来必然对不上
    const rawBody = await request.text();

    const adapter = getAdapterForChannel('wxpay')!;

    let settlement;
    try {
      settlement = await adapter.parseWebhook(request.headers, rawBody);
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        console.error('[wxpay notify]', error.message);
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
        `[wxpay notify] 拒绝结算 ${settlement.outTradeNo}: ${describeSettleFailure(result.reason)}`,
        { channelAmount: settlement.amountMinor, channelCurrency: settlement.currency }
      );
      return NextResponse.json(
        { code: 'FAIL', message: describeSettleFailure(result.reason) },
        { status: result.reason === 'not_found' ? 404 : 400 }
      );
    }

    console.log(
      result.alreadyPaid
        ? `[wxpay notify] 重复回调，订单已是已支付: ${settlement.outTradeNo}`
        : `[wxpay notify] 订单已更新为已支付: ${settlement.outTradeNo}`
    );

    return NextResponse.json({ code: 'SUCCESS', message: '成功' });
  } catch (error: any) {
    console.error('处理支付回调失败:', error);
    return NextResponse.json({ code: 'FAIL', message: '处理失败' }, { status: 500 });
  }
}
