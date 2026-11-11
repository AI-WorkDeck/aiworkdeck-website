'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, PackageOpen, RefreshCw, ShieldX, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, StatusDot, type Tone } from './ui';

/**
 * 插件审核面板。与 Skill 不同，插件是可执行代码、与桌面端宿主同 JVM 同权限，
 * 因此必须人工逐个审核后签名才能上架——界面刻意不提供批量通过。
 * 契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md。
 */

interface ScanHit {
    rule: string;
    label: string;
    severity: 'high' | 'medium' | 'info';
    why: string;
    files: string[];
}
interface ScanFinding {
    kind: 'hardcoded_ip' | 'plaintext_http';
    value: string;
    file: string;
}
interface CrossCheckIssue {
    permission: string;
    kind: 'undeclared' | 'unused';
    detail: string;
}
interface PluginEntry {
    id: string;
    version: string;
    name: string;
    description: string;
    author: string;
    authorId: string;
    developerStatus: string;
    permissions: string[];
    tools: { name: string; description?: string }[];
    files: Record<string, string>;
    size: number;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    scan: {
        classCount: number;
        hits: ScanHit[];
        findings: ScanFinding[];
        crossCheck: CrossCheckIssue[];
        needsAttention: boolean;
    };
    reviewNote?: string;
    submittedAt: string;
    publishedAt?: string;
    downloads: number;
}

const STATUS: Record<PluginEntry['status'], { label: string; tone: Tone }> = {
    pending: { label: '待审核', tone: 'warn' },
    approved: { label: '已上架', tone: 'ok' },
    rejected: { label: '已驳回', tone: 'muted' },
    revoked: { label: '已封禁', tone: 'danger' },
};

/** 扫描命中按严重度着色：只染左侧竖线与底纹，正文保持中性灰，一屏十几条也不刺眼 */
const SEVERITY_CLASS: Record<ScanHit['severity'], string> = {
    high: 'border-l-red-400 bg-red-50/60',
    medium: 'border-l-amber-400 bg-amber-50/60',
    info: 'border-l-neutral-gray-light bg-neutral-gray-pale/70',
};

