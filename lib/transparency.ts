import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb, withTransaction } from '@/lib/db';
import { siteConfigOf } from '@/lib/site-config';

/**
 * 账目公开（dev-board#611 / #612）。
 *
 * 产品事实：软件免费开源，服务器与域名由发起人前期垫付，用户只付第三方 API 成本；
 * 那 20% 是**支付通道抽成的折中**（苹果 30%+、微信、Stripe 各不相同，按通道分别定价
 * 只会把价目表变成天书），盈余先摊销发起人前期垫付，其余捐给全国性慈善机构。
 * 这件事只有一个兑现方式：**每半年把账目和使用情况摆出来**，官网一份、GitHub 一份。
 *
 * ## 为什么是「一期一份 JSON」而不是把科目拆成表
 *
 * 半年一期、一年两份，十年也才二十行。把收入/成本/捐赠拆成三张关系表换来的是
 * 每次改口径都要写迁移；而口径**本来就会改**（新接一家上游、换一个通道）。
 * 整份报表存 JSON、汇总在读时算（`summarizeReport`），历史期次永远保持它发布当天的样子。
 *
 * ## 期次边界按 UTC+8
 *
 * 账是中国大陆主体在记，半年的分界就是北京时间的 1 月 1 日与 7 月 1 日零点。
 * 库里的 `paidAt` / `ts` 都是 ISO（UTC），所以 `parsePeriod` 把 +08:00 的边界
 * 折算成 ISO 再交给 SQL 比较——不折算的话每期头尾各错 8 小时，年底那几单会串期。
 *
 * ## 数字的两种来源
 *
 * 每个数字都带 `source`：`auto` 是从本站库/GitHub 取的，`manual` 是维护者填的。
 * 这不是装饰——公开账目最怕的是「看起来都一样准」，而通道费、捐赠、发起人前期垫付
 * 这些项目在库里根本没有权威数据，只能手填。来源标记让读者知道哪些数字有账可查。
 */

// ---------------------------------------------------------------------------
// 期次
// ---------------------------------------------------------------------------

/** 报表数据的期次：`2026H1` = 1 月 1 日–6 月 30 日，`2026H2` = 7 月 1 日–12 月 31 日（UTC+8）。 */
const PERIOD_RE = /^(\d{4})H([12])$/;

export interface PeriodRange {
    period: string;
    year: number;
    half: 1 | 2;
    /** 期次起点（含），ISO。 */
    from: string;
    /** 期次终点（**不含**），ISO。所有查询一律 `from <= x < to`。 */
    to: string;
    /** 中文标签，后台与导出的 Markdown 用；前台按语种从词典拼。 */
    label: string;
}

/** UTC+8 的某年某月 1 日零点，折算成 ISO。 */
function beijingMonthStart(year: number, month1: number): string {
    return new Date(Date.UTC(year, month1 - 1, 1, -8, 0, 0)).toISOString();
}

export function parsePeriod(period: string): PeriodRange {
    const m = PERIOD_RE.exec(typeof period === 'string' ? period.trim() : '');
    if (!m) throw new Error(`期次格式不合法（应为 2026H1 / 2026H2）：${String(period)}`);
    const year = Number(m[1]);
    const half = Number(m[2]) as 1 | 2;
    // 2020 之前没有这个项目，2100 之后的期次只可能是输入错误
    if (year < 2020 || year > 2100) throw new Error(`期次年份超出范围：${period}`);
    return {
        period: `${year}H${half}`,
        year,
        half,
        from: beijingMonthStart(year, half === 1 ? 1 : 7),
        to: half === 1 ? beijingMonthStart(year, 7) : beijingMonthStart(year + 1, 1),
        label: `${year} 年${half === 1 ? '上' : '下'}半年`,
    };
}

/** 某一时刻所在的期次。用于「实时计数」这种没有期次概念的取数。 */
export function currentPeriod(nowMs = Date.now()): string {
    // 期次边界按 UTC+8，所以先把时刻平移到北京时间再取年月
    const bj = new Date(nowMs + 8 * 3600_000);
    const year = bj.getUTCFullYear();
    return `${year}H${bj.getUTCMonth() < 6 ? 1 : 2}`;
}

