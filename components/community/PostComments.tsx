'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CornerDownRight, MessageSquare, Trash2 } from 'lucide-react';
import { Locale, LOCALE_META } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/user/Avatar';
import { FormNotice } from '@/components/ui/notice';
import { readApiJson } from '@/lib/api-result';

/**
 * 帖子评论区（dev-board#316）：主页评论区（app/[lang]/u/[username]/CommentsSection.tsx）
 * 的论坛泛化版，树形范式与文案（dict.skillsPage.comments）原样沿用，仅换了数据端点
 * 与删除权限主体（帖子作者替代主页主人）。后端契约见 lib/forum.ts。
 */

interface CommentAuthor { id: string; username: string; displayName: string; avatarUpdatedAt?: string | null }
interface CommentItem {
    id: string;
    parentId?: string;
    content: string;
    createdAt: string;
    deleted?: boolean;
    author: CommentAuthor;
}

const MAX_INDENT = 4;

export function PostComments({ lang, t, postId, viewerId, viewerIsPostAuthor }: {
    lang: Locale;
    t: any;
    postId: string;
    /** 未登录为 null */
    viewerId: string | null;
    /** 帖子作者可删任意评论（同主页主人在自己主页的权限） */
    viewerIsPostAuthor: boolean;
}) {
    const [comments, setComments] = useState<CommentItem[] | null>(null);
    const [error, setError] = useState('');
    const endpoint = `/api/community/posts/${encodeURIComponent(postId)}/comments`;

    const load = async () => {
        try {
            const res = await fetch(endpoint);
            const body = await readApiJson(res);
            if (res.ok) setComments(body.comments ?? []);
        } catch { /* 加载失败保持骨架态 */ }
    };
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [postId]);

    const tree = useMemo(() => {
        const byParent = new Map<string | undefined, CommentItem[]>();
        for (const c of comments ?? []) {
            const list = byParent.get(c.parentId) ?? [];
            list.push(c);
            byParent.set(c.parentId, list);
        }
        return byParent;
    }, [comments]);

    const post = async (content: string, parentId?: string): Promise<boolean> => {
        setError('');
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, parentId }),
            });
            const body = await readApiJson(res);
            if (!res.ok) {
                setError(t.errors[body.error] || t.errors.generic);
                return false;
            }
            await load();
            return true;
        } catch {
            setError(t.errors.generic);
            return false;
        }
    };

    const remove = async (id: string) => {
        await fetch(endpoint, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        await load();
    };

    const count = (comments ?? []).filter(c => !c.deleted).length;

    return (
        <section className="mt-14">
            <div className="mb-7 flex items-center gap-4">
                <h2 className="flex items-center gap-2 text-[12px] uppercase tracking-[0.24em] text-king-forest/80">
                    <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.title}
                    {count > 0 && <span className="font-mono tracking-normal">({count})</span>}
                </h2>
                <span className="h-px flex-1 bg-neutral-gray-light" />
            </div>

            {viewerId ? (
                <Composer t={t} onSubmit={content => post(content)} />
            ) : (
                <p className="rounded-xl border border-neutral-gray-light bg-white/70 px-5 py-4 text-sm text-neutral-gray-medium">
                    {t.loginHint}{' '}
                    <Link href={`/${lang}/account`} className="font-medium text-king-forest hover:underline">
                        {t.loginCta}
                    </Link>
                </p>
            )}

            {error && (
                <FormNotice variant="error" className="mt-3">{error}</FormNotice>
            )}

            <div className="mt-6">
                {comments === null ? (
                    <p className="text-sm text-neutral-gray-medium">{t.loading}</p>
                ) : (tree.get(undefined) ?? []).length === 0 ? (
                    <p className="text-sm text-neutral-gray-medium">{t.empty}</p>
                ) : (
                    (tree.get(undefined) ?? []).map(c => (
                        <CommentNode key={c.id} lang={lang} t={t} comment={c} tree={tree} depth={0}
                            viewerId={viewerId} viewerIsPostAuthor={viewerIsPostAuthor}
                            onReply={post} onDelete={remove} />
                    ))
                )}
            </div>
        </section>
    );
}

