/**
 * 支付通道抽象的类型契约。
 *
 * 两站一套代码、两个部署：国内站走微信 Native 扫码，国际站走 Stripe Checkout。
 * 通道差异**只允许存在于 lib/payments/ 内**——路由层拿到的是同一组类型，
 * 拿不到「这是微信还是 Stripe」的隐含知识。
 *
 * 通道选择是**部署级常量**（siteConfig.paymentChannel），不按请求 Host 或
 * locale 判定：同一个部署的库里只会有一种通道的订单，按请求猜等于把
 * 「用哪把密钥验签、按哪个币种结算」交给攻击者可控的输入。
 */

import type { AppPayParams } from '../wxpay';

export type PaymentChannelId = 'wxpay' | 'stripe' | 'wxvp' | 'appstore' | 'wxpay-app';
export type CurrencyCode = 'CNY' | 'USD';

export interface CreateChargeInput {
  outTradeNo: string;
  description: string;
  /** 本通道币种的最小单位（CNY 分 / USD cent）。 */
  amountMinor: number;
  /** 本站 origin，用于拼回调地址与支付完成后的回跳地址。 */
  baseUrl: string;
  /**
   * 道具 id（微信虚拟支付的 `wxvp` 通道**必填**，其余通道忽略）。
   *
   * 可选而不是做成第二个方法：虚拟支付卖的是「已在公众平台发布的道具」，
   * 微信侧会拿它校验价格；扫码/Checkout 两条路则只认金额。调用方那侧的
   * 「哪些通道要传哪些字段」由 `app/api/internal/account` 显式校验，
   * 不靠这里的类型兜底。
   */
  productId?: string;
  /** 小程序 `wx.login()` 的 code（`wxvp` 必填）：换 openid + session_key 用。 */
  wxCode?: string;
}

/**
 * 建单结果用**判别联合**显式分叉，不用「可选字段糊在一起」的宽结构。
 *
 * 两种通道的前端交互形态根本不同：微信要在原页面渲染二维码等轮询，
 * Stripe 要整页跳去 Checkout 再跳回来。写成 `{codeUrl?, qrCode?, redirectUrl?}`
 * 的话，前端只能靠「哪个字段非空」反推形态，新增通道时每个消费点都要重读一遍；
 * 判别联合让 TypeScript 强制每个消费点显式处理每种形态。
 */
export type CreateChargeResult =
  | { channel: 'wxpay'; present: 'qrcode'; codeUrl: string; qrCode: string }
  | { channel: 'stripe'; present: 'redirect'; redirectUrl: string; providerRef: string }
  | {
      channel: 'wxvp';
      present: 'virtual';
      /** 传给 `wx.requestVirtualPayment` 的 signData，**必须原样透传**：两个签名都是对这个字符串算的。 */
      signData: string;
      paySig: string;
      signature: string;
      /** 付款人 openid。落 `orders.providerRef`——回查 `/xpay/query_order` 必须带它。 */
      providerRef: string;
    }
  | {
      channel: 'appstore';
      present: 'native';
      /**
       * StoreKit 2 的 `Product.PurchaseOption.appAccountToken(_:)`（UUID）。
       *
       * **落 `orders.providerRef`**，但刻意不叫 providerRef：它不是「通道侧的
       * 单据引用」（建单时苹果那边压根还不存在这笔交易），而是我们发给客户端、
       * 等它原样回传的**对单凭据**。名字不同是为了让消费点读一眼就知道这是
       * 要发给 iOS 的、而不是从通道拿回来的。
       */
      appAccountToken: string;
    }
  | {
      /** 微信支付 APP 支付（安卓 OpenSDK）：appPay 原样填进 `PayReq`。SDK 回调不作数，到账以服务端查单为准。 */
      channel: 'wxpay-app';
      present: 'app';
      appPay: AppPayParams;
    };

/**
 * 通道回传的「这笔单收到钱了」的事实，已剥离通道私有结构。
 *
 * channel 必须带：settleFromChannel 要拿它跟订单上记的通道比对。
 * currency 必须带：见 lib/payments/settle.ts 文件头。
 */
export interface ChannelSettlement {
  channel: PaymentChannelId;
  outTradeNo: string;
  paid: boolean;
  amountMinor: number;
  currency: CurrencyCode;
  /** 通道侧收款流水号（微信 transaction_id / Stripe payment_intent）。 */
  transactionId?: string;
  /** 付款人标识（微信 openid / Stripe 付款邮箱），仅用于对账，不对外返回。 */
  payerRef?: string;
}

export interface PaymentChannelAdapter {
  id: PaymentChannelId;
  currency: CurrencyCode;
  /** 本通道所需密钥是否齐备。按调用读环境变量，不在模块加载时快照。 */
  isConfigured(): boolean;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  /**
   * 验签并解析 webhook 原始报文。
   * - 验签失败一律抛 {@link WebhookVerificationError}（fail closed，绝不返回 null 让调用方误以为「只是无关事件」）
   * - 报文合法但不是入账事件 → 返回 null
   */
  parseWebhook(headers: Headers, rawBody: string): Promise<ChannelSettlement | null>;
  /** 主动回查。查不到（或本通道无从回查）返回 null。 */
  queryCharge(outTradeNo: string): Promise<ChannelSettlement | null>;
}

/**
 * webhook 验签失败。
 *
 * 单独一个类型是为了让路由能把它和「解析过程中出的其它错」分开：
 * 前者是确定性的拒绝（401/400，重试也没用），后者可能是瞬时故障（5xx，值得重试）。
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
