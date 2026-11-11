import crypto from 'crypto';
import { promises as fsp } from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { getDb, withTransaction } from '@/lib/db';
import { getCredits, isMgmtConfigured } from '@/lib/openrouter-mgmt';
import { getVendorConfig } from '@/lib/gateway/config';
import { findPricing } from '@/lib/gateway/pricing';
import { signedForm } from '@/lib/sms-auth';

/**
 * 成本台账（dev-board#219）：外部服务的余额、日耗与「还能撑几天」。
 *
 * 它要防的事故只有一个：**用户把钱充进了我们平台，而我们没及时给上游充值，
 * 用户的服务断掉**。所以这里的一切取舍都以「预警可靠」优先于「数字精确」——
 * 日耗是估算、余额可能是手填的旧值，但「快见底了」这个信号必须尽早出现。
 *
 * ## 目录钉在代码里，账目落在库里
 *
 * 哪些服务、什么币种、余额从哪自动拉，这些是**产品事实**，随代码走（CATALOG）；
 * 余额数字、续费日期、预警阈值这些是**账目状态**，落 cost_account 表。
 * 手工 INSERT 一行目录出来的「服务」没有任何取数与推算逻辑对得上它，只能是死行。
 *
 * ## 日耗从哪来（按可信度排序）
 *
 * 1. 手动指定（burnOverrideMinorPerDay）——维护者说了算。
 * 2. OpenRouter 的累计用量差（快照存 total_usage，两点相减除以天数）——上游权威计量。
 * 3. 余额快照的降幅和（相邻快照间只累计下降，充值造成的上升不冲抵消耗）。
 * 4. 网关流水推算（wallet_ledger 里 7 天的 units × 采购成本单价）——只覆盖经网关的部分，
 *    国际站的同名消耗、以及不走网关的开销（短信、服务器续费）都不在里面，所以排最后。
 */

export type CostKind = 'prepaid' | 'subscription';
/** POINT/CALL 是「点数/次数」型余额：minor 值就是整数个数，没有小数位 */
export type CostCurrency = 'CNY' | 'USD' | 'POINT' | 'CALL';
export type AutoSource = 'openrouter' | 'aliyun_bss';

export interface CostCatalogEntry {
    service: string;
    name: string;
    kind: CostKind;
    currency: CostCurrency;
    autoSource: AutoSource | null;
    /** wallet_ledger 里映射到这个账户的网关 service 键（用于流水推算日耗） */
    gatewayServices: string[];
    /** 去哪查真实余额 / 去哪充值，给维护者看的一句话 */
    checkHint: string;
}

/**
 * 服务目录。新接一家付费上游时**在这里加一行**（发版行为），别去改库。
 *
 * 两台服务器（阿里云余额、ECS 续费）也在册：它们的续费从阿里云余额里扣，
 * 所以它们的月成本只做分摊展示、不重复计入汇总——阿里云那行的余额降幅已经含了它们。
 */
