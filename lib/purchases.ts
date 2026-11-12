import { PRO_INCLUDED_FEATURES } from './subscription';
import type Database from 'better-sqlite3';
import { getDb, withTransaction } from './db';
import { getSkill } from './skills-store';
import { localizeSkill } from './skill-en';
import { getPlugin } from './plugins-store';
import { getFeatureProduct } from './products';
import { findUserById } from './users';
// 直接依赖 credits 而不是 wallet：wallet 会 import 本模块的 fulfillPurchase，绕道即成环
import { grantCredits, spendCredits, getBalance, InsufficientCreditsError } from './credits';
import { createOrder } from './orders';
import { randomUUID } from 'crypto';
import type { Order } from './orders';
import { bqtProRightsUntil } from './bqt-member';

/**
 * 购买闭环（PR-W3）：SKU 解析、履约（purchases + entitlements + creator_earnings）、
 * 权益查询与创作者收益结算。
 *
 * SKU 语义：
 * - skill:<id>    → entitlement feature = "skill:<id>"，创作者 70 / 平台 30
 * - plugin:<id>   → entitlement feature = "plugin:<id>"，创作者 70 / 平台 30
 * - feature:<key> → entitlement feature = "<key>"（如 clipboard.unlimited），平台 100
 *
 * 买方有两条路，履约共用 fulfillPurchase 所以口径不会分叉：
 * - 微信扫码直付（settleOrderPaid → fulfillPurchase），不动买方 Credits；
 * - 用 Credits 买（purchaseWithCredits，P4），扣减与履约同一事务。
 * 创作者分成（Credits 重构 P2 起）在履约的同一事务里直接发成 **reward 批次的 Credits**，
 * 即时结算、不再人工打款——这是「自动分成」能成立的关键：分钱必须人工（代付通道、
 * 反洗钱、个税代扣），分 Credits 可以在支付回调里一并写完。
 * creator_earnings 保留为收益明细与对账依据。
 */

export type SkuItemType = 'skill' | 'plugin' | 'feature';

export interface ParsedSku {
  itemType: SkuItemType;
  itemId: string;
  /** entitlements.feature 的取值 */
  feature: string;
}

export interface ResolvedSku extends ParsedSku {
  skuId: string;
  itemName: string;
  itemNameEn: string;
  /** 当前标价（分） */
  priceCents: number;
  creatorUserId: string | null;
}

/** 结构解析，不查存在性。非法格式返回 null。 */
export function parseSkuId(skuId: string): ParsedSku | null {
  if (typeof skuId !== 'string' || skuId.length > 128) return null;
  const sep = skuId.indexOf(':');
  if (sep <= 0 || sep === skuId.length - 1) return null;
  const kind = skuId.slice(0, sep);
  const rest = skuId.slice(sep + 1);
  if (kind === 'skill') return { itemType: 'skill', itemId: rest, feature: `skill:${rest}` };
  if (kind === 'plugin') return { itemType: 'plugin', itemId: rest, feature: `plugin:${rest}` };
  if (kind === 'feature') return { itemType: 'feature', itemId: rest, feature: rest };
  return null;
}

/** 解析并核对存在性与当前标价。不可购买（不存在/免费）返回 null 之外的信息由调用方判断。 */
export function resolveSku(skuId: string): ResolvedSku | null {
  const parsed = parseSkuId(skuId);
  if (!parsed) return null;
  if (parsed.itemType === 'skill') {
    const skill = getSkill(parsed.itemId);
    if (!skill) return null;
    return {
      ...parsed,
      skuId,
      itemName: skill.name,
      itemNameEn: localizeSkill(skill, 'en').name,
      priceCents: skill.priceCents ?? 0,
      creatorUserId: skill.authorId,
    };
  }
  if (parsed.itemType === 'plugin') {
    const plugin = getPlugin(parsed.itemId);
    if (!plugin || plugin.status !== 'approved') return null;
    return {
      ...parsed,
      skuId,
      itemName: plugin.name,
      itemNameEn: plugin.name,
      priceCents: plugin.priceCents ?? 0,
      creatorUserId: plugin.authorId,
    };
  }
  const product = getFeatureProduct(parsed.itemId);
  if (!product) return null;
  return {
    ...parsed,
    skuId,
    itemName: product.name,
    itemNameEn: product.nameEn,
    priceCents: product.priceCents,
    creatorUserId: null,
  };
}

