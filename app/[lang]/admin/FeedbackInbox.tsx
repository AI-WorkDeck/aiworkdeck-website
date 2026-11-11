'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    EmptyState,
    Notice,
    StatusDot,
    TableShell,
    TableSkeleton,
    Thead,
    TD,
    TH,
    TR,
    type Tone,
} from './ui';

/**
 * 用户反馈收件箱（dev-board#152）。数据在云端收件箱（addin.aiworkdeck.com），
 * 经 /api/admin/feedback/* 服务端代理取回——取件密钥不进浏览器；
 * 截图与语音以代理路由为 src 内嵌显示/播放（同源 admin cookie 即鉴权）。
 *
 * 优化者邮件里的「在浏览器里看这条反馈」链接落到本分区（?tab=feedback&fb=N）。
 */

interface FeedbackBrief {
    id: number;
    username: string;
    kind: 'BUG' | 'IDEA';
    text: string | null;
    voiceTranscript: string | null;
    page: string | null;
    appVersion: string | null;
    platform: string | null;
    status: 'NEW' | 'PR_OPENED' | 'EMAILED' | 'SKIPPED' | 'FAILED';
    triageVerdict: string | null;
    prUrl: string | null;
    lastError: string | null;
    createdAt: string | null;
}

interface Attachment {
    id: number;
    type: 'IMAGE' | 'AUDIO' | string;
    name: string;
    contentType: string;
    sizeBytes: number;
}

interface FeedbackDetail extends FeedbackBrief {
    contextJson: string | null;
    triageJson: string | null;
    attachments: Attachment[];
}

const STATUS: Record<FeedbackBrief['status'], { label: string; tone: Tone }> = {
    NEW: { label: '待处理', tone: 'warn' },
    PR_OPENED: { label: '已开 PR', tone: 'ok' },
    EMAILED: { label: '已发邮件', tone: 'ok' },
    SKIPPED: { label: '已跳过', tone: 'muted' },
    FAILED: { label: '处理失败', tone: 'danger' },
};

const FILTERS: Array<{ key: string; label: string }> = [
    { key: '', label: '全部' },
    { key: 'NEW', label: '待处理' },
    { key: 'FAILED', label: '处理失败' },
];

function shortTime(t: string | null): string {
    return t ? t.replace('T', ' ').slice(0, 16) : '';
}

/** 分诊 JSON 里维护者关心的三行；解析不动就不显示（verdict 单列已有）。 */
function triageLines(d: FeedbackDetail): string[] {
    const lines: string[] = [];
    if (!d.triageJson) return lines;
    try {
        const t = JSON.parse(d.triageJson);
        if (t.summary) lines.push(`复述：${t.summary}`);
        if (t.reason) lines.push(`依据：${t.reason}`);
        if (t.severity) lines.push(`严重度：${t.severity}`);
    } catch {
        /* 非 JSON 忽略 */
    }
    return lines;
}