export const COST_CATALOG: CostCatalogEntry[] = [
    {
        service: 'openrouter',
        name: 'OpenRouter（AI 模型）',
        kind: 'prepaid',
        currency: 'USD',
        autoSource: 'openrouter',
        gatewayServices: [],
        checkHint: '余额与用量自动拉取（Management Key）。充值：openrouter.ai/settings/credits',
    },
    {
        service: 'aliyun',
        name: '阿里云大陆站（听悟 / 短信 / OCR / OSS / 服务器续费）',
        kind: 'prepaid',
        currency: 'CNY',
        autoSource: 'aliyun_bss',
        gatewayServices: ['asr', 'ocr'],
        checkHint: '账户 1376368437491447，全部大陆站服务从同一余额扣。充值：usercenter2.aliyun.com',
    },
    {
        service: 'pkulaw',
        name: '北大法宝（MCP 点数）',
        kind: 'prepaid',
        currency: 'POINT',
        autoSource: null,
        gatewayServices: ['pkulaw'],
        checkHint: '剩余点数看 mcp.pkulaw.com 控制台（无查询接口，需手动记录）',
    },
    {
        service: 'qichacha',
        name: '企查查（接口次数）',
        kind: 'prepaid',
        currency: 'CALL',
        autoSource: null,
        gatewayServices: ['qichacha'],
        checkHint: '剩余次数看企查查开放平台 / agent.qcc.com 控制台（需手动记录）',
    },
    {
        service: 'bocha',
        name: '博查搜索',
        kind: 'prepaid',
        currency: 'CNY',
        autoSource: null,
        gatewayServices: ['search'],
        checkHint: '余额看博查开放平台控制台（返回 403 通常就是余额见底，需手动记录）',
    },
    {
        service: 'tushare',
        name: 'Tushare（年度订阅）',
        kind: 'subscription',
        currency: 'CNY',
        autoSource: null,
        gatewayServices: ['tushare'],
        checkHint: '按年订阅，到期日看 tushare.pro 个人中心；这里只盯续费日期',
    },
    {
        service: 'server-bj',
        name: '北京 ECS（官网大陆源站 + 云后端）',
        kind: 'subscription',
        currency: 'CNY',
        autoSource: null,
        gatewayServices: [],
        checkHint: '包年包月，续费从阿里云余额扣；到期日看 ECS 控制台。月成本只做分摊展示',
    },
    {
        service: 'server-sg',
        name: '新加坡 ECS（国际站 + 镜像）',
        kind: 'subscription',
        currency: 'CNY',
        autoSource: null,
        gatewayServices: [],
        checkHint: '包年包月（国际站账号），到期日看国际站 ECS 控制台。月成本只做分摊展示',
    },
];

const CATALOG_BY_SERVICE = new Map(COST_CATALOG.map((e) => [e.service, e]));

export function findCatalogEntry(service: string): CostCatalogEntry | null {
    return CATALOG_BY_SERVICE.get(service) ?? null;
}

// ---------------------------------------------------------------------------
// 库表读写
// ---------------------------------------------------------------------------

interface AccountRow {
    service: string;
    balanceMinor: number | null;
    balanceAt: string | null;
    balanceSource: 'auto' | 'manual' | null;
    monthlyCostCents: number | null;
    expiresAt: string | null;
    burnOverrideMinorPerDay: number | null;
    alertDays: number;
    note: string | null;
    updatedAt: string;
}

const EMPTY_ROW: Omit<AccountRow, 'service' | 'updatedAt'> = {
    balanceMinor: null,
    balanceAt: null,
    balanceSource: null,
    monthlyCostCents: null,
    expiresAt: null,
    burnOverrideMinorPerDay: null,
    alertDays: 14,
    note: null,
};

function readRow(d: Database.Database, service: string): AccountRow | null {
    const row = d.prepare('SELECT * FROM cost_account WHERE service = ?').get(service) as
        | AccountRow
        | undefined;
    return row ?? null;
}

function ensureRow(d: Database.Database, service: string, nowIso: string): AccountRow {
    const existing = readRow(d, service);
    if (existing) return existing;
    d.prepare('INSERT INTO cost_account (service, alertDays, updatedAt) VALUES (?, 14, ?)').run(
        service,
        nowIso
    );
    return readRow(d, service)!;
}

export interface SnapshotView {
    ts: string;
    balanceMinor: number;
    usageMinor: number | null;
    source: 'auto' | 'manual';
}

/**
 * 记一次余额快照并同步 cost_account 的现值。
 *
 * 自动快照做了去噪：余额没变且距上一条不足 20 小时就不落新行——cron 每天打一次，
 * 但手动点「立即刷新」可能一天点很多次，快照表不该被点成心电图。
 * 手动录入**永远落行**：维护者刚抄来的数字就是要留痕的那种数字。
 */