export type PurchaseValidationError =
  | 'invalid_sku'
  | 'not_purchasable'
  | 'amount_mismatch'
  | 'already_owned';

/**
 * 下单前校验（payment/create 的 purchase 分支走这里）：
 * SKU 存在、priceCents > 0、金额等于当前标价、未重复购买。
 */
export function validatePurchaseSku(
  userId: string,
  skuId: unknown,
  amountCents: number
): { sku: ResolvedSku } | { error: PurchaseValidationError } {
  const sku = typeof skuId === 'string' ? resolveSku(skuId) : null;
  if (!sku) return { error: 'invalid_sku' };
  if (sku.priceCents <= 0) return { error: 'not_purchasable' };
  if (amountCents !== sku.priceCents) return { error: 'amount_mismatch' };
  if (hasEntitlement(userId, sku.feature)) return { error: 'already_owned' };
  return { sku };
}

/**
 * 七三分成：创作者 70% 向下取整（分），余数归平台，两者之和恒等于总价。
 * 全程整数运算，无浮点误差。feature 类无创作者 → 平台 100%。
 */
export function computeSplit(
  amountCents: number,
  hasCreator: boolean
): { creatorShareCents: number; platformShareCents: number } {
  if (!hasCreator) return { creatorShareCents: 0, platformShareCents: amountCents };
  const creatorShareCents = Math.floor((amountCents * 7) / 10);
  return { creatorShareCents, platformShareCents: amountCents - creatorShareCents };
}

export function hasEntitlement(userId: string, feature: string): boolean {
  return listEntitlements(userId).some(e => e.feature === feature);
}

export interface EntitlementRow {
  feature: string;
  orderId: string;
  createdAt: string;
  /** NULL = 永久；Pro 等限时权益为到期时间（ISO 8601 UTC） */
  expiresAt: string | null;
}

export function listEntitlements(userId: string): EntitlementRow[] {
  const rows = getDb()
    .prepare(
      `SELECT feature, orderId, createdAt, expiresAt FROM entitlements
        WHERE userId = ? AND (expiresAt IS NULL OR expiresAt > ?) ORDER BY id DESC`
    )
    .all(userId, new Date().toISOString()) as EntitlementRow[];
  const apple = rows.find(e => e.feature === 'pro.appstore');
  let pro = rows.find(e => e.feature === 'pro');
  if (apple) {
    if (!pro) { pro = { ...apple, feature: 'pro' }; rows.push(pro); }
    else if (pro.expiresAt !== null && apple.expiresAt! > pro.expiresAt) pro.expiresAt = apple.expiresAt;
  }
  // 包晴天有效会员（ACTIVE + aiWorkbench）在会员到期前享有同一套 Pro 权益（读快照）。
  const bqtUntil = bqtProRightsUntil(userId);
  if (bqtUntil) {
    if (!pro) {
      const bound = getDb().prepare('SELECT boundAt FROM bqt_user_binding WHERE userId = ?').get(userId) as { boundAt: string } | undefined;
      pro = { feature: 'pro', orderId: 'bqt-member', createdAt: bound?.boundAt ?? bqtUntil, expiresAt: bqtUntil };
      rows.push(pro);
    } else if (pro.expiresAt !== null && bqtUntil > pro.expiresAt) pro.expiresAt = bqtUntil;
  }
  if (pro) for (const feature of PRO_INCLUDED_FEATURES) {
    const existing = rows.find(e => e.feature === feature);
    if (!existing) rows.push({ ...pro, feature });
    else if (existing.expiresAt !== null && (pro.expiresAt === null || pro.expiresAt > existing.expiresAt)) {
      existing.expiresAt = pro.expiresAt;
    }
  }
  return rows;
}

