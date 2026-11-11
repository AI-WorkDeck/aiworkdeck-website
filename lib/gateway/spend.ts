import { acceptsPostpaid } from '../postpaid';
import { captureServiceFunding, type ServiceFunding } from '@/lib/subscription';
import type Database from 'better-sqlite3';
import { getDb, withTransaction } from '@/lib/db';
import { getSpendableBalance, spendCredits, refundSpend, type LedgerEntry } from '@/lib/credits';
import { syncAiQuota } from '@/lib/ai-quota';
import { GatewayError } from './errors';
import { creditsFor, type PricingRow } from './pricing';
import { getThresholds } from './config';
import { bqtChargeTarget } from '@/lib/bqt-member';
import { bqtMemberView, bqtSpendableCents, enqueueBqtServiceCharge, dispatchBqtLater } from '@/lib/bqt-account';
import { randomUUID } from 'crypto';

/**
 * 包晴天线（通道开着且是扫码绑定的律师）：本站钱包一分不动。
 * 事前按快照余额放行；事后整笔登记到包晴天发件箱、提交后发出。包晴天没有冻结和退款，
 * 所以 ASR 预扣不占钱，hold 行的 holdLedgerId 记 BQT_HOLD（0，wallet_ledger 自增 id 从 1 起，不会撞）。
 */
const BQT_HOLD = 0;
const BQT_FRESH_MS = 60_000;
function assertBqtFunds(userId: string, requiredCents: number): void {
    // 与 bqtPreflight 同口径：不拿旧快照做花钱判断（路由层先 refreshBqtSnapshot(…, 5s)）。
    const view = bqtMemberView(userId);
    if (!view || Date.now() - Date.parse(view.fetchedAt) > BQT_FRESH_MS) {
        throw new GatewayError('upstream_failed', '包晴天暂时无法连接，稍后再试');
    }
    const available = bqtSpendableCents(userId);
    if (available < requiredCents) {
        throw new GatewayError('no_credits', '包晴天积分不足或会员不可用，请在包晴天 App 内处理', {
            balanceCents: available,
            requiredCents,
        });
    }
}

/**
 * 网关的记账。整个文件只做一件事：把「调了多少上游」变成「扣了多少 Credits」，
 * 且在任何一条失败路径上都不留下坏账。
 *
 * ## 为什么预扣要走三行账
 *
 * `refundSpend` 按原流水行的 meta.lots 明细**全额**退回，没有部分退款能力，
 * 而这是刻意的：批次明细是「原批次原额退回」的依据，允许部分退就要在明细上做
 * 分摊，一旦分摊出错，reward 就能被洗成可退现的 topup。**不改核心记账**，
 * 多两行流水换一个不会算错的退款语义：
 *
 *   ① hold    spendCredits(估算额)                        —— 先把钱占住
 *   ② release refundSpend(①)                              —— 原批次原额退回
 *   ③ settle  spendCredits(真实额)                        —— 按上游真实计量重扣
 *
 * ②③ **必须同事务**：分开写的话，② 成功而 ③ 失败就是「退了钱、服务白干、分文未收」。
 *
 * ## 为什么每次扣费之后都要 syncAiQuota
 *
 * AI 额度是 `limit = 远端已用量 + 折算(当前余额)`，**只在 syncAiQuota 被调用时才重设**。
 * 不调这个钩子，同一笔余额会被网关和 AI 各花一遍：网关扣掉 90，key 的 limit 一动不动，
 * 用户接着把 AI 额度花光，回抄时只能扣到剩下的 10，差额写一条 shortfall 由平台吃掉。
 * 语音按分钟计价意味着单笔可以很大且高频，这个窗口会从偶发抖动变成稳定的白嫖路径。
 *
 * 退款之后同样要调一次把 limit 提回去，否则退了钱 AI 额度不恢复。
 *
 * 调用点在事务**之外**（syncAiQuota 是 async，better-sqlite3 事务里不能 await），
 * 且一律 fire-and-forget——照 app/api/account/purchase/route.ts 的既有写法，
 * 降额失败不能反过来把一笔已经成功的扣费搞砸。
 */

/** 扣费/退款之后把 AI 上限拉回与余额一致。失败不影响已完成的记账。 */
function resyncAiQuota(userId: string): void {
    void syncAiQuota(userId).catch(() => undefined);
}

