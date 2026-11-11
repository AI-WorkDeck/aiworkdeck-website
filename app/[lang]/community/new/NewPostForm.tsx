'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Feather, MessagesSquare } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { FormNotice } from '@/components/ui/notice';
import { readApiJson } from '@/lib/api-result';
import { cn } from '@/lib/utils';

/**
 * 发帖表单（dev-board#316）。类型二选一（讨论帖/博客长文），讨论帖可选固定标签。
 * 正文纯文本（换行分段），长度上限与频控由服务端裁决（lib/forum.ts），
 * 这里只做 maxLength 软约束与错误码翻译。
 */

const THREAD_TAGS = ['practice', 'question', 'lounge'] as const;

export function NewPostForm({ lang, t, tagLabels }: {
    lang: Locale;
    t: any;
    tagLabels: Record<string, string>;
}) {
    const router = useRouter();
    const [type, setType] = useState<'thread' | 'blog'>('thread');
    const [tag, setTag] = useState('');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (busy || !title.trim() || !content.trim()) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/community/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    title,
                    content,
                    ...(type === 'thread' && tag ? { tag } : {}),
                }),
            });
            const body = await readApiJson(res);
            if (!res.ok) {
                setError(t.errors[body.error] || t.errors.generic);
                setBusy(false);
                return;
            }
            router.push(`/${lang}/community/post/${body.post.id}`);
        } catch {
            setError(t.errors.generic);
            setBusy(false);
        }
    };

    const typeCard = (value: 'thread' | 'blog', Icon: typeof Feather, label: string, hint: string) => (
        <button type="button" onClick={() => setType(value)}
            className={cn(
                'flex flex-1 items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                type === value
                    ? 'border-king-forest bg-king-forest-lightest/40'
                    : 'border-neutral-gray-light bg-white hover:border-king-forest/40'
            )}>
            <Icon className={cn('mt-0.5 h-[18px] w-[18px] flex-shrink-0', type === value ? 'text-king-forest' : 'text-neutral-gray-medium')} strokeWidth={1.75} />
            <span>
                <span className={cn('block text-[14px] font-bold', type === value ? 'text-king-forest' : 'text-neutral-dark-bg')}>
                    {label}
                </span>
                <span className="mt-0.5 block text-[12px] text-neutral-gray-medium">{hint}</span>
            </span>
        </button>
    );

    return (
        <div className="rounded-xl border border-neutral-gray-light bg-white px-6 py-7 md:px-8">
            <p className="mb-2.5 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.typeLabel}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
                {typeCard('thread', MessagesSquare, t.typeThread, t.typeThreadHint)}
                {typeCard('blog', Feather, t.typeBlog, t.typeBlogHint)}
            </div>

            {type === 'thread' && (
                <>
                    <p className="mb-2.5 mt-6 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.tagLabel}</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setTag('')}
                            className={cn(
                                'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                                tag === ''
                                    ? 'border-king-forest bg-king-forest text-white'
                                    : 'border-neutral-gray-light text-neutral-gray-medium hover:text-king-forest'
                            )}>
                            {t.tagNone}
                        </button>
                        {THREAD_TAGS.map(tg => (
                            <button key={tg} type="button" onClick={() => setTag(tg)}
                                className={cn(
                                    'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                                    tag === tg
                                        ? 'border-king-forest bg-king-forest text-white'
                                        : 'border-neutral-gray-light text-neutral-gray-medium hover:text-king-forest'
                                )}>
                                {tagLabels[tg]}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <p className="mb-2.5 mt-6 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.titleLabel}</p>
            <input
                value={title}
                maxLength={120}
                placeholder={t.titlePlaceholder}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded-xl border border-neutral-gray-light bg-white px-4 py-3 font-display text-[16px] font-bold text-neutral-dark-bg placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-neutral-gray-medium/60 focus:border-king-forest/50 focus:outline-none"
            />

            <p className="mb-2.5 mt-6 text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.contentLabel}</p>
            <textarea
                value={content}
                rows={type === 'blog' ? 16 : 8}
                maxLength={50000}
                placeholder={t.contentPlaceholder}
                onChange={e => setContent(e.target.value)}
                className="w-full resize-y rounded-xl border border-neutral-gray-light bg-white px-4 py-3 text-sm leading-relaxed text-neutral-gray-dark placeholder:text-neutral-gray-medium/60 focus:border-king-forest/50 focus:outline-none"
            />

            {error && (
                <FormNotice variant="error" className="mt-4">{error}</FormNotice>
            )}

            <div className="mt-6 flex justify-end">
                <Button variant="default" className="px-7 font-bold"
                    disabled={busy || !title.trim() || !content.trim()} onClick={() => void submit()}>
                    {busy ? t.submitting : t.submit}
                </Button>
            </div>
        </div>
    );
}