const SEVERITY_LABEL: Record<ScanHit['severity'], string> = {
    high: '高',
    medium: '中',
    info: '提示',
};

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function PluginReview() {
    const { fetch, url } = useAdminSite();
    const [plugins, setPlugins] = useState<PluginEntry[]>([]);
    const [signingConfigured, setSigningConfigured] = useState(true);
    const [filter, setFilter] = useState<'pending' | 'all'>('pending');
    const [busy, setBusy] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [msg, setMsg] = useState('');

    const load = useCallback(async () => {
        const qs = filter === 'pending' ? '?status=pending' : '';
        const res = await fetch(`/api/admin/plugins${qs}`);
        if (!res.ok) return;
        const d = await res.json();
        setPlugins(d.plugins || []);
        setSigningConfigured(d.signingConfigured !== false);
    }, [filter]);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (p: PluginEntry, action: 'approve' | 'reject' | 'revoke') => {
        let note = '';
        if (action !== 'approve') {
            const label = action === 'reject' ? '驳回原因（会展示给作者）' : '封禁原因（会下发到已安装的客户端）';
            const input = window.prompt(label);
            if (!input || !input.trim()) return;
            note = input.trim();
        } else if (
            !window.confirm(
                `确认上架 ${p.name} v${p.version}？\n\n通过即对该版本签名，桌面端可安装。` +
                    `\n插件与宿主同权限，请确认已核对扫描报告与 JAR 内容。`
            )
        ) {
            return;
        }

        setBusy(`${p.id}@${p.version}`);
        setMsg('');
        const res = await fetch(`/api/admin/plugins/${p.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: p.version, action, note }),
        });
        const d = await res.json().catch(() => ({}));
        setBusy('');
        if (!res.ok) {
            setMsg(d.message || d.error || '操作失败');
            return;
        }
        await load();
    };

    return (
        <div className="flex flex-col gap-4">
            {/* 过滤：编辑式下划线，与广场页签同一套语言 */}
            <div className="flex items-center gap-6 border-b border-neutral-gray-light/80">
                {(['pending', 'all'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
                            filter === f
                                ? 'border-king-forest font-medium text-king-forest'
                                : 'border-transparent text-neutral-gray-medium hover:text-neutral-gray-dark'
                        }`}
                    >
                        {f === 'pending' ? '待审核' : '全部'}
                    </button>
                ))}
                <span className="ml-auto flex items-center gap-3 pb-2.5">
                    <span className="font-mono text-xs tabular-nums text-neutral-gray-medium">{plugins.length} 个</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={load}
                        className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"
                    >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                        刷新
                    </Button>
                </span>
            </div>

            {!signingConfigured && (
                <Notice tone="danger">
                    服务器未配置 <code className="font-mono">AWD_PLUGIN_SIGNING_KEY</code>，无法签名上架。
                    请先生成 Ed25519 密钥对并写入环境变量，公钥同步到桌面端配置。
                </Notice>
            )}
            {msg && <Notice tone="danger">{msg}</Notice>}

            {plugins.length === 0 && (
                <div className="bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl">
                    <EmptyState
                        icon={PackageOpen}
                        title={filter === 'pending' ? '没有待审核的插件' : '还没有插件提交'}
                        hint="开发者通过桌面端或 API 提交插件包后，会在这里排队等待人工审核与签名。"
                    />
                </div>
            )}

            {plugins.map(p => {
                const key = `${p.id}@${p.version}`;
                const isOpen = expanded === key;
                const undeclared = p.scan.crossCheck.filter(c => c.kind === 'undeclared');
                return (
                    <div
                        key={key}
                        className="bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl overflow-hidden"
                    >
                        <div className="flex flex-wrap items-start gap-4 p-5">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                    <span className="font-display text-lg font-bold text-neutral-dark-bg">{p.name}</span>
                                    <code className="font-mono text-xs text-neutral-gray-medium">
                                        {p.id}@{p.version}
                                    </code>
                                    <span className="w-px h-3 bg-neutral-gray-light" />
                                    <span className="text-xs">
                                        <StatusDot tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusDot>
                                    </span>
                                    {p.scan.needsAttention && p.status === 'pending' && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                                            需重点核查
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-sm leading-relaxed text-neutral-gray-medium">
                                    {p.description || '（无描述）'}
                                </p>
                                <p className="mt-1.5 text-xs text-neutral-gray-medium/90">
                                    作者 {p.author}（{p.authorId}）· 资格 {p.developerStatus} · {formatSize(p.size)} · {p.scan.classCount} 个 class ·{' '}
                                    {new Date(p.submittedAt).toLocaleString('zh-CN')}
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setExpanded(isOpen ? null : key)}
                                    className="border-neutral-gray-light bg-white text-neutral-gray-dark"
                                >
                                    {isOpen ? '收起' : '扫描报告'}
                                </Button>
                                {p.status === 'pending' && (
                                    <>
                                        <Button
                                            size="sm"
                                            disabled={busy === key || !signingConfigured}
                                            onClick={() => act(p, 'approve')}
                                        >
                                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                                            通过并签名
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={busy === key}
                                            onClick={() => act(p, 'reject')}
                                            className="border-neutral-gray-light bg-white text-neutral-gray-dark"
                                        >
                                            <XCircle className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                                            驳回
                                        </Button>
                                    </>
                                )}
                                {p.status === 'approved' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={busy === key}
                                        onClick={() => act(p, 'revoke')}
                                        className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                                    >
                                        <ShieldX className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                                        封禁下架
                                    </Button>
                                )}
                            </div>
                        </div>

                        {p.reviewNote && (
                            <p className="border-t border-neutral-gray-light/70 px-5 py-3 text-sm text-neutral-gray-dark">
                                <span className="text-neutral-gray-medium">审核意见：</span>
                                {p.reviewNote}
                            </p>
                        )}

                        {isOpen && (
                            <div className="flex flex-col gap-6 border-t border-neutral-gray-light/70 bg-neutral-gray-pale/60 p-5 text-sm">
                                {undeclared.length > 0 && (
                                    <section>
                                        <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-red-600">
                                            权限声明与代码行为不符
                                        </h4>
                                        <ul className="flex flex-col gap-1.5">
                                            {undeclared.map((c, i) => (
                                                <li
                                                    key={i}
                                                    className="rounded-r-lg border-l-2 border-l-red-400 bg-red-50/60 px-3.5 py-2 text-neutral-gray-dark"
                                                >
                                                    {c.detail}
                                                </li>
                                            ))}
                                        </ul>
                                        <p className="mt-2 text-xs leading-relaxed text-neutral-gray-medium">
                                            声明与实际引用不一致通常应当驳回——要么作者疏漏，要么刻意隐瞒能力。
                                        </p>
                                    </section>
                                )}

                                <section>
                                    <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        自述权限
                                    </h4>
                                    {p.permissions.length ? (
                                        <p className="flex flex-wrap gap-x-3 gap-y-1.5">
                                            {p.permissions.map(x => (
                                                <code key={x} className="font-mono text-xs text-neutral-gray-dark">
                                                    {x}
                                                </code>
                                            ))}
                                        </p>
                                    ) : (
                                        <p className="text-neutral-gray-medium">无</p>
                                    )}
                                </section>

                                <section>
                                    <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        静态扫描命中
                                    </h4>
                                    {p.scan.hits.length === 0 ? (
                                        <p className="text-neutral-gray-medium leading-relaxed">
                                            无命中。仍建议抽查 JAR 内容——扫描只做字符串匹配，可被混淆规避。
                                        </p>
                                    ) : (
                                        <ul className="flex flex-col gap-2">
                                            {p.scan.hits.map(h => (
                                                <li
                                                    key={h.rule}
                                                    className={`rounded-r-lg border-l-2 px-3.5 py-2.5 ${SEVERITY_CLASS[h.severity]}`}
                                                >
                                                    <div className="font-medium text-neutral-dark-bg">
                                                        {h.label}
                                                        <span className="ml-2 text-xs font-normal text-neutral-gray-medium">
                                                            严重度 {SEVERITY_LABEL[h.severity]}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 text-xs leading-relaxed text-neutral-gray-dark">
                                                        {h.why}
                                                    </div>
                                                    <div className="mt-1.5 font-mono text-xs text-neutral-gray-medium">
                                                        {h.files.join('、')}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>

                                {p.scan.findings.length > 0 && (
                                    <section>
                                        <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                            硬编码出口
                                        </h4>
                                        <ul className="flex flex-col gap-1.5 font-mono text-xs">
                                            {p.scan.findings.map((f, i) => (
                                                <li
                                                    key={i}
                                                    className="rounded-r-lg border-l-2 border-l-amber-400 bg-amber-50/60 px-3.5 py-2 text-neutral-gray-dark"
                                                >
                                                    {f.kind === 'hardcoded_ip' ? 'IP' : 'HTTP'} {f.value}
                                                    <span className="ml-2 text-neutral-gray-medium">{f.file}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}

                                <section>
                                    <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        工具清单
                                    </h4>
                                    {p.tools.length === 0 ? (
                                        <p className="text-neutral-gray-medium">manifest 未声明 tools</p>
                                    ) : (
                                        <ul className="flex flex-col gap-1.5">
                                            {p.tools.map(t => (
                                                <li key={t.name}>
                                                    <code className="font-mono text-xs text-neutral-dark-bg">{t.name}</code>
                                                    <span className="ml-2 text-neutral-gray-medium">{t.description}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>

                                <section>
                                    <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        包内文件（点击下载人工核查）
                                    </h4>
                                    <ul className="flex flex-col gap-1.5">
                                        {Object.entries(p.files).map(([name, hash]) => (
                                            <li key={name} className="flex flex-wrap items-center gap-2">
                                                <a
                                                    href={url(`/api/admin/plugins/${p.id}?version=${p.version}&path=${encodeURIComponent(name)}`)}
                                                    className="inline-flex items-center gap-1.5 font-mono text-xs text-king-forest underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                                >
                                                    <Download className="h-3 w-3" strokeWidth={1.75} />
                                                    {name}
                                                </a>
                                                <code className="font-mono text-xs text-neutral-gray-medium/70">
                                                    {hash.slice(0, 16)}…
                                                </code>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
