import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { COST_CATALOG, gatewayCostWindow } from '@/lib/cost-ledger';
import { SITE_ID, siteConfigOf } from '@/lib/site-config';
import {
    parsePeriod,
    type CostKey,
    type CostLine,
    type Money,
    type Num,
    type RevenueChannel,
    type RevenueLine,
    type TransparencyReportData,
} from '@/lib/transparency';

/**
 * 账目公开的自动取数（dev-board#611 / #612）。
 *
 * 规矩只有一条：**能从库里/上游查到的数字，一律不让维护者手抄**。手抄的数字
 * 半年填一次，填错了没人对得出来；而「注册用户」「本期收入」这些恰恰是读者
 * 最先看的几个。所以这里把能自动化的全部自动化，剩下的（通道费、捐赠、
 * 发起人前期垫付）明确标成手工项，界面上也这么标。
 *
 * ## 每个数字都带口径说明
 *
 * 「累计安装」不是「用户数」——遥测可关、24 个月滚动清理，它只是**下限**；
 * 「安装包下载」是 GitHub Releases 的累计计数，**分不出期次**。这些限制写进
 * 每个数字的 `note` 一路带到页面上。公开账目里一个没有口径的数字，比没有更糟。
 *
 * ## 两站各记各的账
 *
 * cn 与 intl 是两套独立部署、两个库（见 lib/site-config.ts）。真账目要把两边加起来，
 * 于是有了 `AWD_TRANSPARENCY_SYNC_TOKEN`：两台服务器配同一把共享密钥，
 * 一边通过 `GET /api/transparency/auto` 向另一边要**聚合数字**（没有任何 PII）。
 * 拉不到不是错误——`remote.ok = false` 带着原因回去，后台照样能出本站数字，
 * 界面上写明「国际站数据未拉取」，绝不悄悄少算一半还装作是全量。
 */

// ---------------------------------------------------------------------------
// 形状
// ---------------------------------------------------------------------------

/** 自动取数只覆盖 `TransparencyReportData` 的这三块，其余（捐赠、发起人前期垫付）无从自动。 */
export interface AutoFigures {
    metrics: TransparencyReportData['metrics'];
    revenue: RevenueLine[];
    costs: CostLine[];
}

export interface AutoResult {
    local: AutoFigures;
    remote: { ok: boolean; error?: string };
    merged: AutoFigures;
}

function autoNum(value: number | null, note: string): Num {
    return { value, source: 'auto', note };
}

function autoMoney(cents: number | null, currency: Money['currency'], note: string): Money {
    return { cents, currency, source: 'auto', note };
}

function emptyFigures(): AutoFigures {
    const blank = (): Num => ({ value: null, source: 'manual' });
    return {
        metrics: {
            usersTotal: blank(),
            usersNew: blank(),
            installsTotal: blank(),
            installsActive: blank(),
            downloads: blank(),
        },
        revenue: [],
        costs: [],
    };
}

// ---------------------------------------------------------------------------
// 使用情况
// ---------------------------------------------------------------------------

interface StoredUser {
    createdAt?: string;
    deletedAt?: string;
}

/** 直接读 users.json（与 app/api/admin/overview 同口径）：账号不在 SQLite 里。 */
function readUsersFile(): StoredUser[] {
    try {
        const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'users.json'), 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
    } catch {
        return [];
    }
}

/** ISO 时刻 → UTC+8 的 `YYYY-MM-DD`。telemetry_rollup.date 存的是北京时区的自然日。 */
function beijingDate(iso: string): string {
    return new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);
}

function countUsers(from: string, to: string): { total: number; fresh: number } {
    let total = 0;
    let fresh = 0;
    for (const u of readUsersFile()) {
        if (u.deletedAt) continue;
        const createdAt = u.createdAt;
        if (!createdAt || createdAt >= to) continue;
        total += 1;
        if (createdAt >= from) fresh += 1;
    }
    return { total, fresh };
}

function countInstalls(from: string, to: string, nowMs: number): { total: number; active: number } {
    const d = getDb();
    const toDate = beijingDate(to);
    const total = (
        d
            .prepare('SELECT COUNT(DISTINCT installId) AS n FROM telemetry_rollup WHERE date < ?')
            .get(toDate) as { n: number }
    ).n;

    // 活跃窗口取「期末前 30 天」；期次还没走完时期末就是现在——否则半年报的活跃数
    // 会在期中永远显示 0（未来 30 天当然没有数据）。
    const endMs = Math.min(Date.parse(to), nowMs);
    const activeFromDate = beijingDate(new Date(endMs - 30 * 86400_000).toISOString());
    const activeToDate = beijingDate(new Date(endMs).toISOString());
    const active = (
        d
            .prepare(
                'SELECT COUNT(DISTINCT installId) AS n FROM telemetry_rollup WHERE date >= ? AND date <= ?'
            )
            .get(activeFromDate, activeToDate) as { n: number }
    ).n;
    return { total, active };
}

