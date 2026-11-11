'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Trash2 } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { readApiJson } from '@/lib/api-result';

/**
 * 帖子详情页的轻动作条（dev-board#316）：登录用户可举报（UGC 治理最小闸），
 * 作者本人可删。管理员的置顶/精选/隐藏在后台「社区论坛」分区，不进公开页面。
 */
export function PostActions({ lang, t, postId, viewerId, viewerIsAuthor }: {
    lang: Locale;
    t: any;
    postId: string;
    viewerId: string | null;
    viewerIsAuthor: boolean;
}) {
    const router = useRouter();
    const [notice, setNotice] = useState('');
    const btn = 'inline-flex items-center gap-1 text-[12.5px] text-neutral-gray-medium transition-colors';

    const report = async () => {
        const reason = window.prompt(t.reportPrompt);
        if (reason === null) return;
        try {
            const res = await fetch('/api/community/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetType: 'post', targetId: postId, reason }),
            });
            const body = await readApiJson(res);
            if (res.ok || body.error === 'duplicate') {
                setNotice(body.error === 'duplicate' ? t.reportDuplicate : t.reportDone);
            }
        } catch { /* 举报失败静默，页面不打扰 */ }
    };

    const remove = async () => {
        if (!window.confirm(t.deleteConfirm)) return;
        const res = await fetch(`/api/community/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
        if (res.ok) router.push(`/${lang}/community`);
    };

    if (!viewerId) return null;

    return (
        <span className="inline-flex items-center gap-4">
            {!viewerIsAuthor && (
                notice ? (
                    <span className="text-[12.5px] text-king-forest">{notice}</span>
                ) : (
                    <button type="button" onClick={() => void report()} className={`${btn} hover:text-amber-700`}>
                        <Flag className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {t.reportCta}
                    </button>
                )
            )}
            {viewerIsAuthor && (
                <button type="button" onClick={() => void remove()} className={`${btn} hover:text-red-600`}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.deleteCta}
                </button>
            )}
        </span>
    );
}