/** 写一条平台超支审计。**扣不满时平台自己吃掉差额，但必须留痕。** */
function writeShortfall(
    d: Database.Database,
    detail: { userId: string; service: string; op: string; owedCents: number; takenCents: number; taskId?: string }
): void {
    d.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
        new Date().toISOString(),
        'gateway_spend_shortfall',
        JSON.stringify({ ...detail, shortfallCents: detail.owedCents - detail.takenCents })
    );
}

/**
 * 余额只读检查。用在「还没开始干活」的那一刻（ASR 的 ticket、通用入口的前置闸），
 * 让用户在上传两小时录音之前就被拦住，而不是传完才被拒。
 *
 * **不是承重结构**：它放行之后真正的闸门仍然是 spendCredits 自己的余额判定。
 */
export function assertBalanceFor(userId: string, estimatedCents: number): ServiceFunding {
    const funding = captureServiceFunding(userId);
    if (estimatedCents <= 0) return funding;
    if (bqtChargeTarget(userId)) { assertBqtFunds(userId, estimatedCents); return funding; }
    const balance = getSpendableBalance(userId, new Date().toISOString(), funding);
    if (balance < estimatedCents) {
        throw new GatewayError('no_credits', 'Credits 余额不足，到官网充值后即可继续', {
            balanceCents: balance,
            requiredCents: estimatedCents,
        });
    }
    return funding;
}

/**
 * 这次动作是否贵到该让用户先确认一下。
 *
 * **不是「要不要预扣」的判据**——预扣与否由「同步还是异步」决定：
 * 对同步调用，「预检余额 → 事后扣」严格优于「预扣 → 结算」（少两行流水、
 * 少一个可能悬挂的状态，防的却是同一件事）。预扣真正解决的是异步任务的长间隔。
 */
export function needsUserConfirm(estimatedCents: number): boolean {
    return estimatedCents >= getThresholds().holdThresholdCents;
}

// ---------------------------------------------------------------------------
// 事后扣（默认路径）
// ---------------------------------------------------------------------------

export interface ChargeInput {
    userId: string;
    funding?: ServiceFunding;
    pricing: PricingRow;
    /** 上游返回的**真实**计量。客户端申报值绝不进这里。 */
    actualUnits: number;
    taskId?: string;
}

export interface ChargeResult {
    ledgerId: number | null;
    chargedCents: number;
    shortfallCents: number;
}

/**
 * 调用成功后扣费。**失败的调用绝不走这里**——调用方只在拿到上游成功响应后才调。
 *
 * 余额不足时扣到 0 而不是抛错：服务已经交付了，回滚改变不了「我们已经付给上游」
 * 这个事实，把它变成 500 只会让用户重试、我们再付一次。
 */
export function chargeAfterSuccess(input: ChargeInput): ChargeResult {
    const owedCents = creditsFor(input.pricing, input.actualUnits);
    if (owedCents <= 0) return { ledgerId: null, chargedCents: 0, shortfallCents: 0 };

    const bqt = bqtChargeTarget(input.userId);
    if (bqt) {
        // 服务已交付：整笔记给包晴天。ledgerId 为 null → 调用方不会走本地退款。
        const requestNo = withTransaction((d) => enqueueBqtServiceCharge(d, {
            userId: input.userId, lawyerId: bqt.lawyerId, cents: owedCents,
            service: `${input.pricing.service}.${input.pricing.op}`, refId: input.taskId ?? randomUUID(),
        }));
        dispatchBqtLater(requestNo);
        return { ledgerId: null, chargedCents: owedCents, shortfallCents: 0 };
    }

    const result = withTransaction((d) => {
        const available = getSpendableBalance(input.userId, new Date().toISOString(), input.funding);
        const takeCents = acceptsPostpaid(input.userId,input.funding) ? owedCents : Math.min(owedCents, available);
        let entry: LedgerEntry | null = null;
        if (takeCents > 0) {
            entry = spendCredits(d, {
                userId: input.userId,
                amountCents: takeCents,
                funding: input.funding,
                delivered: true,
                ledgerKind: 'service_spend',
                meta: {
                    service: input.pricing.service,
                    op: input.pricing.op,
                    units: input.actualUnits,
                    unit: input.pricing.unit,
                    ...(input.taskId ? { taskId: input.taskId } : {}),
                },
            });
        }
        if (takeCents < owedCents) {
            writeShortfall(d, {
                userId: input.userId,
                service: input.pricing.service,
                op: input.pricing.op,
                owedCents,
                takenCents: takeCents,
                taskId: input.taskId,
            });
        }
        return { ledgerId: entry?.id ?? null, chargedCents: takeCents, shortfallCents: owedCents - takeCents };
    });

    resyncAiQuota(input.userId);
    return result;
}