// ---------------------------------------------------------------------------
// 报表数据形状
// ---------------------------------------------------------------------------

export type Source = 'auto' | 'manual';
export type ReportCurrency = 'CNY' | 'USD';
export type RevenueChannel = 'wxpay' | 'wxvp' | 'appstore' | 'stripe' | 'other';
export type CostKey =
    | 'openrouter'
    | 'qichacha'
    | 'pkulaw'
    | 'bocha'
    | 'tushare'
    | 'aliyun_ai'
    | 'domain'
    | 'server'
    | 'oss'
    | 'cdn'
    | 'other';

export const REVENUE_CHANNELS: RevenueChannel[] = ['wxpay', 'wxvp', 'appstore', 'stripe', 'other'];
export const COST_KEYS: CostKey[] = [
    'openrouter',
    'qichacha',
    'pkulaw',
    'bocha',
    'tushare',
    'aliyun_ai',
    'domain',
    'server',
    'oss',
    'cdn',
    'other',
];

/** 计数类数字。`null` = 没取到/没填，页面直接隐藏，绝不显示 0 冒充「真的是零」。 */
export interface Num {
    value: number | null;
    source: Source;
    note?: string;
}

/** 金额。一律以 minor 单位（分 / 美分）存，界面按币种转主单位。 */
export interface Money {
    cents: number | null;
    currency: ReportCurrency;
    source: Source;
    note?: string;
}

export interface RevenueLine {
    channel: RevenueChannel;
    gross: Money;
    /** 支付通道抽成。库里没有权威数据，`collectAutoFigures` 只给估算建议写进 note。 */
    fee: Money;
}

export interface CostLine {
    key: CostKey;
    amount: Money;
    /** `key = 'other'` 时的自定义名称；其余项的展示名从词典取。 */
    label?: string;
}

export interface TransparencyReportData {
    metrics: {
        usersTotal: Num;
        usersNew: Num;
        installsTotal: Num;
        installsActive: Num;
        downloads: Num;
    };
    revenue: RevenueLine[];
    costs: CostLine[];
    /** 发起人前期垫付（服务器/域名等）。只作展示，**不进用户侧成本**，不进盈余公式；盈余有结余时优先摊销这里。 */
    founderCosts: Money;
    /** 给出汇率才会算合并人民币口径；不给就只按币种分别列。 */
    usdToCnyRate: number | null;
    donation: { amount: Money; org: string; note: string };
    remarks: string;
}

export function blankMoney(currency: ReportCurrency = 'CNY'): Money {
    return { cents: null, currency, source: 'manual' };
}

export function blankReportData(): TransparencyReportData {
    const num = (): Num => ({ value: null, source: 'manual' });
    return {
        metrics: {
            usersTotal: num(),
            usersNew: num(),
            installsTotal: num(),
            installsActive: num(),
            downloads: num(),
        },
        revenue: [],
        costs: [],
        founderCosts: blankMoney('CNY'),
        usdToCnyRate: null,
        donation: { amount: blankMoney('CNY'), org: '', note: '' },
        remarks: '',
    };
}

// ---------------------------------------------------------------------------
// 汇总（纯函数，不读库——验证脚本直接喂数据测它）
// ---------------------------------------------------------------------------

export interface CurrencyTotal {
    currency: ReportCurrency;
    grossCents: number;
    feeCents: number;
    costCents: number;
    /** 盈余 = 收入 − 通道费 − 第三方成本。可以是负数，那正是「还在垫」的意思。 */
    netCents: number;
}

export interface ReportSummary {
    byCurrency: CurrencyTotal[];
    /** 给了汇率才有：把美元口径按汇率折成人民币再与人民币口径相加。 */
    combinedCny: Omit<CurrencyTotal, 'currency'> | null;
    /** 汇总里有没有被跳过的空值——页面据此在总计旁标「部分项待补」。 */
    hasNulls: boolean;
}

const CURRENCY_ORDER: ReportCurrency[] = ['CNY', 'USD'];

/**
 * 计算汇总。**空值按跳过处理而不是按 0**：少一行成本与成本为零是两回事，
 * 前者要在界面上说明白（`hasNulls`），后者才该进算式。
 */