/**
 * 履约：paid 确认后在**同一事务**里写 purchases + entitlements + creator_earnings。
 * 必须由 settleOrderPaid 的事务内调用（与 markOrderPaid 四写一体）。
 * skuId 解析失败直接抛错 → 整个事务回滚、订单保持 pending，等待人工介入，
 * 绝不出现「钱收了权益没发」的静默半残。
 */
export function fulfillPurchase(db: Database.Database, order: Order): void {
  if (!db.inTransaction) {
    throw new Error('fulfillPurchase 必须在事务内调用（withTransaction 包裹）');
  }
  if (!order.userId) throw new Error(`purchase 订单缺少 userId: ${order.outTradeNo}`);
  const parsed = order.skuId ? parseSkuId(order.skuId) : null;
  if (!parsed) throw new Error(`purchase 订单 skuId 无法解析: ${order.outTradeNo} ${order.skuId}`);

  // 创作者按履约时点解析（条目可能已被下架/删除，此时分成无从谈起，全额归平台）
  let creatorUserId: string | null = null;
  if (parsed.itemType === 'skill') creatorUserId = getSkill(parsed.itemId)?.authorId ?? null;
  else if (parsed.itemType === 'plugin') creatorUserId = getPlugin(parsed.itemId)?.authorId ?? null;

  // 并发重复购买守卫（PR-W3 审查修复）：already_owned 只在下单时校验，
  // 同一 SKU 可能同时挂多个 pending 订单且都被支付。权益已存在时这笔是重复付款：
  // purchases 行保留（钱已收，待人工退款），创作者不重复拿分成，全额暂记平台并写 audit 提醒。
  const duplicate = !!db
    .prepare('SELECT 1 AS x FROM entitlements WHERE userId = ? AND feature = ? LIMIT 1')
    .get(order.userId, parsed.feature);

  const { creatorShareCents, platformShareCents } = duplicate
    ? { creatorShareCents: 0, platformShareCents: order.amount }
    : computeSplit(order.amount, !!creatorUserId);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO purchases
         (userId, itemType, itemId, orderId, priceCents, creatorUserId, creatorShareCents, platformShareCents, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      order.userId,
      parsed.itemType,
      parsed.itemId,
      order.id,
      order.amount,
      creatorUserId,
      creatorShareCents,
      platformShareCents,
      now
    );

  // UNIQUE(userId, feature) + OR IGNORE：即便上游幂等失守也不会重复发权益
  db.prepare(
    'INSERT OR IGNORE INTO entitlements (userId, feature, orderId, createdAt) VALUES (?, ?, ?, ?)'
  ).run(order.userId, parsed.feature, order.id, now);

  if (!duplicate && creatorUserId && creatorShareCents > 0) {
    // Credits 重构 P2：分成即时入账，不再挂「待人工打款」。
    // 这正是「自动分成」得以成立的地方——分钱必须人工（代付通道、反洗钱、个税代扣），
    // 分 Credits 可以在支付回调这同一个事务里一并写完，零人工介入。
    // creator_earnings 保留为收益明细与对账依据，settledAt 落在与入账相同的时点。
    const entry = grantCredits(db, {
      userId: creatorUserId,
      pool: 'reward',
      amountCents: creatorShareCents,
      ledgerKind: 'earning',
      refOrderId: order.id,
      meta: {
        itemType: parsed.itemType,
        itemId: parsed.itemId,
        priceCents: order.amount,
        sharePercent: 70,
      },
      nowIso: now,
    });
    db.prepare(
      `INSERT INTO creator_earnings (creatorUserId, purchaseId, amountCents, settledAt, settleNote)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      creatorUserId,
      result.lastInsertRowid,
      creatorShareCents,
      now,
      `auto:credits#${entry.id}`
    );
  }

  if (duplicate) {
    db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
      now,
      'duplicate_purchase',
      JSON.stringify({
        outTradeNo: order.outTradeNo,
        userId: order.userId,
        skuId: order.skuId,
        amountCents: order.amount,
        purchaseId: Number(result.lastInsertRowid),
      })
    );
  }
}