/** 上游失败后原批次原额退回。**绝不「再发一笔」**——那会把 reward 洗成可退现的 topup。 */
export function refundCharge(userId: string, spendLedgerId: number): void {
    withTransaction((d) => {
        refundSpend(d, spendLedgerId, {
            ledgerKind: 'adjust',
            meta: { reason: 'gateway_upstream_failed' },
        });
    });
    resyncAiQuota(userId);
}

// ---------------------------------------------------------------------------
// 跨设备文件传输（dev-board#251）
// ---------------------------------------------------------------------------
//
// 这两个函数不是网关自己的调用路径——调用方是官网新增的窄权限内部记账口
// （app/api/internal/transfer/route.ts），代云后端（同机 Spring 服务）按 accountId
// 扣/退 transfer 一种计价项，见设计 §2.4。结构照抄 chargeAfterSuccess/refundCharge：
// 自己开一个 withTransaction，事务提交之后再 resyncAiQuota。
//
// 与 chargeAfterSuccess 的关键差异：那边「服务已经交付，扣不满也要扣到 0」，
// 因为上游已经付过费了；这边计费发生在 B 机真正传字节**之前**（PULL 建行即扣费，
// 等 B 上传），余额不够就该硬拒，不能先扣到 0 再让用户去交付一份收不回钱的传输。
// spendCredits 本身在余额不足时就会抛 InsufficientCreditsError 并回滚整个事务，
// 这正是我们要的语义，不用像 chargeAfterSuccess 那样手动算 min(owed, available)。

export interface ChargeTransferInput {
    userId: string;
    /** 客户端（云后端转述的 B 机声明值）传输字节数，只进审计 meta，不参与计价——
     *  计价在路由层用 creditsFor 已经按 service_pricing 算完并作为 credits 传入。 */
    bytes: number;
    /** 本次要扣的 Credits（分），路由层已按 transfer/relay 定价算好。 */
    credits: number;
    /** 云后端的 requestId，写进 meta，退款时用来核对「退的是哪一笔传输」。 */
    refId: string;
    nowIso?: string;
}

/**
 * 跨设备传输扣费。**硬闸**：余额不足直接抛 `InsufficientCreditsError`（spendCredits
 * 自己抛的），事务整体回滚，不留一分钱悬挂的账。路由层据此回 409 no_credits。
 */
export function chargeTransfer(input: ChargeTransferInput): LedgerEntry {
    if (!Number.isInteger(input.credits) || input.credits <= 0) {
        throw new GatewayError('bad_request', '扣费金额必须为正整数（分）', { refId: input.refId });
    }
    // 传输是「先扣、失败再退」，而包晴天积分扣了就退不回来：包晴天线暂不开放跨设备中转计费。
    if (bqtChargeTarget(input.userId)) {
        throw new GatewayError('no_credits', '包晴天律师账户暂不支持跨设备中转计费', { refId: input.refId, bqt: true });
    }

    const entry = withTransaction((d) =>
        spendCredits(d, {
            userId: input.userId,
            amountCents: input.credits,
            ledgerKind: 'service_spend',
            meta: { service: 'transfer', bytes: input.bytes, refId: input.refId },
            nowIso: input.nowIso,
        })
    );

    resyncAiQuota(input.userId);
    return entry;
}

export interface RefundTransferInput {
    userId: string;
    /** chargeTransfer 返回的流水行 id（云后端存作 chargeLedgerId）。 */
    spendLedgerId: number;
}

export interface RefundTransferResult {
    /** false = 这一笔之前已经退过，本次是幂等回放，没有再产生一笔新流水。 */
    refunded: boolean;
    ledgerId: number;
}