export function summarizeReport(data: TransparencyReportData): ReportSummary {
    const acc = new Map<ReportCurrency, CurrencyTotal>();
    let hasNulls = false;

    const bucket = (currency: ReportCurrency): CurrencyTotal => {
        let row = acc.get(currency);
        if (!row) {
            row = { currency, grossCents: 0, feeCents: 0, costCents: 0, netCents: 0 };
            acc.set(currency, row);
        }
        return row;
    };

    const take = (m: Money | undefined, field: 'grossCents' | 'feeCents' | 'costCents') => {
        if (!m) return;
        if (m.cents === null || !Number.isFinite(m.cents)) {
            hasNulls = true;
            return;
        }
        bucket(m.currency)[field] += m.cents;
    };

    for (const line of data.revenue ?? []) {
        take(line.gross, 'grossCents');
        take(line.fee, 'feeCents');
    }
    for (const line of data.costs ?? []) {
        take(line.amount, 'costCents');
    }

    const byCurrency = [...acc.values()]
        .map((row) => ({ ...row, netCents: row.grossCents - row.feeCents - row.costCents }))
        .sort((a, b) => CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency));

    let combinedCny: ReportSummary['combinedCny'] = null;
    const rate = data.usdToCnyRate;
    if (rate !== null && Number.isFinite(rate) && rate > 0 && byCurrency.length > 0) {
        combinedCny = { grossCents: 0, feeCents: 0, costCents: 0, netCents: 0 };
        for (const row of byCurrency) {
            const k = row.currency === 'USD' ? rate : 1;
            combinedCny.grossCents += Math.round(row.grossCents * k);
            combinedCny.feeCents += Math.round(row.feeCents * k);
            combinedCny.costCents += Math.round(row.costCents * k);
        }
        combinedCny.netCents =
            combinedCny.grossCents - combinedCny.feeCents - combinedCny.costCents;
    }

    return { byCurrency, combinedCny, hasNulls };
}

// ---------------------------------------------------------------------------
// 报表读写
// ---------------------------------------------------------------------------

export type ReportStatus = 'draft' | 'published';

export interface TransparencyReport {
    period: string;
    status: ReportStatus;
    data: TransparencyReportData;
    publishedAt: string | null;
    updatedAt: string;
}

interface ReportRow {
    period: string;
    status: ReportStatus;
    data: string;
    publishedAt: string | null;
    updatedAt: string;
}

function toReport(row: ReportRow): TransparencyReport {
    let data: TransparencyReportData;
    try {
        data = { ...blankReportData(), ...(JSON.parse(row.data) as TransparencyReportData) };
    } catch {
        // 库里的 JSON 坏掉不该让整页 500——退回空报表，界面显示「本期无数据」
        data = blankReportData();
    }
    return {
        period: row.period,
        status: row.status,
        data,
        publishedAt: row.publishedAt,
        updatedAt: row.updatedAt,
    };
}

export function listReports(opts: { publishedOnly?: boolean } = {}): TransparencyReport[] {
    const d = getDb();
    const sql = opts.publishedOnly
        ? "SELECT * FROM transparency_report WHERE status = 'published' ORDER BY period DESC"
        : 'SELECT * FROM transparency_report ORDER BY period DESC';
    return (d.prepare(sql).all() as ReportRow[]).map(toReport);
}

export function getReport(period: string): TransparencyReport | null {
    const { period: normalized } = parsePeriod(period);
    const row = getDb()
        .prepare('SELECT * FROM transparency_report WHERE period = ?')
        .get(normalized) as ReportRow | undefined;
    return row ? toReport(row) : null;
}

/** 写入报表内容。**不动状态**：已发布的期次改内容仍是已发布，别让一次笔误把它撤下线。 */
export function upsertReport(
    period: string,
    data: TransparencyReportData,
    nowIso = new Date().toISOString()
): TransparencyReport {
    const { period: normalized } = parsePeriod(period);
    withTransaction((d) => {
        d.prepare(
            `INSERT INTO transparency_report (period, status, data, publishedAt, updatedAt)
             VALUES (?, 'draft', ?, NULL, ?)
             ON CONFLICT(period) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`
        ).run(normalized, JSON.stringify(data), nowIso);
    });
    return getReport(normalized)!;
}

