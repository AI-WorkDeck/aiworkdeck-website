import { postpaidPolicy, POSTPAID_VERSION } from './postpaid';
import { platformProvider, bailianConfigured } from './platform-ai/config';
import { subscriptionSnapshot, captureServiceFunding, type ServiceFunding } from './subscription';
import { getDb, withTransaction } from './db';
import { getAiConfig, getExchangeRateInfo } from './ai-config';
import { getSpendableBalance, spendCredits, InsufficientCreditsError } from './credits';
import { CIRCLE_DEEPSEEK_SOURCE_KIND, canCircleUserCallOverseasModel, getCircleDeepseekBalanceCents, getUserCircleFirm, getUserMarginMultiplier } from './circle-firms';
import {
    getActiveKeyRow,
    encryptKeyMaterial,
    isEncryptionConfigured,
    type OrKeyRow,
} from './openrouter-keys';
import * as mgmt from './openrouter-mgmt';
import { refreshBqtSnapshot } from './bqt-ai';

/**
 * AI 额度自动预留（Credits 重构 P3，doc/credits-redesign.md §4）。
 *
 * 取代「用户手动从余额分配额度」那一步。用户看不到「分配」，充完值 AI 直接能用。
 *
 * ## 为什么不能按次精确扣费
 *
 * 桌面端持 provisioned key **直连** OpenRouter，我们不在请求路径上。要按次原子扣
 * Credits 就得代理全部 AI 请求，等于把延迟、可用性与流量成本全接过来。不划算。
 *
 * ## 取而代之：limit 派生自余额，用量事后回抄
 *
 *   目标 limit(USD) = 远端已用量 + 折算(可用 Credits)
 *
 * 每次同步做两件事：
 * 1. **回抄**：远端 usage 比上次结算多出来的部分，折成人民币分从 Credits 扣掉；
 * 2. **提额/降额**：把 limit 设成「已用 + 还买得起的」，让用户能花光 Credits 但不超支。
 *
 * ## 与旧 allocate 的关键区别：patch 失败不再是丢钱事故
 *
 * 旧路径先扣钱再提额，patch 抛错就必须实查三态再决定退不退款（退错了用户既拿回钱
 * 又白得额度）。现在钱只在**用量真实发生后**才扣，limit 只是一个上限阀门：
 * patch 失败 → 阀门维持原值 → 下次同步重试，一分钱都不会错。
 * 因此这里不需要两阶段事务，也不需要 pending 状态机。
 *
 * ## 已知的有界超支
 *
 * 「同步后、用户把 Credits 花在别处」这个窗口内，limit 会短暂高于余额，用户可能多花
 * 一点 AI。回抄时余额不够就只扣到 0 并写 admin_audit 记一笔缺口——平台自己吃掉。
 * 缺口上限就是并发那笔消费的金额，且 P4 在扣 Credits 时会顺手降额把窗口收窄。
 * 绝不能为了堵这个窗口把余额扣成负数：负余额会污染所有下游判断。
 */

/** REAL 列与 OpenRouter 浮点比较容差（半美分） */
const USD_EPSILON = 0.005;

export interface QuotaState {
    /** 服务端是否配置齐全（Management key + 加密密钥） */
    configured: boolean;
    hasKey: boolean;
    /** 可用 Credits（分）——桌面端应当以此判断「能不能用平台 AI」，不要再看 hasKey */
    creditsCents: number;
    limitUsd: number;
    usageUsd: number;
    remainingUsd: number;
    disabled?: boolean;
    /** 本次同步从 Credits 扣掉的用量（分） */
    settledCents?: number;
}

export function isAiQuotaConfigured(): boolean {
    return platformProvider() === 'bailian' ? bailianConfigured() : mgmt.isMgmtConfigured() && isEncryptionConfigured();
}

/** Expired subscribers must explicitly authorize cash, including after a previously enabled fallback is revoked. */
export function captureAiFunding(userId: string): ServiceFunding {
    const funding = captureServiceFunding(userId);
    if (!funding.postpaidVersion && funding.periodId == null
        && getDb().prepare('SELECT 1 FROM subscription_period WHERE userId = ? LIMIT 1').get(userId)) {
        funding.walletAllowed = subscriptionSnapshot(userId).walletFallbackEnabled;
    }
    return funding;
}

