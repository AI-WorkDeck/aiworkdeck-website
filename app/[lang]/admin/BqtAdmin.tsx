'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminSite } from './AdminWorkspace';
import { callJson, transportMessage } from './adminApi';
import {
    ConfigStatus,
    EmptyState,
    Field,
    MetricTile,
    Notice,
    Panel,
    SectionHeader,
    Skeleton,
    StatusDot,
    TableShell,
    TableSkeleton,
    Thead,
    TD,
    TD_NUM,
    TH,
    TH_RIGHT,
    TR,
    type Tone,
} from './ui';

/**
 * 包晴天律师积分通道后台（国内站专属；在国际站打开时经后台代理访问国内站）。
 * 管理维护者专用，与 AdminPanel 一样界面固定中文、不走 i18n 词典。
 * 写操作全部落到 lib/bqt-member.ts（设置留痕、重发、重扣、放弃）。
 */

interface Settings {
    tunnelEnabled: boolean;
    centsPerPoint: number | null;
    marginMultiplier: number | null;
    grantProRights: boolean;
    updatedAt: string;
    updatedBy: string | null;
}
interface Stats {
    today: { points: string; cents: number; count: number };
    month: { points: string; cents: number; count: number };
    failed: number;
    stale: number;
    pending: number;
    outstandingCents: number;
}
interface Overview {
    settings: Settings;
    globalMargin: number;
    effectiveMargin: number;
    connection: { baseUrl: string | null; appIdMasked: string | null; secretConfigured: boolean; envComplete: boolean; tunnelActive: boolean };
    audit: Array<{ id: number; changedAt: string; actor: string | null; field: string; oldValue: string | null; newValue: string | null }>;
    stats: Stats;
}
interface Entitlement {
    lawyerId: string;
    levelCode: 'LIGHT' | 'GROWTH' | null;
    status: 'ACTIVE' | 'EXPIRED';
    expireAt: string | null;
    aiWorkbench: boolean;
    points: string;
    fetchedAt: string;
}
interface UserBrief { username: string; displayName: string }
interface LawyerRow {
    userId: string;
    lawyerId: string;
    bqtName: string | null;
    mobileMasked: string | null;
    boundAt: string;
    user: UserBrief | null;
    entitlement: Entitlement | null;
    outstandingCents: number;
    failedCount: number;
}
type ConsumeState = 'pending' | 'sending' | 'succeeded' | 'failed' | 'waived';
interface ConsumeRow {
    requestNo: string;
    userId: string;
    lawyerId: string;
    points: string;
    cents: number;
    service: string;
    refId: string | null;
    state: ConsumeState;
    resultCode: string | null;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
    resolvedBy: string | null;
    user: UserBrief | null;
}
interface Paged<T> { total: number; page: number; pageSize: number; rows: T[] }

const ERRORS: Record<string, string> = {
    ratio_required: '请先设置并保存「积分比例」再开启通道。',
    env_missing: '服务器缺少 AWD_BQT_MEMBER_BASE_URL / APP_ID / APP_SECRET 环境变量，无法开启通道。',
    invalid_cents_per_point: '积分比例需大于 0、不超过 100000，最多 4 位小数。',
    invalid_margin: '毛利乘数需在 1 到 10 之间（留空 = 跟随全站）。',
    invalid_tunnel_enabled: '通道开关取值无效。',
    invalid_grant_pro_rights: 'Pro 权益开关取值无效。',
    empty_patch: '没有需要保存的改动。',
    invalid_lawyer_id: '律师 ID 应为 1–19 位数字。',
    bqt_cn_only: '包晴天通道只在国内站运行。',
    invalid_state: '这笔扣减的状态已变化，请刷新后再试。',
    not_found: '找不到这笔扣减，请刷新。',
    unauthorized: '登录已失效，请重新登录。',
};

const FIELD_LABEL: Record<string, string> = {
    tunnelEnabled: '通道开关',
    centsPerPoint: '积分比例（分/积分）',
    marginMultiplier: '包晴天线毛利乘数',
    grantProRights: '有效会员享 Pro 权益',
};

const STATE_META: Record<ConsumeState, { tone: Tone; label: string }> = {
    pending: { tone: 'warn', label: '待发送' },
    sending: { tone: 'warn', label: '发送中' },
    succeeded: { tone: 'ok', label: '已扣' },
    failed: { tone: 'danger', label: '失败' },
    waived: { tone: 'muted', label: '已放弃' },
};

