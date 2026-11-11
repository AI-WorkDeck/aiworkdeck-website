import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';

/**
 * 按服务分组的当月消耗。桌面端「平台服务」面板据此显示每项服务本月花了多少。
 *
 * ## 为什么不能直接对 service_spend 求和
 *
 * **预扣会留下三行账**（见 gateway/spend.ts）：
 *
 *   hold          service_spend  −600   meta.phase = 'hold'
 *   hold_release  adjust         +600   meta.phase = 'hold_release'
 *   settle        service_spend  −420   meta.phase = 'settle'
 *
 * 把 `kind='service_spend'` 的行全加起来 = 600 + 420 = 1020，而用户实际只花了 420。
 * hold 那一行已经被 release 全额冲销掉了，它不是消费，是一段临时占用。
 *
 * 正确口径：**只算 `meta.phase` 为空或等于 `settle` 的行**。
 * - 空 = 事后扣（同步服务，一次调用一行，没有 phase）
 * - `settle` = 预扣任务的真实结算额
 * - `hold` = 已被冲销，必须排除
 *
 * 不要改成「service_spend 求和再减去 hold_release」：那种写法看着等价，但 release
 * 的 kind 是 `adjust`，而 `adjust` 还承载着退款和客服手工调账，一减就把不相干的
 * 调账也算进服务消耗里了。认 phase 是唯一说得清的口径。
 */

export interface ServiceUsage {
    service: string;
    /** 本月该服务的消费（分，正数） */
    cents: number;
    /** 计费次数（结算过的调用数，不含被冲销的预扣） */
    calls: number;
}

export interface MonthlyUsage {
    /** 自然月标识，形如 2026-08（北京时间口径） */
    month: string;
    /** 统计区间（UTC ISO，左闭右开），便于对账时复现同一个数 */
    from: string;
    to: string;
    services: ServiceUsage[];
    totalCents: number;
}

/**
 * 北京时间的自然月区间，换算成与 `wallet_ledger.ts` 同一口径的 UTC ISO。
 *
 * 为什么不直接用 UTC 的月份：账本时间戳存的是 UTC，而「本月」是给国内用户看的。
 * 每个月头八小时（北京 00:00–08:00，UTC 还在上个月）产生的消费会被算进上一个月，
 * 用户在 1 号早上打开面板会看到「本月 0 元」而账户里明明刚扣过钱。
 */
export function monthRange(nowMs: number, offsetHours = 8): { month: string; from: string; to: string } {
    const shifted = new Date(nowMs + offsetHours * 3_600_000);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth();
    const fromMs = Date.UTC(y, m, 1) - offsetHours * 3_600_000;
    const toMs = Date.UTC(y, m + 1, 1) - offsetHours * 3_600_000;
    return {
        month: `${y}-${String(m + 1).padStart(2, '0')}`,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
    };
}

export function monthlyUsageByService(
    userId: string,
    nowMs = Date.now(),
    d: Database.Database = getDb()
): MonthlyUsage {
    const { month, from, to } = monthRange(nowMs);
    const rows = d
        .prepare(
            `SELECT json_extract(meta, '$.service') AS service,
                    SUM(COALESCE(json_extract(meta, '$.billedCents'), -amountCents)) AS cents,
                    COUNT(*)          AS calls
               FROM wallet_ledger
              WHERE userId = ?
                AND kind = 'service_spend'
                AND ts >= ? AND ts < ?
                AND (json_extract(meta, '$.phase') IS NULL OR json_extract(meta, '$.phase') = 'settle')
              GROUP BY service
              ORDER BY cents DESC`
        )
        .all(userId, from, to) as { service: string | null; cents: number; calls: number }[];

    const services = rows
        // service 落空 = 有人写了一行没带 meta.service 的消费流水。归到「其他」比丢掉好：
        // 面板上的分项加起来必须等于总额，否则用户会以为我们少报了消费。
        .map((r) => ({ service: r.service ?? 'other', cents: r.cents, calls: r.calls }));

    return {
        month,
        from,
        to,
        services,
        totalCents: services.reduce((sum, s) => sum + s.cents, 0),
    };
}