function recordBalance(
    d: Database.Database,
    service: string,
    balanceMinor: number,
    usageMinor: number | null,
    source: 'auto' | 'manual',
    nowIso: string
): void {
    ensureRow(d, service, nowIso);
    const last = d
        .prepare('SELECT ts, balanceMinor, usageMinor FROM cost_snapshot WHERE service = ? ORDER BY ts DESC LIMIT 1')
        .get(service) as { ts: string; balanceMinor: number; usageMinor: number | null } | undefined;
    const skip =
        source === 'auto' &&
        last &&
        last.balanceMinor === balanceMinor &&
        (last.usageMinor ?? null) === (usageMinor ?? null) &&
        Date.parse(nowIso) - Date.parse(last.ts) < 20 * 3_600_000;
    if (!skip) {
        d.prepare(
            'INSERT INTO cost_snapshot (service, ts, balanceMinor, usageMinor, source) VALUES (?, ?, ?, ?, ?)'
        ).run(service, nowIso, balanceMinor, usageMinor, source);
    }
    d.prepare(
        'UPDATE cost_account SET balanceMinor = ?, balanceAt = ?, balanceSource = ?, updatedAt = ? WHERE service = ?'
    ).run(balanceMinor, nowIso, source, nowIso, service);
}

export interface UpdateCostAccountInput {
    service: string;
    /** 手动录入的当前余额（minor 单位：分 / 美分 / 点 / 次）。undefined = 不动余额 */
    balanceMinor?: number;
    monthlyCostCents?: number | null;
    expiresAt?: string | null;
    burnOverrideMinorPerDay?: number | null;
    alertDays?: number;
    note?: string | null;
    nowIso?: string;
}

export function updateCostAccount(input: UpdateCostAccountInput): void {
    const entry = findCatalogEntry(input.service);
    if (!entry) throw new Error(`未知的成本账户：${input.service}`);
    const nowIso = input.nowIso ?? new Date().toISOString();
    withTransaction((d) => {
        ensureRow(d, input.service, nowIso);
        if (input.balanceMinor !== undefined) {
            recordBalance(d, input.service, input.balanceMinor, null, 'manual', nowIso);
        }
        const sets: string[] = [];
        const args: unknown[] = [];
        const assign = (col: string, value: unknown) => {
            sets.push(`${col} = ?`);
            args.push(value);
        };
        if (input.monthlyCostCents !== undefined) assign('monthlyCostCents', input.monthlyCostCents);
        if (input.expiresAt !== undefined) assign('expiresAt', input.expiresAt);
        if (input.burnOverrideMinorPerDay !== undefined)
            assign('burnOverrideMinorPerDay', input.burnOverrideMinorPerDay);
        if (input.alertDays !== undefined) assign('alertDays', input.alertDays);
        if (input.note !== undefined) assign('note', input.note);
        if (sets.length > 0) {
            assign('updatedAt', nowIso);
            args.push(input.service);
            d.prepare(`UPDATE cost_account SET ${sets.join(', ')} WHERE service = ?`).run(...args);
        }
    });
}

// ---------------------------------------------------------------------------
// 日耗推算
// ---------------------------------------------------------------------------

export type BurnBasis = 'override' | 'usage' | 'snapshots' | 'gateway';

interface BurnEstimate {
    minorPerDay: number;
    basis: BurnBasis;
}

const DAY_MS = 86_400_000;

/**
 * 从快照时间线推日耗。区间口径 30 天、至少两条快照且跨度过半天——
 * 一天里的两条快照相减放大到「每天」，噪声会大到没法看。
 *
 * 只累计**下降**：充值让余额上升，那不是负消耗；相邻快照间涨了就记 0。
 * 代价是「同一区间里既充了值又消耗了」的那一段会把消耗低估成 0，
 * 快照按天打的话这个窗口最多一天，可接受。
 */
function snapshotBurn(
    d: Database.Database,
    service: string,
    nowMs: number
): { balanceBurn: number | null; usageBurn: number | null } {
    const fromIso = new Date(nowMs - 30 * DAY_MS).toISOString();
    const rows = d
        .prepare(
            'SELECT ts, balanceMinor, usageMinor FROM cost_snapshot WHERE service = ? AND ts >= ? ORDER BY ts ASC'
        )
        .all(service, fromIso) as { ts: string; balanceMinor: number; usageMinor: number | null }[];
    if (rows.length < 2) return { balanceBurn: null, usageBurn: null };
    const first = rows[0];
    const last = rows[rows.length - 1];
    const spanDays = (Date.parse(last.ts) - Date.parse(first.ts)) / DAY_MS;
    if (spanDays < 0.5) return { balanceBurn: null, usageBurn: null };

    let decreases = 0;
    for (let i = 1; i < rows.length; i++) {
        decreases += Math.max(0, rows[i - 1].balanceMinor - rows[i].balanceMinor);
    }
    const balanceBurn = decreases / spanDays;

    let usageBurn: number | null = null;
    if (first.usageMinor !== null && last.usageMinor !== null && last.usageMinor >= first.usageMinor) {
        usageBurn = (last.usageMinor - first.usageMinor) / spanDays;
    }
    return { balanceBurn, usageBurn };
}

