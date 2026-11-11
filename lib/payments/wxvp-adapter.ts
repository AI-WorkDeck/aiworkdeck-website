import crypto from 'crypto';
import { getOrder } from '../orders';
import {
  WX_TOKEN_ERRCODES,
  WxError,
  wxAccessToken,
  wxCode2Session,
  wxMiniConfigured,
} from '../wx-mini';
import {
  ChannelSettlement,
  CreateChargeInput,
  CreateChargeResult,
  PaymentChannelAdapter,
  WebhookVerificationError,
} from './types';

/**
 * 微信小程序**虚拟支付**（米大师 /xpay）适配器（dev-board#427）。
 *
 * 与 `wxpay-adapter.ts`（微信支付 Native 扫码）**是两条完全不同的通道**，不是同一
 * 条的两种展现：这条卖的是公众平台上已发布的「道具」，钱先进微信虚拟支付账户、
 * T+3 分账，iOS 端还会被路由到 Apple 支付。所以它是独立的 `PaymentChannelId`，
 * 订单上记 `channel='wxvp'`，回调/回查各走各的。
 *
 * ## 为什么小程序侧不能自己算签名
 *
 * `paySig` 的 HMAC key 是 AppKey（商户密钥），`signature` 的 key 是 session_key
 * （用户登录态）。两把都只能待在服务端：AppKey 进了小程序包等于把收款能力发出去，
 * session_key 由 `jscode2session` 换出来、本来就只在服务端存在。所以整条链路是
 * 「小程序拿 code → 服务端换 session_key → 服务端出两个签名 → 小程序只负责调起」。
 *
 * ## 官方文档引用（2026-09-09 抓取）
 *
 * - 总览：`platform-capabilities/business-capabilities/virtual-payment.html`
 *   §2.5 签名详解、§2.6 参考的 Python 脚本（含两条**官方示例向量**，见
 *   `scripts/verify-wxvp.mts` 的对拍）
 * - `wx.requestVirtualPayment`：signData 字段表（offerId / buyQuantity / env /
 *   currencyType / productId / goodsPrice / outTradeNo / attach），mode 取
 *   `short_series_goods`（道具直购）
 * - `server/API/VirtualPayment/api_query_order`：请求体 `openid` / `env` /
 *   `order_id`（与 `wx_order_id` 二选一）；响应 `errcode` / `errmsg` / `order`，
 *   `order` 内 `status` / `order_fee` / `paid_fee` / `paid_time` /
 *   `wx_order_id` / `wxpay_order_id` / `env_type` 等
 *
 * ## 沙箱是**部署级**开关
 *
 * `WXVP_ENV=sandbox` 时 env=1 且用沙箱 AppKey，否则 env=0 用现网 AppKey。
 * 不按请求切：切错等于用错密钥验签、用错账本收钱，而请求是攻击者可控的。
 * （iOS 端的 Apple 支付根本没有沙箱，只能现网小额真付。）
 */

const WX_API = 'https://api.weixin.qq.com';

/** 调 `wx.requestVirtualPayment` 时 pay_sig 的 uri 固定值（文档 §2.5：不带斜杠）。 */
const REQUEST_VIRTUAL_PAYMENT_URI = 'requestVirtualPayment';

/** `/xpay/query_order` 响应里 `order.status` 中代表「钱已经收到」的值。 */
const PAID_STATUS = new Set([
  2, // 订单已经支付，待发货
  3, // 订单发货中
  4, // 订单已发货
]);

/**
 * `/xpay/query_order` 的响应形状（只写本文件真正读的字段，其余照文档还有
 * create_time / refund_fee / sett_state 等，用不到就不摊在类型里）。
 */
interface XpayQueryOrderResponse {
  order?: {
    status?: number;
    /** 订单金额，单位分 */
    order_fee?: number;
    /** 用户支付金额，单位分 */
    paid_fee?: number;
    /** 微信内部单号 */
    wx_order_id?: string;
    /** 微信支付交易单号（用户支付详情页上的那个） */
    wxpay_order_id?: string;
  };
}

/** 0 现网 / 1 沙箱。文档里 signData.env 与 query_order.env 用的是同一套取值。 */
export function wxvpEnv(): 0 | 1 {
  return process.env.WXVP_ENV === 'sandbox' ? 1 : 0;
}

/** 现网 / 沙箱各一把 AppKey，跟着 env 走（文档 §2.5 明写「env=0 对应现网 AppKey」）。 */
function appKey(): string {
  const key = wxvpEnv() === 1 ? process.env.WXVP_APP_KEY_SANDBOX : process.env.WXVP_APP_KEY;
  return key || '';
}

function offerId(): string {
  return process.env.WXVP_OFFER_ID || '';
}

