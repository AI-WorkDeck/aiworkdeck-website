import { NextRequest } from 'next/server';
import { handleWxpayNotify } from '@/lib/payments/wxpay-notify';

/**
 * 微信支付 Native（扫码）回调。处理逻辑在 lib/payments/wxpay-notify.ts，
 * 与 APP 支付回调（./app/route.ts）共用。
 */
export async function POST(request: NextRequest) {
  return handleWxpayNotify(request, 'wxpay');
}
