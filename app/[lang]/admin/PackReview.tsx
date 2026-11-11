'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Layers, RefreshCw, ShieldX, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, StatusDot, type Tone } from './ui';

/**
 * 原生资源包（native pack）审核面板。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §8。
 *
 * 与插件审核的判断依据不同：原生二进制没有 class 常量池那样可交叉验证的面，
 * 自动扫描只能给出条目级线索（谁带可执行位、二进制里出现过哪些 URL/IP）。
 * 因此这里刻意**不给任何自动结论**，只把线索摆出来——审核结论主要依赖来源
 * 可信度（作者是否提供可复现构建脚本 / 上游开源地址），拿不准就驳回。
 */

interface PackComponentSummary {
    name: string;
    archive: string;
    platforms: string[];
    unpackDir: string;
    size: number;
    sha256: string;
    entryCount: number;
    unpackedBytes: number;
    execCount: number;
    literalCount: number;
}

interface PackEntry {
    id: string;
    version: string;
    author: string;
    note: string;
    manifest: Record<string, unknown>;
    components: PackComponentSummary[];
    totalSize: number;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    reviewNote?: string;
    submittedAt: string;
    publishedAt?: string;
}

interface TarEntryInfo {
    path: string;
    size: number;
    mode: number;
    exec: boolean;
    type: 'file' | 'dir' | 'other';
}

interface TarLiteral {
    kind: 'url' | 'ip';
    value: string;
    file: string;
}

interface TarInspection {
    entryCount: number;
    unpackedBytes: number;
    entries: TarEntryInfo[];
    literals: TarLiteral[];
    literalsTruncated: boolean;
}

const STATUS: Record<PackEntry['status'], { label: string; tone: Tone }> = {
    pending: { label: '待审核', tone: 'warn' },
    approved: { label: '已签名待上架', tone: 'ok' },
    rejected: { label: '已驳回', tone: 'muted' },
    revoked: { label: '已封禁', tone: 'danger' },
};

const GROUP_ORDER: PackEntry['status'][] = ['pending', 'approved', 'rejected', 'revoked'];

