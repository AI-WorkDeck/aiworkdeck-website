import QRCode from 'qrcode';
import {
  createNativeOrder,
  decryptNotify,
  queryOrder as queryWxOrder,
  verifyWechatpayMessage,
} from '../wxpay';
import {
  ChannelSettlement,
  CreateChargeInput,
  CreateChargeResult,
  PaymentChannelAdapter,
  WebhookVerificationError,
} from './types';

/**
 * 微信支付 Native（扫码）适配器。
 *
 * 只 wrap lib/wxpay.ts，不改它：验签、平台证书 / 公钥双模式、回查响应验签
 * 这些已经过生产验证的逻辑一行都不动。本文件只负责把它的输出翻译成通道无关的形状。
 */

function env(name: string): string {
  return process.env[name] || '';
}

export const wxpayAdapter: PaymentChannelAdapter = {
  id: 'wxpay',
  currency: 'CNY',

  isConfigured() {
    // 按调用读，不在模块加载时快照：脚本切 env 验证各分支时不必重启进程
    return Boolean(
      env('WXPAY_APPID') && env('WXPAY_MCHID') && env('WXPAY_APIV3_KEY') && env('WXPAY_SERIAL_NO')
    );
  },

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    // 同一 out_trade_no 以相同参数重复调用会返回同一个 code_url（微信侧幂等）
    const wxOrder = await createNativeOrder({
      description: input.description,
      outTradeNo: input.outTradeNo,
      amount: input.amountMinor,
      notifyUrl: `${input.baseUrl}/api/payment/notify`,
    });

    const codeUrl: string = wxOrder.code_url;
    const qrCode = await QRCode.toDataURL(codeUrl, { width: 256, margin: 2 });

    return { channel: 'wxpay', present: 'qrcode', codeUrl, qrCode };
  },

  async parseWebhook(headers: Headers, rawBody: string): Promise<ChannelSettlement | null> {
    const ok = await verifyWechatpayMessage({
      timestamp: headers.get('Wechatpay-Timestamp') || '',
      nonce: headers.get('Wechatpay-Nonce') || '',
      serial: headers.get('Wechatpay-Serial') || '',
      signature: headers.get('Wechatpay-Signature') || '',
      body: rawBody,
    });
    if (!ok) {
      throw new WebhookVerificationError('微信支付回调签名验证失败');
    }

    const { resource } = JSON.parse(rawBody);
    const data = decryptNotify(resource.nonce, resource.associated_data, resource.ciphertext);

    if (data.trade_state !== 'SUCCESS') return null;

    return {
      channel: 'wxpay',
      outTradeNo: data.out_trade_no,
      paid: true,
      amountMinor: data.amount?.total,
      // 微信 Native 只受理人民币；回调里的 amount.currency 也恒为 CNY
      currency: 'CNY',
      transactionId: data.transaction_id,
      payerRef: data.payer?.openid,
    };
  },

  async queryCharge(outTradeNo: string): Promise<ChannelSettlement | null> {
    // queryOrder 内部已对响应验签，验签失败直接抛错（fail closed）
    const wxOrder = await queryWxOrder(outTradeNo);
    return {
      channel: 'wxpay',
      outTradeNo,
      paid: wxOrder.trade_state === 'SUCCESS',
      amountMinor: wxOrder.amount?.total,
      currency: 'CNY',
      transactionId: wxOrder.transaction_id,
      payerRef: wxOrder.payer?.openid,
    };
  },
};