export function getAiSpendableBalance(userId: string): number {
    return getSpendableBalance(userId, new Date().toISOString(), captureAiFunding(userId));
}

/** 人民币分 → 美元额度。向下取整，宁少给不多给（与旧 computeUsdDelta 同一公式）。 */
export function usdFromCents(cents: number, exchangeRate: number, marginMultiplier: number): number {
    const usdCents = Math.floor(cents / (exchangeRate * marginMultiplier));
    return usdCents / 100;
}

/** 美元用量 → 人民币分。向上取整，成本不能少收（与上一函数刻意不对称）。 */
export function centsFromUsd(usd: number, exchangeRate: number, marginMultiplier: number): number {
    return Math.ceil(usd * exchangeRate * marginMultiplier * 100);
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * 把远端新增用量回抄成 Credits 扣减。
 * 余额不足时只扣到 0 并记 audit——绝不把余额扣成负数。
 *
 * 汇率由调用方传入：即时汇率会在后台刷新（dev-board#853），同一次同步里回抄与重设 limit
 * 必须用同一个值，否则两步之间刷新落盘就会一半按旧汇率、一半按新汇率。
 * 汇率只作用于**本次新增**的那段用量（水位之上），水位之下的历史一分不重算。
 */
export function settleUsage(
    row: OrKeyRow,
    remoteUsageUsd: number,
    exchangeRate: number,
    marginMultiplier: number
): number {
    return withTransaction(db => {
    row = db.prepare('SELECT * FROM openrouter_keys WHERE id=?').get(row.id) as OrKeyRow;
    if (!row) throw new Error('key_missing');
    // 水位未建立（迁移前建的 key）：这些用量在旧的「先分配后消费」模型下已经付过钱，
    // 只对齐水位、一分不扣。扣了就是二次收费。
    if (row.settledUsageUsd == null) {
        getDb()
            .prepare('UPDATE openrouter_keys SET settledUsageUsd = ? WHERE id = ?')
            .run(remoteUsageUsd, row.id);
        return 0;
    }

    const deltaUsd = remoteUsageUsd - row.settledUsageUsd;
    if (deltaUsd <= USD_EPSILON) return 0;

    const owedCents = centsFromUsd(deltaUsd, exchangeRate, marginMultiplier);
    if (owedCents <= 0) return 0;

    return withTransaction(db => {
        const funding: ServiceFunding = row.fundingJson ? JSON.parse(row.fundingJson) : captureServiceFunding(row.userId);
        const circleDeepseekCents = getCircleDeepseekBalanceCents(row.userId);
        const rawAvailable = getSpendableBalance(row.userId, new Date().toISOString(), funding);
        const available = Math.max(0, rawAvailable - circleDeepseekCents);
        const takeCents = Math.min(owedCents, available);
        if (takeCents > 0) {
            spendCredits(db, {
                userId: row.userId,
                amountCents: takeCents,
                funding,
                ledgerKind: 'ai_alloc',
                excludeSourceKinds: [CIRCLE_DEEPSEEK_SOURCE_KIND],
                // 汇率随即时值浮动之后，每笔回抄按哪个汇率折的要能从流水里查回来
                meta: { aiUsageUsd: round2(deltaUsd), orKeyId: row.id, exchangeRate },
            });
        }
        if (takeCents < owedCents) {
            // 有界超支：同步窗口内用户把 Credits 花在了别处。平台吃掉差额，但要留痕。
            db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
                new Date().toISOString(),
                'ai_usage_shortfall',
                JSON.stringify({
                    userId: row.userId,
                    owedCents,
                    takenCents: takeCents,
                    shortfallCents: owedCents - takeCents,
                    usageUsd: round2(remoteUsageUsd),
                })
            );
        }
        // 无论是否扣满，结算水位都要推进到远端用量，否则同一笔用量会被反复扣
        db.prepare('UPDATE openrouter_keys SET settledUsageUsd = ? WHERE id = ?').run(
            remoteUsageUsd,
            row.id
        );
        return takeCents;
    });
    });
}

