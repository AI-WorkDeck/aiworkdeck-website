import type Database from 'better-sqlite3';
import { getDb } from './db';
import { acceptsPostpaid, postpaidAvailable, reconcileCreditCase, postpaidPolicy } from './postpaid';
import { captureServiceFunding, subscriptionFundingBudget, type ServiceFunding } from './subscription';

/**
 * Credits：站内唯一计价单位（doc/credits-redesign.md）。
 *
 * 用户只看到一个余额数字，内部按**批次（lot）**记账，两类属性不同：
 *
 * | 批次     | 来源                  | 有效期      | 可退现 |
 * |----------|-----------------------|-------------|--------|
 * | `topup`  | 微信充值              | 永不        | 可     |
 * | `reward` | 创作分成/赠送/兑换码  | 24 个月     | 否     |
 *
 * 为什么必须分批次：合成一个池子的话，创作者赚到的 reward 可以通过「退未消耗余额」
 * 变相提现，整套不出金的合规设计直接落空。分开存让「奖励不可提现」是数据层的事实，
 * 而不只是条款里的一句话。`topup` 不许带有效期这条由表级 CHECK 兜住——用户真金白银
 * 充进来的钱设有效期触碰预付卡红线，不能只靠调用方自觉。
 *
 * 记账口径：
 * - **余额的唯一权威是未过期批次的 remainingCents 之和**，不是账本最后一行。
 *   批次到期无需任何写操作，余额自动少掉——即使清理任务没跑，读到的数也是对的。
 * - `wallet_ledger` 退化为流水日志；其 balanceAfterCents 是写入当刻的余额快照，
 *   供展示与审计，不作为权威。
 * - 扣减按 **reward 优先 → topup 其次**，同类先到期者先扣：先烧掉会过期的负债。
 * - 扣减时把命中的批次明细写进流水行的 meta，退款据此**原批次原额**退回，
 *   否则一次失败的分配就能把 reward 洗成 topup（等于洗出提现资格）。
 */

export type CreditPool = 'topup' | 'reward';

export type LedgerKind =
    | 'recharge'
    | 'ai_alloc'
    | 'purchase'
    | 'earning'
    | 'adjust'
    | 'gift'
    | 'expire'
    // 平台服务网关的消费（语音转写/OCR/搜索/企业数据…）。
    // **刻意只有一个 kind，服务名进 meta.service**：kind 是开放枚举，但每加一个
    // 都要同步改 contract-check.mts 的 KINDS、desktop-contract.md 的表、词典的
    // accountPage.kinds 三处。服务会一直加下去，用 meta 区分才不会每接一家就动契约。
    | 'service_spend';

/** 奖励批次有效期：入账起 24 个月 */
export const REWARD_TTL_MONTHS = 24;

export interface LedgerEntry {
    id: number;
    userId: string;
    ts: string;
    kind: LedgerKind;
    amountCents: number;
    balanceAfterCents: number;
    refOrderId: string | null;
    meta: Record<string, unknown> | null;
}

interface LedgerRow {
    id: number;
    userId: string;
    ts: string;
    kind: LedgerKind;
    amountCents: number;
    balanceAfterCents: number;
    refOrderId: string | null;
    meta: string | null;
}

interface LotRow {
    id: number;
    userId: string;
    pool: CreditPool;
    originalCents: number;
    remainingCents: number;
    grantedAt: string;
    expiresAt: string | null;
    sourceKind: string;
}

/** 扣减时命中的批次明细，落在流水行 meta.lots 里，退款按此原样退回 */
export interface LotHit {
    lotId: number;
    cents: number;
}

export function rowToEntry(row: LedgerRow): LedgerEntry {
    let meta: Record<string, unknown> | null = null;
    if (row.meta) {
        try {
            meta = JSON.parse(row.meta);
        } catch {
            meta = null;
        }
    }
    return {
        id: row.id,
        userId: row.userId,
        ts: row.ts,
        kind: row.kind,
        amountCents: row.amountCents,
        balanceAfterCents: row.balanceAfterCents,
        refOrderId: row.refOrderId,
        meta,
    };
}

