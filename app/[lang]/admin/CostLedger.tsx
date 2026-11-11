'use client';

import { useAdminSite } from './AdminWorkspace';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { HardDrive, Receipt, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    EmptyState,
    Notice,
    Panel,
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
 * 成本台账面板。数据契约见 lib/cost-ledger.ts：目录（哪些服务、什么币种、
 * 余额怎么拉）钉在服务端代码里，这里只负责展示与手动记账。
 *
 * 金额统一以 minor 单位（分 / 美分 / 点 / 次）过网络，界面上转成主单位输入输出——
 * 与后台其余页面的 fmtYuan 同一口径，避免「界面输入元、接口存分」在哪一层丢了 ×100。
 */

type CostCurrency = 'CNY' | 'USD' | 'POINT' | 'CALL';
type BurnBasis = 'override' | 'usage' | 'snapshots' | 'gateway';

interface SnapshotView {
    ts: string;
    balanceMinor: number;
    usageMinor: number | null;
    source: 'auto' | 'manual';
}

interface CostAccountView {
    service: string;
    name: string;
    kind: 'prepaid' | 'subscription';
    currency: CostCurrency;
    autoSource: 'openrouter' | 'aliyun_bss' | null;
    checkHint: string;
    balanceMinor: number | null;
    balanceAt: string | null;
    balanceSource: 'auto' | 'manual' | null;
    monthlyCostCents: number | null;
    expiresAt: string | null;
    burnOverrideMinorPerDay: number | null;
    alertDays: number;
    note: string | null;
    burnMinorPerDay: number | null;
    burnBasis: BurnBasis | null;
    daysLeft: number | null;
    alerting: boolean;
    autoConfigured: boolean;
    snapshots: SnapshotView[];
}

interface GatewayCostRow {
    service: string;
    calls: number;
    units: number;
    unit: string | null;
    rawCostCents: number | null;
    chargedCents: number;
}

interface RelayStorageUsage {
    bytes: number;
    fileCount: number;
    diskFreeBytes: number;
    diskTotalBytes: number;
    measuredAt: string;
}

interface RelayOssUsage {
    bucket: string;
    bytes: number;
    objectCount: number;
    measuredAt: string;
}

interface CostsData {
    accounts: CostAccountView[];
    gatewayDetail: GatewayCostRow[];
    alertMailConfigured: boolean;
    storage: { relay: RelayStorageUsage | null; oss: RelayOssUsage | null };
}

const CUR: Record<CostCurrency, { prefix: string; suffix: string; decimals: number }> = {
    CNY: { prefix: '¥', suffix: '', decimals: 2 },
    USD: { prefix: 'US$', suffix: '', decimals: 2 },
    POINT: { prefix: '', suffix: ' 点', decimals: 0 },
    CALL: { prefix: '', suffix: ' 次', decimals: 0 },
};

const BASIS_LABEL: Record<BurnBasis, string> = {
    override: '手动指定',
    usage: '上游用量',
    snapshots: '余额回推',
    gateway: '流水推算',
};

function fmtMinor(minor: number, currency: CostCurrency): string {
    const c = CUR[currency];
    const major = minor / Math.pow(10, c.decimals);
    return `${c.prefix}${major.toLocaleString('zh-CN', {
        minimumFractionDigits: c.decimals,
        maximumFractionDigits: c.decimals,
    })}${c.suffix}`;
}

function fmtYuan(cents: number): string {
    return fmtMinor(cents, 'CNY');
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('zh-CN');
}

function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function fmtBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = -1;
    do {
        value /= 1024;
        i++;
    } while (value >= 1024 && i < units.length - 1);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

interface Draft {
    balance: string;
    expiresAt: string;
    monthlyYuan: string;
    burnOverride: string;
    alertDays: string;
    note: string;
}

function draftOf(a: CostAccountView): Draft {
    const dec = CUR[a.currency].decimals;
    return {
        balance: '',
        expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 10) : '',
        monthlyYuan: a.monthlyCostCents === null ? '' : String(a.monthlyCostCents / 100),
        burnOverride:
            a.burnOverrideMinorPerDay === null
                ? ''
                : String(a.burnOverrideMinorPerDay / Math.pow(10, dec)),
        alertDays: String(a.alertDays),
        note: a.note ?? '',
    };
}