export function FeedbackInbox({ focusId }: { focusId?: number }) {
    const { fetch } = useAdminSite();
    const [items, setItems] = useState<FeedbackBrief[] | null>(null);
    const [configured, setConfigured] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [detail, setDetail] = useState<FeedbackDetail | null>(null);
    const [detailError, setDetailError] = useState('');
    const focusRef = useRef<HTMLTableRowElement | null>(null);
    // 深链只定位一次：之后维护者自由点别的行，不再被拽回去
    const focusConsumed = useRef(false);

    const load = useCallback(async (status: string) => {
        setItems(null);
        setError('');
        const res = await fetch(`/api/admin/feedback${status ? `?status=${status}` : ''}`);
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setItems([]);
            setError(body?.detail || '收件箱暂时读不到，稍后重试');
            return;
        }
        const body = await res.json();
        setConfigured(body.configured !== false);
        setItems(body.items ?? []);
    }, []);

    const openDetail = useCallback(async (id: number) => {
        setOpenId(id);
        setDetail(null);
        setDetailError('');
        const res = await fetch(`/api/admin/feedback/${id}`);
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setDetailError(body?.detail || '详情读不到，稍后重试');
            return;
        }
        setDetail(await res.json());
    }, []);

    useEffect(() => {
        load(filter);
    }, [load, filter]);

    // 深链（?fb=N）：列表就绪后自动展开并滚到那条
    useEffect(() => {
        if (!focusId || focusConsumed.current || !items) return;
        focusConsumed.current = true;
        openDetail(focusId);
        // 行如果不在当前列表（超出 100 条窗口）也没关系：详情区仍会渲染
        setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }, [focusId, items, openDetail]);

    if (!configured) {
        return (
            <Notice tone="warn">
                未配置收件箱取件密钥（AWD_FEEDBACK_INBOX_TOKEN）。在两台官网实例的环境变量里填入
                云端收件箱的 FEEDBACK_OPTIMIZER_TOKEN 后重启即可。
            </Notice>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => {
                                setFilter(f.key);
                                setOpenId(null);
                                setDetail(null);
                            }}
                            className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                filter === f.key
                                    ? 'bg-king-forest text-white'
                                    : 'bg-white/70 text-neutral-gray-medium hover:text-neutral-gray-dark'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => load(filter)}
                    className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"
                >
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                    刷新
                </Button>
            </div>

            {error && <Notice tone="warn">{error}</Notice>}

            {items === null ? (
                <TableSkeleton rows={5} cols={5} />
            ) : items.length === 0 && openId === null ? (
                <EmptyState icon={Inbox} title="没有反馈" hint="这个筛选档下还没有用户反馈。" />
            ) : (
                <TableShell>
                    <Thead>
                        <tr>
                            <th className={TH}>#</th>
                            <th className={TH}>状态</th>
                            <th className={TH}>类型</th>
                            <th className={TH}>时间</th>
                            <th className={TH}>用户</th>
                            <th className={TH}>内容</th>
                        </tr>
                    </Thead>
                    <tbody>
                        {items.map(fb => {
                            const snippet =
                                (fb.text && fb.text.trim()) || fb.voiceTranscript || '（语音 / 截图）';
                            const st = STATUS[fb.status] ?? { label: fb.status, tone: 'muted' as Tone };
                            const isOpen = openId === fb.id;
                            return (
                                <FragmentRow
                                    key={fb.id}
                                    rowRef={focusId === fb.id ? focusRef : undefined}
                                    onClick={() => (isOpen ? setOpenId(null) : openDetail(fb.id))}
                                    cells={
                                        <>
                                            <td className={`${TD} font-mono tabular-nums`}>{fb.id}</td>
                                            <td className={TD}>
                                                <StatusDot tone={st.tone}>{st.label}</StatusDot>
                                            </td>
                                            <td className={TD}>{fb.kind === 'IDEA' ? '建议' : '报障'}</td>
                                            <td className={`${TD} whitespace-nowrap`}>{shortTime(fb.createdAt)}</td>
                                            <td className={TD}>{fb.username}</td>
                                            <td className={`${TD} max-w-[22rem]`}>
                                                <span className="line-clamp-1">{snippet}</span>
                                            </td>
                                        </>
                                    }
                                    expanded={
                                        isOpen ? (
                                            <DetailBlock detail={detail} error={detailError} />
                                        ) : null
                                    }
                                />
                            );
                        })}
                    </tbody>
                </TableShell>
            )}

            {/* 深链目标不在列表窗口内（老反馈超出最近 100 条）时，详情单独渲染 */}
            {openId !== null && items !== null && !items.some(i => i.id === openId) && (
                <div className="rounded-xl border border-neutral-gray-light/70 bg-white p-5">
                    <DetailBlock detail={detail} error={detailError} />
                </div>
            )}
        </div>
    );
}