/**
 * 从网关流水推日耗（近 7 天）。CNY 账户推**采购成本**（units × costCentsPerUnit），
 * 点数/次数账户推**用量本身**（1 次调用按 1 点/1 次计——法宝的真实点数汇率
 * 我们拿不到，宁可让维护者用「手动指定日耗」覆盖，也不编一个假汇率）。
 */
function gatewayBurn(d: Database.Database, entry: CostCatalogEntry, nowMs: number): number | null {
    if (entry.gatewayServices.length === 0) return null;
    const fromIso = new Date(nowMs - 7 * DAY_MS).toISOString();
    const placeholders = entry.gatewayServices.map(() => '?').join(', ');
    const rows = d
        .prepare(
            `SELECT json_extract(meta, '$.service') AS service,
                    json_extract(meta, '$.op')      AS op,
                    SUM(json_extract(meta, '$.units')) AS units
               FROM wallet_ledger
              WHERE kind = 'service_spend'
                AND ts >= ?
                AND json_extract(meta, '$.service') IN (${placeholders})
                AND (json_extract(meta, '$.phase') IS NULL OR json_extract(meta, '$.phase') = 'settle')
              GROUP BY service, op`
        )
        .all(fromIso, ...entry.gatewayServices) as { service: string; op: string | null; units: number | null }[];
    if (rows.length === 0) return null;

    let total = 0;
    for (const r of rows) {
        const units = r.units ?? 0;
        if (units <= 0) continue;
        if (entry.currency === 'POINT' || entry.currency === 'CALL') {
            total += units;
        } else {
            const pricing = findPricing(r.service, r.op ?? '*', d);
            if (pricing) total += units * pricing.costCentsPerUnit;
        }
    }
    return total / 7;
}

function estimateBurn(
    d: Database.Database,
    entry: CostCatalogEntry,
    row: AccountRow | null,
    nowMs: number
): BurnEstimate | null {
    if (row?.burnOverrideMinorPerDay != null) {
        return { minorPerDay: row.burnOverrideMinorPerDay, basis: 'override' };
    }
    const { balanceBurn, usageBurn } = snapshotBurn(d, entry.service, nowMs);
    if (entry.autoSource === 'openrouter' && usageBurn !== null) {
        return { minorPerDay: usageBurn, basis: 'usage' };
    }
    if (balanceBurn !== null) return { minorPerDay: balanceBurn, basis: 'snapshots' };
    const fromGateway = gatewayBurn(d, entry, nowMs);
    if (fromGateway !== null) return { minorPerDay: fromGateway, basis: 'gateway' };
    return null;
}

// ---------------------------------------------------------------------------
// 汇总视图
// ---------------------------------------------------------------------------

export interface CostAccountView extends CostCatalogEntry {
    balanceMinor: number | null;
    balanceAt: string | null;
    balanceSource: 'auto' | 'manual' | null;
    monthlyCostCents: number | null;
    expiresAt: string | null;
    burnOverrideMinorPerDay: number | null;
    alertDays: number;
    note: string | null;
    /** 估算日耗（minor/天）与推算依据；null = 没有任何依据可推 */
    burnMinorPerDay: number | null;
    burnBasis: BurnBasis | null;
    /** 预付：余额 / 日耗；订阅：距到期日的天数。null = 缺数据算不出 */
    daysLeft: number | null;
    alerting: boolean;
    /** 自动取数是否已配好（openrouter：Management Key；aliyun：账单子用户 AK） */
    autoConfigured: boolean;
    snapshots: SnapshotView[];
}