/**
 * 跨设备传输退款。原批次原额退回（refundSpend），并把 AI 额度拉回来。
 *
 * **必须自己扎幂等围栏**：`refundSpend` 只按 `meta.lots` 原样退，不认「这笔是不是已经
 * 退过」——重复调用它就是重复退款。TTL 清扫任务与业务失败两条路径都可能各调一次
 * 同一个 ledgerId（设计 §2.1 状态机原话就是「已扣未退才退」），这里查一次
 * `meta.refundOf` 就地拦掉，比指望上层永远不重复调更可靠。
 *
 * accountId 越权顺手挡在这里：spendLedgerId 不属于 userId 一律当成「找不到」，
 * 而不是把别的账户的流水退给调用方声称的这个 userId。
 */
export function refundTransfer(input: RefundTransferInput): RefundTransferResult {
    const result = withTransaction((d) => {
        const original = d
            .prepare('SELECT userId FROM wallet_ledger WHERE id = ?')
            .get(input.spendLedgerId) as { userId: string } | undefined;
        if (!original || original.userId !== input.userId) {
            throw new GatewayError('bad_request', `找不到属于该账户的流水行：${input.spendLedgerId}`);
        }

        const already = d
            .prepare(`SELECT id FROM wallet_ledger WHERE json_extract(meta, '$.refundOf') = ?`)
            .get(input.spendLedgerId) as { id: number } | undefined;
        if (already) {
            return { refunded: false, ledgerId: already.id };
        }

        const entry = refundSpend(d, input.spendLedgerId, {
            ledgerKind: 'adjust',
            meta: { reason: 'transfer_refund' },
        });
        return { refunded: true, ledgerId: entry.id };
    });

    resyncAiQuota(input.userId);
    return result;
}

// ---------------------------------------------------------------------------
// 预扣三行账
// ---------------------------------------------------------------------------

export type HoldStatus = 'held' | 'settled' | 'released';

export interface HoldRow {
    taskId: string;
    userId: string;
    service: string;
    op: string;
    holdLedgerId: number;
    estimatedUnits: number;
    upstreamRef: string | null;
    status: HoldStatus;
    createdAt: string;
    holdExpiresAt: string;
    lastPolledAt: string | null;
    settledAt: string | null;
    /** 该服务自己的长任务状态（JSON 字符串）。语音用它存中转 OSS 的 objectKey。 */
    meta: string | null;
}