function Composer({ t, onSubmit, compact, onCancel }: {
    t: any;
    onSubmit: (content: string) => Promise<boolean>;
    compact?: boolean;
    onCancel?: () => void;
}) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        const content = text.trim();
        if (!content || busy) return;
        setBusy(true);
        if (await onSubmit(content)) {
            setText('');
            onCancel?.();
        }
        setBusy(false);
    };
    return (
        <div className={compact ? 'mt-3' : ''}>
            <textarea
                value={text}
                rows={compact ? 2 : 3}
                maxLength={1000}
                placeholder={t.placeholder}
                onChange={e => setText(e.target.value)}
                className="w-full resize-y rounded-xl border border-neutral-gray-light bg-white px-4 py-3 text-sm leading-relaxed text-neutral-gray-dark placeholder:text-neutral-gray-medium/60 focus:border-king-forest/50 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
                {onCancel && (
                    <Button variant="ghost" className="text-[13px]" onClick={onCancel}>{t.cancel}</Button>
                )}
                <Button variant="default" className="font-bold" disabled={busy || !text.trim()} onClick={() => void submit()}>
                    {busy ? t.posting : compact ? t.replyCta : t.postCta}
                </Button>
            </div>
        </div>
    );
}

function CommentNode({ lang, t, comment, tree, depth, viewerId, viewerIsPostAuthor, onReply, onDelete }: {
    lang: Locale;
    t: any;
    comment: CommentItem;
    tree: Map<string | undefined, CommentItem[]>;
    depth: number;
    viewerId: string | null;
    viewerIsPostAuthor: boolean;
    onReply: (content: string, parentId?: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<void>;
}) {
    const [replying, setReplying] = useState(false);
    const children = tree.get(comment.id) ?? [];
    const canDelete = !comment.deleted && !!viewerId && (viewerId === comment.author.id || viewerIsPostAuthor);
    const when = new Date(comment.createdAt).toLocaleString(LOCALE_META[lang].bcp47, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return (
        <div className={depth > 0 && depth <= MAX_INDENT ? 'ml-5 border-l border-neutral-gray-light/80 pl-4 md:ml-7 md:pl-5' : ''}>
            <div className="py-3">
                <div className="flex items-center gap-2.5">
                    {comment.deleted || !comment.author.username ? (
                        <span className="text-[13px] text-neutral-gray-medium">{t.deletedAuthor}</span>
                    ) : (
                        <Link href={`/${lang}/u/${encodeURIComponent(comment.author.username)}`}
                            className="flex items-center gap-2.5 group">
                            <Avatar userId={comment.author.id} displayName={comment.author.displayName}
                                avatarUpdatedAt={comment.author.avatarUpdatedAt ?? undefined} size={26} shape="circle" />
                            <span className="text-[13.5px] font-bold text-neutral-dark-bg group-hover:text-king-forest">
                                {comment.author.displayName}
                            </span>
                        </Link>
                    )}
                    <span className="text-[12px] text-neutral-gray-medium">{when}</span>
                </div>
                {comment.deleted ? (
                    <p className="mt-1.5 text-sm italic text-neutral-gray-medium/70">{t.deletedBody}</p>
                ) : (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-gray-dark">{comment.content}</p>
                )}
                {!comment.deleted && (
                    <div className="mt-1.5 flex items-center gap-4">
                        {viewerId && (
                            <button type="button" onClick={() => setReplying(v => !v)}
                                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-neutral-gray-medium transition-colors hover:text-king-forest">
                                <CornerDownRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                                {t.replyCta}
                            </button>
                        )}
                        {canDelete && (
                            <button type="button" onClick={() => void onDelete(comment.id)}
                                className="inline-flex items-center gap-1 text-[12.5px] text-neutral-gray-medium transition-colors hover:text-red-600">
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                {t.deleteCta}
                            </button>
                        )}
                    </div>
                )}
                {replying && (
                    <Composer t={t} compact onCancel={() => setReplying(false)}
                        onSubmit={content => onReply(content, comment.id)} />
                )}
            </div>
            {children.map(child => (
                <CommentNode key={child.id} lang={lang} t={t} comment={child} tree={tree}
                    depth={depth + 1} viewerId={viewerId} viewerIsPostAuthor={viewerIsPostAuthor}
                    onReply={onReply} onDelete={onDelete} />
            ))}
        </div>
    );
}