/** 条目清单最多铺这么多行：5000 条全渲染会把审核页拖垮，超出的引导下载原文核查 */
const ENTRY_DISPLAY_LIMIT = 300;

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function PackReview() {
    const { fetch, url } = useAdminSite();
    const [packs, setPacks] = useState<PackEntry[]>([]);
    const [signingConfigured, setSigningConfigured] = useState(true);
    const [filter, setFilter] = useState<'pending' | 'all'>('pending');
    const [busy, setBusy] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [inspection, setInspection] = useState<Record<string, TarInspection>>({});
    const [msg, setMsg] = useState('');

    const load = useCallback(async () => {
        const qs = filter === 'pending' ? '?status=pending' : '';
        const res = await fetch(`/api/admin/packs${qs}`);
        if (!res.ok) return;
        const d = await res.json();
        setPacks(d.packs || []);
        setSigningConfigured(d.signingConfigured !== false);
    }, [filter]);

    useEffect(() => {
        load();
    }, [load]);

    // 逐条目清单体积大（一个 draw.io 归档几百条），只在展开那一刻才拉
    const toggle = async (p: PackEntry) => {
        const key = `${p.id}@${p.version}`;
        if (expanded === key) {
            setExpanded(null);
            return;
        }
        setExpanded(key);
        setInspection({});
        const res = await fetch(`/api/admin/packs/${p.id}?version=${encodeURIComponent(p.version)}`);
        if (!res.ok) return;
        const d = await res.json();
        setInspection(d.inspection || {});
    };

    const act = async (p: PackEntry, action: 'approve' | 'reject' | 'revoke') => {
        let note = '';
        if (action !== 'approve') {
            const label = action === 'reject' ? '驳回原因（会展示给作者）' : '封禁原因（会下发到已安装的客户端）';
            const input = window.prompt(label);
            if (!input || !input.trim()) return;
            note = input.trim();
        } else if (
            !window.confirm(
                `确认通过 ${p.id} v${p.version}？\n\n` +
                    '通过即对该版本的 manifest 定稿字节签名，并在服务器上生成发布件。\n' +
                    '上架仍需人工执行 publish-pack-outbox.sh 推镜像并切指针。\n' +
                    'pack 里的脚本与原生二进制会被宿主 spawn，请确认已核对来源与条目清单。'
            )
        ) {
            return;
        }

        setBusy(`${p.id}@${p.version}`);
        setMsg('');
        const res = await fetch(`/api/admin/packs/${p.id}`, {
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

    const groups = GROUP_ORDER.map(status => ({ status, items: packs.filter(p => p.status === status) })).filter(
        g => g.items.length > 0
    );

    return (
        <div className="flex flex-col gap-4">
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
                    <span className="font-mono text-xs tabular-nums text-neutral-gray-medium">{packs.length} 个</span>
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
                    pack 与 JAR 插件共用同一对 Ed25519 密钥，公钥即桌面端的{' '}
                    <code className="font-mono">ai.plugins.registry-public-key</code>。
                </Notice>
            )}
            {msg && <Notice tone="danger">{msg}</Notice>}

            {packs.length === 0 && (
                <div className="bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl">
                    <EmptyState
                        icon={Layers}
                        title={filter === 'pending' ? '没有待审核的资源包' : '还没有资源包提交'}
                        hint="开发者提交 manifest 草案并上传组件归档后，会在这里排队等待人工审核与签名。"
                    />
                </div>
            )}

            {groups.map(group => (
                <section key={group.status} className="flex flex-col gap-4">
                    {filter === 'all' && (
                        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                            {STATUS[group.status].label}
                            <span className="ml-2 font-mono tabular-nums">{group.items.length}</span>
                        </h3>
                    )}
                    {group.items.map(p => {
                        const key = `${p.id}@${p.version}`;
                        const isOpen = expanded === key;
                        const execTotal = p.components.reduce((sum, c) => sum + c.execCount, 0);
                        return (
                            <div
                                key={key}
                                className="bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl overflow-hidden"
                            >
                                <div className="flex flex-wrap items-start gap-4 p-5">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                            <span className="font-display text-lg font-bold text-neutral-dark-bg">
                                                {p.id}
                                            </span>
                                            <code className="font-mono text-xs text-neutral-gray-medium">
                                                v{p.version}
                                            </code>
                                            <span className="w-px h-3 bg-neutral-gray-light" />
                                            <span className="text-xs">
                                                <StatusDot tone={STATUS[p.status].tone}>
                                                    {STATUS[p.status].label}
                                                </StatusDot>
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm leading-relaxed text-neutral-gray-medium">
                                            {p.note || '（作者未填写用途自述）'}
                                        </p>
                                        <p className="mt-1.5 text-xs text-neutral-gray-medium/90">
                                            作者 {p.author} · {p.components.length} 个组件 · {formatSize(p.totalSize)} ·{' '}
                                            {execTotal} 个可执行文件 ·{' '}
                                            {new Date(p.submittedAt).toLocaleString('zh-CN')}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => toggle(p)}
                                            className="border-neutral-gray-light bg-white text-neutral-gray-dark"
                                        >
                                            {isOpen ? '收起' : '审核详情'}
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
                                        <section>
                                            <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                                manifest 草案
                                            </h4>
                                            <pre className="overflow-x-auto rounded-lg border border-neutral-gray-light/70 bg-white/70 p-4 font-mono text-xs leading-relaxed text-neutral-gray-dark">
                                                {JSON.stringify(p.manifest, null, 2)}
                                            </pre>
                                            <p className="mt-2 text-xs leading-relaxed text-neutral-gray-medium">
                                                通过时平台会补 publishedAt 并对重排后的定稿字节签名，旁挂 manifest.json.sig。
                                            </p>
                                        </section>

                                        <section>
                                            <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                                组件清单
                                            </h4>
                                            <ul className="flex flex-col gap-2">
                                                {p.components.map(c => (
                                                    <li
                                                        key={c.archive}
                                                        className="rounded-lg border border-neutral-gray-light/70 bg-white/70 px-3.5 py-2.5"
                                                    >
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                            <span className="font-medium text-neutral-dark-bg">
                                                                {c.name}
                                                            </span>
                                                            <code className="font-mono text-xs text-neutral-gray-medium">
                                                                {c.platforms.join(' / ')}
                                                            </code>
                                                            <span className="text-xs text-neutral-gray-medium">
                                                                解压到 {c.unpackDir}/
                                                            </span>
                                                            <a
                                                                href={url(`/api/admin/packs/${p.id}?version=${encodeURIComponent(p.version)}&archive=${encodeURIComponent(c.archive)}`)}
                                                                className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs text-king-forest underline decoration-dotted underline-offset-2 hover:decoration-solid"
                                                            >
                                                                <Download className="h-3 w-3" strokeWidth={1.75} />
                                                                {c.archive}
                                                            </a>
                                                        </div>
                                                        <div className="mt-1.5 font-mono text-xs text-neutral-gray-medium">
                                                            {formatSize(c.size)} 压缩 · 解压 {formatSize(c.unpackedBytes)} ·{' '}
                                                            {c.entryCount} 条目 · {c.execCount} 个可执行 · sha256{' '}
                                                            {c.sha256.slice(0, 16)}…
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>

                                        {p.components.map(c => {
                                            const detail = inspection[c.archive];
                                            if (!detail) return null;
                                            const shown = detail.entries.slice(0, ENTRY_DISPLAY_LIMIT);
                                            return (
                                                <section key={`entries-${c.archive}`}>
                                                    <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                                        {c.archive} 条目清单
                                                    </h4>
                                                    <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-gray-light/70 bg-white/70 p-3 font-mono text-xs">
                                                        {shown.map(e => (
                                                            <li
                                                                key={e.path}
                                                                className="flex flex-wrap items-center gap-x-3 text-neutral-gray-dark"
                                                            >
                                                                <span className="min-w-0 flex-1 break-all">{e.path}</span>
                                                                <span className="tabular-nums text-neutral-gray-medium">
                                                                    {e.type === 'dir' ? '目录' : formatSize(e.size)}
                                                                </span>
                                                                <span className="tabular-nums text-neutral-gray-medium">
                                                                    {e.mode.toString(8).padStart(4, '0')}
                                                                </span>
                                                                {e.exec && (
                                                                    <span className="font-medium text-amber-700">exec</span>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {detail.entries.length > shown.length && (
                                                        <p className="mt-2 text-xs text-neutral-gray-medium">
                                                            还有 {detail.entries.length - shown.length} 条未展示，
                                                            需要逐条核查请下载归档原文。
                                                        </p>
                                                    )}

                                                    {detail.literals.length > 0 && (
                                                        <div className="mt-3">
                                                            <h5 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
                                                                二进制内的 URL / IP 字面量
                                                            </h5>
                                                            <ul className="flex flex-col gap-1.5 font-mono text-xs">
                                                                {detail.literals.map((l, i) => (
                                                                    <li
                                                                        key={`${l.kind}-${l.value}-${i}`}
                                                                        className="rounded-r-lg border-l-2 border-l-amber-400 bg-amber-50/60 px-3.5 py-2 text-neutral-gray-dark"
                                                                    >
                                                                        <span className="uppercase">{l.kind}</span>{' '}
                                                                        {l.value}
                                                                        <span className="ml-2 text-neutral-gray-medium">
                                                                            {l.file}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                            {detail.literalsTruncated && (
                                                                <p className="mt-2 text-xs text-neutral-gray-medium">
                                                                    线索条数触顶，仅展示前若干条。
                                                                </p>
                                                            )}
                                                            <p className="mt-2 text-xs leading-relaxed text-neutral-gray-medium">
                                                                字面量只是线索不是判定：静态资源里的文档链接与二进制里的
                                                                回连地址在这里看起来一模一样，要结合来源可信度判断。
                                                            </p>
                                                        </div>
                                                    )}
                                                </section>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </section>
            ))}
        </div>
    );
}