/** 一行 + 可选的展开详情行（colSpan 全宽）。 */
function FragmentRow({
    cells,
    expanded,
    onClick,
    rowRef,
}: {
    cells: React.ReactNode;
    expanded: React.ReactNode;
    onClick: () => void;
    rowRef?: React.Ref<HTMLTableRowElement>;
}) {
    return (
        <>
            <tr ref={rowRef} className={`${TR} cursor-pointer`} onClick={onClick}>
                {cells}
            </tr>
            {expanded && (
                <tr className="border-t border-neutral-gray-light/40 bg-neutral-gray-pale/40">
                    <td colSpan={6} className="px-5 py-5">
                        {expanded}
                    </td>
                </tr>
            )}
        </>
    );
}

function DetailBlock({ detail, error }: { detail: FeedbackDetail | null; error: string }) {
    const { url } = useAdminSite();
    if (error) return <Notice tone="warn">{error}</Notice>;
    if (!detail) return <TableSkeleton rows={2} cols={1} />;
    const scene = [detail.page, detail.appVersion, detail.platform].filter(Boolean).join(' · ');
    const triage = triageLines(detail);
    return (
        <div className="flex flex-col gap-4 text-sm">
            <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium mb-1.5">
                    用户原话
                </p>
                <blockquote className="border-l-2 border-king-forest bg-king-forest-lightest/50 px-4 py-2.5 whitespace-pre-wrap break-words rounded-r-lg">
                    {(detail.text && detail.text.trim()) || '（没写文字）'}
                </blockquote>
            </div>
            {detail.voiceTranscript && (
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium mb-1.5">
                        语音转写
                    </p>
                    <p className="whitespace-pre-wrap break-words text-neutral-gray-dark">{detail.voiceTranscript}</p>
                </div>
            )}
            {detail.attachments.length > 0 && (
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium mb-1.5">
                        附件（{detail.attachments.length} 件）
                    </p>
                    <div className="flex flex-col gap-3">
                        {detail.attachments.map(a => {
                            const src = url(`/api/admin/feedback/${detail.id}/attachments/${a.id}`);
                            return (
                                <div key={a.id} className="flex flex-col gap-1.5">
                                    <p className="text-xs text-neutral-gray-medium">
                                        {a.type} · {a.name} · {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                                        <a
                                            href={src}
                                            download={a.name}
                                            className="ml-2 inline-flex items-center gap-0.5 text-king-forest hover:underline"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            下载原件
                                            <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
                                        </a>
                                    </p>
                                    {a.type === 'IMAGE' && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={src}
                                            alt={a.name}
                                            className="max-w-xl rounded-lg border border-neutral-gray-light/70"
                                        />
                                    )}
                                    {a.type === 'AUDIO' && (
                                        <audio controls src={src} className="w-full max-w-xl" preload="metadata" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {(detail.triageVerdict || triage.length > 0) && (
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium mb-1.5">
                        优化者分诊
                    </p>
                    <div className="text-neutral-gray-dark whitespace-pre-wrap">
                        {[detail.triageVerdict ? `判定：${detail.triageVerdict}` : '', ...triage]
                            .filter(Boolean)
                            .join('\n')}
                    </div>
                    {detail.prUrl && (
                        <a
                            href={detail.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-0.5 text-king-forest hover:underline"
                        >
                            处理去向
                            <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
                        </a>
                    )}
                </div>
            )}
            {detail.lastError && <Notice tone="warn">最近一次处理报错：{detail.lastError}</Notice>}
            {scene && <p className="text-xs text-neutral-gray-medium">现场：{scene}</p>}
            {detail.contextJson && (
                <details className="text-xs text-neutral-gray-medium">
                    <summary className="cursor-pointer select-none">运行现场（contextJson）</summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-neutral-gray-light/70 bg-white p-3 whitespace-pre-wrap break-words">
                        {(() => {
                            try {
                                return JSON.stringify(JSON.parse(detail.contextJson), null, 2);
                            } catch {
                                return detail.contextJson;
                            }
                        })()}
                    </pre>
                </details>
            )}
        </div>
    );
}