function autoConfigured(entry: CostCatalogEntry): boolean {
    if (entry.autoSource === 'openrouter') return isMgmtConfigured();
    if (entry.autoSource === 'aliyun_bss') {
        const cfg = getVendorConfig();
        return !!(cfg.billingAccessKeyId && cfg.billingAccessKeySecret);
    }
    return false;
}

export function listCostAccounts(nowMs = Date.now()): CostAccountView[] {
    const d = getDb();
    return COST_CATALOG.map((entry) => {
        const row = readRow(d, entry.service);
        const burn = estimateBurn(d, entry, row, nowMs);
        const balanceMinor = row?.balanceMinor ?? null;

        let daysLeft: number | null = null;
        if (entry.kind === 'subscription') {
            const expires = row?.expiresAt ? Date.parse(row.expiresAt) : NaN;
            if (Number.isFinite(expires)) daysLeft = (expires - nowMs) / DAY_MS;
        } else if (balanceMinor !== null && burn && burn.minorPerDay > 0) {
            daysLeft = balanceMinor / burn.minorPerDay;
        }

        const alertDays = row?.alertDays ?? EMPTY_ROW.alertDays;
        const snapshots = d
            .prepare(
                'SELECT ts, balanceMinor, usageMinor, source FROM cost_snapshot WHERE service = ? ORDER BY ts DESC LIMIT 12'
            )
            .all(entry.service) as SnapshotView[];

        return {
            ...entry,
            balanceMinor,
            balanceAt: row?.balanceAt ?? null,
            balanceSource: row?.balanceSource ?? null,
            monthlyCostCents: row?.monthlyCostCents ?? null,
            expiresAt: row?.expiresAt ?? null,
            burnOverrideMinorPerDay: row?.burnOverrideMinorPerDay ?? null,
            alertDays,
            note: row?.note ?? null,
            burnMinorPerDay: burn?.minorPerDay ?? null,
            burnBasis: burn?.basis ?? null,
            daysLeft,
            alerting: daysLeft !== null && daysLeft <= alertDays,
            autoConfigured: autoConfigured(entry),
            snapshots,
        };
    });
}

/** 近 7 天平台代采明细（按网关 service 聚合）：调用量、采购成本、Credits 实收 */
export interface GatewayCostRow {
    service: string;
    calls: number;
    units: number;
    unit: string | null;
    rawCostCents: number | null;
    chargedCents: number;
}

/**
 * 任意 `[from, to)` 窗口内的网关代采明细。
 *
 * 抽出来是给账目公开用的（lib/transparency-auto.ts 要按半年期次取数），
 * `gatewayCostDetail()` 变成它的一个调用点——「近 N 天」。两处共用同一条 SQL
 * 与同一套成本推算：复制一份的话，改了计价规则只改一处，两个界面的数字就会打架。
 *
 * @param toIso 窗口右端（**不含**）。null = 一直到现在。
 */
export function gatewayCostWindow(fromIso: string, toIso: string | null): GatewayCostRow[] {
    const d = getDb();
    const rows = d
        .prepare(
            `SELECT json_extract(meta, '$.service') AS service,
                    json_extract(meta, '$.op')      AS op,
                    json_extract(meta, '$.unit')    AS unit,
                    SUM(json_extract(meta, '$.units')) AS units,
                    COUNT(*)           AS calls,
                    SUM(-amountCents)  AS chargedCents
               FROM wallet_ledger
              WHERE kind = 'service_spend'
                AND ts >= ?
                AND (? IS NULL OR ts < ?)
                AND (json_extract(meta, '$.phase') IS NULL OR json_extract(meta, '$.phase') = 'settle')
              GROUP BY service, op`
        )
        .all(fromIso, toIso, toIso) as {
        service: string | null;
        op: string | null;
        unit: string | null;
        units: number | null;
        calls: number;
        chargedCents: number;
    }[];

    const byService = new Map<string, GatewayCostRow>();
    for (const r of rows) {
        const service = r.service ?? 'other';
        const agg = byService.get(service) ?? {
            service,
            calls: 0,
            units: 0,
            unit: r.unit,
            rawCostCents: 0,
            chargedCents: 0,
        };
        agg.calls += r.calls;
        agg.units += r.units ?? 0;
        agg.chargedCents += r.chargedCents;
        // 成本单价查不到定价行时整行成本记为未知（null），而不是把查得到的部分加一加
        // 冒充总成本——半个成本比没有成本更会误导毛利判断
        if (agg.rawCostCents !== null) {
            const pricing = r.service ? findPricing(r.service, r.op ?? '*', d) : null;
            agg.rawCostCents = pricing ? agg.rawCostCents + (r.units ?? 0) * pricing.costCentsPerUnit : null;
        }
        byService.set(service, agg);
    }
    return [...byService.values()].sort((a, b) => b.chargedCents - a.chargedCents);
}