/** 读 hold.meta。存的不是合法 JSON 就当没有——meta 是清理线索，不该反过来把结算搞崩。 */
export function holdMeta(hold: HoldRow): Record<string, unknown> {
    if (!hold.meta) return {};
    try {
        const parsed = JSON.parse(hold.meta) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export function findHold(taskId: string, d: Database.Database = getDb()): HoldRow | null {
    const row = d.prepare('SELECT * FROM gateway_hold WHERE taskId = ?').get(taskId) as HoldRow | undefined;
    return row ?? null;
}

export interface OpenHoldInput {
    userId: string;
    taskId: string;
    pricing: PricingRow;
    /** 客户端申报的估算计量。**只用于预扣，不用于计价。** */
    estimatedUnits: number;
    nowMs: number;
    /**
     * 该服务的长任务状态，与 hold 行**同一条 INSERT 落库**。
     *
     * 不做成事后 UPDATE：中间那个「hold 已存在但还不知道要清理哪个 OSS 对象」的窗口，
     * 正好覆盖了最容易崩的一段（刚扣完钱、还没调上游）。
     */
    meta?: Record<string, unknown>;
}

/**
 * ① hold：把估算额占住，并落一行服务端状态。
 *
 * hold **必须落库**：初稿把释放与结算全挂在桌面主动轮询上，用户合盖笔记本
 * 那笔钱就永久冻结，客服除手工 adjust 无解。落库之后回收任务才有东西可扫。
 */
export function openHold(input: OpenHoldInput): { holdLedgerId: number; heldCents: number } {
    const heldCents = creditsFor(input.pricing, input.estimatedUnits);
    if (heldCents <= 0) {
        throw new GatewayError('bad_request', '预扣金额必须为正', { taskId: input.taskId });
    }
    const nowIso = new Date(input.nowMs).toISOString();
    const expiresIso = new Date(
        input.nowMs + getThresholds().holdTtlMinutes * 60_000
    ).toISOString();

    if (bqtChargeTarget(input.userId)) {
        assertBqtFunds(input.userId, heldCents);
        withTransaction((d) => {
            d.prepare(
                `INSERT INTO gateway_hold
                   (taskId, userId, service, op, holdLedgerId, estimatedUnits, status, createdAt, holdExpiresAt, meta)
                 VALUES (?, ?, ?, ?, ?, ?, 'held', ?, ?, ?)`
            ).run(input.taskId, input.userId, input.pricing.service, input.pricing.op, BQT_HOLD, input.estimatedUnits,
                nowIso, expiresIso, input.meta ? JSON.stringify(input.meta) : null);
        });
        return { holdLedgerId: BQT_HOLD, heldCents };
    }

    const result = withTransaction((d) => {
        const available = getSpendableBalance(input.userId);
        if (available < heldCents) {
            throw new GatewayError('no_credits', 'Credits 余额不足，到官网充值后即可继续', {
                balanceCents: available,
                requiredCents: heldCents,
            });
        }
        const entry = spendCredits(d, {
            userId: input.userId,
            amountCents: heldCents,
            ledgerKind: 'service_spend',
            meta: {
                service: input.pricing.service,
                op: input.pricing.op,
                phase: 'hold',
                taskId: input.taskId,
                units: input.estimatedUnits,
                unit: input.pricing.unit,
            },
        });
        d.prepare(
            `INSERT INTO gateway_hold
               (taskId, userId, service, op, holdLedgerId, estimatedUnits, status, createdAt, holdExpiresAt, meta)
             VALUES (?, ?, ?, ?, ?, ?, 'held', ?, ?, ?)`
        ).run(
            input.taskId,
            input.userId,
            input.pricing.service,
            input.pricing.op,
            entry.id,
            input.estimatedUnits,
            nowIso,
            expiresIso,
            input.meta ? JSON.stringify(input.meta) : null
        );
        return { holdLedgerId: entry.id, heldCents };
    });

    resyncAiQuota(input.userId);
    return result;
}

export function attachUpstreamRef(taskId: string, upstreamRef: string): void {
    withTransaction((d) => {
        d.prepare('UPDATE gateway_hold SET upstreamRef = ? WHERE taskId = ?').run(upstreamRef, taskId);
    });
}

export function touchHoldPoll(taskId: string, nowIso = new Date().toISOString()): void {
    withTransaction((d) => {
        d.prepare('UPDATE gateway_hold SET lastPolledAt = ? WHERE taskId = ?').run(nowIso, taskId);
    });
}

export interface SettleResult {
    chargedCents: number;
    shortfallCents: number;
}

/**
 * ②③ 结算：全额释放预扣，再按上游真实计量重扣。**同一个事务。**
 *
 * 三条路径里最容易被漏掉的是第三条——真实计量大于预扣估算、且余额已经不够补差。
 * 这不需要恶意就会发生：hold 90 分钟之后用户在转写期间把余额花在别处，
 * 结算 95 分钟即撞上。此时**扣到 0、写 shortfall、绝不回滚整笔结算**：
 * 回滚等于「服务交付了、我们向上游付过费了、账面上却什么都没发生」。
 */
export function settleHold(taskId: string, actualUnits: number, pricing: PricingRow): SettleResult {
    let bqtRequestNo: string | null = null;
    const result = withTransaction((d) => {
        const hold = findHold(taskId, d);
        if (!hold) throw new GatewayError('bad_request', `找不到预扣记录：${taskId}`);
        if (hold.status !== 'held') {
            // 幂等：已结算/已释放的重复结算请求直接返回零变更，不抛错。
            return { chargedCents: 0, shortfallCents: 0 };
        }
        if (hold.holdLedgerId === BQT_HOLD) {
            const owed = creditsFor(pricing, actualUnits);
            const bqt = bqtChargeTarget(hold.userId, d);
            if (owed > 0 && bqt) {
                bqtRequestNo = enqueueBqtServiceCharge(d, { userId: hold.userId, lawyerId: bqt.lawyerId, cents: owed, service: `${hold.service}.${hold.op}`, refId: taskId });
            } else if (owed > 0) {
                // 结算前通道被关：这笔包晴天没法再扣，平台承担并留痕。
                writeShortfall(d, { userId: hold.userId, service: hold.service, op: hold.op, owedCents: owed, takenCents: 0, taskId });
            }
            d.prepare("UPDATE gateway_hold SET status = 'settled', settledAt = ? WHERE taskId = ?").run(new Date().toISOString(), taskId);
            return { chargedCents: bqt ? owed : 0, shortfallCents: bqt ? 0 : owed };
        }

        const original = d.prepare('SELECT meta FROM wallet_ledger WHERE id = ?').get(hold.holdLedgerId) as { meta: string | null };
        // Legacy holds predate subscriptions and were wallet-funded. New holds retain explicit consent and period.
        const funding: ServiceFunding = (original.meta ? JSON.parse(original.meta).funding : null)
            ?? { periodId: null, weekStart: null, walletAllowed: true };
        refundSpend(d, hold.holdLedgerId, {
            ledgerKind: 'adjust',
            meta: { phase: 'hold_release', taskId },
        });

        const owedCents = creditsFor(pricing, actualUnits);
        const available = getSpendableBalance(hold.userId, new Date().toISOString(), funding);
        const takeCents = acceptsPostpaid(hold.userId,funding) ? owedCents : Math.min(owedCents, available);
        if (takeCents > 0) {
            spendCredits(d, {
                userId: hold.userId,
                amountCents: takeCents,
                funding,
                delivered: true,
                ledgerKind: 'service_spend',
                meta: {
                    service: hold.service,
                    op: hold.op,
                    phase: 'settle',
                    taskId,
                    units: actualUnits,
                    unit: pricing.unit,
                },
            });
        }
        if (takeCents < owedCents) {
            writeShortfall(d, {
                userId: hold.userId,
                service: hold.service,
                op: hold.op,
                owedCents,
                takenCents: takeCents,
                taskId,
            });
        }

        d.prepare(
            "UPDATE gateway_hold SET status = 'settled', settledAt = ? WHERE taskId = ?"
        ).run(new Date().toISOString(), taskId);

        return { chargedCents: takeCents, shortfallCents: owedCents - takeCents };
    });

    dispatchBqtLater(bqtRequestNo);
    const hold = findHold(taskId);
    if (hold) resyncAiQuota(hold.userId);
    return result;
}

/** ② 只释放不重扣：任务中途失败时走这条，用户不花一分钱。 */
export function releaseHold(taskId: string, reason: string): void {
    const userId = withTransaction((d) => {
        const hold = findHold(taskId, d);
        if (!hold || hold.status !== 'held') return null;
        if (hold.holdLedgerId !== BQT_HOLD) refundSpend(d, hold.holdLedgerId, {
            ledgerKind: 'adjust',
            meta: { phase: 'hold_release', taskId, reason },
        });
        d.prepare(
            "UPDATE gateway_hold SET status = 'released', settledAt = ? WHERE taskId = ?"
        ).run(new Date().toISOString(), taskId);
        return hold.userId;
    });
    if (userId) resyncAiQuota(userId);
}

/** 某用户尚未结算的预扣总额（分）。账户页据此显示「N Credits 正被一项任务占用」。 */
export function pendingHoldCents(userId: string, d: Database.Database = getDb()): number {
    const rows = d
        .prepare(
            `SELECT -COALESCE(json_extract(l.meta, '$.billedCents'), -l.amountCents) AS amountCents
               FROM gateway_hold h JOIN wallet_ledger l ON l.id = h.holdLedgerId
              WHERE h.userId = ? AND h.status = 'held'`
        )
        .all(userId) as { amountCents: number }[];
    return rows.reduce((sum, r) => sum + Math.abs(r.amountCents), 0);
}

/**
 * 超时回收：把过期仍未结算的 hold 全部释放。
 *
 * 挂在 /api/admin/ai/reconcile（已有的每小时 cron）上，不新开 crontab 条目。
 *
 * 这里**只释放不结算**：判定「上游其实已经完成了」需要各服务自己的查询实现，
 * 而释放对用户永远是安全的一侧——最坏的结果是一次我们已经付过费的转写没收到钱，
 * 好过让用户的钱永久冻结。真正的结算仍走桌面轮询那条正路。
 */
export function reclaimExpiredHolds(nowIso = new Date().toISOString()): { released: number } {
    const expired = getDb()
        .prepare("SELECT taskId FROM gateway_hold WHERE status = 'held' AND holdExpiresAt < ?")
        .all(nowIso) as { taskId: string }[];
    for (const row of expired) {
        releaseHold(row.taskId, 'hold_expired');
    }
    return { released: expired.length };
}