function hmacSha256Hex(key: string, message: string): string {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

/**
 * 支付签名：`hex(hmac_sha256(appKey, uri + '&' + signData))`。
 *
 * uri 对 `wx.requestVirtualPayment` 固定为 `requestVirtualPayment`，
 * 对服务器 API 是不带 query string 的路径（如 `/xpay/query_order`）。
 */
export function calcPaySig(uri: string, postBody: string, key: string): string {
  return hmacSha256Hex(key, `${uri}&${postBody}`);
}

/** 用户态签名：`hex(hmac_sha256(sessionKey, signData))`。session_key 按 utf-8 原文当 key，不做 base64 解码。 */
export function calcUserSignature(postBody: string, sessionKey: string): string {
  return hmacSha256Hex(sessionKey, postBody);
}

/**
 * 调一次 /xpay 服务器 API。
 *
 * **签名算的是即将发出去的那个 body 字符串本身**（文档反复强调「参与签名的
 * post_body 和真正发起 http 请求的一致」），所以这里只序列化一次，签名和请求
 * 体用的是同一个 `postBody` 变量——不许在别处再 `JSON.stringify` 一遍。
 */
async function xpayPost<T>(uri: string, body: Record<string, unknown>): Promise<T> {
  const postBody = JSON.stringify(body);
  const paySig = calcPaySig(uri, postBody, appKey());

  const call = async (token: string) => {
    const query = new URLSearchParams({ access_token: token, pay_sig: paySig });
    const res = await fetch(`${WX_API}${uri}?${query.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: postBody,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new WxError(-1, `HTTP ${res.status}`);
    const data = (await res.json()) as { errcode?: number; errmsg?: string };
    if (typeof data?.errcode === 'number' && data.errcode !== 0) {
      throw new WxError(data.errcode, String(data.errmsg || ''));
    }
    return data as T;
  };

  try {
    return await call(await wxAccessToken());
  } catch (e) {
    if (e instanceof WxError && WX_TOKEN_ERRCODES.has(e.errcode)) {
      return call(await wxAccessToken(true));
    }
    throw e;
  }
}

export const wxvpAdapter: PaymentChannelAdapter = {
  id: 'wxvp',
  currency: 'CNY',

  isConfigured() {
    // 按调用读，不在模块加载时快照（与 wxpay-adapter 同口径）。
    // `wxMiniConfigured()` 同时管着两件事：站点是大陆站、AppSecret 已配
    // ——jscode2session 与 stable_token 都要它，缺一条这条通道就不成立。
    return wxMiniConfigured() && Boolean(appKey() && offerId());
  },

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    // 这两条本该被路由层挡在门外（`product_mismatch` / `wx_code_required`），
    // 落到这里说明有新的调用点漏了校验——直接抛，不要拿空串去签一个废签名。
    if (!input.productId) throw new Error('wxvp 建单缺 productId');
    if (!input.wxCode) throw new Error('wxvp 建单缺 wxCode');

    const session = await wxCode2Session(input.wxCode);

    // 字段名与顺序照 `wx.requestVirtualPayment` 的 signData 文档。
    // buyQuantity 恒为 1、goodsPrice 即整单金额：一档一次买一件，
    // 微信侧会拿 goodsPrice 与现网道具价对账（不符回 -15013）。
    // 键按字典序排列：微信米大师验签侧会按 key 字典序重组 signData 再算签名（yansongda/pay
    // 与多篇接入实录一致），乱序的 signData 在真机上报 -15013 / -15006（dev-board#427）。
    // attach 是发货推送里原样透传回来的字段。放单号：推送到达时它就是
    // 「这条推送说的是哪张单」的第二份证据（第一份是 OutTradeNo）。
    const signData = JSON.stringify({
      attach: input.outTradeNo,
      buyQuantity: 1,
      currencyType: 'CNY',
      env: wxvpEnv(),
      goodsPrice: input.amountMinor,
      offerId: offerId(),
      outTradeNo: input.outTradeNo,
      productId: input.productId,
    });
    // signData 本身不含密钥；原样记日志，真机报 -15013/-15006 时能直接对照我们到底传了什么（dev-board#427）
    console.log(`[wxvp] createCharge ${input.outTradeNo} signData=${signData}`);

    return {
      channel: 'wxvp',
      present: 'virtual',
      signData,
      paySig: calcPaySig(REQUEST_VIRTUAL_PAYMENT_URI, signData, appKey()),
      signature: calcUserSignature(signData, session.sessionKey),
      providerRef: session.openid,
    };
  },

  async parseWebhook(): Promise<ChannelSettlement | null> {
    // 虚拟支付没有「带签名的回调报文」这种东西：消息推送验的是 URL 上的
    // token/timestamp/nonce（`app/api/wx-mini/push`），推送体本身不可信，
    // 里面的金额一律要用 query_order 复核。所以这条路上不该有人来调它。
    throw new WebhookVerificationError(
      'wxvp 不走 parseWebhook：消息推送由 /api/wx-mini/push 验签并回查复核'
    );
  },

  async queryCharge(outTradeNo: string): Promise<ChannelSettlement | null> {
    // openid 认订单上记的那个（建单时由 jscode2session 落下），不认调用方传的：
    // 拿别人的 openid 去查这张单，微信要么查不到、要么查到的不是这笔钱。
    const order = getOrder(outTradeNo);
    const openid = order?.providerRef;
    if (!openid) return null;

    const data = await xpayPost<XpayQueryOrderResponse>('/xpay/query_order', {
      openid,
      env: wxvpEnv(),
      order_id: outTradeNo,
    });

    const wxOrder = data?.order;
    if (!wxOrder) return null;

    // paid_fee 是「用户实付」，order_fee 是「下单金额」。本站建单不带
    // activitySellingPrice（没有优惠券），两者应当相等；取实付为准，
    // 缺失时退回下单金额——真不相等时 settleFromChannel 会拒绝结算。
    const paidFee = typeof wxOrder.paid_fee === 'number' && wxOrder.paid_fee > 0
      ? wxOrder.paid_fee
      : Number(wxOrder.order_fee);

    return {
      channel: 'wxvp',
      outTradeNo,
      paid: PAID_STATUS.has(Number(wxOrder.status)),
      amountMinor: paidFee,
      currency: 'CNY',
      transactionId: wxOrder.wxpay_order_id || wxOrder.wx_order_id || undefined,
      payerRef: openid,
    };
  },
};
