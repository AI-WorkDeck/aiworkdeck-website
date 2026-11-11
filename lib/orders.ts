import crypto from 'crypto';
import { getDb, withTransaction } from './db';
import { siteConfig } from './site-config';

/**
 * 订单存取（PR-W0 起走 SQLite，见 lib/db.ts）。
 * 对外字段名保持 amount（单位分），数据库列为 amountCents。
 * amount 一律是 `currency` 这个币种的最小单位（CNY 分 / USD cent）。
 */

export type OrderKind = 'recharge' | 'purchase' | 'support' | 'subscription';

/**
 * 充值/购买单笔上限（本站币种的最小单位）。本地兜底，微信/Stripe 侧另有各自限额。
 *
 * 放在这里而不是某条路由里：现在有两个建单入口（网页/桌面的
 * `app/api/payment/create`、手机端的 `app/api/internal/account`），
 * 上限是钱的口径，两处各写一个常量迟早会漂成两个数。
 */
export const ORDER_MAX_CENTS = 1000000; // 10000 元 / $10000

export type OrderStatus = 'pending' | 'paid' | 'closed' | 'expired';

export interface Order {
  id: string;
  outTradeNo: string;
  userId?: string | null;
  kind: OrderKind;
  skuId?: string | null;
  description: string;
  amount: number; // currency 的最小单位
  status: OrderStatus;
  /** 结算通道。回调 / 回查一律按订单上记的这个值取 adapter，不按请求来源猜。 */
  channel: string;
  /** ISO 4217。结算时必须比对，见 lib/payments/settle.ts。 */
  currency: string;
  /** 通道侧单据引用（Stripe Checkout Session id）；微信 Native 无此概念。 */
  providerRef?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  paidAt?: string;
  transactionId?: string;
  payerOpenid?: string;
  /** 通道侧退款时间（Apple 的 REFUND / REVOKE 通知）。非空 = 这笔钱已被退。 */
  refundedAt?: string;
  /** 通道侧对账字段（Apple 实收 price/currency/storefront 等）的 JSON 原文。 */
  providerMeta?: string;
}

interface OrderRow {
  id: string;
  outTradeNo: string;
  userId: string | null;
  kind: OrderKind;
  skuId: string | null;
  description: string;
  amountCents: number;
  status: OrderStatus;
  channel: string;
  currency: string;
  providerRef: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  paidAt: string | null;
  transactionId: string | null;
  payerOpenid: string | null;
  refundedAt: string | null;
  providerMeta: string | null;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    outTradeNo: row.outTradeNo,
    userId: row.userId,
    kind: row.kind,
    skuId: row.skuId,
    description: row.description,
    amount: row.amountCents,
    status: row.status,
    channel: row.channel,
    currency: row.currency,
    providerRef: row.providerRef,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    paidAt: row.paidAt ?? undefined,
    transactionId: row.transactionId ?? undefined,
    payerOpenid: row.payerOpenid ?? undefined,
    refundedAt: row.refundedAt ?? undefined,
    providerMeta: row.providerMeta ?? undefined,
  };
}

export interface CreateOrderInput {
  id: string;
  outTradeNo: string;
  description: string;
  amount: number; // currency 的最小单位，正整数
  status: OrderStatus;
  userId?: string | null;
  kind?: OrderKind;
  skuId?: string | null;
  /**
   * 缺省取本站配置：Credits 直付的订单（lib/purchases.ts）没有外部通道，
   * 记本站通道与本站币种即可；走外部通道的订单由建单路由显式传。
   */
  channel?: string;
  currency?: string;
  providerRef?: string | null;
  idempotencyKey?: string | null;
}