/** 入账起 +24 个月。用 UTC 月份加法，避免月末溢出（1/31 + 1 月 → 3/3 之类）。 */
export function rewardExpiryFrom(nowIso: string): string {
    const d = new Date(nowIso);
    const day = d.getUTCDate();
    const target = new Date(d.getTime());
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() + REWARD_TTL_MONTHS);
    // 目标月的天数不足时钳到月末（如 8/31 + 24 月 → 2028-08-31 正常；1/31 → 钳 2/29）
    const daysInTargetMonth = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
    ).getUTCDate();
    target.setUTCDate(Math.min(day, daysInTargetMonth));
    return target.toISOString();
}

function assertTx(db: Database.Database) {
    if (!db.inTransaction) {
        throw new Error('Credits 变更必须在事务内进行（用 withTransaction 包裹）');
    }
}

// ---------------------------------------------------------------------------
// 余额
// ---------------------------------------------------------------------------

function balanceOf(db: Database.Database, userId: string, nowIso: string): number {
    const row = db
        .prepare(
            `SELECT COALESCE(SUM(remainingCents), 0) AS total
               FROM credit_lots
              WHERE userId = ?
                AND remainingCents > 0
                AND (expiresAt IS NULL OR expiresAt > ?)`
        )
        .get(userId, nowIso) as { total: number };
    return row.total;
}

/** 当前可用 Credits（分）。已过期批次自动不计，无需依赖清理任务。 */
export function getBalance(userId: string, nowIso = new Date().toISOString()): number {
    return balanceOf(getDb(), userId, nowIso);
}

/** External-service budget only: subscription first; wallet requires explicit fallback while subscribed. */
export function getSpendableBalance(userId: string, nowIso = new Date().toISOString(), funding = captureServiceFunding(userId, nowIso)): number {
    if (acceptsPostpaid(userId,funding) && (postpaidPolicy(userId)?.frozen || getDb().prepare('SELECT 1 FROM postpaid_case WHERE userId=? AND resolvedAt IS NULL').get(userId))) return 0;
    return subscriptionFundingBudget(userId, funding) + (funding.walletAllowed ? getBalance(userId, nowIso) : 0) + postpaidAvailable(userId,funding,nowIso);
}

export interface BalanceBreakdown {
    totalCents: number;
    /** 充值而来：不过期、可退 */
    topupCents: number;
    /** 分成/赠送而来：有有效期、不可退 */
    rewardCents: number;
    /** 最近一笔将到期的奖励批次，没有则为 null */
    nextExpiry: { at: string; amountCents: number } | null;
}

export function getBalanceBreakdown(
    userId: string,
    nowIso = new Date().toISOString()
): BalanceBreakdown {
    const db = getDb();
    const rows = db
        .prepare(
            `SELECT pool, COALESCE(SUM(remainingCents), 0) AS total
               FROM credit_lots
              WHERE userId = ? AND remainingCents > 0
                AND (expiresAt IS NULL OR expiresAt > ?)
              GROUP BY pool`
        )
        .all(userId, nowIso) as { pool: CreditPool; total: number }[];

    const topupCents = rows.find(r => r.pool === 'topup')?.total ?? 0;
    const rewardCents = rows.find(r => r.pool === 'reward')?.total ?? 0;

    const next = db
        .prepare(
            `SELECT expiresAt AS at, SUM(remainingCents) AS amountCents
               FROM credit_lots
              WHERE userId = ? AND remainingCents > 0 AND expiresAt IS NOT NULL AND expiresAt > ?
              GROUP BY expiresAt
              ORDER BY expiresAt ASC
              LIMIT 1`
        )
        .get(userId, nowIso) as { at: string; amountCents: number } | undefined;

    return {
        totalCents: topupCents + rewardCents,
        topupCents,
        rewardCents,
        nextExpiry: next ?? null,
    };
}

// ---------------------------------------------------------------------------
// 流水
// ---------------------------------------------------------------------------

