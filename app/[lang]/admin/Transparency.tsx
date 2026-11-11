'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Panel, StatusDot, TableSkeleton, type Tone } from './ui';

/**
 * 账目公开编辑器（dev-board#611 / #612）。
 *
 * 半年填一次的表单最容易出的事故是**手抄错数字**，而且半年之后没人对得出来。
 * 所以这里的核心不是表单，是那颗「自动取数」按钮：能从库里查到的一律自动填，
 * 并且**不覆盖维护者已经填过的值**——自动取数是帮手，不是清场。
 *
 * 金额一律界面填「元 / 美元」、存「分」，与成本台账同一口径（见 CostLedger.tsx）。
 */

type Source = 'auto' | 'manual';
type ReportCurrency = 'CNY' | 'USD';
type RevenueChannel = 'wxpay' | 'wxvp' | 'appstore' | 'stripe' | 'other';
type CostKey =
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

interface Num {
    value: number | null;
    source: Source;
    note?: string;
}
interface Money {
    cents: number | null;
    currency: ReportCurrency;
    source: Source;
    note?: string;
}
interface RevenueLine {
    channel: RevenueChannel;
    gross: Money;
    fee: Money;
}
interface CostLine {
    key: CostKey;
    amount: Money;
    label?: string;
}
interface ReportData {
    metrics: {
        usersTotal: Num;
        usersNew: Num;
        installsTotal: Num;
        installsActive: Num;
        downloads: Num;
    };
    revenue: RevenueLine[];
    costs: CostLine[];
    founderCosts: Money;
    usdToCnyRate: number | null;
    donation: { amount: Money; org: string; note: string };
    remarks: string;
}

interface Receipt {
    id: string;
    period: string;
    fileName: string;
    mime: string;
    size: number;
    caption: string | null;
    createdAt: string;
}

interface CurrencyTotal {
    currency: ReportCurrency;
    grossCents: number;
    feeCents: number;
    costCents: number;
    netCents: number;
}

interface Summary {
    byCurrency: CurrencyTotal[];
    combinedCny: Omit<CurrencyTotal, 'currency'> | null;
    hasNulls: boolean;
}

interface AutoFigures {
    metrics: ReportData['metrics'];
    revenue: RevenueLine[];
    costs: CostLine[];
}

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

const METRIC_LABEL: Array<[keyof ReportData['metrics'], string]> = [
    ['usersTotal', '注册用户（累计）'],
    ['usersNew', '本期新增注册'],
    ['installsTotal', '累计安装（遥测口径）'],
    ['installsActive', '30 天活跃安装'],
    ['downloads', '安装包下载（GitHub Releases）'],
];

const COST_KEYS = Object.keys(COST_LABEL) as CostKey[];
const CHANNELS = Object.keys(CHANNEL_LABEL) as RevenueChannel[];

function blankMoney(currency: ReportCurrency = 'CNY'): Money {
    return { cents: null, currency, source: 'manual' };
}

function blankData(): ReportData {
    const n = (): Num => ({ value: null, source: 'manual' });
    return {
        metrics: {
            usersTotal: n(),
            usersNew: n(),
            installsTotal: n(),
            installsActive: n(),
            downloads: n(),
        },
        revenue: [],
        costs: [],
        founderCosts: blankMoney('CNY'),
        usdToCnyRate: null,
        donation: { amount: blankMoney('CNY'), org: '', note: '' },
        remarks: '',
    };
}

/** 分 → 元（界面），空值给空串而不是 0：0 与「没填」在账目里是两件事。 */
function centsToMajor(cents: number | null): string {
    return cents === null ? '' : (cents / 100).toFixed(2);
}