export function createOrder(order: CreateOrderInput): Order {
  const db = getDb();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO orders
       (id, outTradeNo, userId, kind, skuId, description, amountCents, status,
        channel, currency, providerRef, idempotencyKey, createdAt)
     VALUES
       (@id, @outTradeNo, @userId, @kind, @skuId, @description, @amountCents, @status,
        @channel, @currency, @providerRef, @idempotencyKey, @createdAt)`
  ).run({
    id: order.id,
    outTradeNo: order.outTradeNo,
    userId: order.userId ?? null,
    kind: order.kind ?? 'support',
    skuId: order.skuId ?? null,
    description: order.description,
    amountCents: order.amount,
    status: order.status,
    channel: order.channel ?? siteConfig.paymentChannel,
    currency: order.currency ?? siteConfig.currency,
    providerRef: order.providerRef ?? null,
    idempotencyKey: order.idempotencyKey ?? null,
    createdAt,
  });
  return getOrder(order.outTradeNo)!;
}

export function getOrder(outTradeNo: string): Order | undefined {
  const row = getDb()
    .prepare('SELECT * FROM orders WHERE outTradeNo = ?')
    .get(outTradeNo) as OrderRow | undefined;
  return row ? rowToOrder(row) : undefined;
}

/** 按幂等键查同一用户的既有订单（匿名订单 userId 为 NULL，不参与幂等去重）。 */
export function findOrderByIdempotencyKey(userId: string | null, idempotencyKey: string): Order | undefined {
  if (!idempotencyKey) return undefined;
  const db = getDb();
  const row = (
    userId === null
      ? db
          .prepare('SELECT * FROM orders WHERE userId IS NULL AND idempotencyKey = ? ORDER BY createdAt LIMIT 1')
          .get(idempotencyKey)
      : db
          .prepare('SELECT * FROM orders WHERE userId = ? AND idempotencyKey = ?')
          .get(userId, idempotencyKey)
  ) as OrderRow | undefined;
  return row ? rowToOrder(row) : undefined;
}

/**
 * 按通道 + 通道侧引用反查订单（Apple 内购用 `appAccountToken`）。
 *
 * **必须带 channel**：`providerRef` 这一列三条通道共用（微信 openid / Stripe
 * Session id / Apple appAccountToken），一个 openid 名下会有很多张单，
 * 不带 channel 查等于随机挑一张。内购这条通道的 providerRef 是每单一个的 UUID，
 * 所以在 channel 限定下它是唯一的。
 */
export function findOrderByProviderRef(channel: string, providerRef: string): Order | undefined {
  if (!providerRef) return undefined;
  const row = getDb()
    .prepare('SELECT * FROM orders WHERE channel = ? AND providerRef = ? ORDER BY createdAt LIMIT 1')
    .get(channel, providerRef) as OrderRow | undefined;
  return row ? rowToOrder(row) : undefined;
}

/** 按通道 + 通道侧交易号反查订单（退款通知按 transactionId 找单）。 */
export function findOrderByTransactionId(channel: string, transactionId: string): Order | undefined {
  if (!transactionId) return undefined;
  const row = getDb()
    .prepare('SELECT * FROM orders WHERE channel = ? AND transactionId = ?')
    .get(channel, transactionId) as OrderRow | undefined;
  return row ? rowToOrder(row) : undefined;
}

/**
 * 记下「这笔钱被通道退掉了」。**不改 status**：订单确实付过、也确实发过 Credits，
 * 把它改回 pending 会让重放的确认请求再发一次币。追回 Credits 是另一件事
 * （lib/wallet.ts 的 `clawbackOrderCredits`），这里只落时间戳。
 * 已经记过的不再覆盖——苹果会重推同一条通知。
 */
export function markOrderRefunded(outTradeNo: string, refundedAt: string): Order | undefined {
  const db = getDb();
  db.prepare(
    'UPDATE orders SET refundedAt = @refundedAt WHERE outTradeNo = @outTradeNo AND refundedAt IS NULL'
  ).run({ outTradeNo, refundedAt });
  return getOrder(outTradeNo);
}

/** 兼容旧签名的部分更新。不允许改 status——金钱状态迁移只能走 markOrderPaid（事务 + 幂等）。 */
export function updateOrder(
  outTradeNo: string,
  updates: Partial<
    Pick<
      Order,
      'paidAt' | 'transactionId' | 'payerOpenid' | 'description' | 'providerRef' | 'providerMeta'
    >
  >
): Order | undefined {
  const existing = getOrder(outTradeNo);
  if (!existing) return undefined;
  getDb()
    .prepare(
      `UPDATE orders SET
         paidAt = @paidAt,
         transactionId = @transactionId,
         payerOpenid = @payerOpenid,
         description = @description,
         providerRef = @providerRef,
         providerMeta = @providerMeta
       WHERE outTradeNo = @outTradeNo`
    )
    .run({
      outTradeNo,
      paidAt: updates.paidAt ?? existing.paidAt ?? null,
      transactionId: updates.transactionId ?? existing.transactionId ?? null,
      payerOpenid: updates.payerOpenid ?? existing.payerOpenid ?? null,
      description: updates.description ?? existing.description,
      providerRef: updates.providerRef ?? existing.providerRef ?? null,
      providerMeta: updates.providerMeta ?? existing.providerMeta ?? null,
    });
  return getOrder(outTradeNo);
}

export interface MarkPaidResult {
  order: Order;
  /** true 表示本次调用前订单已是 paid（重复回调），未做任何写入。 */
  alreadyPaid: boolean;
}

/**
 * 订单置 paid：在事务里完成、幂等。
 * 只允许 pending -> paid；已 paid 直接返回 alreadyPaid=true（防重复入账）。
 * 后续 PR 的入账本 / 发权益必须挂进同一个事务。
 */
export function markOrderPaid(
  outTradeNo: string,
  info: { transactionId?: string; payerOpenid?: string; paidAt?: string; providerRef?: string }
): MarkPaidResult | undefined {
  return withTransaction((db) => {
    const row = db
      .prepare('SELECT * FROM orders WHERE outTradeNo = ?')
      .get(outTradeNo) as OrderRow | undefined;
    if (!row) return undefined;
    if (row.status === 'paid') {
      return { order: rowToOrder(row), alreadyPaid: true };
    }
    db.prepare(
      // providerRef 用 COALESCE 而非直接覆盖：Stripe 单在建单时就把 Session id
      // 落库了，结算方若没带这个字段，不能把已有的引用抹成 NULL
      `UPDATE orders SET
         status = 'paid',
         paidAt = @paidAt,
         transactionId = @transactionId,
         payerOpenid = @payerOpenid,
         providerRef = COALESCE(@providerRef, providerRef)
       WHERE outTradeNo = @outTradeNo AND status != 'paid'`
    ).run({
      outTradeNo,
      paidAt: info.paidAt ?? new Date().toISOString(),
      transactionId: info.transactionId ?? null,
      payerOpenid: info.payerOpenid ?? null,
      providerRef: info.providerRef ?? null,
    });
    const updated = db
      .prepare('SELECT * FROM orders WHERE outTradeNo = ?')
      .get(outTradeNo) as OrderRow;
    return { order: rowToOrder(updated), alreadyPaid: false };
  });
}

export function generateOrderNo(prefix: string = 'SUPPORT'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${timestamp}${random}`;
}