function writeLedger(
    db: Database.Database,
    input: {
        userId: string;
        kind: LedgerKind;
        amountCents: number;
        nowIso: string;
        refOrderId?: string | null;
        meta?: Record<string, unknown> | null;
    }
): LedgerEntry {
    const balanceAfter = balanceOf(db, input.userId, input.nowIso);
    const result = db
        .prepare(
            `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta)
             VALUES (@userId, @ts, @kind, @amountCents, @balanceAfterCents, @refOrderId, @meta)`
        )
        .run({
            userId: input.userId,
            ts: input.nowIso,
            kind: input.kind,
            amountCents: input.amountCents,
            balanceAfterCents: balanceAfter,
            refOrderId: input.refOrderId ?? null,
            meta: input.meta ? JSON.stringify(input.meta) : null,
        });
    const row = db
        .prepare('SELECT * FROM wallet_ledger WHERE id = ?')
        .get(result.lastInsertRowid) as LedgerRow;
    return rowToEntry(row);
}

// ---------------------------------------------------------------------------
// 入账
// ---------------------------------------------------------------------------

export interface GrantInput {
    userId: string;
    pool: CreditPool;
    /** 正数（分） */
    amountCents: number;
    /** 流水展示用的类别 */
    ledgerKind: LedgerKind;
    /**
     * credit_lots.sourceKind（批次来源标注，自由文本），缺省沿用 ledgerKind。
     * 会员充值赠送复用 ledgerKind='gift'（不扩 kind 枚举），靠这里的
     * 'membership_bonus' 与兑换码赠送区分来源。
     */
    sourceKind?: string;
    refOrderId?: string | null;
    meta?: Record<string, unknown> | null;
    nowIso?: string;
    expiresAt?: string | null;
}