// ---------------------------------------------------------------------------
// 安装包下载量（GitHub Releases）
// ---------------------------------------------------------------------------

const RELEASES_API = 'https://api.github.com/repos/AI-WorkDeck/aiworkdeck/releases';
const INSTALLER_EXT = ['.dmg', '.exe', '.zip', '.appimage', '.msi', '.pkg'];

/**
 * 全部 release 的安装包资产下载数之和。
 *
 * **只有累计值**：GitHub 不提供按时间切分的下载计数，所以这个数字**跨期不可加、
 * 也不是本期新增**。口径写进 note 一路带到页面。匿名接口 60 次/小时，
 * 这里挂一小时 revalidate；拉不到回 null，宁可不显示也不猜。
 */
async function fetchDownloadCount(): Promise<number | null> {
    try {
        let total = 0;
        // 最多翻 10 页（1000 个 release），够用到下个十年
        for (let page = 1; page <= 10; page++) {
            const res = await fetch(`${RELEASES_API}?per_page=100&page=${page}`, {
                headers: { Accept: 'application/vnd.github+json' },
                signal: AbortSignal.timeout(4000),
                next: { revalidate: 3600, tags: ['transparency-downloads'] },
            });
            if (!res.ok) return null;
            const data = (await res.json()) as Array<{
                assets?: Array<{ name?: string; download_count?: number }>;
            }>;
            if (!Array.isArray(data) || data.length === 0) break;
            for (const rel of data) {
                for (const asset of rel.assets ?? []) {
                    const name = (asset.name ?? '').toLowerCase();
                    if (!INSTALLER_EXT.some((ext) => name.endsWith(ext))) continue;
                    total += asset.download_count ?? 0;
                }
            }
            if (data.length < 100) break;
        }
        return total;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// 收入
// ---------------------------------------------------------------------------

const REVENUE_CHANNEL_SET = new Set<string>(['wxpay', 'wxvp', 'appstore', 'stripe', 'other']);

const CHANNEL_FEE_HINT: Record<RevenueChannel, (grossCents: number, orders: number) => string> = {
    wxpay: (gross) => `建议估算：微信支付费率 0.6% ≈ ¥${((gross * 0.006) / 100).toFixed(2)}，以商户账单为准`,
    wxvp: (gross) => `建议估算：小程序虚拟支付费率 0.6% ≈ ¥${((gross * 0.006) / 100).toFixed(2)}，以商户账单为准`,
    stripe: (gross, orders) =>
        `建议估算：Stripe 2.9% + US$0.30/笔（${orders} 笔）≈ US$${((gross * 0.029 + orders * 30) / 100).toFixed(2)}，以 Stripe 结算报表为准`,
    appstore: (gross) =>
        `建议估算：App Store 抽成 30% ≈ ¥${((gross * 0.3) / 100).toFixed(2)}；小型企业计划为 15%，以 ASC 财务报告为准`,
    other: () => '渠道费需手工填报',
};

function collectRevenue(from: string, to: string): RevenueLine[] {
    const rows = getDb()
        .prepare(
            `SELECT channel, currency, SUM(amountCents) AS gross, COUNT(*) AS orders
               FROM orders
              WHERE status = 'paid'
                AND paidAt >= ? AND paidAt < ?
                AND refundedAt IS NULL
              GROUP BY channel, currency`
        )
        .all(from, to) as Array<{
        channel: string;
        currency: string;
        gross: number;
        orders: number;
    }>;

    const byChannel = new Map<string, typeof rows>();
    for (const r of rows) {
        const list = byChannel.get(r.channel) ?? [];
        list.push(r);
        byChannel.set(r.channel, list);
    }

    const lines: RevenueLine[] = [];
    for (const [channel, group] of byChannel) {
        // 一条通道正常只有一种币种。真出现混币（多半是配置事故）时**不把两种币加在一起**——
        // 那是算术错误。取笔数占多的那种，把被排除的另一种写进 note 让人去查。
        const sorted = [...group].sort((a, b) => b.orders - a.orders);
        const main = sorted[0];
        const currency: Money['currency'] = main.currency === 'USD' ? 'USD' : 'CNY';
        const mixed = sorted.slice(1);
        const key = (REVENUE_CHANNEL_SET.has(channel) ? channel : 'other') as RevenueChannel;
        const noteParts = [`订单表口径：已支付且未退款，共 ${main.orders} 笔`];
        if (mixed.length > 0) {
            noteParts.push(
                `注意：本通道另有 ${mixed
                    .map((m) => `${m.orders} 笔 ${m.currency}`)
                    .join('、')} 的订单未计入，需人工核对`
            );
        }
        lines.push({
            channel: key,
            gross: autoMoney(main.gross, currency, noteParts.join('；')),
            fee: {
                cents: null,
                currency,
                source: 'manual',
                note: CHANNEL_FEE_HINT[key](main.gross, main.orders),
            },
        });
    }
    return lines.sort((a, b) => (b.gross.cents ?? 0) - (a.gross.cents ?? 0));
}

// ---------------------------------------------------------------------------
// 成本
// ---------------------------------------------------------------------------

/** 成本台账的服务键 → 报表科目键。 */
const SERVICE_TO_COST_KEY: Record<string, CostKey> = {
    openrouter: 'openrouter',
    aliyun: 'aliyun_ai',
    pkulaw: 'pkulaw',
    qichacha: 'qichacha',
    bocha: 'bocha',
    tushare: 'tushare',
};

/** 网关流水里的 service 键（asr / ocr / search / …）→ 报表科目键，由目录推导，不另抄一份。 */
const GATEWAY_TO_COST_KEY: Record<string, CostKey> = (() => {
    const map: Record<string, CostKey> = {};
    for (const entry of COST_CATALOG) {
        const key = SERVICE_TO_COST_KEY[entry.service];
        if (!key) continue;
        for (const gs of entry.gatewayServices) map[gs] = key;
    }
    return map;
})();

/**
 * OpenRouter 本期用量 = 期末前最后一条快照的累计用量 − 期初前最后一条。
 * 快照不足两条就回 null：一条快照推不出区间用量，硬拿它当本期消耗会把
 * **开站至今的累计值**说成半年的花费。
 */
function openrouterCostCents(from: string, to: string): { cents: number | null; note: string } {
    const d = getDb();
    const pick = (before: string) =>
        d
            .prepare(
                `SELECT usageMinor FROM cost_snapshot
                  WHERE service = 'openrouter' AND usageMinor IS NOT NULL AND ts < ?
                  ORDER BY ts DESC LIMIT 1`
            )
            .get(before) as { usageMinor: number } | undefined;
    const end = pick(to);
    const start = pick(from);
    if (!end || !start) {
        return { cents: null, note: 'OpenRouter 累计用量快照不足两条，无法推算本期消耗，需手工填报' };
    }
    return {
        cents: Math.max(0, end.usageMinor - start.usageMinor),
        note: 'OpenRouter 累计用量快照差（上游权威计量，美元）',
    };
}

function collectCosts(from: string, to: string): CostLine[] {
    const lines: CostLine[] = [];

    const or = openrouterCostCents(from, to);
    lines.push({ key: 'openrouter', amount: autoMoney(or.cents, 'USD', or.note) });

    // 网关流水推算：本期 units × service_pricing 的采购成本单价（人民币分）。
    // 只覆盖经平台网关的那部分——用户自带 Key 的调用不经过我们，也就不该记进我们的成本。
    const byKey = new Map<CostKey, { cents: number; calls: number }>();
    for (const row of gatewayCostWindow(from, to)) {
        const key = GATEWAY_TO_COST_KEY[row.service];
        if (!key || row.rawCostCents === null) continue;
        const agg = byKey.get(key) ?? { cents: 0, calls: 0 };
        agg.cents += row.rawCostCents;
        agg.calls += row.calls;
        byKey.set(key, agg);
    }
    for (const [key, agg] of byKey) {
        lines.push({
            key,
            amount: autoMoney(
                Math.round(agg.cents),
                'CNY',
                `网关流水推算（本期 ${agg.calls} 次调用 × 采购成本单价）`
            ),
        });
    }

    return lines;
}

// ---------------------------------------------------------------------------
// 本站取数
// ---------------------------------------------------------------------------

export interface CollectOptions {
    includeRemote?: boolean;
    nowMs?: number;
    /** 跳过 GitHub 请求（验证脚本与不需要下载量的调用点用）。 */
    skipDownloads?: boolean;
}

async function collectLocal(period: string, opts: CollectOptions): Promise<AutoFigures> {
    const { from, to } = parsePeriod(period);
    const nowMs = opts.nowMs ?? Date.now();

    const users = countUsers(from, to);
    const installs = countInstalls(from, to, nowMs);
    const downloads = opts.skipDownloads ? null : await fetchDownloadCount();

    return {
        metrics: {
            usersTotal: autoNum(users.total, '本站注册账号累计数（已注销账号不计入）'),
            usersNew: autoNum(users.fresh, '本期内新注册的账号数'),
            installsTotal: autoNum(
                installs.total,
                '遥测口径：匿名安装标识去重。遥测可由用户关闭、且滚动保留 24 个月，此数为下限'
            ),
            installsActive: autoNum(installs.active, '期末前 30 天内有遥测上报的安装数（期次未结束时算到今天）'),
            downloads:
                downloads === null
                    ? { value: null, source: 'manual', note: 'GitHub Releases 下载量未取到，可手工填报' }
                    : autoNum(
                          downloads,
                          'GitHub Releases 全部安装包资产的累计下载数。GitHub 不提供按期次切分，此为开源至今的累计值，不可跨期相加'
                      ),
        },
        revenue: collectRevenue(from, to),
        costs: collectCosts(from, to),
    };
}

// ---------------------------------------------------------------------------
// 跨站合并
// ---------------------------------------------------------------------------

function addNum(a: Num, b: Num): Num {
    if (a.value === null && b.value === null) return a;
    if (a.value === null) return { ...b };
    if (b.value === null) return { ...a };
    return { value: a.value + b.value, source: 'auto', note: `${a.note ?? ''}（两站合计）`.trim() };
}

function mergeFigures(local: AutoFigures, remote: AutoFigures): AutoFigures {
    const merged: AutoFigures = {
        metrics: {
            usersTotal: addNum(local.metrics.usersTotal, remote.metrics.usersTotal),
            usersNew: addNum(local.metrics.usersNew, remote.metrics.usersNew),
            installsTotal: addNum(local.metrics.installsTotal, remote.metrics.installsTotal),
            installsActive: addNum(local.metrics.installsActive, remote.metrics.installsActive),
            // 下载量是同一个 GitHub 仓库的计数，两站取的是同一个数——相加就是翻倍
            downloads: local.metrics.downloads.value !== null
                ? local.metrics.downloads
                : remote.metrics.downloads,
        },
        // 通道不重叠（cn 是微信/内购，intl 是 Stripe），直接拼；真撞上同名通道也分两行列，
        // 合并成一行会把两个主体的收入混成一笔，对账时谁也认不出来
        revenue: [...local.revenue, ...remote.revenue],
        costs: [],
    };

    const costIndex = new Map<string, CostLine>();
    for (const line of [...local.costs, ...remote.costs]) {
        const k = `${line.key}|${line.amount.currency}`;
        const existing = costIndex.get(k);
        if (!existing) {
            costIndex.set(k, { ...line, amount: { ...line.amount } });
            continue;
        }
        if (existing.amount.cents === null) existing.amount.cents = line.amount.cents;
        else if (line.amount.cents !== null) existing.amount.cents += line.amount.cents;
    }
    merged.costs = [...costIndex.values()];
    return merged;
}

/** 另一个站的 origin。两站互为对方的「远端」。 */
export function remoteOrigin(): string {
    return siteConfigOf(SITE_ID === 'cn' ? 'intl' : 'cn').origin;
}

export function syncToken(): string | undefined {
    const t = process.env.AWD_TRANSPARENCY_SYNC_TOKEN?.trim();
    return t && t.length >= 16 ? t : undefined;
}

async function fetchRemote(period: string): Promise<{ figures?: AutoFigures; error?: string }> {
    const token = syncToken();
    if (!token) return { error: '未配置 AWD_TRANSPARENCY_SYNC_TOKEN' };
    try {
        const res = await fetch(`${remoteOrigin()}/api/transparency/auto?period=${encodeURIComponent(period)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
            cache: 'no-store',
        });
        if (!res.ok) return { error: `远端返回 ${res.status}` };
        const json = (await res.json()) as { figures?: AutoFigures };
        if (!json?.figures?.metrics) return { error: '远端响应格式不符' };
        return { figures: json.figures };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * 取一期的自动数字。`includeRemote` 时把另一个站的聚合数字合进 `merged`；
 * 拉不到就 `remote.ok = false` 带原因回去，`merged` 等于 `local`。
 */
export async function collectAutoFigures(
    period: string,
    opts: CollectOptions = {}
): Promise<AutoResult> {
    const local = await collectLocal(period, opts);
    if (!opts.includeRemote) {
        return { local, remote: { ok: false, error: '未请求远端' }, merged: local };
    }
    const remote = await fetchRemote(period);
    if (!remote.figures) {
        return { local, remote: { ok: false, error: remote.error }, merged: local };
    }
    return {
        local,
        remote: { ok: true },
        merged: mergeFigures(local, { ...emptyFigures(), ...remote.figures }),
    };
}