function majorToCents(v: string): number | null {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function fmtCents(cents: number, currency: ReportCurrency): string {
    // 负号在货币符号之前，与公开页同一写法
    return `${cents < 0 ? '-' : ''}${currency === 'USD' ? 'US$' : '¥'}${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtMoney(m: Money): string {
    return m.cents === null ? '—' : fmtCents(m.cents, m.currency);
}

/** 汇总（与 lib/transparency.ts 的 summarizeReport 同口径，用于保存前的即时预览）。 */
function summarize(data: ReportData): Summary {
    const acc = new Map<ReportCurrency, CurrencyTotal>();
    let hasNulls = false;
    const bucket = (c: ReportCurrency) => {
        let row = acc.get(c);
        if (!row) {
            row = { currency: c, grossCents: 0, feeCents: 0, costCents: 0, netCents: 0 };
            acc.set(c, row);
        }
        return row;
    };
    const take = (m: Money, f: 'grossCents' | 'feeCents' | 'costCents') => {
        if (m.cents === null) {
            hasNulls = true;
            return;
        }
        bucket(m.currency)[f] += m.cents;
    };
    for (const l of data.revenue) {
        take(l.gross, 'grossCents');
        take(l.fee, 'feeCents');
    }
    for (const l of data.costs) take(l.amount, 'costCents');

    const byCurrency = [...acc.values()]
        .map((r) => ({ ...r, netCents: r.grossCents - r.feeCents - r.costCents }))
        .sort((a, b) => (a.currency === 'CNY' ? -1 : 1) - (b.currency === 'CNY' ? -1 : 1));

    let combinedCny: Summary['combinedCny'] = null;
    const rate = data.usdToCnyRate;
    if (rate && rate > 0 && byCurrency.length > 0) {
        combinedCny = { grossCents: 0, feeCents: 0, costCents: 0, netCents: 0 };
        for (const r of byCurrency) {
            const k = r.currency === 'USD' ? rate : 1;
            combinedCny.grossCents += Math.round(r.grossCents * k);
            combinedCny.feeCents += Math.round(r.feeCents * k);
            combinedCny.costCents += Math.round(r.costCents * k);
        }
        combinedCny.netCents = combinedCny.grossCents - combinedCny.feeCents - combinedCny.costCents;
    }
    return { byCurrency, combinedCny, hasNulls };
}

const PERIOD_RE = /^(\d{4})H([12])$/;

function periodLabel(period: string): string {
    const m = PERIOD_RE.exec(period);
    if (!m) return period;
    return `${m[1]} 年${m[2] === '1' ? '上' : '下'}半年`;
}

/** 下一个可建的期次（今天所在的那一期）。 */
function defaultPeriod(): string {
    const bj = new Date(Date.now() + 8 * 3600_000);
    return `${bj.getUTCFullYear()}H${bj.getUTCMonth() < 6 ? 1 : 2}`;
}

const INPUT = 'h-9 text-sm';
const SELECT =
    'h-9 rounded-md border border-neutral-gray-light bg-white px-2 text-sm text-neutral-gray-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest/20';
const TEXTAREA =
    'w-full rounded-md border border-neutral-gray-light bg-white px-3 py-2 text-sm leading-relaxed text-neutral-gray-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest/20';

interface ListItem {
    period: string;
    status: 'draft' | 'published';
    publishedAt: string | null;
    updatedAt: string;
}

export function Transparency() {
    const { fetch, url } = useAdminSite();
    const [list, setList] = useState<ListItem[] | null>(null);
    const [period, setPeriod] = useState<string>('');
    const [newPeriod, setNewPeriod] = useState(defaultPeriod());
    const [status, setStatus] = useState<'draft' | 'published' | null>(null);
    const [data, setData] = useState<ReportData>(blankData());
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [remote, setRemote] = useState<{ ok: boolean; error?: string } | null>(null);
    const [overwrite, setOverwrite] = useState(false);
    const [caption, setCaption] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const loadList = useCallback(async () => {
        const res = await fetch('/api/admin/transparency');
        if (!res.ok) return;
        const d = (await res.json()) as { reports: ListItem[] };
        setList(d.reports);
        setPeriod((p) => p || d.reports[0]?.period || '');
    }, []);

    const loadPeriod = useCallback(async (p: string) => {
        if (!p) return;
        const res = await fetch(`/api/admin/transparency?period=${encodeURIComponent(p)}`);
        if (!res.ok) return;
        const d = (await res.json()) as {
            report: { status: 'draft' | 'published'; data: ReportData } | null;
            receipts: Receipt[];
        };
        setStatus(d.report?.status ?? null);
        setData(d.report?.data ?? blankData());
        setReceipts(d.receipts ?? []);
    }, []);

    useEffect(() => {
        loadList();
    }, [loadList]);

    useEffect(() => {
        loadPeriod(period);
    }, [period, loadPeriod]);

    const patch = (fn: (draft: ReportData) => void) => {
        setData((prev) => {
            const next = JSON.parse(JSON.stringify(prev)) as ReportData;
            fn(next);
            return next;
        });
    };

    /**
     * 自动取数。**默认不覆盖已填值**：只有还是空的、或上一次也是自动填的字段才会被写。
     * 勾上「覆盖已填值」才强填——那是「我上次填错了，重来一次」的场景。
     */
    const autofill = async () => {
        if (!period) return;
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`/api/admin/transparency/auto?period=${encodeURIComponent(period)}`);
            const d = await res.json();
            if (!res.ok) {
                setMsg(`取数失败：${d.error ?? res.status}`);
                return;
            }
            const figures = d.merged as AutoFigures;
            setRemote(d.remote as { ok: boolean; error?: string });

            patch((next) => {
                for (const [key] of METRIC_LABEL) {
                    const cur = next.metrics[key];
                    const incoming = figures.metrics[key];
                    if (!incoming || incoming.value === null) continue;
                    if (overwrite || cur.value === null || cur.source === 'auto') {
                        next.metrics[key] = { ...incoming };
                    }
                }

                for (const line of figures.revenue) {
                    const existing = next.revenue.find((r) => r.channel === line.channel);
                    if (!existing) {
                        next.revenue.push({ ...line, gross: { ...line.gross }, fee: { ...line.fee } });
                        continue;
                    }
                    if (overwrite || existing.gross.cents === null || existing.gross.source === 'auto') {
                        existing.gross = { ...line.gross };
                    }
                    // 渠道费没有权威来源，自动取数只补建议口径的说明，绝不代填金额
                    if (existing.fee.cents === null) existing.fee = { ...existing.fee, note: line.fee.note };
                }

                for (const line of figures.costs) {
                    const existing = next.costs.find(
                        (c) => c.key === line.key && c.amount.currency === line.amount.currency
                    );
                    if (!existing) {
                        next.costs.push({ ...line, amount: { ...line.amount } });
                        continue;
                    }
                    if (overwrite || existing.amount.cents === null || existing.amount.source === 'auto') {
                        existing.amount = { ...line.amount };
                    }
                }
            });
            setMsg('已按自动取数填入（未覆盖已手工填写的字段）');
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!period) return;
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch('/api/admin/transparency', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period, data }),
            });
            const d = await res.json();
            if (!res.ok) {
                setMsg(`保存失败：${d.field ? `字段 ${d.field} 不合法` : (d.error ?? res.status)}`);
                return;
            }
            setMsg(`${periodLabel(period)} 已保存`);
            await loadList();
            await loadPeriod(period);
        } finally {
            setBusy(false);
        }
    };

    const changeStatus = async (next: 'draft' | 'published') => {
        if (!period) return;
        const verb = next === 'published' ? '公开发布' : '撤回';
        if (!confirm(`确认${verb}「${periodLabel(period)}」的账目？发布后任何人都能看到。`)) return;
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch('/api/admin/transparency', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period, status: next }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setMsg(`${verb}失败：${d.error ?? res.status}`);
                return;
            }
            setMsg(`${periodLabel(period)} 已${verb}`);
            await loadList();
            await loadPeriod(period);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!period) return;
        if (!confirm(`删除「${periodLabel(period)}」及其全部凭证文件？此操作不可撤销。`)) return;
        setBusy(true);
        try {
            await fetch(`/api/admin/transparency?period=${encodeURIComponent(period)}`, { method: 'DELETE' });
            setPeriod('');
            setStatus(null);
            setData(blankData());
            setReceipts([]);
            setMsg('已删除');
            await loadList();
        } finally {
            setBusy(false);
        }
    };

    const uploadReceipt = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file || !period) return;
        const form = new FormData();
        form.set('period', period);
        form.set('caption', caption);
        form.set('file', file);
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch('/api/admin/transparency/receipts', { method: 'POST', body: form });
            const d = await res.json();
            if (!res.ok) {
                setMsg(`上传失败：${d.error ?? res.status}`);
                return;
            }
            setReceipts(d.receipts as Receipt[]);
            setCaption('');
            if (fileRef.current) fileRef.current.value = '';
            setMsg('凭证已上传');
        } finally {
            setBusy(false);
        }
    };

    const deleteReceipt = async (id: string) => {
        if (!confirm('删除这张凭证？文件会一并删除。')) return;
        setBusy(true);
        try {
            await fetch(`/api/admin/transparency/receipts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            setReceipts((prev) => prev.filter((r) => r.id !== id));
        } finally {
            setBusy(false);
        }
    };

    const createPeriod = () => {
        if (!PERIOD_RE.test(newPeriod.trim())) {
            setMsg('期次格式应为 2026H1 / 2026H2');
            return;
        }
        setPeriod(newPeriod.trim());
        setStatus(null);
        setData(blankData());
        setReceipts([]);
        setMsg(`已新建 ${periodLabel(newPeriod.trim())} 草稿（保存后入库）`);
    };

    if (!list) {
        return (
            <Panel padded={false}>
                <TableSkeleton rows={5} cols={4} />
            </Panel>
        );
    }

    const summary = summarize(data);
    const statusTone: Tone = status === 'published' ? 'ok' : status === 'draft' ? 'warn' : 'muted';
    const statusText = status === 'published' ? '已公布' : status === 'draft' ? '草稿' : '未创建';

    return (
        <div className="flex flex-col gap-6">
            {msg && <Notice tone={msg.includes('失败') || msg.includes('不合法') ? 'danger' : 'info'}>{msg}</Notice>}

            {/* 期次选择 */}
            <Panel title="期次" description="每半年一期：H1 = 1 月 1 日–6 月 30 日，H2 = 7 月 1 日–12 月 31 日（北京时间）。">
                <div className="flex flex-wrap items-end gap-4">
                    <Field label="已有期次" className="min-w-[12rem]">
                        <select
                            className={SELECT}
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                        >
                            <option value="">（未选择）</option>
                            {list.map((r) => (
                                <option key={r.period} value={r.period}>
                                    {periodLabel(r.period)} · {r.status === 'published' ? '已公布' : '草稿'}
                                </option>
                            ))}
                            {period && !list.some((r) => r.period === period) && (
                                <option value={period}>{periodLabel(period)} · 新建</option>
                            )}
                        </select>
                    </Field>
                    <Field label="新建期次" hint="形如 2026H1 / 2026H2" className="min-w-[10rem]">
                        <div className="flex gap-2">
                            <Input
                                className={INPUT}
                                value={newPeriod}
                                onChange={(e) => setNewPeriod(e.target.value)}
                                placeholder="2026H2"
                            />
                            <Button size="sm" variant="outline" onClick={createPeriod}>
                                新建
                            </Button>
                        </div>
                    </Field>
                    <div className="pb-1 text-sm">
                        <StatusDot tone={statusTone}>{statusText}</StatusDot>
                    </div>
                </div>
            </Panel>

            {!period ? (
                <Panel padded={false}>
                    <EmptyState
                        icon={FileText}
                        title="选择或新建一个期次"
                        hint="账目每半年公布一次；新建后先「自动取数」，再补手工项，最后上传凭证并发布。"
                    />
                </Panel>
            ) : (
                <>
                    {/* 操作条 */}
                    <Panel>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={autofill} disabled={busy} className="gap-1.5">
                                <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                自动取数
                            </Button>
                            <label className="flex items-center gap-1.5 text-xs text-neutral-gray-medium">
                                <input
                                    type="checkbox"
                                    checked={overwrite}
                                    onChange={(e) => setOverwrite(e.target.checked)}
                                />
                                覆盖已填值
                            </label>
                            <span className="mx-1 h-5 w-px bg-neutral-gray-light" />
                            <Button size="sm" variant="outline" onClick={save} disabled={busy}>
                                保存草稿
                            </Button>
                            {status === 'published' ? (
                                <Button size="sm" variant="outline" onClick={() => changeStatus('draft')} disabled={busy}>
                                    撤回公布
                                </Button>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => changeStatus('published')} disabled={busy || !status}>
                                    公开发布
                                </Button>
                            )}
                            <a
                                href={url(`/api/admin/transparency/export?period=${encodeURIComponent(period)}`)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-gray-light bg-white/70 px-3 text-sm text-neutral-gray-dark transition-colors hover:border-king-forest/40"
                            >
                                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                                导出 Markdown
                            </a>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={remove}
                                disabled={busy || !status}
                                className="gap-1.5 text-red-600"
                            >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                删除期次
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => loadPeriod(period)} disabled={busy} className="gap-1.5">
                                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                                重载
                            </Button>
                        </div>
                        {remote && (
                            <p className="mt-3 text-xs text-neutral-gray-medium">
                                {remote.ok ? '国际站：已合并' : `国际站：未拉取（${remote.error ?? '未知原因'}）`}
                            </p>
                        )}
                    </Panel>

                    {/* 使用情况 */}
                    <Panel title="使用情况" description="能自动取数的一律自动；口径说明会原样出现在公开页上。">
                        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            {METRIC_LABEL.map(([key, label]) => {
                                const m = data.metrics[key];
                                return (
                                    <Field
                                        key={key}
                                        label={label}
                                        suffix={m.source === 'auto' ? '自动' : '手工'}
                                        hint={m.note}
                                    >
                                        <Input
                                            className={INPUT}
                                            inputMode="numeric"
                                            value={m.value === null ? '' : String(m.value)}
                                            onChange={(e) => {
                                                const t = e.target.value.trim();
                                                const n = t === '' ? null : Number(t);
                                                patch((next) => {
                                                    next.metrics[key] = {
                                                        value: n === null || !Number.isFinite(n) ? null : Math.round(n),
                                                        source: 'manual',
                                                        note: next.metrics[key].note,
                                                    };
                                                });
                                            }}
                                        />
                                    </Field>
                                );
                            })}
                        </div>
                    </Panel>

                    {/* 收入与渠道费 */}
                    <Panel
                        title="收入与渠道费"
                        description="收入自动取自订单表（已支付、未退款）；渠道费没有权威数据源，按各通道结算报表手工填。"
                        actions={
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    patch((next) => {
                                        next.revenue.push({
                                            channel: 'other',
                                            gross: blankMoney('CNY'),
                                            fee: blankMoney('CNY'),
                                        });
                                    })
                                }
                            >
                                添加一行
                            </Button>
                        }
                    >
                        {data.revenue.length === 0 ? (
                            <p className="text-sm text-neutral-gray-medium">本期暂无收入行。点「自动取数」从订单表取，或手动添加。</p>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {data.revenue.map((line, i) => (
                                    <div
                                        key={i}
                                        className="grid items-end gap-3 border-t border-neutral-gray-light/70 pt-4 md:grid-cols-[10rem_8rem_1fr_1fr_auto]"
                                    >
                                        <Field label="渠道">
                                            <select
                                                className={SELECT}
                                                value={line.channel}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.revenue[i].channel = e.target.value as RevenueChannel;
                                                    })
                                                }
                                            >
                                                {CHANNELS.map((c) => (
                                                    <option key={c} value={c}>
                                                        {CHANNEL_LABEL[c]}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="币种">
                                            <select
                                                className={SELECT}
                                                value={line.gross.currency}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        const c = e.target.value as ReportCurrency;
                                                        next.revenue[i].gross.currency = c;
                                                        next.revenue[i].fee.currency = c;
                                                    })
                                                }
                                            >
                                                <option value="CNY">CNY</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </Field>
                                        <Field
                                            label="收入"
                                            suffix={line.gross.source === 'auto' ? '自动' : '手工'}
                                            hint={line.gross.note}
                                        >
                                            <Input
                                                className={INPUT}
                                                inputMode="decimal"
                                                value={centsToMajor(line.gross.cents)}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.revenue[i].gross.cents = majorToCents(e.target.value);
                                                        next.revenue[i].gross.source = 'manual';
                                                    })
                                                }
                                            />
                                        </Field>
                                        <Field label="渠道费" hint={line.fee.note}>
                                            <Input
                                                className={INPUT}
                                                inputMode="decimal"
                                                value={centsToMajor(line.fee.cents)}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.revenue[i].fee.cents = majorToCents(e.target.value);
                                                        next.revenue[i].fee.source = 'manual';
                                                    })
                                                }
                                            />
                                        </Field>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="mb-0.5 text-red-600"
                                            onClick={() =>
                                                patch((next) => {
                                                    next.revenue.splice(i, 1);
                                                })
                                            }
                                        >
                                            删除
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    {/* 成本 */}
                    <Panel
                        title="第三方成本"
                        description="用户侧成本：模型、数据接口、转写 / OCR 等。服务器与域名走下面的「发起人前期垫付」，不进这里。"
                        actions={
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    patch((next) => {
                                        next.costs.push({ key: 'other', amount: blankMoney('CNY') });
                                    })
                                }
                            >
                                添加一行
                            </Button>
                        }
                    >
                        {data.costs.length === 0 ? (
                            <p className="text-sm text-neutral-gray-medium">本期暂无成本行。点「自动取数」从快照与网关流水推算，或手动添加。</p>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {data.costs.map((line, i) => (
                                    <div
                                        key={i}
                                        className="grid items-end gap-3 border-t border-neutral-gray-light/70 pt-4 md:grid-cols-[14rem_8rem_1fr_1fr_auto]"
                                    >
                                        <Field label="科目">
                                            <select
                                                className={SELECT}
                                                value={line.key}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.costs[i].key = e.target.value as CostKey;
                                                    })
                                                }
                                            >
                                                {COST_KEYS.map((k) => (
                                                    <option key={k} value={k}>
                                                        {COST_LABEL[k]}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="币种">
                                            <select
                                                className={SELECT}
                                                value={line.amount.currency}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.costs[i].amount.currency = e.target.value as ReportCurrency;
                                                    })
                                                }
                                            >
                                                <option value="CNY">CNY</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </Field>
                                        <Field
                                            label="金额"
                                            suffix={line.amount.source === 'auto' ? '自动' : '手工'}
                                            hint={line.amount.note}
                                        >
                                            <Input
                                                className={INPUT}
                                                inputMode="decimal"
                                                value={centsToMajor(line.amount.cents)}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.costs[i].amount.cents = majorToCents(e.target.value);
                                                        next.costs[i].amount.source = 'manual';
                                                    })
                                                }
                                            />
                                        </Field>
                                        <Field label="自定义名称" hint="只在「其他」科目下显示">
                                            <Input
                                                className={INPUT}
                                                value={line.label ?? ''}
                                                onChange={(e) =>
                                                    patch((next) => {
                                                        next.costs[i].label = e.target.value;
                                                    })
                                                }
                                            />
                                        </Field>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="mb-0.5 text-red-600"
                                            onClick={() =>
                                                patch((next) => {
                                                    next.costs.splice(i, 1);
                                                })
                                            }
                                        >
                                            删除
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    {/* 发起人前期垫付 + 汇率 */}
                    <Panel title="发起人前期垫付" description="服务器、域名等前期开销，由发起人先行垫付，一开始不向用户收。只作公开展示，不计入用户侧成本、不进下面的盈余公式；但盈余有结余时优先用来摊销这里的金额。">
                        <div className="grid gap-5 md:grid-cols-3">
                            <Field label="币种">
                                <select
                                    className={SELECT}
                                    value={data.founderCosts.currency}
                                    onChange={(e) =>
                                        patch((next) => {
                                            next.founderCosts.currency = e.target.value as ReportCurrency;
                                        })
                                    }
                                >
                                    <option value="CNY">CNY</option>
                                    <option value="USD">USD</option>
                                </select>
                            </Field>
                            <Field label="金额">
                                <Input
                                    className={INPUT}
                                    inputMode="decimal"
                                    value={centsToMajor(data.founderCosts.cents)}
                                    onChange={(e) =>
                                        patch((next) => {
                                            next.founderCosts.cents = majorToCents(e.target.value);
                                            next.founderCosts.source = 'manual';
                                        })
                                    }
                                />
                            </Field>
                            <Field label="美元折人民币汇率" hint="填了才会在公开页显示「合计（人民币）」一行">
                                <Input
                                    className={INPUT}
                                    inputMode="decimal"
                                    value={data.usdToCnyRate === null ? '' : String(data.usdToCnyRate)}
                                    onChange={(e) => {
                                        const t = e.target.value.trim();
                                        const n = t === '' ? null : Number(t);
                                        patch((next) => {
                                            next.usdToCnyRate = n !== null && Number.isFinite(n) && n > 0 ? n : null;
                                        });
                                    }}
                                />
                            </Field>
                        </div>
                    </Panel>

                    {/* 捐赠 */}
                    <Panel title="捐赠" description="盈余先摊销发起人前期垫付，摊完后的余额捐给全国性慈善机构。金额、机构与凭证都在这里填。">
                        <div className="grid gap-5 md:grid-cols-3">
                            <Field label="币种">
                                <select
                                    className={SELECT}
                                    value={data.donation.amount.currency}
                                    onChange={(e) =>
                                        patch((next) => {
                                            next.donation.amount.currency = e.target.value as ReportCurrency;
                                        })
                                    }
                                >
                                    <option value="CNY">CNY</option>
                                    <option value="USD">USD</option>
                                </select>
                            </Field>
                            <Field label="捐赠金额">
                                <Input
                                    className={INPUT}
                                    inputMode="decimal"
                                    value={centsToMajor(data.donation.amount.cents)}
                                    onChange={(e) =>
                                        patch((next) => {
                                            next.donation.amount.cents = majorToCents(e.target.value);
                                            next.donation.amount.source = 'manual';
                                        })
                                    }
                                />
                            </Field>
                            <Field label="受赠机构">
                                <Input
                                    className={INPUT}
                                    value={data.donation.org}
                                    onChange={(e) =>
                                        patch((next) => {
                                            next.donation.org = e.target.value;
                                        })
                                    }
                                />
                            </Field>
                        </div>
                        <div className="mt-5">
                            <Field label="捐赠说明">
                                <textarea
                                    className={TEXTAREA}
                                    rows={3}
                                    value={data.donation.note}
                                    onChange={(e) =>
                                        patch((next) => {
                                            next.donation.note = e.target.value;
                                        })
                                    }
                                />
                            </Field>
                        </div>

                        {/* 凭证 */}
                        <div className="mt-6 border-t border-neutral-gray-light/70 pt-5">
                            <p className="mb-3 text-sm font-medium text-neutral-gray-dark">捐赠凭证</p>
                            <div className="flex flex-wrap items-end gap-3">
                                <Field label="文件" hint="JPG / PNG / WebP / PDF，单个不超过 8 MB">
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,application/pdf"
                                        className="text-sm text-neutral-gray-dark"
                                    />
                                </Field>
                                <Field label="说明">
                                    <Input
                                        className={INPUT}
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                        placeholder="如：2026 年上半年捐赠回执"
                                    />
                                </Field>
                                <Button size="sm" variant="outline" onClick={uploadReceipt} disabled={busy}>
                                    上传
                                </Button>
                            </div>
                            {receipts.length > 0 && (
                                <ul className="mt-4 flex flex-col gap-2">
                                    {receipts.map((r) => (
                                        <li
                                            key={r.id}
                                            className="flex items-center justify-between gap-3 border-t border-neutral-gray-light/60 pt-2 text-sm"
                                        >
                                            <span className="flex min-w-0 items-center gap-2 text-neutral-gray-dark">
                                                <FileText className="h-4 w-4 flex-shrink-0 text-neutral-gray-medium" strokeWidth={1.5} />
                                                <span className="truncate">{r.caption || r.fileName}</span>
                                                <span className="font-mono text-xs text-neutral-gray-medium">
                                                    {(r.size / 1024).toFixed(0)} KB
                                                </span>
                                                {status === 'published' && (
                                                    <a
                                                        href={url(`/api/transparency/receipt/${r.id}`)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-king-forest hover:underline"
                                                    >
                                                        查看
                                                    </a>
                                                )}
                                            </span>
                                            <button
                                                onClick={() => deleteReceipt(r.id)}
                                                className="text-xs text-red-600 hover:underline"
                                            >
                                                删除
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </Panel>

                    {/* 备注 */}
                    <Panel title="备注" description="公开页最下方的自由文字。口径说明、特殊情况、下一期计划都写在这里。">
                        <textarea
                            className={TEXTAREA}
                            rows={5}
                            value={data.remarks}
                            onChange={(e) =>
                                patch((next) => {
                                    next.remarks = e.target.value;
                                })
                            }
                        />
                    </Panel>

                    {/* 汇总预览 */}
                    <Panel title="汇总预览" description="收入 − 渠道费 − 第三方成本 = 盈余；盈余优先摊销发起人前期垫付，摊完后的余额才捐赠。保存前即时计算，与公开页同一口径。">
                        {summary.byCurrency.length === 0 ? (
                            <p className="text-sm text-neutral-gray-medium">还没有可汇总的金额。</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] border-collapse text-sm">
                                    <thead>
                                        <tr className="border-b border-neutral-gray-light/70 text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">
                                            <th className="py-2 pr-4 text-left font-medium">币种</th>
                                            <th className="py-2 pr-4 text-right font-medium">收入</th>
                                            <th className="py-2 pr-4 text-right font-medium">渠道费</th>
                                            <th className="py-2 pr-4 text-right font-medium">第三方成本</th>
                                            <th className="py-2 text-right font-medium">盈余</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.byCurrency.map((row) => (
                                            <tr key={row.currency} className="border-b border-neutral-gray-light/50">
                                                <td className="py-2.5 pr-4 text-neutral-gray-dark">{row.currency}</td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                    {fmtCents(row.grossCents, row.currency)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                    {fmtCents(row.feeCents, row.currency)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                    {fmtCents(row.costCents, row.currency)}
                                                </td>
                                                <td className="py-2.5 text-right font-mono font-medium text-king-forest tabular-nums">
                                                    {fmtCents(row.netCents, row.currency)}
                                                </td>
                                            </tr>
                                        ))}
                                        {summary.combinedCny && (
                                            <tr className="border-b border-neutral-gray-light/50">
                                                <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                                    合计（1 USD = {data.usdToCnyRate} CNY）
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                    {fmtCents(summary.combinedCny.grossCents, 'CNY')}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                    {fmtCents(summary.combinedCny.feeCents, 'CNY')}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                    {fmtCents(summary.combinedCny.costCents, 'CNY')}
                                                </td>
                                                <td className="py-2.5 text-right font-mono font-medium text-king-forest tabular-nums">
                                                    {fmtCents(summary.combinedCny.netCents, 'CNY')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-neutral-gray-medium">
                            发起人前期垫付：{fmtMoney(data.founderCosts)}（不参与上表计算，盈余优先摊销这里）
                            {summary.hasNulls && ' · 有金额尚未填写，汇总按跳过处理'}
                        </p>
                    </Panel>
                </>
            )}
        </div>
    );
}