export function CostLedger() {
    const { fetch } = useAdminSite();
    const [data, setData] = useState<CostsData | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/costs');
        if (!res.ok) return;
        setData((await res.json()) as CostsData);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const refresh = async () => {
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch('/api/admin/costs/refresh', { method: 'POST' });
            const d = await res.json();
            if (!res.ok) {
                setMsg(`刷新失败：${d.error ?? res.status}`);
                return;
            }
            const okPart = d.refreshed?.length ? `已刷新 ${d.refreshed.length} 项` : '没有可自动刷新的账户';
            const errPart = d.errors?.length
                ? `；失败：${d.errors.map((e: { service: string; message: string }) => `${e.service}（${e.message}）`).join('、')}`
                : '';
            setMsg(okPart + errPart);
            await load();
        } finally {
            setBusy(false);
        }
    };

    const save = async (a: CostAccountView) => {
        const draft = drafts[a.service];
        if (!draft) return;
        const dec = CUR[a.currency].decimals;
        const body: Record<string, unknown> = { service: a.service };

        if (draft.balance.trim() !== '') {
            const n = Number(draft.balance);
            if (!Number.isFinite(n) || n < 0) {
                setMsg(`「${a.name}」的余额数字不合法`);
                return;
            }
            body.balanceMinor = Math.round(n * Math.pow(10, dec));
        }
        body.expiresAt = draft.expiresAt.trim() === '' ? null : draft.expiresAt;
        body.monthlyCostCents =
            draft.monthlyYuan.trim() === '' ? null : Math.round(Number(draft.monthlyYuan) * 100);
        body.burnOverrideMinorPerDay =
            draft.burnOverride.trim() === ''
                ? null
                : Math.round(Number(draft.burnOverride) * Math.pow(10, dec));
        body.alertDays = Number(draft.alertDays);
        body.note = draft.note.trim() === '' ? null : draft.note.trim();

        setBusy(true);
        setMsg('');
        try {
            const res = await fetch('/api/admin/costs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) {
                setMsg(`保存失败：${d.field ? `字段 ${d.field} 不合法` : (d.error ?? res.status)}`);
                return;
            }
            setMsg(`「${a.name}」已保存`);
            setOpen(null);
            await load();
        } finally {
            setBusy(false);
        }
    };

    if (!data) {
        return (
            <Panel padded={false}>
                <TableSkeleton rows={8} cols={5} />
            </Panel>
        );
    }

    const alerting = data.accounts.filter((a) => a.alerting);
    const needInit = data.accounts.filter(
        (a) => a.kind === 'prepaid' && a.balanceMinor === null && !a.autoConfigured
    );

    return (
        <>
            {alerting.length > 0 && (
                <Notice tone="danger">
                    {alerting.length} 项即将见底或到期：
                    {alerting.map((a) => a.name).join('、')}。尽快充值/续费，避免用户侧服务中断。
                </Notice>
            )}
            {needInit.length > 0 && (
                <Notice tone="warn">
                    以下账户还没有初始余额，推不出可用天数：
                    {needInit.map((a) => a.name).join('、')}。到对应控制台抄一次当前余额，点行内「记账」填入即可。
                </Notice>
            )}
            {!data.alertMailConfigured && (
                <Notice tone="info">
                    预警邮件未配置（需要 AWD_COST_ALERT_EMAIL + Resend 密钥）。当前只有打开本页才能看到红色预警，
                    建议在服务器 .env.local 配上，由每日 cron 兜底提醒。
                </Notice>
            )}

            <Panel
                title="外部服务账户"
                description="日耗为估算值，口径按行内标注（手动指定 / 上游用量 / 余额回推 / 流水推算）。流水推算只覆盖经网关的调用，短信、服务器续费等开销以余额回推为准。"
                actions={
                    <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
                        <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
                        刷新自动余额
                    </Button>
                }
                padded={false}
            >
                <TableShell>
                    <Thead>
                        <tr>
                            <th className={TH}>服务</th>
                            <th className={TH_RIGHT}>余额 / 到期</th>
                            <th className={TH_RIGHT}>估算日耗</th>
                            <th className={TH_RIGHT}>可用天数</th>
                            <th className={TH}>状态</th>
                            <th className={TH_RIGHT}>操作</th>
                        </tr>
                    </Thead>
                    <tbody>
                        {data.accounts.map((a) => {
                            const tone: Tone = a.alerting ? 'danger' : a.daysLeft === null ? 'muted' : 'ok';
                            const statusText = a.alerting
                                ? '需要充值/续费'
                                : a.daysLeft === null
                                  ? '缺数据'
                                  : '正常';
                            const isOpen = open === a.service;
                            return (
                                <Fragment key={a.service}>
                                    <tr className={TR}>
                                        <td className={TD}>
                                            <span className="font-medium text-neutral-dark-bg">{a.name}</span>
                                            <span className="block text-[11px] text-neutral-gray-medium mt-0.5">
                                                {a.kind === 'prepaid' ? '预付余额' : '订阅/包期'}
                                                {a.autoSource &&
                                                    (a.autoConfigured ? ' · 自动拉取' : ' · 自动拉取未配置')}
                                                {a.balanceSource === 'manual' && a.balanceAt
                                                    ? ` · 手动记于 ${fmtDate(a.balanceAt)}`
                                                    : ''}
                                            </span>
                                        </td>
                                        <td className={TD_NUM}>
                                            {a.kind === 'subscription' ? (
                                                <span>{fmtDate(a.expiresAt)}</span>
                                            ) : a.balanceMinor === null ? (
                                                <span className="text-neutral-gray-medium">未录入</span>
                                            ) : (
                                                <span className="font-bold text-neutral-dark-bg">
                                                    {fmtMinor(a.balanceMinor, a.currency)}
                                                </span>
                                            )}
                                        </td>
                                        <td className={TD_NUM}>
                                            {a.kind === 'subscription' ? (
                                                a.monthlyCostCents === null ? (
                                                    <span className="text-neutral-gray-medium">—</span>
                                                ) : (
                                                    <span>
                                                        {fmtYuan(Math.round(a.monthlyCostCents / 30))}/天
                                                        <span className="block text-[11px] text-neutral-gray-medium">
                                                            月付 {fmtYuan(a.monthlyCostCents)} 分摊
                                                        </span>
                                                    </span>
                                                )
                                            ) : a.burnMinorPerDay === null ? (
                                                <span className="text-neutral-gray-medium">推不出</span>
                                            ) : (
                                                <span>
                                                    {fmtMinor(Math.round(a.burnMinorPerDay), a.currency)}/天
                                                    <span className="block text-[11px] text-neutral-gray-medium">
                                                        {a.burnBasis ? BASIS_LABEL[a.burnBasis] : ''}
                                                    </span>
                                                </span>
                                            )}
                                        </td>
                                        <td className={TD_NUM}>
                                            {a.daysLeft === null ? (
                                                <span className="text-neutral-gray-medium">—</span>
                                            ) : (
                                                <span
                                                    className={`font-bold font-mono tabular-nums ${
                                                        a.alerting ? 'text-red-600' : 'text-neutral-dark-bg'
                                                    }`}
                                                >
                                                    {Math.max(0, Math.floor(a.daysLeft))} 天
                                                </span>
                                            )}
                                        </td>
                                        <td className={TD}>
                                            <StatusDot tone={tone}>{statusText}</StatusDot>
                                        </td>
                                        <td className={`${TD} text-right`}>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    if (isOpen) {
                                                        setOpen(null);
                                                        return;
                                                    }
                                                    setDrafts((prev) => ({ ...prev, [a.service]: draftOf(a) }));
                                                    setOpen(a.service);
                                                }}
                                            >
                                                {isOpen ? '收起' : '记账'}
                                            </Button>
                                        </td>
                                    </tr>
                                    {isOpen && drafts[a.service] && (
                                        <tr className="border-t border-neutral-gray-light/70 bg-neutral-gray-pale/50">
                                            <td className="px-5 py-4" colSpan={6}>
                                                <p className="text-[12px] text-neutral-gray-medium mb-3">{a.checkHint}</p>
                                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                                    {a.kind === 'prepaid' && (
                                                        <label className="text-[12px] text-neutral-gray-dark">
                                                            当前余额（{CUR[a.currency].prefix || CUR[a.currency].suffix.trim() || '主单位'}，留空不改）
                                                            <Input
                                                                value={drafts[a.service].balance}
                                                                onChange={(e) =>
                                                                    setDrafts((p) => ({
                                                                        ...p,
                                                                        [a.service]: { ...p[a.service], balance: e.target.value },
                                                                    }))
                                                                }
                                                                placeholder={
                                                                    a.balanceMinor === null
                                                                        ? '待录入'
                                                                        : fmtMinor(a.balanceMinor, a.currency)
                                                                }
                                                                className="mt-1 bg-white font-mono"
                                                            />
                                                        </label>
                                                    )}
                                                    <label className="text-[12px] text-neutral-gray-dark">
                                                        到期/续费日（订阅项）
                                                        <Input
                                                            type="date"
                                                            value={drafts[a.service].expiresAt}
                                                            onChange={(e) =>
                                                                setDrafts((p) => ({
                                                                    ...p,
                                                                    [a.service]: { ...p[a.service], expiresAt: e.target.value },
                                                                }))
                                                            }
                                                            className="mt-1 bg-white font-mono"
                                                        />
                                                    </label>
                                                    {a.kind === 'subscription' && (
                                                        <label className="text-[12px] text-neutral-gray-dark">
                                                            月成本（元，做每日分摊展示）
                                                            <Input
                                                                value={drafts[a.service].monthlyYuan}
                                                                onChange={(e) =>
                                                                    setDrafts((p) => ({
                                                                        ...p,
                                                                        [a.service]: { ...p[a.service], monthlyYuan: e.target.value },
                                                                    }))
                                                                }
                                                                className="mt-1 bg-white font-mono"
                                                            />
                                                        </label>
                                                    )}
                                                    {a.kind === 'prepaid' && (
                                                        <label className="text-[12px] text-neutral-gray-dark">
                                                            手动指定日耗（主单位/天，留空用自动推算）
                                                            <Input
                                                                value={drafts[a.service].burnOverride}
                                                                onChange={(e) =>
                                                                    setDrafts((p) => ({
                                                                        ...p,
                                                                        [a.service]: { ...p[a.service], burnOverride: e.target.value },
                                                                    }))
                                                                }
                                                                className="mt-1 bg-white font-mono"
                                                            />
                                                        </label>
                                                    )}
                                                    <label className="text-[12px] text-neutral-gray-dark">
                                                        预警阈值（天）
                                                        <Input
                                                            value={drafts[a.service].alertDays}
                                                            onChange={(e) =>
                                                                setDrafts((p) => ({
                                                                    ...p,
                                                                    [a.service]: { ...p[a.service], alertDays: e.target.value },
                                                                }))
                                                            }
                                                            className="mt-1 bg-white font-mono"
                                                        />
                                                    </label>
                                                    <label className="text-[12px] text-neutral-gray-dark">
                                                        备注
                                                        <Input
                                                            value={drafts[a.service].note}
                                                            onChange={(e) =>
                                                                setDrafts((p) => ({
                                                                    ...p,
                                                                    [a.service]: { ...p[a.service], note: e.target.value },
                                                                }))
                                                            }
                                                            className="mt-1 bg-white"
                                                        />
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-3 mt-3">
                                                    <Button size="sm" onClick={() => save(a)} disabled={busy}>
                                                        保存
                                                    </Button>
                                                    {a.snapshots.length > 0 && (
                                                        <span className="text-[11px] text-neutral-gray-medium">
                                                            最近快照：
                                                            {a.snapshots
                                                                .slice(0, 5)
                                                                .map(
                                                                    (s) =>
                                                                        `${fmtDate(s.ts)} ${fmtMinor(s.balanceMinor, a.currency)}（${s.source === 'auto' ? '自动' : '手动'}）`
                                                                )
                                                                .join(' · ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </TableShell>
            </Panel>

            <Panel
                title="存储"
                description="手机端现场影像/录音云中转的存储占用，仅展示用量，不是账目行。"
                padded={false}
            >
                {!data.storage.relay && !data.storage.oss ? (
                    <EmptyState icon={HardDrive} title="未检测到中转存储（本机未部署云后端，OSS 未配置）" />
                ) : (
                    <>
                        <TableShell>
                            <Thead>
                                <tr>
                                    <th className={TH}>用途</th>
                                    <th className={TH_RIGHT}>占用</th>
                                    <th className={TH_RIGHT}>件数</th>
                                    <th className={TH_RIGHT}>磁盘余量 / 总量</th>
                                    <th className={TH_RIGHT}>测得于</th>
                                </tr>
                            </Thead>
                            <tbody>
                                {data.storage.oss && (
                                    <tr className={TR}>
                                        <td className={TD}>
                                            <span className="font-medium text-neutral-dark-bg">
                                                手机影像云中转（OSS {data.storage.oss.bucket}）
                                            </span>
                                        </td>
                                        <td className={TD_NUM}>{fmtBytes(data.storage.oss.bytes)}</td>
                                        <td className={TD_NUM}>
                                            {data.storage.oss.objectCount.toLocaleString('zh-CN')}
                                        </td>
                                        <td className={TD_NUM}>-</td>
                                        <td className={TD_NUM}>{fmtTime(data.storage.oss.measuredAt)}</td>
                                    </tr>
                                )}
                                {data.storage.relay && (
                                    <tr className={TR}>
                                        <td className={TD}>
                                            <span className="font-medium text-neutral-dark-bg">
                                                {data.storage.oss
                                                    ? '迁移前遗留（ECS 本地盘）'
                                                    : '手机影像云中转（ECS 本地盘）'}
                                            </span>
                                        </td>
                                        <td className={TD_NUM}>{fmtBytes(data.storage.relay.bytes)}</td>
                                        <td className={TD_NUM}>
                                            {data.storage.relay.fileCount.toLocaleString('zh-CN')}
                                        </td>
                                        <td className={TD_NUM}>
                                            {fmtBytes(data.storage.relay.diskFreeBytes)} /{' '}
                                            {fmtBytes(data.storage.relay.diskTotalBytes)}
                                        </td>
                                        <td className={TD_NUM}>{fmtTime(data.storage.relay.measuredAt)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </TableShell>
                        <p className="px-5 py-3 text-xs leading-relaxed text-neutral-gray-medium border-t border-neutral-gray-light/70">
                            桌面端确认落盘即删，30 天 TTL + 桶生命周期 35 天兜底。中转已迁 OSS
                            私有桶（dev-board#236），存储/流量费计入「阿里云」行；本地盘行是迁移前
                            遗留，最迟 30 天自然清零。ECS 磁盘为固定成本（见服务器条目），
                            会议录音转写的 OSS 临时中转同样计入「阿里云」行。
                        </p>
                    </>
                )}
            </Panel>

            <Panel
                title="近 7 天平台代采明细"
                description="经服务网关的按量代采（AI 对话走 OpenRouter 每用户 Key，不在此表；其成本看上表 OpenRouter 行的日耗）。毛利 = Credits 实收 - 采购成本。"
                padded={false}
            >
                {data.gatewayDetail.length === 0 ? (
                    <EmptyState
                        icon={Receipt}
                        title="近 7 天没有代采调用"
                        hint="有用户使用听悟转写、OCR、企业数据等服务后，这里会出现分服务的成本与实收。"
                    />
                ) : (
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>服务</th>
                                <th className={TH_RIGHT}>调用次数</th>
                                <th className={TH_RIGHT}>计费用量</th>
                                <th className={TH_RIGHT}>采购成本</th>
                                <th className={TH_RIGHT}>Credits 实收</th>
                                <th className={TH_RIGHT}>毛利</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {data.gatewayDetail.map((r) => (
                                <tr key={r.service} className={TR}>
                                    <td className={TD}>
                                        <span className="font-medium text-neutral-dark-bg">{r.service}</span>
                                    </td>
                                    <td className={TD_NUM}>{r.calls}</td>
                                    <td className={TD_NUM}>
                                        {r.units.toLocaleString('zh-CN')} {r.unit ?? ''}
                                    </td>
                                    <td className={TD_NUM}>
                                        {r.rawCostCents === null ? '—' : fmtYuan(Math.round(r.rawCostCents))}
                                    </td>
                                    <td className={TD_NUM}>{fmtYuan(r.chargedCents)}</td>
                                    <td className={TD_NUM}>
                                        {r.rawCostCents === null ? (
                                            '—'
                                        ) : (
                                            <span
                                                className={
                                                    r.chargedCents - r.rawCostCents < 0
                                                        ? 'text-red-600 font-bold'
                                                        : 'text-king-forest font-bold'
                                                }
                                            >
                                                {fmtYuan(Math.round(r.chargedCents - r.rawCostCents))}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </Panel>

            {msg && <Notice tone="info">{msg}</Notice>}
        </>
    );
}