export function gatewayCostDetail(nowMs = Date.now(), days = 7): GatewayCostRow[] {
    return gatewayCostWindow(new Date(nowMs - days * DAY_MS).toISOString(), null);
}

// ---------------------------------------------------------------------------
// 自动取数
// ---------------------------------------------------------------------------

/** 阿里云 BSS QueryAccountBalance（V1 RPC 签名，与短信同一套配方）。返回：分 */
async function fetchAliyunBalanceCents(): Promise<number> {
    const cfg = getVendorConfig();
    if (!cfg.billingAccessKeyId || !cfg.billingAccessKeySecret) {
        throw new Error('未配置账单查询凭证（GW_BILLING_AK_ID / GW_BILLING_AK_SECRET）');
    }
    const params: Record<string, string> = {
        Action: 'QueryAccountBalance',
        Version: '2017-12-14',
        Format: 'JSON',
        AccessKeyId: cfg.billingAccessKeyId,
        SignatureMethod: 'HMAC-SHA1',
        SignatureVersion: '1.0',
        SignatureNonce: crypto.randomUUID(),
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
    const res = await fetch('https://business.aliyuncs.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: signedForm(params, cfg.billingAccessKeySecret),
        signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as {
        Code?: string;
        Message?: string;
        Data?: { AvailableAmount?: string; Currency?: string };
    } | null;
    // BSS 的成功信封是 Code:"200"；失败时 Code 是错误码字符串（HTTP 状态也非 200）
    if (!res.ok || !json || json.Code !== '200') {
        throw new Error(`QueryAccountBalance 失败：${json?.Code ?? res.status} ${json?.Message ?? ''}`.trim());
    }
    // 金额是字符串且可能带千分位逗号（"1,234.56"）
    const amount = Number(String(json.Data?.AvailableAmount ?? '').replace(/,/g, ''));
    if (!Number.isFinite(amount)) {
        throw new Error(`QueryAccountBalance 返回的金额无法解析：${json.Data?.AvailableAmount ?? '(空)'}`);
    }
    return Math.round(amount * 100);
}

export interface RefreshResult {
    refreshed: { service: string; balanceMinor: number }[];
    errors: { service: string; message: string }[];
}

/**
 * 拉一轮自动余额并落快照。**一家失败不拖累另一家**——错误逐家收进 errors 返回，
 * cron 日志与后台页都能看到具体是哪家、什么原因。
 */
export async function refreshAutoBalances(nowMs = Date.now()): Promise<RefreshResult> {
    const nowIso = new Date(nowMs).toISOString();
    const refreshed: RefreshResult['refreshed'] = [];
    const errors: RefreshResult['errors'] = [];

    for (const entry of COST_CATALOG) {
        if (!entry.autoSource) continue;
        try {
            let balanceMinor: number;
            let usageMinor: number | null = null;
            if (entry.autoSource === 'openrouter') {
                const credits = await getCredits();
                balanceMinor = Math.round(credits.remainingUsd * 100);
                usageMinor = Math.round(credits.totalUsageUsd * 100);
            } else {
                balanceMinor = await fetchAliyunBalanceCents();
            }
            withTransaction((d) => recordBalance(d, entry.service, balanceMinor, usageMinor, 'auto', nowIso));
            refreshed.push({ service: entry.service, balanceMinor });
        } catch (e) {
            errors.push({ service: entry.service, message: e instanceof Error ? e.message : String(e) });
        }
    }
    return { refreshed, errors };
}

// ---------------------------------------------------------------------------
// 预警邮件
// ---------------------------------------------------------------------------

const ALERT_THROTTLE_MS = 72 * 3_600_000;

/**
 * 有账户跌破阈值时给维护者发一封提醒（Resend，与邮箱验证码同通道）。
 *
 * 未配 AWD_COST_ALERT_EMAIL 或本站没有 Resend 密钥就静默跳过——预警的主战场是
 * cron + 邮件，但后台页上的红色行不依赖这里，邮件只是「没人开后台也能知道」的兜底。
 * 72 小时内不重发：余额见底后每天一封只会被当垃圾邮件屏蔽，反而错过真正的变化。
 */
export async function maybeSendCostAlert(
    accounts: CostAccountView[],
    nowMs = Date.now()
): Promise<{ sent: boolean; reason: string }> {
    const alerting = accounts.filter((a) => a.alerting);
    if (alerting.length === 0) return { sent: false, reason: 'no_alerts' };

    const to = process.env.AWD_COST_ALERT_EMAIL || '';
    const apiKey = process.env.AWD_MAIL_RESEND_KEY || '';
    const from = process.env.AWD_MAIL_FROM || '';
    if (!to || !apiKey || !from) return { sent: false, reason: 'not_configured' };

    const d = getDb();
    const last = d
        .prepare("SELECT ts FROM admin_audit WHERE action = 'cost_alert_emailed' ORDER BY ts DESC LIMIT 1")
        .get() as { ts: string } | undefined;
    if (last && nowMs - Date.parse(last.ts) < ALERT_THROTTLE_MS) {
        return { sent: false, reason: 'throttled' };
    }

    const lines = alerting.map((a) => {
        const days = a.daysLeft === null ? '?' : String(Math.max(0, Math.floor(a.daysLeft)));
        const what = a.kind === 'subscription' ? '距到期' : '按当前日耗预计可用';
        return `- ${a.name}：${what}约 ${days} 天（阈值 ${a.alertDays} 天）。${a.checkHint}`;
    });
    const subject = `[AI WorkDeck] 外部服务余额预警：${alerting.length} 项需要充值/续费`;
    const text =
        `以下外部服务即将见底或到期，请尽快充值/续费，避免用户侧服务中断：\n\n` +
        `${lines.join('\n')}\n\n` +
        `明细与手动记账：官网后台「成本台账」页。\n`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(10_000),
    });
    if (res.status < 200 || res.status >= 300) {
        const body = await res.text().catch(() => '');
        return { sent: false, reason: `send_failed_${res.status}:${body.slice(0, 200)}` };
    }
    d.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
        new Date(nowMs).toISOString(),
        'cost_alert_emailed',
        JSON.stringify({ to, services: alerting.map((a) => a.service) })
    );
    return { sent: true, reason: 'sent' };
}

