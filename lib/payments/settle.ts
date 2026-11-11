import {endPaymentReview} from '../postpaid';
import { getOrder } from '../orders';
import { settleOrderPaid } from '../wallet';
import { ChannelSettlement } from './types';

/**
 * 通道结算的唯一入口。三个调用点（微信 notify、微信 query、Stripe webhook）
 * **只许调 settleFromChannel，不许直接调 settleOrderPaid**。
 *
 * ## 为什么必须有这层，而不是各路由各写一遍
 *
 * settleOrderPaid 本身是通道无关的、正确的：它在 BEGIN IMMEDIATE 事务里
 * 置 paid、发 Credits、发权益，重复回调零写入返回。正因为它这么好用，
 * **新写一个 webhook 时最自然的写法就是直接调它** —— 拿到 outTradeNo 就结算。
 * 那一刻「金额必须与订单相符」这条不变式就在新通道上悄悄消失了：
 * 它从来不在 settleOrderPaid 里，而是靠 notify/query 两处各自手写的 if 撑着。
 * 抄漏一次没有任何征兆，直到有人用 1 美分的支付结掉一张 99 美元的订单。
 *
 * ## 为什么必须比 currency，而不是只比金额
 *
 * 金额一律以最小单位存取：USD $10.00 是 1000，¥10.00 也是 1000，**数值完全相等**。
 * 只比 amountMinor，一笔 10 美元的 Stripe 支付就能结算一张 10 元人民币的订单
 * （反向则是白拿 7 倍商品）。两站眼下是两份独立的库、币种是部署级常量，
 * 看似撞不上——但这条不变式不能寄托在部署拓扑上：合库、迁移、跨站对账脚本、
 * 或者哪天某站开第二种货币，任何一个都会让它成真，而错的那一刻没有任何报错。
 *
 * ## 为什么还要比 channel
 *
 * 订单建单时就记下了自己属于哪个通道。拿 Stripe 的结算去结一张微信订单
 * （或反过来）说明要么路由挂错了 adapter，要么有人在拿另一个通道的伪造报文试探。
 * 两种都不该结算，都该留给人工。
 */

export type SettleFailureReason =
  | 'not_found'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'channel_mismatch';

export type SettleResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; reason: SettleFailureReason };

/**
 * 校验 + 结算。**前置条件：调用方只在 `s.paid === true` 时调用**——
 * 本函数的语义是「通道说这笔收到钱了，把它落成 paid」，不承担判断收没收到钱。
 *
 * 返回 ok:false 时一分钱都没写，调用方按各自通道的重试语义决定 HTTP 状态码。
 */
export function settleFromChannel(s: ChannelSettlement): SettleResult {
  const order = getOrder(s.outTradeNo);
  if (!order) return { ok: false, reason: 'not_found' };

  if (order.channel !== s.channel) return { ok: false, reason: 'channel_mismatch' };
  if (order.currency !== s.currency) return { ok: false, reason: 'currency_mismatch' };
  if (s.amountMinor !== order.amount) return { ok: false, reason: 'amount_mismatch' };

  const result = settleOrderPaid(s.outTradeNo, {
    transactionId: s.transactionId,
    payerOpenid: s.payerRef,
  });
  // 上面刚 getOrder 到、这里却没有：并发把订单删了才可能，按未找到处理
  if (!result) return { ok: false, reason: 'not_found' };

  if(order.userId)endPaymentReview(order.userId,s.outTradeNo);
  return { ok: true, alreadyPaid: result.alreadyPaid };
}

/** 结算失败原因的日志文案（面向运维，不对外返回）。 */
export function describeSettleFailure(reason: SettleFailureReason): string {
  switch (reason) {
    case 'not_found':
      return '订单不存在';
    case 'amount_mismatch':
      return '通道金额与订单金额不符';
    case 'currency_mismatch':
      return '通道币种与订单币种不符';
    case 'channel_mismatch':
      return '通道与订单记录的通道不符';
  }
}