export function setReportStatus(
    period: string,
    status: ReportStatus,
    nowIso = new Date().toISOString()
): TransparencyReport | null {
    const { period: normalized } = parsePeriod(period);
    withTransaction((d) => {
        d.prepare(
            'UPDATE transparency_report SET status = ?, publishedAt = ?, updatedAt = ? WHERE period = ?'
        ).run(status, status === 'published' ? nowIso : null, nowIso, normalized);
    });
    return getReport(normalized);
}

/** 删除期次，连同它的凭证行与磁盘文件。 */
export function deleteReport(period: string): void {
    const { period: normalized } = parsePeriod(period);
    const receipts = listReceipts(normalized);
    withTransaction((d) => {
        d.prepare('DELETE FROM transparency_receipt WHERE period = ?').run(normalized);
        d.prepare('DELETE FROM transparency_report WHERE period = ?').run(normalized);
    });
    for (const r of receipts) removeReceiptFile(r.id, r.mime);
}

// ---------------------------------------------------------------------------
// 捐赠凭证
// ---------------------------------------------------------------------------

const RECEIPT_DIR = path.join(process.cwd(), 'data', 'transparency-receipts');

/** 允许的凭证格式。与头像同理，**不收 SVG**：矢量能构造成渲染炸弹且会拉外部引用。 */
export const RECEIPT_MIME_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
};

export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

export interface Receipt {
    id: string;
    period: string;
    fileName: string;
    mime: string;
    size: number;
    caption: string | null;
    createdAt: string;
}

export type ReceiptError = 'too_large' | 'unsupported_format' | 'empty';

/** id 恒由随机 hex 生成，文件名恒由 id 拼出——上传方给的文件名一概不参与路径。 */
const RECEIPT_ID_RE = /^[0-9a-f]{24}$/;

function receiptFile(id: string, mime: string): string | null {
    const ext = RECEIPT_MIME_EXT[mime];
    if (!ext || !RECEIPT_ID_RE.test(id)) return null;
    return path.join(RECEIPT_DIR, `${id}.${ext}`);
}

function removeReceiptFile(id: string, mime: string): void {
    const file = receiptFile(id, mime);
    if (file) fs.rmSync(file, { force: true });
}

