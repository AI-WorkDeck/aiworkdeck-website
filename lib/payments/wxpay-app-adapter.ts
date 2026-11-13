import { buildAppPayParams, createAppOrder } from '../wxpay';
import { siteConfig } from '../site-config';
import {
  ChannelSettlement,
  CreateChargeInput,
  CreateChargeResult,
  PaymentChannelAdapter,
} from './types';
import { wxpayAdapter } from './wxpay-adapter';

/**
 * 微信支付 APP 支付适配器（安卓 com.aiworkdeck.mobile.cn，dev-board#428）。
 *
 * 与 Native 共用商户号、商户私钥、APIv3 key 与回调验签；只是下单接口与 appid
 * （开放平台移动应用 AppID，`WXPAY_APP_APPID`）不同。回调验签解密与回查直接复用
 * wxpayAdapter，只把结算结果的 channel 换成本通道——settleFromChannel 按订单上记的
 * channel 比对，APP 单只能被本通道结算，Native 单也不会被 APP 回调结掉。
 *
 * **WXPAY_APP_APPID 未配置 = 本通道不存在**（isConfigured 为 false）；仅限人民币站。
 */
export const wxpayAppAdapter: PaymentChannelAdapter = {
  id: 'wxpay-app',
  currency: 'CNY',

  isConfigured() {
    return Boolean(process.env.WXPAY_APP_APPID) && siteConfig.currency === 'CNY' && wxpayAdapter.isConfigured();
  },

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    // 同一 out_trade_no 以相同参数重复下单，微信回同一个 prepay_id（2 小时内）
    const prepayId = await createAppOrder({
      description: input.description,
      outTradeNo: input.outTradeNo,
      amount: input.amountMinor,
      notifyUrl: `${input.baseUrl}/api/payment/notify/app`,
    });
    return { channel: 'wxpay-app', present: 'app', appPay: buildAppPayParams(prepayId) };
  },

  async parseWebhook(headers: Headers, rawBody: string): Promise<ChannelSettlement | null> {
    const s = await wxpayAdapter.parseWebhook(headers, rawBody);
    return s && { ...s, channel: 'wxpay-app' };
  },

  async queryCharge(outTradeNo: string): Promise<ChannelSettlement | null> {
    const s = await wxpayAdapter.queryCharge(outTradeNo);
    return s && { ...s, channel: 'wxpay-app' };
  },
};
