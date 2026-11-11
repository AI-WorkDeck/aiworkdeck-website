'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useState } from 'react';
import { Flag, MessagesSquare, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, StatusDot, TableShell, TableSkeleton, Thead, TD, TH, TR } from './ui';

/**
 * 社区论坛管理（dev-board#316/#317）：举报处置 + 帖子开关（置顶/精选/隐藏/删除）+ 聊天删除。
 * 数据取自 /api/admin/community；处置动作打公开路由（admin cookie 即鉴权）。
 */

interface ReportRow {
    id: number;
    targetType: 'post' | 'comment';
    targetId: string;
    postId: string;
    snippet: string;
    reason: string;
    reporter: string;
    createdAt: string;
}

interface PostRow {
    id: string;
    type: 'blog' | 'thread';
    title: string;
    author: string;
    createdAt: string;
    commentCount: number;
    pinned: boolean;
    featured: boolean;
    hidden: boolean;
    deleted: boolean;
}

interface ChatRow {
    id: number;
    content: string;
    createdAt: string;
    author: string;
}

function shortTime(t: string): string {
    return t.replace('T', ' ').slice(0, 16);
}

export function CommunityModeration() {
    const { fetch, publicUrl } = useAdminSite();
    const [reports, setReports] = useState<ReportRow[] | null>(null);
    const [posts, setPosts] = useState<PostRow[]>([]);
    const [chat, setChat] = useState<ChatRow[]>([]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setReports(null);
        setError('');
        try {
            const res = await fetch('/api/admin/community');
            if (!res.ok) throw new Error();
            const body = await res.json();
            setReports(body.reports ?? []);
            setPosts(body.posts ?? []);
            setChat(body.chat ?? []);
        } catch {
            setReports([]);
            setError('社区数据暂时读不到，稍后重试');
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const act = async (fn: () => Promise<Response>) => {
        try {
            await fn();
        } catch { /* 刷新后见真实状态 */ }
        await load();
    };

    const patchPost = (id: string, patch: Record<string, boolean>) =>
        act(() => fetch(`/api/community/posts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        }));

    const resolve = (id: number) =>
        act(() => fetch('/api/admin/community', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resolve_report', id }),
        }));

    if (reports === null) return <TableSkeleton rows={5} cols={5} />;

    const flagBtn = 'rounded-full px-2.5 py-1 text-[11px] transition-colors';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => void load()}
                    className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark">
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                    刷新
                </Button>
            </div>

            {error && <Notice tone="warn">{error}</Notice>}

            {/* 举报 */}
            <section>
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.2em] text-king-forest/80">待处理举报</h3>
                {reports.length === 0 ? (
                    <EmptyState icon={Flag} title="没有待处理举报" hint="用户举报的帖子与评论会出现在这里。" />
                ) : (
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>时间</th>
                                <th className={TH}>类型</th>
                                <th className={TH}>内容</th>
                                <th className={TH}>理由</th>
                                <th className={TH}>举报人</th>
                                <th className={TH}>操作</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {reports.map(r => (
                                <tr key={r.id} className={TR}>
                                    <td className={`${TD} whitespace-nowrap`}>{shortTime(r.createdAt)}</td>
                                    <td className={TD}>{r.targetType === 'post' ? '帖子' : '评论'}</td>
                                    <td className={`${TD} max-w-[20rem]`}>
                                        {r.postId ? (
                                            <a href={publicUrl(`/zh/community/post/${r.postId}`)} target="_blank" rel="noreferrer"
                                                className="inline-flex items-center gap-0.5 text-king-forest hover:underline">
                                                <span className="line-clamp-1">{r.snippet}</span>
                                                <ArrowUpRight className="w-3 h-3 flex-shrink-0" strokeWidth={1.75} />
                                            </a>
                                        ) : (
                                            <span className="line-clamp-1">{r.snippet}</span>
                                        )}
                                    </td>
                                    <td className={`${TD} max-w-[14rem]`}>
                                        <span className="line-clamp-1">{r.reason || '（未填写）'}</span>
                                    </td>
                                    <td className={TD}>{r.reporter}</td>
                                    <td className={`${TD} whitespace-nowrap`}>
                                        <button onClick={() => void resolve(r.id)}
                                            className={`${flagBtn} bg-king-forest text-white hover:bg-king-forest-darker`}>
                                            标记已处理
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </section>

            {/* 帖子 */}
            <section>
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.2em] text-king-forest/80">最近帖子</h3>
                {posts.length === 0 ? (
                    <EmptyState icon={MessagesSquare} title="还没有帖子" hint="社区发布的博客与讨论帖会出现在这里。" />
                ) : (
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>时间</th>
                                <th className={TH}>类型</th>
                                <th className={TH}>标题</th>
                                <th className={TH}>作者</th>
                                <th className={TH}>状态</th>
                                <th className={TH}>操作</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {posts.map(p => (
                                <tr key={p.id} className={TR}>
                                    <td className={`${TD} whitespace-nowrap`}>{shortTime(p.createdAt)}</td>
                                    <td className={TD}>{p.type === 'blog' ? '博客' : '讨论'}</td>
                                    <td className={`${TD} max-w-[20rem]`}>
                                        <a href={publicUrl(`/zh/community/post/${p.id}`)} target="_blank" rel="noreferrer"
                                            className="text-king-forest hover:underline">
                                            <span className="line-clamp-1">{p.title}</span>
                                        </a>
                                    </td>
                                    <td className={TD}>{p.author}</td>
                                    <td className={`${TD} whitespace-nowrap`}>
                                        {p.deleted ? (
                                            <StatusDot tone="muted">已删除</StatusDot>
                                        ) : p.hidden ? (
                                            <StatusDot tone="danger">已隐藏</StatusDot>
                                        ) : (
                                            <StatusDot tone="ok">
                                                {[p.pinned && '置顶', p.featured && '精选'].filter(Boolean).join(' · ') || '正常'}
                                            </StatusDot>
                                        )}
                                    </td>
                                    <td className={`${TD} whitespace-nowrap`}>
                                        {!p.deleted && (
                                            <span className="inline-flex gap-1.5">
                                                <button onClick={() => void patchPost(p.id, { pinned: !p.pinned })}
                                                    className={`${flagBtn} ${p.pinned ? 'bg-king-forest text-white' : 'bg-white/70 text-neutral-gray-medium hover:text-neutral-gray-dark border border-neutral-gray-light'}`}>
                                                    {p.pinned ? '取消置顶' : '置顶'}
                                                </button>
                                                {p.type === 'blog' && (
                                                    <button onClick={() => void patchPost(p.id, { featured: !p.featured })}
                                                        className={`${flagBtn} ${p.featured ? 'bg-king-forest text-white' : 'bg-white/70 text-neutral-gray-medium hover:text-neutral-gray-dark border border-neutral-gray-light'}`}>
                                                        {p.featured ? '取消精选' : '精选'}
                                                    </button>
                                                )}
                                                <button onClick={() => void patchPost(p.id, { hidden: !p.hidden })}
                                                    className={`${flagBtn} ${p.hidden ? 'bg-amber-600 text-white' : 'bg-white/70 text-neutral-gray-medium hover:text-amber-700 border border-neutral-gray-light'}`}>
                                                    {p.hidden ? '取消隐藏' : '隐藏'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('删除后帖子对所有人不可见且不可恢复，确定？')) {
                                                            void act(() => fetch(`/api/community/posts/${p.id}`, { method: 'DELETE' }));
                                                        }
                                                    }}
                                                    className={`${flagBtn} bg-white/70 text-neutral-gray-medium hover:text-red-600 border border-neutral-gray-light`}>
                                                    删除
                                                </button>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </section>

            {/* 聊天室 */}
            <section>
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.2em] text-king-forest/80">聊天室最近发言</h3>
                {chat.length === 0 ? (
                    <EmptyState icon={MessagesSquare} title="还没有发言" hint="聊天室最近 50 条发言会出现在这里。" />
                ) : (
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>时间</th>
                                <th className={TH}>用户</th>
                                <th className={TH}>内容</th>
                                <th className={TH}>操作</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {chat.map(m => (
                                <tr key={m.id} className={TR}>
                                    <td className={`${TD} whitespace-nowrap`}>{shortTime(m.createdAt)}</td>
                                    <td className={TD}>{m.author}</td>
                                    <td className={`${TD} max-w-[26rem]`}>
                                        <span className="line-clamp-2 whitespace-pre-wrap break-words">{m.content}</span>
                                    </td>
                                    <td className={`${TD} whitespace-nowrap`}>
                                        <button
                                            onClick={() =>
                                                void act(() => fetch('/api/community/chat', {
                                                    method: 'DELETE',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ id: m.id }),
                                                }))
                                            }
                                            className={`${flagBtn} bg-white/70 text-neutral-gray-medium hover:text-red-600 border border-neutral-gray-light`}>
                                            删除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </section>
        </div>
    );
}
