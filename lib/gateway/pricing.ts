import type Database from 'better-sqlite3';
import { getDb, withTransaction } from '@/lib/db';
import { GatewayError } from './errors';

/**
 * 计价：service_pricing 表是**唯一权威**。
 *
 * 两条并列的红线（设计 §4.2）：
 * - **客户端永远不传价格**。同广场付费项那条：信前端传来的 priceCents，
 *   等于让客户端决定闸门何时生效。
 * - **客户端申报的计量数量同样不可信**。ASR 的 durationSec 是桌面端算出来的，
 *   转码取时长失败会回落、也可以被直接改。申报值只用于预扣估算与余额闸，
 *   且受 maxUnitsPerCall 硬约束；**计价一律以上游返回的真实计量为准**。
 */

export type PricingUnit = 'minute' | 'page' | 'call' | 'kchar' | 'gb';

export interface PricingRow {
    service: string;
    op: string;
    unit: PricingUnit;
    costCentsPerUnit: number;
    marginMultiplier: number;
    creditsPerUnit: number;
    maxUnitsPerCall: number;
    enabled: boolean;
    updatedAt: string;
}

interface RawRow extends Omit<PricingRow, 'enabled'> {
    enabled: number;
}

function toRow(r: RawRow): PricingRow {
    return { ...r, enabled: r.enabled === 1 };
}

/**
 * 查一条定价。`op` 精确匹配优先，落空回退到该服务的 `*` 通配行。
 * 两者都没有 = 我们从没给这个服务建过定价行，属配置缺失而不是「未开放」。
 */
export function findPricing(service: string, op: string, d: Database.Database = getDb()): PricingRow | null {
    const exact = d
        .prepare('SELECT * FROM service_pricing WHERE service = ? AND op = ?')
        .get(service, op) as RawRow | undefined;
    if (exact) return toRow(exact);
    const wildcard = d
        .prepare("SELECT * FROM service_pricing WHERE service = ? AND op = '*'")
        .get(service) as RawRow | undefined;
    return wildcard ? toRow(wildcard) : null;
}

export function listPricing(d: Database.Database = getDb()): PricingRow[] {
    const rows = d
        .prepare('SELECT * FROM service_pricing ORDER BY service, op')
        .all() as RawRow[];
    return rows.map(toRow);
}

/**
 * 取一条**可用**的定价：不存在 → not_configured；enabled=0 → service_disabled。
 *
 * 这两个必须分开：前者是我们漏建了行（运维问题），后者是「合同还没谈成/账号还没开通」
 * 这个有定义的产品状态，桌面端要显示「未开放」并给「改用自己的 Key」的入口，
 * 而不是显示一个像故障的错误。
 */
export function requireEnabledPricing(service: string, op: string, d: Database.Database = getDb()): PricingRow {
    const row = findPricing(service, op, d);
    if (!row) {
        throw new GatewayError('not_configured', `平台尚未配置「${service}」服务的计价`, { service, op });
    }
    if (!row.enabled) {
        throw new GatewayError('service_disabled', `「${service}」暂未开放，可改用自己的 Key`, {
            service,
            op,
        });
    }
    return row;
}

/**
 * 计量数量 → Credits（分），向上取整。
 *
 * 向上取整而不是四舍五入：一次 0.4 分钟的转写按 1 分钟收，是所有按量计费上游的
 * 通行做法（听悟自己也这么算），我们跟着取整才不会出现「按秒付出去、按分钟少收回来」。
 */
export function creditsFor(row: PricingRow, units: number): number {
    if (!Number.isFinite(units) || units <= 0) return 0;
    return Math.ceil(units * row.creditsPerUnit);
}

/**
 * 校验客户端申报的计量数量。超过 maxUnitsPerCall 直接拒，**不放行了再兜底**——
 * 放行意味着我们已经替用户向上游付过费，再去追讨一个可能余额为零的账户。
 */
export function assertUnitsWithinCap(row: PricingRow, units: number): void {
    if (!Number.isFinite(units) || units <= 0) {
        throw new GatewayError('bad_request', `计量数量不合法：${units}`, {
            service: row.service,
            op: row.op,
        });
    }
    if (units > row.maxUnitsPerCall) {
        throw new GatewayError(
            'bad_request',
            `单次调用的用量超出上限（${row.maxUnitsPerCall} ${row.unit}）`,
            { service: row.service, op: row.op, maxUnitsPerCall: row.maxUnitsPerCall }
        );
    }
}

export interface UpsertPricingInput {
    service: string;
    op?: string;
    unit: PricingUnit;
    costCentsPerUnit: number;
    marginMultiplier: number;
    maxUnitsPerCall: number;
    enabled: boolean;
    nowIso?: string;
}

/**
 * 由成本与加价率派生落库单价（分/单位）。**向上取整，不是四舍五入。**
 *
 * Credits 的最小刻度是「分」，而真实成本大多是几分钱的量级：听悟一分钟约 1.64 分，
 * 取整成 2 分之后 × 1.2 = 2.4——`Math.round` 会把它抹回 2 分，即**零毛利**，
 * 而这恰恰是我们最高频的一项服务。取整方向必须站在「派生单价永不低于成本」这一侧：
 * 少收的那半分钱没有任何地方能补回来，多收的半分钱只是把毛利凑到刻度上。
 *
 * 代价是低价项的实际加价率高于名义值（2 分成本、名义 1.2，实收 3 分 = 1.5），
 * 这在按分计价的体系里无解，只能让 admin 页把派生单价与毛利率直接摆出来，
 * 让调价的人看着真实数字决定，而不是以为自己调的是 1.2。
 */
export function deriveCreditsPerUnit(costCentsPerUnit: number, marginMultiplier: number): number {
    return Math.max(0, Math.ceil(costCentsPerUnit * marginMultiplier));
}

/** 写一条定价。creditsPerUnit 由成本 × 加价率算出并落库冗余，避免每次现算。 */
export function upsertPricing(input: UpsertPricingInput): PricingRow {
    const op = input.op ?? '*';
    const creditsPerUnit = deriveCreditsPerUnit(input.costCentsPerUnit, input.marginMultiplier);
    const nowIso = input.nowIso ?? new Date().toISOString();
    return withTransaction((d) => {
        d.prepare(
            `INSERT INTO service_pricing
               (service, op, unit, costCentsPerUnit, marginMultiplier, creditsPerUnit, maxUnitsPerCall, enabled, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (service, op) DO UPDATE SET
               unit = excluded.unit,
               costCentsPerUnit = excluded.costCentsPerUnit,
               marginMultiplier = excluded.marginMultiplier,
               creditsPerUnit = excluded.creditsPerUnit,
               maxUnitsPerCall = excluded.maxUnitsPerCall,
               enabled = excluded.enabled,
               updatedAt = excluded.updatedAt`
        ).run(
            input.service,
            op,
            input.unit,
            input.costCentsPerUnit,
            input.marginMultiplier,
            creditsPerUnit,
            input.maxUnitsPerCall,
            input.enabled ? 1 : 0,
            nowIso
        );
        return findPricing(input.service, op, d)!;
    });
}
