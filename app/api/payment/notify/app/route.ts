import { NextRequest } from 'next/server';
import { handleWxpayNotify } from '@/lib/payments/wxpay-notify';

/**
 * 微信支付 APP 支付回调（安卓，dev-board#428）。与 Native 同一套验签/解密/结算，
 * 只是按 wxpay-app 通道结算：APP 单只认这条回调，Native 单不会被它结掉。
 */
export async function POST(request: NextRequest) {
  return handleWxpayNotify(request, 'wxpay-app');
}