/** 发放 Credits：建一个批次 + 记一行流水。必须在事务内调用。 */
export function grantCredits(db: Database.Database, input: GrantInput): LedgerEntry {
    assertTx(db);
    const { userId, pool, amountCents, ledgerKind } = input;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error(`发放金额必须为正整数（分）: ${amountCents}`);
    }
    const nowIso = input.nowIso ?? new Date().toISOString();
    // topup 恒不过期——表级 CHECK 也拦，这里是第一道
    const expiresAt = pool === 'reward' ? (input.expiresAt ?? rewardExpiryFrom(nowIso)) : null;

    db.prepare(
        `INSERT INTO credit_lots
           (userId, pool, originalCents, remainingCents, grantedAt, expiresAt, sourceKind, refOrderId, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        userId,
        pool,
        amountCents,
        amountCents,
        nowIso,
        expiresAt,
        input.sourceKind ?? ledgerKind,
        input.refOrderId ?? null,
        input.meta ? JSON.stringify(input.meta) : null
    );

    const grant = writeLedger(db, {
        userId,
        kind: ledgerKind,
        amountCents,
        nowIso,
        refOrderId: input.refOrderId,
        meta: { ...(input.meta ?? {}), pool, ...(expiresAt ? { expiresAt } : {}) },
    });
    if(pool==='topup') repayOutstanding(db,userId,nowIso);
    return grant;
}

/** Cash lots repay oldest settled debt. Holds are not debts and cannot consume a payment. */
export function repayOutstanding(db:Database.Database,userId:string,nowIso=new Date().toISOString()):number {
    assertTx(db);
    const debts=db.prepare('SELECT ledgerId,outstandingCents FROM postpaid_debt WHERE userId=? AND reserved=0 AND reversed=0 AND outstandingCents>0 ORDER BY ledgerId').all(userId) as {ledgerId:number;outstandingCents:number}[];
    const lots=db.prepare("SELECT id,remainingCents FROM credit_lots WHERE userId=? AND pool='topup' AND remainingCents>0 ORDER BY id").all(userId) as {id:number;remainingCents:number}[];
    let paid=0; const hits:LotHit[]=[];
    for(const debt of debts) for(const lot of lots) {
        const take=Math.min(debt.outstandingCents,lot.remainingCents); if(take<=0)continue;
        db.prepare('UPDATE credit_lots SET remainingCents=remainingCents-? WHERE id=?').run(take,lot.id);
        db.prepare('UPDATE postpaid_debt SET outstandingCents=outstandingCents-? WHERE ledgerId=?').run(take,debt.ledgerId);
        db.prepare('INSERT INTO postpaid_repayment(debtLedgerId,lotId,cents,createdAt) VALUES(?,?,?,?)').run(debt.ledgerId,lot.id,take,nowIso);
        debt.outstandingCents-=take;lot.remainingCents-=take;paid+=take;hits.push({lotId:lot.id,cents:take});
    }
    if(paid)writeLedger(db,{userId,kind:'adjust',amountCents:-paid,nowIso,meta:{reason:'postpaid_repayment',lots:hits}});
    reconcileCreditCase(userId,nowIso,db);
    return paid;
}

// ---------------------------------------------------------------------------
// 扣减
// ---------------------------------------------------------------------------

export interface SpendInput {
    userId: string;
    funding?: ServiceFunding;
    /** 要花掉多少（正数，分） */
    amountCents: number;
    ledgerKind: LedgerKind;
    refOrderId?: string | null;
    meta?: Record<string, unknown> | null;
    nowIso?: string;
    excludeSourceKinds?: string[];
    /** Only actual delivered usage may exceed the authorized credit limit. Never set at admission. */
    delivered?: boolean;
}

export class InsufficientCreditsError extends Error {
    constructor(public readonly availableCents: number, public readonly requiredCents: number) {
        super(`Credits 不足：可用 ${availableCents} 分，需要 ${requiredCents} 分`);
        this.name = 'InsufficientCreditsError';
    }
}

/**
 * 扣减 Credits。按 reward 优先 → topup 其次、同类先到期先扣。
 * 余额不足抛 InsufficientCreditsError，调用方事务应整体回滚。
 */
export function spendCredits(db: Database.Database, input: SpendInput): LedgerEntry {
    assertTx(db);
    const { userId, amountCents, ledgerKind } = input;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error(`扣减金额必须为正整数（分）: ${amountCents}`);
    }
    const nowIso = input.nowIso ?? new Date().toISOString();
    const excluded = new Set(input.excludeSourceKinds ?? []);

    const serviceSpend = ledgerKind === 'ai_alloc' || ledgerKind === 'service_spend';
    const funding = serviceSpend ? input.funding ?? captureServiceFunding(userId, nowIso) : null;
    const subscriptionCents = Math.min(amountCents, funding ? subscriptionFundingBudget(userId, funding, db) : 0);
    const walletNeeded = amountCents - subscriptionCents;

    // reward 先于 topup；同池先到期先扣，到期日相同则先入账的先扣
    const allLots = db
        .prepare(
            `SELECT id, remainingCents, sourceKind
               FROM credit_lots
              WHERE userId = ? AND remainingCents > 0
                AND (expiresAt IS NULL OR expiresAt > ?)
              ORDER BY CASE pool WHEN 'reward' THEN 0 ELSE 1 END,
                       CASE WHEN expiresAt IS NULL THEN 1 ELSE 0 END,
                       expiresAt ASC,
                       id ASC`
        )
        .all(userId, nowIso) as { id: number; remainingCents: number; sourceKind: string }[];
    const lots = excluded.size > 0 ? allLots.filter(l => !excluded.has(l.sourceKind)) : allLots;
    const eligibleWalletCents = lots.reduce((sum, l) => sum + l.remainingCents, 0);
    const postpaid = !!funding && acceptsPostpaid(userId,funding,db);
    if(postpaid && !input.delivered && (postpaidPolicy(userId,db)?.frozen || reconcileCreditCase(userId,nowIso,db))) throw new InsufficientCreditsError(0,amountCents);
    const debtBudget = funding ? postpaidAvailable(userId,funding,nowIso,db) : 0;
    const walletCents = Math.min(walletNeeded, !funding || funding.walletAllowed ? eligibleWalletCents : 0);
    const debtCents = walletNeeded-walletCents;
    const available = serviceSpend
        ? subscriptionFundingBudget(userId, funding!, db) + (funding!.walletAllowed ? eligibleWalletCents : 0) + debtBudget
        : eligibleWalletCents;
    if (available < amountCents && !(postpaid && input.delivered)) {
        throw new InsufficientCreditsError(available, amountCents);
    }

    const hits: LotHit[] = [];
    let left = walletCents;
    const deduct = db.prepare('UPDATE credit_lots SET remainingCents = remainingCents - ? WHERE id = ?');
    for (const lot of lots) {
        if (left === 0) break;
        const take = Math.min(left, lot.remainingCents);
        deduct.run(take, lot.id);
        hits.push({ lotId: lot.id, cents: take });
        left -= take;
    }
    if (left !== 0) {
        // 余额校验已通过却没扣够，说明批次数据与余额口径不一致，绝不能放过
        throw new Error(`扣减未能配平：still ${left} 分未分摊`);
    }

    const entry = writeLedger(db, {
        userId,
        kind: ledgerKind,
        amountCents: -walletCents,
        nowIso,
        refOrderId: input.refOrderId,
        meta: { ...(input.meta ?? {}), lots: hits,
            ...(serviceSpend ? { billedCents: amountCents, subscriptionCents, walletCents, debtCents, funding } : {}) },
    });
    if (subscriptionCents > 0 && funding) {
        db.prepare('INSERT INTO subscription_usage(ledgerId,periodId,weekStart,amountCents) VALUES (?,?,?,?)')
            .run(entry.id, funding.periodId, funding.weekStart, subscriptionCents);
    }
    if (debtCents>0) {
        if(!postpaid)throw new Error('postpaid_not_authorized');
        const reserved=input.meta?.phase==='reserve'||input.meta?.phase==='hold'||input.meta?.phase==='external_reserve';
        db.prepare('INSERT INTO postpaid_debt(ledgerId,userId,originalCents,outstandingCents,reserved) VALUES(?,?,?,?,?)').run(entry.id,userId,debtCents,debtCents,reserved?1:0);
        if(!reserved)reconcileCreditCase(userId,new Date().toISOString(),db);
    }
    return entry;
}

/**
 * 按原批次退回一次扣减。传入当初 spendCredits 返回的流水行 id。
 *
 * 必须原批次原额退：若退成一笔新的 topup，创作者只要「分配 AI 额度后失败」
 * 就能把不可提现的 reward 洗成可退的 topup。
 */
export function refundSpend(
    db: Database.Database,
    spendLedgerId: number,
    opts: { ledgerKind?: LedgerKind; meta?: Record<string, unknown> | null; nowIso?: string } = {}
): LedgerEntry {
    assertTx(db);
    const nowIso = opts.nowIso ?? new Date().toISOString();
    const row = db.prepare('SELECT * FROM wallet_ledger WHERE id = ?').get(spendLedgerId) as
        | LedgerRow
        | undefined;
    if (!row) throw new Error(`找不到要退回的流水行: ${spendLedgerId}`);
    const entry = rowToEntry(row);
    const allowance = db.prepare('SELECT periodId, weekStart, amountCents FROM subscription_usage WHERE ledgerId = ?').get(spendLedgerId) as { periodId: number; weekStart: string; amountCents: number } | undefined;
    const debt=db.prepare('SELECT * FROM postpaid_debt WHERE ledgerId=?').get(spendLedgerId) as {originalCents:number;outstandingCents:number;reversed:number}|undefined;
    if (entry.amountCents >= 0 && !(allowance && allowance.amountCents > 0) && !debt) throw new Error(`流水行 ${spendLedgerId} 不是一笔扣减`);
    const priorRefund = db.prepare("SELECT * FROM wallet_ledger WHERE json_extract(meta, '$.refundOf') = ?").get(spendLedgerId) as LedgerRow | undefined;
    if (priorRefund) return rowToEntry(priorRefund);

    const hits = (entry.meta?.lots as LotHit[] | undefined) ?? [];
    if (hits.length === 0 && !allowance && !debt) {
        throw new Error(`流水行 ${spendLedgerId} 没有批次明细，无法原路退回`);
    }

    const restore = db.prepare(
        'UPDATE credit_lots SET remainingCents = remainingCents + ? WHERE id = ? AND userId = ?'
    );
    let total = 0;
    for (const hit of hits) {
        const res = restore.run(hit.cents, hit.lotId, entry.userId);
        if (res.changes !== 1) throw new Error(`退回失败：批次 ${hit.lotId} 不存在或不属于该用户`);
        total += hit.cents;
    }
    if (total !== -entry.amountCents) {
        throw new Error(`退回金额与原扣减不符：${total} vs ${-entry.amountCents}`);
    }

    if(debt && !debt.reversed) {
        const payments=db.prepare('SELECT p.id,p.lotId,p.cents-COALESCE((SELECT SUM(r.cents) FROM postpaid_repayment_reversal r WHERE r.repaymentId=p.id),0) cents FROM postpaid_repayment p WHERE debtLedgerId=?').all(spendLedgerId) as {id:number;lotId:number;cents:number}[];
        for(const payment of payments) {
            if(payment.cents<=0)continue;
            restore.run(payment.cents,payment.lotId,entry.userId);
            total+=payment.cents;
            db.prepare('INSERT INTO postpaid_repayment_reversal(repaymentId,cents,reason,createdAt) VALUES(?,?,?,?)').run(payment.id,payment.cents,'spend_refund',nowIso);
        }
        db.prepare('UPDATE postpaid_debt SET reversed=1,outstandingCents=0 WHERE ledgerId=?').run(spendLedgerId);
    }
    const refund = writeLedger(db, {
        userId: entry.userId,
        kind: opts.ledgerKind ?? 'adjust',
        amountCents: total,
        nowIso,
        refOrderId: entry.refOrderId,
        meta: { ...(opts.meta ?? {}), refundOf: spendLedgerId, lots: hits,
            ...(allowance ? { subscriptionCents: allowance.amountCents, walletCents: total, billedCents: total + allowance.amountCents } : {}) },
    });
    if (allowance) db.prepare('INSERT INTO subscription_usage(ledgerId,periodId,weekStart,amountCents) VALUES (?,?,?,?)')
        .run(refund.id, allowance.periodId, allowance.weekStart, -allowance.amountCents);
    reconcileCreditCase(entry.userId,nowIso,db);
    return refund;
}

// ---------------------------------------------------------------------------
// 到期
// ---------------------------------------------------------------------------

/**
 * 清理到期批次：把余额清零并补一行 expire 流水。
 * 余额本身不依赖这个任务（getBalance 已过滤到期批次），这里只是让流水完整可读。
 */
export function expireCredits(
    db: Database.Database,
    nowIso = new Date().toISOString()
): { lots: number; totalCents: number } {
    assertTx(db);
    const stale = db
        .prepare(
            `SELECT userId, SUM(remainingCents) AS cents, COUNT(*) AS n
               FROM credit_lots
              WHERE remainingCents > 0 AND expiresAt IS NOT NULL AND expiresAt <= ?
              GROUP BY userId`
        )
        .all(nowIso) as { userId: string; cents: number; n: number }[];

    if (stale.length === 0) return { lots: 0, totalCents: 0 };

    db.prepare(
        `UPDATE credit_lots SET remainingCents = 0
          WHERE remainingCents > 0 AND expiresAt IS NOT NULL AND expiresAt <= ?`
    ).run(nowIso);

    let lots = 0;
    let totalCents = 0;
    for (const s of stale) {
        writeLedger(db, {
            userId: s.userId,
            kind: 'expire',
            amountCents: -s.cents,
            nowIso,
            meta: { reason: 'reward_expired', lots: s.n },
        });
        lots += s.n;
        totalCents += s.cents;
    }
    return { lots, totalCents };
}

/**
 * Apple 内购到账批次的 `credit_lots.sourceKind`（dev-board#426，设计 §4.3）。
 *
 * 它必须与普通充值（sourceKind='recharge'）区分得开，否则就有一个现成的套利口：
 * 用 Apple 付款买 Credits（我们只净收 84.24%），再按注销流程要求 100% 原路退现。
 * 分辨这件事只能落在数据上——写一条「IAP 不退现」的条款挡不住 `getRefundableCents`。
 */
export const APPSTORE_SOURCE_KIND = 'appstore';
export const GOOGLEPLAY_SOURCE_KIND = 'googleplay';

/**
 * 某用户可退现的部分（topup 批次，**扣掉 Apple / Google Play 商店内购那些**）。注销退款用。
 *
 * 不复用 `getBalanceBreakdown().topupCents`：那是**余额**口径（内购买来的
 * Credits 当然能花，要计进余额），这里是**可退现**口径，两者从这一版起分家。
 */
export function getRefundableCents(userId: string, nowIso = new Date().toISOString()): number {
    const row = getDb()
        .prepare(
            `SELECT COALESCE(SUM(remainingCents), 0) AS total
               FROM credit_lots
              WHERE userId = ?
                AND pool = 'topup'
                AND remainingCents > 0
                AND (expiresAt IS NULL OR expiresAt > ?)
                AND sourceKind NOT IN (?, ?)`
        )
        .get(userId, nowIso, APPSTORE_SOURCE_KIND, GOOGLEPLAY_SOURCE_KIND) as { total: number };
    return row.total;
}

/**
 * 按**原批次**追回一次发放（Apple 退款用，设计 §4.3）。
 *
 * 只动这张订单当初发出来的那些批次（`refOrderId` 命中），不动别的钱：
 * 苹果退的是这一笔，追回也只该追这一笔。批次已经花掉的部分追不回来——
 * 返回 `shortfallCents` 让调用方决定怎么处置（本轮是记日志告警，见
 * `app/api/appstore/notifications`）。
 *
 * **刻意不复用 `spendCredits`**：它按 reward 优先扣，会拿用户的赠额去抵一笔
 * Apple 退款，等于退款惩罚了别的钱包；而且余额不足时它直接抛，追不回的部分
 * 连记录都留不下。
 */
export interface ClawbackResult {
    /** 实际追回（分） */
    clawedBackCents: number;
    /** 追不回的部分（分）：批次已经花掉了 */
    shortfallCents: number;
}

export function clawbackGrantedLots(
    db: Database.Database,
    input: {
        userId: string;
        refOrderId: string;
        amountCents: number;
        meta?: Record<string, unknown> | null;
        nowIso?: string;
    }
): ClawbackResult {
    assertTx(db);
    const nowIso = input.nowIso ?? new Date().toISOString();
    const lots = db
        .prepare(
            `SELECT id, remainingCents FROM credit_lots
              WHERE userId = ? AND refOrderId = ? AND remainingCents > 0
              ORDER BY id ASC`
        )
        .all(input.userId, input.refOrderId) as { id: number; remainingCents: number }[];

    const hits: LotHit[] = [];
    let left = input.amountCents;
    const deduct = db.prepare(
        'UPDATE credit_lots SET remainingCents = remainingCents - ? WHERE id = ?'
    );
    for (const lot of lots) {
        if (left === 0) break;
        const take = Math.min(left, lot.remainingCents);
        deduct.run(take, lot.id);
        hits.push({ lotId: lot.id, cents: take });
        left -= take;
    }

    if(left>0) {
        const payments=db.prepare('SELECT p.id,p.debtLedgerId,p.cents-COALESCE((SELECT SUM(r.cents) FROM postpaid_repayment_reversal r WHERE r.repaymentId=p.id),0) cents FROM postpaid_repayment p JOIN credit_lots l ON l.id=p.lotId WHERE l.userId=? AND l.refOrderId=? ORDER BY p.id').all(input.userId,input.refOrderId) as {id:number;debtLedgerId:number;cents:number}[];
        for(const payment of payments) {
            const take=Math.min(left,payment.cents); if(left<=0)break;if(take<=0)continue;
            db.prepare('UPDATE postpaid_debt SET outstandingCents=outstandingCents+? WHERE ledgerId=? AND reversed=0').run(take,payment.debtLedgerId);
            db.prepare('INSERT INTO postpaid_repayment_reversal(repaymentId,cents,reason,createdAt) VALUES(?,?,?,?)').run(payment.id,take,'payment_reversal',nowIso);
            left-=take;
        }
        reconcileCreditCase(input.userId,nowIso,db);
    }
    const clawedBackCents = input.amountCents - left;
    if (clawedBackCents > 0) {
        writeLedger(db, {
            userId: input.userId,
            kind: 'adjust',
            amountCents: -clawedBackCents,
            nowIso,
            refOrderId: input.refOrderId,
            meta: { ...(input.meta ?? {}), lots: hits, shortfallCents: left },
        });
    }
    return { clawedBackCents, shortfallCents: left };
}