/**
 * 同步该用户的 AI 额度：回抄用量 → 按余额重设 limit。没有 key 且有 Credits 时自动开一把。
 *
 * 幂等且可反复调用；上游失败时不抛错，返回当前已知状态并带 configured/hasKey，
 * 让调用方自己决定降级展示（**不能**把上游故障显示成「你的 Credits 是 0」）。
 */
async function syncAiQuotaOnce(userId: string): Promise<QuotaState> {
    if (platformProvider() === 'bailian') {
        const { retireOpenRouter, domesticQuota } = await import('./platform-ai/billing');
        await retireOpenRouter(userId);
        await refreshBqtSnapshot(userId);
        return domesticQuota(userId);
    }
    if(postpaidPolicy(userId)?.version===POSTPAID_VERSION) {
        const {syncPostpaidOpenRouter}=await import('./postpaid-openrouter');
        return syncPostpaidOpenRouter(userId);
    }
    const marginMultiplier = getUserMarginMultiplier(userId);
    const exchangeRate = getExchangeRateInfo().rate;
    const funding = captureAiFunding(userId);
    const creditsCents = getSpendableBalance(userId, new Date().toISOString(), funding);
    const circleFirm = getUserCircleFirm(userId);
    const circleDeepseekCents = circleFirm ? getCircleDeepseekBalanceCents(userId) : 0;
    const orEligibleCents = circleFirm
        ? (canCircleUserCallOverseasModel(userId) ? Math.max(0, creditsCents - circleDeepseekCents) : 0)
        : creditsCents;
    const base: QuotaState = {
        configured: isAiQuotaConfigured(),
        hasKey: false,
        creditsCents,
        limitUsd: round2(usdFromCents(circleDeepseekCents, exchangeRate, marginMultiplier)),
        usageUsd: 0,
        remainingUsd: round2(usdFromCents(circleDeepseekCents, exchangeRate, marginMultiplier)),
    };
    let row = getActiveKeyRow(userId);
    // 服务端没配齐时也要如实报「有没有 key」——把已有的 key 报成没有，
    // 会让桌面端以为账户从没接过平台通道。金额字段此时确实不可信，保持 0。
    if (!base.configured) return { ...base, hasKey: !!row };

    // --- 没有 key：有可上 OpenRouter 的 Credits 才开，避免给零余额或仅含 DeepSeek 专项赠额账户造孤儿 key ---
    if (!row) {
        if (orEligibleCents <= 0) return base;
        const limitUsd = usdFromCents(orEligibleCents, exchangeRate, marginMultiplier);
        if (limitUsd <= 0) return base;
        // create 路径刻意不重试：runtime key 明文只在创建响应里出现一次，
        // 重试会建出一堆带 limit 的孤儿 key，全计入平台超卖告警却无人可用。
        const created = await mgmt.createKey(`awd-user-${userId}`, limitUsd);
        getDb()
            .prepare(
                `INSERT INTO openrouter_keys (userId, orKeyHash, limitUsd, createdAt, encKey, settledUsageUsd, fundingJson, mgmtAccount)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
            )
            .run(
                userId,
                created.hash,
                created.limitUsd,
                new Date().toISOString(),
                encryptKeyMaterial(created.key),
                JSON.stringify(funding),
                mgmt.currentMgmtAccount()
            );
        const dsUsd = usdFromCents(circleDeepseekCents, exchangeRate, marginMultiplier);
        return {
            ...base,
            hasKey: true,
            limitUsd: round2(created.limitUsd + dsUsd),
            usageUsd: 0,
            remainingUsd: round2(created.limitUsd + dsUsd),
        };
    }

    // --- 有 key：实查远端，回抄用量，再按余额重设 limit ---
    const remote = await mgmt.getKey(row.orKeyHash);
    const settledCents = settleUsage(row, remote.usageUsd, exchangeRate, marginMultiplier);
    const nextFunding = captureAiFunding(userId);
    const balanceAfter = getSpendableBalance(userId, new Date().toISOString(), nextFunding);
    const dsAfterCents = circleFirm ? getCircleDeepseekBalanceCents(userId) : 0;
    const orAfterCents = circleFirm
        ? (canCircleUserCallOverseasModel(userId) ? Math.max(0, balanceAfter - dsAfterCents) : 0)
        : balanceAfter;

    const targetLimitUsd = round2(
        remote.usageUsd + usdFromCents(orAfterCents, exchangeRate, marginMultiplier)
    );
    let limitUsd = remote.limitUsd;
    if (Math.abs(targetLimitUsd - remote.limitUsd) > USD_EPSILON) {
        // patch 失败不是事故：钱已按真实用量扣过，limit 只是上限阀门，下次同步会重试。
        // 所以这里刻意不做三态实查，也不回滚任何账。
        try {
            await mgmt.patchKeyLimit(row.orKeyHash, targetLimitUsd);
            limitUsd = targetLimitUsd;
            getDb()
                .prepare('UPDATE openrouter_keys SET limitUsd = ? WHERE id = ?')
                .run(targetLimitUsd, row.id);
        } catch (error) {
            // A subscription must not report a lowered cap while an older wallet-funded cap remains.
            if (targetLimitUsd < remote.limitUsd && (subscriptionSnapshot(userId).active || !nextFunding.walletAllowed)) throw error;
            // Legacy prepaid quota retains its existing retry behaviour.
        }
    }

    // Only save the new authorization after the provider has that limit. Failed patches keep the old source.
    if (Math.abs(targetLimitUsd - limitUsd) <= USD_EPSILON) {
        getDb().prepare('UPDATE openrouter_keys SET fundingJson = ? WHERE id = ?').run(JSON.stringify(nextFunding), row.id);
    }
    return {
        configured: true,
        hasKey: true,
        creditsCents: balanceAfter,
        limitUsd: round2(limitUsd),
        usageUsd: round2(remote.usageUsd),
        remainingUsd: round2(Math.max(limitUsd - remote.usageUsd, 0)),
        disabled: remote.disabled,
        settledCents,
    };
}

// Serialize reads and settlement for a user: overlapping polls must not charge the same usage twice.
const quotaSyncs = new Map<string, Promise<QuotaState>>();
export function withQuotaLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = quotaSyncs.get(userId);
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(fn);
    quotaSyncs.set(userId, next as Promise<QuotaState>);
    void next.finally(() => { if (quotaSyncs.get(userId) === next) quotaSyncs.delete(userId); }).catch(() => undefined);
    return next;
}
export function syncAiQuota(userId: string): Promise<QuotaState> {
    return withQuotaLock(userId, () => syncAiQuotaOnce(userId));
}

/**
 * 对账扫描：给定时任务用。逐个同步有 key 的账户，把用量回抄成 Credits 扣减。
 *
 * 取消用户侧 allocate 后，官网这边就再没有「用户主动发起一次分配」这个天然触发点了；
 * 用量回抄若只挂在读接口上，长期不打开账户页的用户就白用。因此必须有独立的定时任务。
 */
export async function reconcileAllQuotas(
    limit = 200
): Promise<{ scanned: number; settledCents: number; failed: number }> {
    if (platformProvider() === 'bailian') {
        const { recoverPending } = await import('./platform-ai/billing');
        recoverPending();
    }
    if (!isAiQuotaConfigured()) return { scanned: 0, settledCents: 0, failed: 0 };
    const rows = getDb()
        .prepare(
            `SELECT DISTINCT userId FROM openrouter_keys WHERE disabledAt IS NULL OR id IN (SELECT keyId FROM bailian_retired_key) OR id IN (SELECT keyId FROM openrouter_rotated_key WHERE doneAt IS NULL) ORDER BY id DESC LIMIT ?`
        )
        .all(limit) as { userId: string }[];

    let settledCents = 0;
    let failed = 0;
    for (const { userId } of rows) {
        try {
            if (platformProvider() === 'bailian') {
                const { retireOpenRouter } = await import('./platform-ai/billing');
                await retireOpenRouter(userId, true);
            }
            // 账号轮换后旧账号 key 的迟到用量：先回读结算，再按（已扣减的）余额同步新 key
            const { settleRotatedKeys } = await import('./openrouter-rotation');
            await settleRotatedKeys(userId);
            const state = await syncAiQuota(userId);
            settledCents += state.settledCents ?? 0;
        } catch {
            // 单个账户的上游失败不该中断整轮对账
            failed++;
        }
    }
    return { scanned: rows.length, settledCents, failed };
}

export { InsufficientCreditsError };