export interface PurchaseRecord {
  id: number;
  userId: string;
  itemType: SkuItemType;
  itemId: string;
  orderId: string;
  priceCents: number;
  creatorUserId: string | null;
  creatorShareCents: number | null;
  platformShareCents: number | null;
  createdAt: string;
}

/** 某用户的已购列表，新的在前。 */
export function listUserPurchases(userId: string): PurchaseRecord[] {
  return getDb()
    .prepare('SELECT * FROM purchases WHERE userId = ? ORDER BY id DESC')
    .all(userId) as PurchaseRecord[];
}

/** admin：近 N 笔购买 */
export function listRecentPurchases(limit = 50): PurchaseRecord[] {
  return getDb()
    .prepare('SELECT * FROM purchases ORDER BY id DESC LIMIT ?')
    .all(Math.min(Math.max(limit, 1), 200)) as PurchaseRecord[];
}

export interface EarningsSummary {
  totalCents: number;
  pendingCents: number;
  settledCents: number;
}

/** 创作者收益汇总（账户页展示） */
export function earningsSummary(creatorUserId: string): EarningsSummary {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(amountCents), 0) AS total,
         COALESCE(SUM(CASE WHEN settledAt IS NULL THEN amountCents ELSE 0 END), 0) AS pending
       FROM creator_earnings WHERE creatorUserId = ?`
    )
    .get(creatorUserId) as { total: number; pending: number };
  return { totalCents: row.total, pendingCents: row.pending, settledCents: row.total - row.pending };
}

export interface CreatorEarningsAggregate {
  creatorUserId: string;
  username: string;
  displayName: string;
  pendingCents: number;
  pendingCount: number;
  settledCents: number;
}

/** admin：按创作者聚合收益（有记录的才出现），待结算多的在前。 */
export function earningsByCreator(): CreatorEarningsAggregate[] {
  const rows = getDb()
    .prepare(
      `SELECT
         creatorUserId,
         COALESCE(SUM(CASE WHEN settledAt IS NULL THEN amountCents ELSE 0 END), 0) AS pendingCents,
         COALESCE(SUM(CASE WHEN settledAt IS NULL THEN 1 ELSE 0 END), 0) AS pendingCount,
         COALESCE(SUM(CASE WHEN settledAt IS NOT NULL THEN amountCents ELSE 0 END), 0) AS settledCents
       FROM creator_earnings GROUP BY creatorUserId
       ORDER BY pendingCents DESC, creatorUserId`
    )
    .all() as Array<{ creatorUserId: string; pendingCents: number; pendingCount: number; settledCents: number }>;
  return rows.map(r => {
    const user = findUserById(r.creatorUserId);
    return {
      ...r,
      username: user?.username ?? 'unknown',
      displayName: user?.displayName ?? r.creatorUserId,
    };
  });
}

/**
 * admin：把某创作者全部未结算收益标记为已结算（人工转账后操作）。
 * settleNote 记录转账凭证说明；同一事务写 admin_audit 留痕。
 */
/**
 * 补结算：把历史上遗留的未结算收益一次性补成 Credits。
 *
 * Credits 重构 P2 起，分成在履约事务里就已入账并标记 settledAt，正常情况下不会再有
 * 待结算行。本函数只服务两种残留：P2 之前挂着的历史行、以及人工修数据造成的
 * settledAt 为空。它**不再是「人工打款后回来标记」**——真正的钱早已不出金，
 * 标记与入账必须同时发生，否则会出现「标了已结算但创作者没拿到 Credits」。
 */
export function settleCreatorEarnings(
  creatorUserId: string,
  settleNote: string
): { settledCount: number; settledCents: number } {
  return withTransaction(db => {
    const pending = db
      .prepare(
        'SELECT COUNT(*) AS c, COALESCE(SUM(amountCents), 0) AS s FROM creator_earnings WHERE creatorUserId = ? AND settledAt IS NULL'
      )
      .get(creatorUserId) as { c: number; s: number };
    if (pending.c === 0) return { settledCount: 0, settledCents: 0 };
    const now = new Date().toISOString();

    // 先入账再标记：同一事务内顺序不影响原子性，但把「钱到位」放在前面，
    // 读代码的人一眼看到标记不是空头支票。
    const entry = grantCredits(db, {
      userId: creatorUserId,
      pool: 'reward',
      amountCents: pending.s,
      ledgerKind: 'earning',
      meta: { backfill: true, settleNote, count: pending.c },
      nowIso: now,
    });
    db.prepare(
      'UPDATE creator_earnings SET settledAt = ?, settleNote = ? WHERE creatorUserId = ? AND settledAt IS NULL'
    ).run(now, `${settleNote} · credits#${entry.id}`, creatorUserId);
    db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
      now,
      'settle_earnings',
      JSON.stringify({
        creatorUserId,
        settleNote,
        count: pending.c,
        amountCents: pending.s,
        creditsLedgerId: entry.id,
      })
    );
    return { settledCount: pending.c, settledCents: pending.s };
  });
}