// ---------------------------------------------------------------------------
// 存储用量（手机端云中转，纯展示，不入账目）
// ---------------------------------------------------------------------------

/**
 * 手机端现场影像/录音走云中转，blob 落在 ECS 本地盘（桌面端 ACK 即删 + 30 天 TTL 兜底），
 * 不走 OSS——这里只是让维护者看到磁盘占用没有失控增长，不是账目行，不进 COST_CATALOG。
 */
export interface RelayStorageUsage {
    bytes: number;
    fileCount: number;
    diskFreeBytes: number;
    diskTotalBytes: number;
    measuredAt: string;
}

const RELAY_DEFAULT_DIR = '/opt/aiworkdeck/cloud/data/mobile-relay';
const RELAY_CACHE_MS = 10 * 60_000;
let relayCache: { at: number; value: RelayStorageUsage | null } | null = null;

/** 递归汇总目录下所有文件的字节数与件数；子路径读取失败（文件在统计期间被删等）直接跳过 */
async function walkDirUsage(dir: string): Promise<{ bytes: number; fileCount: number }> {
    let bytes = 0;
    let fileCount = 0;
    let entries: import('fs').Dirent[];
    try {
        entries = await fsp.readdir(dir, { withFileTypes: true, encoding: 'utf8' });
    } catch {
        return { bytes, fileCount };
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        try {
            if (entry.isDirectory()) {
                const sub = await walkDirUsage(full);
                bytes += sub.bytes;
                fileCount += sub.fileCount;
            } else if (entry.isFile()) {
                const st = await fsp.stat(full);
                bytes += st.size;
                fileCount += 1;
            }
        } catch {
            // 桌面端 ACK 即删是常态，统计途中文件消失属预期，跳过即可
        }
    }
    return { bytes, fileCount };
}