const LEVEL_LABEL: Record<string, string> = { LIGHT: '轻享会员', GROWTH: '成长会员' };

/** 与 lib/bqt-member.ts centsToPointsHundredths 同口径：向上取整到 0.01 积分。 */
function pointsFor(cents: number, centsPerPoint: number): string {
    const h = Math.ceil((cents * 100) / centsPerPoint - 1e-6);
    return `${Math.trunc(h / 100)}.${String(h % 100).padStart(2, '0')}`;
}

const VIEWS = [
    { key: 'settings', label: '设置与连接' },
    { key: 'lawyers', label: '绑定律师' },
    { key: 'ledger', label: '扣减台账' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const SELECT_CLASS =
    'h-10 rounded-lg border border-neutral-gray-light bg-white px-3 text-sm text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint';

export function BqtAdmin({ onNeedLogin }: { onNeedLogin: () => void }) {
    const { fetch, copy, locale } = useAdminSite();
    const fmtYuan = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CNY' }).format(cents / 100);
    const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { hour12: false }) : '—');
    const [data, setData] = useState<Overview | null>(null);
    const [loadError, setLoadError] = useState('');
    const [needLogin, setNeedLogin] = useState(false);
    const [view, setView] = useState<View>('settings');

    const explain = useCallback(
        (r: { status: number; error: string; body?: Record<string, unknown> }) => {
            if (r.status === 401) setNeedLogin(true);
            return transportMessage(r, copy) ?? ERRORS[r.error] ?? `操作失败（${r.error}）`;
        },
        [copy],
    );

    const load = useCallback(async () => {
        setLoadError('');
        const r = await callJson<Overview>(fetch, '/api/admin/bqt');
        if (r.ok) setData(r.data);
        else setLoadError(explain(r));
    }, [fetch, explain]);

    useEffect(() => {
        const v = new URLSearchParams(window.location.search).get('bqtView');
        if (VIEWS.some(x => x.key === v)) setView(v as View);
        load();
    }, [load]);

    function selectView(next: View) {
        setView(next);
        const url = new URL(window.location.href);
        url.searchParams.set('bqtView', next);
        window.history.replaceState(null, '', url);
    }

    if (needLogin) {
        return (
            <Notice>
                <p className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" strokeWidth={1.75} />尚未登录后台。请先在本站标签页输入管理口令，再回到「包晴天」。</p>
                <Button onClick={onNeedLogin} variant="outline" className="mt-3">去登录</Button>
            </Notice>
        );
    }
    if (loadError && !data) return <Notice><p>{loadError}</p><Button onClick={load} variant="outline" className="mt-3">{copy.retry}</Button></Notice>;
    if (!data) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-10 w-56" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    const s = data.stats;
    const attention = s.failed + s.stale;
    return (
        <div className="flex flex-col gap-8">
            <SectionHeader
                eyebrow="计费线 · 包晴天"
                title="包晴天律师积分通道"
                description="扫码绑定的包晴天律师使用平台 AI 时，按比例扣包晴天积分而不是本站钱包。通道关闭时律师回到本站钱包计费。"
                actions={
                    <Button variant="outline" size="sm" onClick={load} className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark">
                        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />刷新
                    </Button>
                }
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricTile label="通道" value={data.connection.tunnelActive ? '生效中' : '未生效'} hint={data.settings.centsPerPoint ? `1 元 = ${Number((100 / data.settings.centsPerPoint).toFixed(4))} 积分` : '未设比例'} />
                <MetricTile label="今日已扣（上海时间）" value={s.today.points} hint={`积分 · ${fmtYuan(s.today.cents)} · ${s.today.count} 笔`} />
                <MetricTile label="本月已扣" value={s.month.points} hint={`积分 · ${fmtYuan(s.month.cents)} · ${s.month.count} 笔`} />
                <MetricTile label="待处理" value={attention} hint={`失败 ${s.failed} · 滞留 ${s.stale} · 未扣成 ${fmtYuan(s.outstandingCents)}`} />
            </div>
            <div className="flex flex-wrap gap-1 border-b border-neutral-gray-light/80" role="tablist">
                {VIEWS.map(v => (
                    <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => selectView(v.key)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm ${view === v.key ? 'border-king-forest font-medium text-king-forest' : 'border-transparent text-neutral-gray-medium hover:text-neutral-gray-dark'}`}>
                        {v.label}
                        {v.key === 'ledger' && attention > 0 && <span className="ms-2 font-mono text-xs text-red-600">{attention}</span>}
                    </button>
                ))}
            </div>
            {view === 'settings' && <SettingsView data={data} onSaved={setData} explain={explain} fmtTime={fmtTime} fmtYuan={fmtYuan} />}
            {view === 'lawyers' && <LawyersView explain={explain} fmtTime={fmtTime} fmtYuan={fmtYuan} />}
            {view === 'ledger' && <LedgerView explain={explain} fmtTime={fmtTime} fmtYuan={fmtYuan} onChanged={load} />}
        </div>
    );
}

type Explain = (r: { status: number; error: string; body?: Record<string, unknown> }) => string;
type Fmt = (v: string | null) => string;
type FmtMoney = (cents: number) => string;

// ─── 设置与连接 ─────────────────────────────────────────────────────────

function SettingsView({ data, onSaved, explain, fmtTime, fmtYuan }: { data: Overview; onSaved: (d: Overview) => void; explain: Explain; fmtTime: Fmt; fmtYuan: FmtMoney }) {
    const { fetch } = useAdminSite();
    const { settings, connection } = data;
    // 后台按「1 元 = N 积分」录入，存储仍是 centsPerPoint = 100 / N（不截断，1 元 = 3 积分时为 33.33…）。
    const [ratio, setRatio] = useState(settings.centsPerPoint != null ? String(Number((100 / settings.centsPerPoint).toFixed(4))) : '');
    const [margin, setMargin] = useState(settings.marginMultiplier != null ? String(settings.marginMultiplier) : '');
    const [grantPro, setGrantPro] = useState(settings.grantProRights);
    const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    async function patch(body: Record<string, unknown>, okText: string) {
        setBusy(true);
        setMsg(null);
        const r = await callJson<Overview & { ok: true }>(fetch, '/api/admin/bqt', { method: 'PATCH', body });
        setBusy(false);
        if (!r.ok) { setMsg({ tone: 'danger', text: explain(r) }); return; }
        onSaved(r.data);
        setMsg({ tone: 'info', text: okText });
    }

    function saveSettings(e: React.FormEvent) {
        e.preventDefault();
        const body: Record<string, unknown> = {};
        const nextRatio = ratio.trim() === '' ? null : 100 / Number(ratio);
        const nextMargin = margin.trim() === '' ? null : Number(margin);
        const sameRatio = nextRatio === settings.centsPerPoint || (nextRatio != null && settings.centsPerPoint != null && Math.abs(nextRatio - settings.centsPerPoint) < 1e-9);
        if (!sameRatio) body.centsPerPoint = nextRatio;
        if (nextMargin !== settings.marginMultiplier) body.marginMultiplier = nextMargin;
        if (grantPro !== settings.grantProRights) body.grantProRights = grantPro;
        if (Object.keys(body).length === 0) { setMsg({ tone: 'info', text: ERRORS.empty_patch }); return; }
        if ('centsPerPoint' in body && settings.tunnelEnabled &&
            !window.confirm(`通道正在运行。改比例只影响之后登记的扣减，已登记的仍按原积分发送。确认把比例改为 1 元 = ${ratio.trim() || '（清空）'} 积分？`)) return;
        patch(body, '已保存。');
    }

    function toggleTunnel() {
        const next = !settings.tunnelEnabled;
        const text = next
            ? `开启后，已绑定的包晴天律师使用平台 AI 时改为扣包晴天积分（1 元 = ${settings.centsPerPoint ? Number((100 / settings.centsPerPoint).toFixed(4)) : '?'} 积分），不再扣本站钱包。\n\n确认开启通道？`
            : '关闭后，包晴天律师回到本站钱包计费；已登记的扣减不受影响，仍需在台账里处理。\n\n确认关闭通道？';
        if (!window.confirm(text)) return;
        patch({ tunnelEnabled: next }, next ? '通道已开启。' : '通道已关闭。');
    }

    const ppy = Number(ratio);
    const ratioOk = ratio.trim() !== '' && Number.isFinite(ppy) && ppy > 0;
    const cpp = ratioOk ? 100 / ppy : 0;
    const marginNum = margin.trim() === '' ? data.globalMargin : Number(margin);
    const inactiveReason = !settings.tunnelEnabled ? '后台开关未开' : !settings.centsPerPoint ? '未设积分比例' : !connection.envComplete ? '环境变量不全' : '';

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="通道开关" description="通道实际生效需同时满足：后台开关开、积分比例已设、服务器环境变量齐全。">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-col gap-1.5 text-sm">
                        <StatusDot tone={settings.tunnelEnabled ? 'ok' : 'muted'}>后台开关：{settings.tunnelEnabled ? '已开' : '已关'}</StatusDot>
                        <StatusDot tone={connection.tunnelActive ? 'ok' : 'warn'}>实际生效：{connection.tunnelActive ? '是' : `否（${inactiveReason}）`}</StatusDot>
                        <span className="text-xs text-neutral-gray-medium">最后修改 {fmtTime(settings.updatedAt)} · {settings.updatedBy ?? '—'}</span>
                    </div>
                    <Button onClick={toggleTunnel} disabled={busy} variant={settings.tunnelEnabled ? 'destructive' : 'default'}>
                        {settings.tunnelEnabled ? '关闭通道' : '开启通道'}
                    </Button>
                </div>
                {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
            </Panel>

            <Panel title="连接状态" description="环境变量只在服务器配置，后台只显示是否配置，不显示密钥。">
                <ConfigStatus ok={!!connection.baseUrl} label="接口地址" detail={<span className="font-mono" dir="ltr">{connection.baseUrl ?? 'AWD_BQT_MEMBER_BASE_URL'}</span>} />
                <ConfigStatus ok={!!connection.appIdMasked} label="App ID" detail={<span className="font-mono" dir="ltr">{connection.appIdMasked ?? 'AWD_BQT_MEMBER_APP_ID'}</span>} />
                <ConfigStatus ok={connection.secretConfigured} label="App Secret" detail="AWD_BQT_MEMBER_APP_SECRET（不回显）" />
                <LookupBox explain={explain} fmtTime={fmtTime} />
            </Panel>

            <Panel title="计费设置" description="积分比例只影响之后登记的扣减；已登记的扣减按登记时的积分发送（包晴天要求重发原积分）。" className="xl:col-span-2">
                <form onSubmit={saveSettings} className="grid gap-6 md:grid-cols-3">
                    <Field label="积分比例：1 元 = N 积分" suffix="centsPerPoint = 100 / N" hint="按律师在包晴天买积分的价格定，例如 1 元 = 3 积分。最多 4 位小数。">
                        <Input value={ratio} onChange={e => setRatio(e.target.value)} inputMode="decimal" placeholder="例如 3" className="bg-white" />
                    </Field>
                    <Field label="包晴天线毛利乘数" suffix="marginMultiplier"
                        hint={`留空 = 跟随全站（当前 ×${data.globalMargin}）。生效值 ×${data.effectiveMargin}。1.0 = 按成本、不加价。`}>
                        <Input value={margin} onChange={e => setMargin(e.target.value)} inputMode="decimal" placeholder={`跟随全站 ×${data.globalMargin}`} className="bg-white" />
                    </Field>
                    <Field label="有效会员享 Pro 权益" suffix="grantProRights" hint="会员 ACTIVE 且开通 AI 工作台时，按会员到期日给 Pro 权益。">
                        <label className="flex h-10 items-center gap-2 text-sm text-neutral-gray-dark">
                            <input type="checkbox" checked={grantPro} onChange={e => setGrantPro(e.target.checked)} className="h-4 w-4 accent-king-forest" />
                            {grantPro ? '享有' : '不享有'}
                        </label>
                    </Field>
                    <div className="md:col-span-3">
                        <Notice>
                            {ratioOk ? (
                                <>
                                    <p>1 元 = {ppy} 积分（1 积分 = {fmtYuan(cpp)}）；一次 {fmtYuan(50)} 的调用扣 <b className="font-mono">{pointsFor(50, cpp)}</b> 积分。</p>
                                    {Number.isFinite(marginNum) && marginNum >= 1 && (
                                        <p className="mt-1 text-neutral-gray-medium">
                                            上游成本 {fmtYuan(50)} × 毛利 {marginNum} = 售价 {fmtYuan(Math.ceil(50 * marginNum))}，扣 {pointsFor(Math.ceil(50 * marginNum), cpp)} 积分。扣分向上取整到 0.01 积分。
                                        </p>
                                    )}
                                </>
                            ) : <p>填写积分比例后，这里显示换算示例。</p>}
                        </Notice>
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                        <Button type="submit" disabled={busy}>保存设置</Button>
                    </div>
                </form>
            </Panel>

            <Panel title="改动留痕" description="后台共用一个口令，操作人记为来源 IP。最近 50 条。" padded={false} className="xl:col-span-2">
                {data.audit.length === 0 ? <EmptyState icon={Inbox} title="还没有改动记录" /> : (
                    <TableShell>
                        <Thead><tr><th className={TH}>时间</th><th className={TH}>操作人</th><th className={TH}>字段</th><th className={TH}>原值</th><th className={TH}>新值</th></tr></Thead>
                        <tbody>
                            {data.audit.map(a => (
                                <tr key={a.id} className={TR}>
                                    <td className={`${TD} whitespace-nowrap`}>{fmtTime(a.changedAt)}</td>
                                    <td className={`${TD} font-mono text-xs`}>{a.actor ?? '—'}</td>
                                    <td className={TD}>{FIELD_LABEL[a.field] ?? a.field}</td>
                                    <td className={`${TD} font-mono text-xs`}>{a.oldValue ?? '—'}</td>
                                    <td className={`${TD} font-mono text-xs`}>{a.newValue ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </Panel>
        </div>
    );
}

function EntitlementSummary({ e, fmtTime }: { e: Entitlement; fmtTime: Fmt }) {
    return (
        <div className="flex flex-col gap-1 text-sm">
            <StatusDot tone={e.status === 'ACTIVE' && e.aiWorkbench ? 'ok' : e.status === 'ACTIVE' ? 'warn' : 'muted'}>
                {e.status === 'ACTIVE' ? '有效会员' : '未开通/已过期'}
                {e.levelCode ? ` · ${LEVEL_LABEL[e.levelCode]}` : ''}
                {e.status === 'ACTIVE' && !e.aiWorkbench ? ' · AI 工作台未开' : ''}
            </StatusDot>
            <span className="text-xs text-neutral-gray-medium">可用 {e.points} 积分 · 到期 {fmtTime(e.expireAt)}</span>
        </div>
    );
}

/** 测试连接 / 查律师：只读查权益，不扣积分。 */
function LookupBox({ explain, fmtTime }: { explain: Explain; fmtTime: Fmt }) {
    const { fetch } = useAdminSite();
    const [lawyerId, setLawyerId] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: true; e: Entitlement; ms: number } | { ok: false; text: string } | null>(null);
    async function lookup(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setResult(null);
        const r = await callJson<{ entitlement: Entitlement; latencyMs: number }>(fetch, '/api/admin/bqt/lookup', { method: 'POST', body: { lawyerId: lawyerId.trim() } });
        setBusy(false);
        if (r.ok) setResult({ ok: true, e: r.data.entitlement, ms: r.data.latencyMs });
        else setResult({ ok: false, text: r.error === 'bqt_unavailable' ? `包晴天不可用：${String(r.body.reason ?? '')}` : explain(r) });
    }
    return (
        <form onSubmit={lookup} className="mt-4 border-t border-neutral-gray-light/70 pt-4 flex flex-col gap-3">
            <Field label="测试连接 / 查律师" hint="按律师 ID 实时查一次会员权益（只读，不扣积分），并刷新本地快照。">
                <div className="flex gap-2">
                    <Input value={lawyerId} onChange={e => setLawyerId(e.target.value)} inputMode="numeric" placeholder="律师 ID（lawyerId）" className="bg-white font-mono" />
                    <Button type="submit" variant="outline" disabled={busy || !lawyerId.trim()} className="gap-1.5"><Search className="w-3.5 h-3.5" />查询</Button>
                </div>
            </Field>
            {result && (result.ok
                ? <Notice><EntitlementSummary e={result.e} fmtTime={fmtTime} /><p className="mt-1 text-xs text-neutral-gray-medium">连接正常 · {result.ms} ms</p></Notice>
                : <Notice tone="danger">{result.text}</Notice>)}
        </form>
    );
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-neutral-gray-light/70 text-xs text-neutral-gray-medium">
            <span>共 {total} 条 · 第 {page}/{pages} 页</span>
            <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</Button>
            </div>
        </div>
    );
}

function snapshotAge(iso: string): string {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
    if (min < 60) return `${min} 分钟前`;
    if (min < 48 * 60) return `${Math.round(min / 60)} 小时前`;
    return `${Math.round(min / 1440)} 天前`;
}

// ─── 绑定律师 ───────────────────────────────────────────────────────────

function LawyersView({ explain, fmtTime, fmtYuan }: { explain: Explain; fmtTime: Fmt; fmtYuan: FmtMoney }) {
    const { fetch } = useAdminSite();
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState<Paged<LawyerRow> | null>(null);
    const [err, setErr] = useState('');
    const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');

    const load = useCallback(async (query: string, p: number) => {
        const r = await callJson<Paged<LawyerRow>>(fetch, `/api/admin/bqt/lawyers?q=${encodeURIComponent(query)}&page=${p}`);
        if (r.ok) { setData(r.data); setErr(''); } else setErr(explain(r));
    }, [fetch, explain]);
    useEffect(() => { load('', 1); }, [load]);

    async function refresh(row: LawyerRow) {
        setBusy(row.userId);
        const r = await callJson<{ entitlement: Entitlement }>(fetch, '/api/admin/bqt/lookup', { method: 'POST', body: { lawyerId: row.lawyerId } });
        setBusy('');
        setRowMsg(m => ({ ...m, [row.userId]: r.ok ? '' : r.error === 'bqt_unavailable' ? `刷新失败：${String(r.body.reason ?? '')}` : explain(r) }));
        if (r.ok) load(q, page);
    }

    return (
        <Panel title="绑定律师" description="扫码绑定了包晴天账号的本站用户。权益来自本地快照，「刷新」实时查一次。" padded={false}
            actions={
                <form onSubmit={e => { e.preventDefault(); setPage(1); load(q, 1); }} className="flex gap-2">
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="律师 ID / 手机号 / 姓名 / 用户名" className="bg-white w-64" />
                    <Button type="submit" variant="outline" className="gap-1.5"><Search className="w-3.5 h-3.5" />搜索</Button>
                </form>
            }>
            {err && <div className="p-5"><Notice tone="danger">{err}</Notice></div>}
            {!data ? <TableSkeleton cols={6} /> : data.rows.length === 0 ? <EmptyState icon={Inbox} title="没有绑定的律师" hint={q ? '换个关键词试试。' : '律师在桌面端扫码登录后出现在这里。'} /> : (
                <>
                    <TableShell>
                        <Thead><tr>
                            <th className={TH}>包晴天律师</th><th className={TH}>本站账号</th><th className={TH}>会员权益</th>
                            <th className={TH}>快照</th><th className={TH_RIGHT}>未扣成</th><th className={TH_RIGHT}>操作</th>
                        </tr></Thead>
                        <tbody>
                            {data.rows.map(row => (
                                <tr key={row.userId} className={TR}>
                                    <td className={TD}>
                                        <p>{row.bqtName ?? '—'}</p>
                                        <p className="font-mono text-xs text-neutral-gray-medium" dir="ltr">{row.lawyerId}{row.mobileMasked ? ` · ${row.mobileMasked}` : ''}</p>
                                    </td>
                                    <td className={TD}>
                                        <p>{row.user?.displayName ?? '（用户不存在）'}</p>
                                        <p className="font-mono text-xs text-neutral-gray-medium">{row.user ? `@${row.user.username}` : row.userId}</p>
                                    </td>
                                    <td className={TD}>{row.entitlement ? <EntitlementSummary e={row.entitlement} fmtTime={fmtTime} /> : <span className="text-neutral-gray-medium">未查询过</span>}</td>
                                    <td className={`${TD} text-xs text-neutral-gray-medium whitespace-nowrap`} title={row.entitlement ? fmtTime(row.entitlement.fetchedAt) : undefined}>
                                        {row.entitlement ? snapshotAge(row.entitlement.fetchedAt) : '—'}
                                    </td>
                                    <td className={TD_NUM}>
                                        {row.outstandingCents > 0 ? fmtYuan(row.outstandingCents) : '—'}
                                        {row.failedCount > 0 && <p className="text-xs text-red-600">失败 {row.failedCount} 笔</p>}
                                    </td>
                                    <td className={`${TD} text-right`}>
                                        <Button size="sm" variant="outline" disabled={busy === row.userId} onClick={() => refresh(row)} className="gap-1.5">
                                            <RefreshCw className="w-3.5 h-3.5" />刷新
                                        </Button>
                                        {rowMsg[row.userId] && <p className="mt-1 text-xs text-red-600">{rowMsg[row.userId]}</p>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                    <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={p => { setPage(p); load(q, p); }} />
                </>
            )}
        </Panel>
    );
}

// ─── 扣减台账 ───────────────────────────────────────────────────────────

const ACTIONS = {
    retry: { label: '立即重发', confirm: (r: ConsumeRow) => `用原单号、原积分（${r.points}）立即向包晴天重发这笔扣减？\n${r.requestNo}` },
    reissue: { label: '重扣', confirm: (r: ConsumeRow) => `律师已补足积分？原单将标记放弃，并按原积分（${r.points}）开新单号立即扣减。\n${r.requestNo}` },
    waive: { label: '放弃', confirm: (r: ConsumeRow) => `放弃这笔 ${r.points} 积分的扣减？由平台承担，不再向律师收取，且不可恢复。\n${r.requestNo}` },
} as const;
type Action = keyof typeof ACTIONS;

function actionsFor(r: ConsumeRow): Action[] {
    if (r.state === 'pending' || r.state === 'sending') return ['retry'];
    if (r.state === 'failed') return ['reissue', 'waive'];
    return [];
}

function ConsumeTable({ rows, fmtTime, fmtYuan, busy, onAction }: { rows: ConsumeRow[]; fmtTime: Fmt; fmtYuan: FmtMoney; busy: string; onAction: (r: ConsumeRow, a: Action) => void }) {
    return (
        <TableShell>
            <Thead><tr>
                <th className={TH}>登记时间</th><th className={TH}>单号</th><th className={TH}>用户 / 律师</th>
                <th className={TH_RIGHT}>积分</th><th className={TH_RIGHT}>金额</th><th className={TH}>状态</th><th className={TH_RIGHT}>操作</th>
            </tr></Thead>
            <tbody>
                {rows.map(r => (
                    <tr key={r.requestNo} className={TR}>
                        <td className={`${TD} whitespace-nowrap text-xs`}>{fmtTime(r.createdAt)}</td>
                        <td className={TD}>
                            <p className="font-mono text-xs break-all" dir="ltr">{r.requestNo}</p>
                            <p className="text-xs text-neutral-gray-medium">{r.service}</p>
                        </td>
                        <td className={TD}>
                            <p>{r.user?.displayName ?? r.userId}</p>
                            <p className="font-mono text-xs text-neutral-gray-medium" dir="ltr">{r.lawyerId}</p>
                        </td>
                        <td className={TD_NUM}>{r.points}</td>
                        <td className={TD_NUM}>{fmtYuan(r.cents)}</td>
                        <td className={TD}>
                            <StatusDot tone={STATE_META[r.state].tone}>{STATE_META[r.state].label}</StatusDot>
                            <p className="text-xs text-neutral-gray-medium">
                                {[r.resultCode, r.lastError, `尝试 ${r.attempts} 次`].filter(Boolean).join(' · ')}
                                {r.state === 'pending' || r.state === 'sending' ? ` · 更新于 ${fmtTime(r.updatedAt)}` : ''}
                            </p>
                            {r.resolvedBy && <p className="text-xs text-neutral-gray-medium">{r.resolvedBy} · {fmtTime(r.resolvedAt)}</p>}
                        </td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                            {actionsFor(r).map(a => (
                                <Button key={a} size="sm" variant={a === 'waive' ? 'ghost' : 'outline'} disabled={busy === r.requestNo} onClick={() => onAction(r, a)} className="ms-2">
                                    {ACTIONS[a].label}
                                </Button>
                            ))}
                        </td>
                    </tr>
                ))}
            </tbody>
        </TableShell>
    );
}

function LedgerView({ explain, fmtTime, fmtYuan, onChanged }: { explain: Explain; fmtTime: Fmt; fmtYuan: FmtMoney; onChanged: () => void }) {
    const { fetch } = useAdminSite();
    const [filter, setFilter] = useState({ state: '', q: '', from: '', to: '' });
    const [page, setPage] = useState(1);
    const [list, setList] = useState<Paged<ConsumeRow> | null>(null);
    const [queue, setQueue] = useState<Paged<ConsumeRow> | null>(null);
    const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
    const [busy, setBusy] = useState('');

    const loadList = useCallback(async (f: typeof filter, p: number) => {
        const qs = new URLSearchParams({ ...f, page: String(p) });
        const r = await callJson<Paged<ConsumeRow>>(fetch, `/api/admin/bqt/consumes?${qs}`);
        if (r.ok) setList(r.data); else setMsg({ tone: 'danger', text: explain(r) });
    }, [fetch, explain]);
    const loadQueue = useCallback(async () => {
        const r = await callJson<Paged<ConsumeRow>>(fetch, '/api/admin/bqt/consumes?state=attention');
        if (r.ok) setQueue(r.data);
    }, [fetch]);
    useEffect(() => { loadQueue(); loadList({ state: '', q: '', from: '', to: '' }, 1); }, [loadQueue, loadList]);

    async function act(row: ConsumeRow, action: Action) {
        if (!window.confirm(ACTIONS[action].confirm(row))) return;
        setBusy(row.requestNo);
        setMsg(null);
        const r = await callJson<{ row: ConsumeRow }>(fetch, '/api/admin/bqt/consumes/action', { method: 'POST', body: { requestNo: row.requestNo, action } });
        setBusy('');
        if (!r.ok) setMsg({ tone: 'danger', text: explain(r) });
        else {
            const after = r.data.row;
            const label = STATE_META[after.state as ConsumeState]?.label ?? after.state;
            setMsg({ tone: after.state === 'failed' ? 'danger' : 'info', text: `${ACTIONS[action].label}完成：${after.requestNo} → ${label}${after.resultCode && after.state !== 'succeeded' ? `（${after.resultCode}）` : ''}` });
        }
        loadQueue();
        loadList(filter, page);
        onChanged();
    }

    return (
        <div className="flex flex-col gap-6">
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Panel title="待处理队列" description="失败的扣减（会拦住该律师的新花费）与超过 10 分钟仍未发成的扣减。失败单：律师补足积分后「重扣」，或「放弃」由平台承担；滞留单：「立即重发」（原单号原积分，包晴天按单号幂等）。" padded={false}>
                {!queue ? <TableSkeleton cols={6} /> : queue.rows.length === 0
                    ? <EmptyState icon={Inbox} title="没有待处理的扣减" />
                    : <ConsumeTable rows={queue.rows} fmtTime={fmtTime} fmtYuan={fmtYuan} busy={busy} onAction={act} />}
                {queue && queue.total > queue.rows.length && <p className="px-5 py-3 text-xs text-neutral-gray-medium">仅显示前 {queue.rows.length} 条，共 {queue.total} 条；用下方台账筛选「待处理」翻页。</p>}
            </Panel>
            <Panel title="扣减台账" description="日期按上海时间。金额为本站分折算的售价（已含毛利）。" padded={false}
                actions={
                    <form onSubmit={e => { e.preventDefault(); setPage(1); loadList(filter, 1); }} className="flex flex-wrap items-center gap-2">
                        <select value={filter.state} onChange={e => setFilter({ ...filter, state: e.target.value })} className={SELECT_CLASS} aria-label="状态">
                            <option value="">全部状态</option>
                            <option value="attention">待处理</option>
                            {(Object.keys(STATE_META) as ConsumeState[]).map(k => <option key={k} value={k}>{STATE_META[k].label}</option>)}
                        </select>
                        <Input value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} placeholder="用户 ID / 律师 ID / 单号" className="bg-white w-52" />
                        <Input type="date" value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })} className="bg-white w-40" aria-label="起始日期" />
                        <Input type="date" value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })} className="bg-white w-40" aria-label="截止日期" />
                        <Button type="submit" variant="outline" className="gap-1.5"><Search className="w-3.5 h-3.5" />筛选</Button>
                    </form>
                }>
                {!list ? <TableSkeleton cols={6} /> : list.rows.length === 0 ? <EmptyState icon={Inbox} title="没有符合条件的扣减" /> : (
                    <>
                        <ConsumeTable rows={list.rows} fmtTime={fmtTime} fmtYuan={fmtYuan} busy={busy} onAction={act} />
                        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={p => { setPage(p); loadList(filter, p); }} />
                    </>
                )}
            </Panel>
        </div>
    );
}