// ---------------------------------------------------------------------------
// 用 Credits 直接购买（Credits 重构 P4）
// ---------------------------------------------------------------------------

export type CreditsPurchaseError =
  | 'invalid_sku'
  | 'not_purchasable'
  | 'already_owned'
  | 'insufficient_credits';

export interface CreditsPurchaseResult {
  ok: true;
  feature: string;
  priceCents: number;
  balanceCents: number;
  orderId: string;
}

/**
 * 用 Credits 买广场条目 / 功能解锁。扣减、发权益、给创作者分成在**同一事务**里完成。
 *
 * 与微信扫码直付的区别只在钱从哪来：那条路是「收到款 → 履约」，这条是「扣 Credits →
 * 履约」，履约本身共用 fulfillPurchase，所以七三分成、重复购买守卫、权益唯一约束
 * 全都自动一致，不会出现两条路径口径分叉。
 *
 * 价格一律服务端自查（resolveSku），绝不采信调用方传来的金额——让客户端报价就等于
 * 让客户端决定付费闸门什么时候生效。
 *
 * 幂等：orders.outTradeNo 唯一 + entitlements 的 UNIQUE(userId, feature) + 事务内
 * 复查 hasEntitlement。并发两笔只有一笔能建权益，另一笔在事务内被 already_owned 拦下
 * 并整体回滚（**Credits 不会被扣两次**——这与微信直付「钱已收待人工退款」的口径不同，
 * 因为这里钱还没离开我们的账本，回滚即可，不必留待退款）。
 */
export function purchaseWithCredits(
  userId: string,
  skuId: unknown
): CreditsPurchaseResult | { error: CreditsPurchaseError } {
  const sku = typeof skuId === 'string' ? resolveSku(skuId) : null;
  if (!sku) return { error: 'invalid_sku' };
  if (sku.priceCents <= 0) return { error: 'not_purchasable' };
  if (hasEntitlement(userId, sku.feature)) return { error: 'already_owned' };

  const outTradeNo = `CR-${randomUUID()}`;
  try {
    return withTransaction(db => {
      // 事务内复查：上面的守卫到这里之间可能被并发的另一笔抢先发了权益
      if (hasEntitlement(userId, sku.feature)) {
        throw new AlreadyOwnedError();
      }
      // 直接建成 paid：Credits 扣减即交付，没有「待支付」这个中间态
      const order = createOrder({
        id: outTradeNo,
        outTradeNo,
        userId,
        kind: 'purchase',
        skuId: typeof skuId === 'string' ? skuId : undefined,
        description: `Credits 购买 ${sku.itemName}`,
        amount: sku.priceCents,
        status: 'paid',
      });
      spendCredits(db, {
        userId,
        amountCents: sku.priceCents,
        ledgerKind: 'purchase',
        refOrderId: order.id,
        meta: { skuId, itemName: sku.itemName, paidWith: 'credits' },
      });
      fulfillPurchase(db, order);
      return {
        ok: true as const,
        feature: sku.feature,
        priceCents: sku.priceCents,
        balanceCents: getBalance(userId),
        orderId: order.id,
      };
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return { error: 'insufficient_credits' };
    if (e instanceof AlreadyOwnedError) return { error: 'already_owned' };
    throw e;
  }
}

class AlreadyOwnedError extends Error {}