export function addReceipt(input: {
    period: string;
    fileName: string;
    mime: string;
    bytes: Buffer;
    caption?: string | null;
    nowIso?: string;
}): { receipt?: Receipt; error?: ReceiptError } {
    const { period } = parsePeriod(input.period);
    if (!RECEIPT_MIME_EXT[input.mime]) return { error: 'unsupported_format' };
    if (input.bytes.length === 0) return { error: 'empty' };
    if (input.bytes.length > RECEIPT_MAX_BYTES) return { error: 'too_large' };

    const id = crypto.randomBytes(12).toString('hex');
    const file = receiptFile(id, input.mime)!;
    const nowIso = input.nowIso ?? new Date().toISOString();
    // 原始文件名只作展示（导出的 Markdown 里给个人看的说明），长度截断即可
    const fileName = (input.fileName || 'receipt').slice(0, 120);
    const caption = input.caption ? input.caption.slice(0, 200) : null;

    fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, input.bytes);
    fs.renameSync(tmp, file);

    withTransaction((d) => {
        d.prepare(
            `INSERT INTO transparency_receipt (id, period, fileName, mime, size, caption, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, period, fileName, input.mime, input.bytes.length, caption, nowIso);
    });

    return { receipt: { id, period, fileName, mime: input.mime, size: input.bytes.length, caption, createdAt: nowIso } };
}

export function listReceipts(period: string): Receipt[] {
    const { period: normalized } = parsePeriod(period);
    return getDb()
        .prepare('SELECT * FROM transparency_receipt WHERE period = ? ORDER BY createdAt')
        .all(normalized) as Receipt[];
}

export function getReceipt(id: string): Receipt | null {
    if (!RECEIPT_ID_RE.test(id)) return null;
    const row = getDb().prepare('SELECT * FROM transparency_receipt WHERE id = ?').get(id) as
        | Receipt
        | undefined;
    return row ?? null;
}

export function readReceiptBytes(receipt: Receipt): Buffer | null {
    const file = receiptFile(receipt.id, receipt.mime);
    if (!file || !fs.existsSync(file)) return null;
    return fs.readFileSync(file);
}

export function deleteReceipt(id: string): boolean {
    const row = getReceipt(id);
    if (!row) return false;
    withTransaction((d) => {
        d.prepare('DELETE FROM transparency_receipt WHERE id = ?').run(id);
    });
    removeReceiptFile(row.id, row.mime);
    return true;
}

// ---------------------------------------------------------------------------
// 导出 Markdown（贴 GitHub 用）
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<RevenueChannel, string> = {
    wxpay: '微信支付',
    wxvp: '小程序虚拟支付',
    appstore: 'App Store 内购',
    stripe: 'Stripe',
    other: '其他',
};

const COST_LABEL: Record<CostKey, string> = {
    openrouter: 'AI 模型（OpenRouter）',
    qichacha: '企业信息（企查查）',
    pkulaw: '法律数据库（北大法宝）',
    bocha: '联网搜索（博查）',
    tushare: '财经数据（Tushare）',
    aliyun_ai: '语音转写 / OCR / 短信（阿里云）',
    domain: '域名',
    server: '服务器',
    oss: '对象存储',
    cdn: 'CDN',
    other: '其他',
};

function fmtMoney(m: Money | undefined): string {
    if (!m || m.cents === null) return '—';
    // 负号要落在货币符号**之前**：`US$-148.80` 读起来像乱码，`-US$148.80` 才是钱。
    // 盈余为负是常态（还在垫钱），这一格不是边角情况。
    const major = (Math.abs(m.cents) / 100).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${m.cents < 0 ? '-' : ''}${m.currency === 'USD' ? 'US$' : '¥'}${major}`;
}

function fmtNum(n: Num | undefined): string {
    if (!n || n.value === null) return '—';
    return n.value.toLocaleString('zh-CN');
}

function sourceMark(s: Source | undefined): string {
    return s === 'auto' ? '自动取数' : '手工填报';
}

/**
 * 一期报表的 GitHub 版。凭证一律给**国内站的绝对地址**：
 * README 被 clone、被镜像、被转贴，相对链接到那些地方全是死链。
 */
export function renderReportMarkdown(period: string): string {
    const range = parsePeriod(period);
    const report = getReport(range.period);
    if (!report) throw new Error(`期次不存在：${range.period}`);
    const data = report.data;
    const summary = summarizeReport(data);
    const receipts = listReceipts(range.period);
    const origin = siteConfigOf('cn').origin;

    const lines: string[] = [];
    lines.push(`# AI WorkDeck 账目公开 · ${range.label}`);
    lines.push('');
    // 日期按 UTC+8 展示：range.from/to 是折算后的 ISO（UTC），直接 slice 出来会
    // 显示成 2025-12-31 — 读者看到的必须是「2026-01-01 到 2026-06-30」这个自然半年
    const bjDay = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);
    lines.push(
        `期次 \`${range.period}\`（${bjDay(range.from)} — ${bjDay(
            new Date(Date.parse(range.to) - 1).toISOString()
        )}，北京时间）· 状态：${report.status === 'published' ? '已公布' : '草稿'}`
    );
    lines.push('');

    lines.push('## 口径说明');
    lines.push('');
    lines.push(
        'AI WorkDeck 是一个开源、公益性质的项目：桌面端以 AGPLv3 开源，源码公开，软件本身免费，这份账目里的 20% 不是利润率。' +
            '服务器、域名等前期开销，一开始不向用户收，由发起人先行垫付；用户实际付的是第三方服务的真实成本，外加统一 20%——' +
            '这是折中各支付渠道抽成差异的结果。收到的钱扣除渠道费与第三方成本后如果有结余，优先用来摊销发起人前期垫付的费用；' +
            `摊完之后如果还有剩余，捐给全国性慈善机构。定价说明见 ${origin}/zh/faq#pricing。`
    );
    lines.push('');

    lines.push('## 使用情况');
    lines.push('');
    lines.push('| 指标 | 数值 | 来源 | 口径 |');
    lines.push('| --- | ---: | --- | --- |');
    const metricRows: Array<[string, Num]> = [
        ['注册用户（累计）', data.metrics.usersTotal],
        ['本期新增注册', data.metrics.usersNew],
        ['累计安装（遥测）', data.metrics.installsTotal],
        ['30 天活跃安装', data.metrics.installsActive],
        ['安装包下载（GitHub Releases）', data.metrics.downloads],
    ];
    for (const [label, n] of metricRows) {
        lines.push(`| ${label} | ${fmtNum(n)} | ${sourceMark(n?.source)} | ${n?.note ?? ''} |`);
    }
    lines.push('');

    lines.push('## 收入与渠道费');
    lines.push('');
    lines.push('| 渠道 | 收入 | 渠道费 | 净额 | 来源 |');
    lines.push('| --- | ---: | ---: | ---: | --- |');
    for (const line of data.revenue) {
        const net =
            line.gross.cents !== null && line.fee.cents !== null
                ? fmtMoney({ ...line.gross, cents: line.gross.cents - line.fee.cents })
                : '—';
        lines.push(
            `| ${CHANNEL_LABEL[line.channel] ?? line.channel} | ${fmtMoney(line.gross)} | ${fmtMoney(
                line.fee
            )} | ${net} | ${sourceMark(line.gross.source)} |`
        );
    }
    if (data.revenue.length === 0) lines.push('| — | — | — | — | — |');
    lines.push('');

    lines.push('## 第三方成本');
    lines.push('');
    lines.push('| 科目 | 金额 | 来源 | 说明 |');
    lines.push('| --- | ---: | --- | --- |');
    for (const line of data.costs) {
        const label = line.key === 'other' && line.label ? line.label : COST_LABEL[line.key] ?? line.key;
        lines.push(
            `| ${label} | ${fmtMoney(line.amount)} | ${sourceMark(line.amount.source)} | ${
                line.amount.note ?? ''
            } |`
        );
    }
    if (data.costs.length === 0) lines.push('| — | — | — | — |');
    lines.push('');

    lines.push('## 盈余');
    lines.push('');
    lines.push('| 币种 | 收入 | 渠道费 | 第三方成本 | 盈余 |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const row of summary.byCurrency) {
        const cur = row.currency;
        const m = (cents: number) => fmtMoney({ cents, currency: cur, source: 'auto' });
        lines.push(
            `| ${cur} | ${m(row.grossCents)} | ${m(row.feeCents)} | ${m(row.costCents)} | ${m(row.netCents)} |`
        );
    }
    if (summary.byCurrency.length === 0) lines.push('| — | — | — | — | — |');
    if (summary.combinedCny) {
        const m = (cents: number) => fmtMoney({ cents, currency: 'CNY', source: 'auto' });
        lines.push(
            `| 合计（按 1 USD = ${data.usdToCnyRate} CNY 折算） | ${m(summary.combinedCny.grossCents)} | ${m(
                summary.combinedCny.feeCents
            )} | ${m(summary.combinedCny.costCents)} | ${m(summary.combinedCny.netCents)} |`
        );
    }
    lines.push('');
    lines.push(`发起人前期垫付（服务器 / 域名等，盈余优先摊销）：${fmtMoney(data.founderCosts)}`);
    lines.push('');

    lines.push('## 捐赠');
    lines.push('');
    lines.push('| 项目 | 内容 |');
    lines.push('| --- | --- |');
    lines.push(`| 金额 | ${fmtMoney(data.donation.amount)} |`);
    lines.push(`| 受赠机构 | ${data.donation.org || '—'} |`);
    lines.push(`| 说明 | ${data.donation.note || '—'} |`);
    lines.push('');
    if (receipts.length > 0) {
        lines.push('凭证：');
        lines.push('');
        for (const r of receipts) {
            lines.push(
                `- [${r.caption || r.fileName}](${origin}/api/transparency/receipt/${r.id})`
            );
        }
        lines.push('');
    }

    if (data.remarks.trim()) {
        lines.push('## 备注');
        lines.push('');
        lines.push(data.remarks.trim());
        lines.push('');
    }

    return lines.join('\n');
}

const EXACT_REPORT_NOTES_EN: Record<string, string> = {
    '本站注册账号累计数（已注销账号不计入）':
        'Cumulative registered accounts on this site (excluding deleted accounts)',
    '本期内新注册的账号数': 'New accounts registered during this period',
    '遥测口径：匿名安装标识去重。遥测可由用户关闭、且滚动保留 24 个月，此数为下限':
        'Telemetry basis: deduplicated anonymous install IDs. Telemetry can be disabled and rolls over after 24 months, so this is a lower bound.',
    '期末前 30 天内有遥测上报的安装数（期次未结束时算到今天）':
        'Installs reporting telemetry within the last 30 days of the period (or up to today if the period is ongoing)',
    'GitHub Releases 下载量未取到，可手工填报':
        'GitHub Releases download count unavailable; can be filled in manually',
    'GitHub Releases 全部安装包资产的累计下载数。GitHub 不提供按期次切分，此为开源至今的累计值，不可跨期相加':
        'Cumulative downloads across all installer assets on GitHub Releases. GitHub does not split by period; this is the all-time total since open-sourcing and cannot be summed across periods.',
    '渠道费需手工填报': 'Channel fee must be entered manually',
    'OpenRouter 累计用量快照不足两条，无法推算本期消耗，需手工填报':
        'Fewer than two OpenRouter cumulative usage snapshots; period usage cannot be derived automatically and must be entered manually',
    'OpenRouter 累计用量快照差（上游权威计量，美元）':
        'Difference between OpenRouter cumulative usage snapshots (authoritative upstream metering in USD)',
};

/**
 * 将自动采集写入报表 JSON 的标准中文口径说明在英文页面转译为英文；
 * 自定义手填的英文或未知说明保持原样。
 */
export function localizeReportNote(note: string | undefined, lang: string): string | undefined {
    if (!note || lang === 'zh' || lang === 'zh-hant') return note;
    let combined = false;
    let base = note.trim();
    if (base.endsWith('（两站合计）')) {
        combined = true;
        base = base.slice(0, -'（两站合计）'.length).trim();
    }
    const finalize = (s: string) => (combined ? `${s} (combined across both sites)` : s);

    if (EXACT_REPORT_NOTES_EN[base]) {
        return finalize(EXACT_REPORT_NOTES_EN[base]);
    }
    const gwMatch = /^网关流水推算（本期 (\d+) 次调用 × 采购成本单价）$/.exec(base);
    if (gwMatch) {
        return finalize(`Estimated from gateway logs (${gwMatch[1]} calls in this period × unit procurement cost)`);
    }
    const orderMatch = /^订单表口径：已支付且未退款，共 (\d+) 笔(?:；注意：本通道另有 (.+) 的订单未计入，需人工核对)?$/.exec(
        base
    );
    if (orderMatch) {
        const main = `Orders table basis: paid and unrefunded, ${orderMatch[1]} orders total`;
        if (!orderMatch[2]) return finalize(main);
        const extra = orderMatch[2].replace(/(\d+)\s*笔\s*([A-Z]+)/g, '$1 $2 orders').replace(/、/g, ', ');
        return finalize(`${main}; note: ${extra} on this channel were excluded and require manual verification`);
    }
    const wxMatch = /^建议估算：(微信支付|小程序虚拟支付)费率 0\.6% ≈ ¥([0-9.]+)，以商户账单为准$/.exec(base);
    if (wxMatch) {
        const ch = wxMatch[1] === '微信支付' ? 'WeChat Pay' : 'WeChat Mini Program Virtual Payment';
        return finalize(`Estimated ${ch} fee at 0.6% ≈ ¥${wxMatch[2]}; subject to merchant statement`);
    }
    const stripeMatch = /^建议估算：Stripe 2\.9% \+ US\$0\.30\/笔（(\d+) 笔）≈ US\$([0-9.]+)，以 Stripe 结算报表为准$/.exec(
        base
    );
    if (stripeMatch) {
        return finalize(
            `Estimated Stripe fee at 2.9% + US$0.30/tx (${stripeMatch[1]} orders) ≈ US$${stripeMatch[2]}; subject to Stripe settlement report`
        );
    }
    const iapMatch = /^建议估算：App Store 抽成 30% ≈ ¥([0-9.]+)；小型企业计划为 15%，以 ASC 财务报告为准$/.exec(
        base
    );
    if (iapMatch) {
        return finalize(
            `Estimated App Store commission at 30% ≈ ¥${iapMatch[1]} (15% under Small Business Program); subject to ASC financial report`
        );
    }
    return finalize(base);
}
