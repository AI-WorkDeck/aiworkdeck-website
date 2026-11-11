import { siteConfig } from '../site-config';
import { appstoreAdapter } from './appstore-adapter';
import { stripeAdapter } from './stripe-adapter';
import { PaymentChannelAdapter, PaymentChannelId } from './types';
import { wxpayAdapter } from './wxpay-adapter';
import { wxvpAdapter } from './wxvp-adapter';

export * from './types';
export { wxvpAdapter } from './wxvp-adapter';
export {
  appstoreAdapter,
  appstoreEnv,
  verifyTransaction,
  verifyTransactionInEnvironment,
  verifyNotification,
  settlementFromTransaction,
  AppstoreVerificationError,
  setAppleRootCertificates,
} from './appstore-adapter';
export { APPSTORE_PRODUCTS, APPSTORE_CURRENCY, appstoreFaceValue } from './appstore-catalog';
export { settleFromChannel, describeSettleFailure } from './settle';
export type { SettleResult, SettleFailureReason } from './settle';

const ADAPTERS: Record<PaymentChannelId, PaymentChannelAdapter> = {
  wxpay: wxpayAdapter,
  stripe: stripeAdapter,
  // 虚拟支付**不参与 getPaymentAdapter()**（它不是任何一个站点的默认通道），
  // 但必须在表里：回调与回查按订单上记的 channel 取 adapter。
  wxvp: wxvpAdapter,
  // 内购同理不参与 getPaymentAdapter()：它不是任何站点的默认通道，
  // 但必须在表里——退款通知与订单回查按订单上记的 channel 取 adapter。
  appstore: appstoreAdapter,
};

/**
 * 本站建单用的通道。取 siteConfig.paymentChannel（部署级常量），
 * **不按请求 Host 或 locale 判定**：那会让用哪把密钥、按哪个币种收款
 * 变成攻击者可控的输入，而且国内站的中文页面照样可能被境外用户打开。
 */
export function getPaymentAdapter(): PaymentChannelAdapter {
  return ADAPTERS[siteConfig.paymentChannel];
}

/**
 * 按通道 id 取 adapter。回调与回查一律用**订单上记录的 channel** 调它：
 * 订单已经落库，认订单比认请求稳——配置改过、报文伪造、路由挂错都不影响它。
 */
export function getAdapterForChannel(channel: string): PaymentChannelAdapter | undefined {
  return ADAPTERS[channel as PaymentChannelId];
}