/**
 * 中转目录用量 + 所在卷的磁盘余量/总量。目录不存在或无权限（本机没部署云后端）返回
 * null，不抛错——这一项缺失不该拖垮整个成本台账接口。模块级缓存 10 分钟，
 * admin 页每次刷新不必都全盘 walk 一遍。
 */
export async function relayStorageUsage(nowMs = Date.now()): Promise<RelayStorageUsage | null> {
    if (relayCache && nowMs - relayCache.at < RELAY_CACHE_MS) {
        return relayCache.value;
    }
    const dir = process.env.AWD_RELAY_DATA_DIR || RELAY_DEFAULT_DIR;
    let value: RelayStorageUsage | null = null;
    try {
        const { bytes, fileCount } = await walkDirUsage(dir);
        const stat = await fsp.statfs(dir);
        value = {
            bytes,
            fileCount,
            diskFreeBytes: stat.bavail * stat.bsize,
            diskTotalBytes: stat.blocks * stat.bsize,
            measuredAt: new Date(nowMs).toISOString(),
        };
    } catch {
        value = null;
    }
    relayCache = { at: nowMs, value };
    return value;
}

/**
 * 手机影像云中转的 OSS 桶用量（dev-board#236：中转 blob 已从 ECS 本地盘迁 OSS）。
 * 走 OSS GetBucketStat（V1 header 签名），凭证 = 与云后端同一个 RAM 子用户
 * awd-mobile-relay（策略里带 oss:GetBucketStat）。env 未配（国际站 OSS 未开通）
 * 或请求失败返回 null。缓存 10 分钟，口径同 relayStorageUsage。
 */
export interface RelayOssUsage {
    bucket: string;
    bytes: number;
    objectCount: number;
    measuredAt: string;
}

let relayOssCache: { at: number; value: RelayOssUsage | null } | null = null;

export async function relayOssUsage(nowMs = Date.now()): Promise<RelayOssUsage | null> {
    if (relayOssCache && nowMs - relayOssCache.at < RELAY_CACHE_MS) {
        return relayOssCache.value;
    }
    const endpoint = process.env.AWD_RELAY_OSS_ENDPOINT || '';
    const bucket = process.env.AWD_RELAY_OSS_BUCKET || '';
    const akId = process.env.AWD_RELAY_OSS_AK_ID || '';
    const akSecret = process.env.AWD_RELAY_OSS_AK_SECRET || '';
    let value: RelayOssUsage | null = null;
    if (endpoint && bucket && akId && akSecret) {
        try {
            const date = new Date(nowMs).toUTCString();
            const toSign = `GET\n\n\n${date}\n/${bucket}/?stat`;
            const sig = crypto.createHmac('sha1', akSecret).update(toSign).digest('base64');
            const res = await fetch(`https://${bucket}.${endpoint}/?stat`, {
                headers: { Date: date, Authorization: `OSS ${akId}:${sig}` },
                signal: AbortSignal.timeout(8000),
            });
            if (res.ok) {
                const xml = await res.text();
                const storage = /<Storage>(\d+)<\/Storage>/.exec(xml);
                const count = /<ObjectCount>(\d+)<\/ObjectCount>/.exec(xml);
                if (storage && count) {
                    value = {
                        bucket,
                        bytes: Number(storage[1]),
                        objectCount: Number(count[1]),
                        measuredAt: new Date(nowMs).toISOString(),
                    };
                }
            }
        } catch {
            value = null;
        }
    }
    relayOssCache = { at: nowMs, value };
    return value;
}
