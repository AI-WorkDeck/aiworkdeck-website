'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SendHorizontal } from 'lucide-react';
import { Locale, LOCALE_META } from '@/i18n-config';
import { Avatar } from '@/components/user/Avatar';
import { Button } from '@/components/ui/button';
import { FormNotice } from '@/components/ui/notice';
import { readApiJson } from '@/lib/api-result';

/**
 * 全站聊天室（dev-board#317）。
 *
 * 连接策略：REST 首拉历史 → SSE（/api/community/chat/stream）增量推送；
 * SSE 出错或被服务端定期收尾（reset 帧）后带当前游标重连，重连间隙用一次
 * REST 增量兜底补洞。所有下发消息按 id 去重，游标只进不退。
 * 发言成功后立刻 REST 补拉一次，不等 2 秒的服务端轮询节拍。
 */

interface ChatAuthor { id: string; username: string; displayName: string; avatarUpdatedAt?: string | null }
interface ChatItem { id: number; content: string; createdAt: string; author: ChatAuthor }

const RECONNECT_DELAY_MS = 5_000;

export function ChatRoom({ lang, t, viewerId }: {
    lang: Locale;
    t: any;
    viewerId: string | null;
}) {
    const [messages, setMessages] = useState<ChatItem[] | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lastIdRef = useRef(0);
    const esRef = useRef<EventSource | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const stickBottomRef = useRef(true);

    const append = useCallback((incoming: ChatItem[]) => {
        const fresh = incoming.filter(m => m.id > lastIdRef.current);
        if (fresh.length === 0) return;
        lastIdRef.current = fresh[fresh.length - 1].id;
        setMessages(prev => [...(prev ?? []), ...fresh].slice(-500));
    }, []);

    const pull = useCallback(async () => {
        try {
            const res = await fetch(`/api/community/chat?since=${lastIdRef.current}`);
            if (!res.ok) return;
            const body = await res.json();
            append(body.messages ?? []);
            setMessages(prev => prev ?? []);
        } catch { /* 下一拍再试 */ }
    }, [append]);

    useEffect(() => {
        let disposed = false;

        const connect = () => {
            if (disposed) return;
            esRef.current?.close();
            const es = new EventSource(`/api/community/chat/stream?since=${lastIdRef.current}`);
            esRef.current = es;
            es.onmessage = ev => {
                try {
                    const frame = JSON.parse(ev.data);
                    if (frame.type === 'messages') append(frame.messages ?? []);
                    if (frame.type === 'reset') {
                        es.close();
                        connect();
                    }
                } catch { /* 坏帧忽略 */ }
            };
            es.onerror = () => {
                es.close();
                if (disposed) return;
                // 重连间隙先 REST 补一次洞，再择机重建 SSE
                void pull();
                reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
            };
        };

        // 首拉历史（拿到 latest 游标）后再建流
        (async () => {
            try {
                const res = await fetch('/api/community/chat');
                const body = await readApiJson(res);
                if (disposed) return;
                if (res.ok) {
                    const items: ChatItem[] = body.messages ?? [];
                    lastIdRef.current = items.length > 0 ? items[items.length - 1].id : 0;
                    setMessages(items);
                } else {
                    setMessages([]);
                }
            } catch {
                if (!disposed) setMessages([]);
            }
            connect();
        })();

        return () => {
            disposed = true;
            esRef.current?.close();
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
        };
    }, [append, pull]);

    // 贴底自动滚动：用户在底部附近才跟随新消息，翻历史时不打扰
    useEffect(() => {
        const el = listRef.current;
        if (el && stickBottomRef.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const onScroll = () => {
        const el = listRef.current;
        if (!el) return;
        stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    const send = async () => {
        const content = text.trim();
        if (!content || busy) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/community/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            const body = await readApiJson(res);
            if (!res.ok) {
                setError(t.errors[body.error] || t.errors.generic);
            } else {
                setText('');
                stickBottomRef.current = true;
                await pull();
            }
        } catch {
            setError(t.errors.generic);
        }
        setBusy(false);
    };

    return (
        <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-neutral-gray-light bg-white">
            <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-5 md:px-6"
                style={{ maxHeight: 'calc(100vh - 22rem)' }}>
                {messages === null ? (
                    <p className="text-sm text-neutral-gray-medium">{t.connecting}</p>
                ) : messages.length === 0 ? (
                    <p className="text-sm text-neutral-gray-medium">{t.empty}</p>
                ) : (
                    <ul className="flex flex-col gap-4">
                        {messages.map(m => (
                            <li key={m.id} className="flex items-start gap-3">
                                <Avatar userId={m.author.id} displayName={m.author.displayName}
                                    avatarUpdatedAt={m.author.avatarUpdatedAt ?? undefined} size={30} shape="circle" />
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-baseline gap-2">
                                        {m.author.username ? (
                                            <Link href={`/${lang}/u/${encodeURIComponent(m.author.username)}`}
                                                className="text-[13px] font-bold text-neutral-dark-bg hover:text-king-forest">
                                                {m.author.displayName}
                                            </Link>
                                        ) : (
                                            <span className="text-[13px] text-neutral-gray-medium">{m.author.displayName}</span>
                                        )}
                                        <span className="text-[11.5px] text-neutral-gray-medium">
                                            {new Date(m.createdAt).toLocaleTimeString(LOCALE_META[lang].bcp47, {
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </span>
                                    </p>
                                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-gray-dark">
                                        {m.content}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="border-t border-neutral-gray-light px-5 py-4 md:px-6">
                {error && (
                    <FormNotice variant="error" className="mb-3">{error}</FormNotice>
                )}
                {viewerId ? (
                    <div className="flex items-end gap-3">
                        <textarea
                            value={text}
                            rows={1}
                            maxLength={500}
                            placeholder={t.placeholder}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    void send();
                                }
                            }}
                            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-neutral-gray-light bg-white px-4 py-2.5 text-sm leading-relaxed text-neutral-gray-dark placeholder:text-neutral-gray-medium/60 focus:border-king-forest/50 focus:outline-none"
                        />
                        <Button variant="default" className="gap-1.5 font-bold" disabled={busy || !text.trim()}
                            onClick={() => void send()}>
                            <SendHorizontal className="h-4 w-4" strokeWidth={1.75} />
                            {t.send}
                        </Button>
                    </div>
                ) : (
                    <p className="text-sm text-neutral-gray-medium">
                        {t.loginHint}{' '}
                        <Link href={`/${lang}/account`} className="font-medium text-king-forest hover:underline">
                            {t.loginCta}
                        </Link>
                    </p>
                )}
            </div>
        </div>
    );
}
