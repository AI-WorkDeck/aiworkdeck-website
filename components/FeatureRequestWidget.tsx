'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormNotice } from '@/components/ui/notice';

const TEXT_MAX = 2000;
const CONTACT_MAX = 120;

/**
 * 全站悬浮的「提交需求」入口：右下角圆形按钮，点开是弹窗表单。
 * 维护者裁决（dev-board#240 复测）：不做独立页面——表单就一屏，配不上一个页面，
 * 更不该藏在页脚里。旧路由 /feature-request 在 next.config.ts 里 301 跳首页带 ?feature-request=1
 * （README 与外部已散出的链接不能死），本组件挂载时读到该参数就自动弹开。
 *
 * admin 后台不渲染：那是维护者自己的地盘，给自己提需求没有意义还挡操作区。
 */
interface FeatureRequestWidgetProps {
    lang: string;
    t: {
        title: string;
        intro: string;
        floatLabel: string;
        fields: {
            text: string;
            textPlaceholder: string;
            contact: string;
            contactPlaceholder: string;
            contactHint: string;
        };
        submit: string;
        submitting: string;
        successTitle: string;
        successBody: string;
        submitAnother: string;
        privacyNote: string;
        privacyLink: string;
        errors: Record<string, string>;
    };
}

export function FeatureRequestWidget({ lang, t }: FeatureRequestWidgetProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [contact, setContact] = useState('');
    const [hp, setHp] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    // 深链自动弹开（/feature-request 301 过来的落点）
    useEffect(() => {
        if (searchParams.get('feature-request')) setOpen(true);
    }, [searchParams]);

    if (pathname?.includes('/admin')) return null;

    function openDialog() {
        setDone(false);
        setError('');
        setOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submitting) return;
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch('/api/feature-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, contact, lang, hp }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok) {
                setDone(true);
                setText('');
                setContact('');
            } else {
                const key = data?.error as string | undefined;
                setError((key && t.errors[key]) || t.errors.server);
            }
        } catch {
            setError(t.errors.server);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={openDialog}
                aria-label={t.floatLabel}
                title={t.floatLabel}
                className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-king-forest text-white shadow-lg transition-transform hover:scale-105 hover:bg-king-forest/90 focus:outline-none focus:ring-2 focus:ring-king-mint focus:ring-offset-2"
            >
                <MessageSquarePlus className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="mx-4 max-h-[85vh] overflow-y-auto">
                    {done ? (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <CheckCircle2 className="h-10 w-10 text-king-forest" strokeWidth={1.75} />
                            <h2 className="font-display text-2xl font-bold text-neutral-gray-dark">{t.successTitle}</h2>
                            <p className="max-w-md text-sm leading-relaxed text-neutral-gray-medium">{t.successBody}</p>
                            <Button variant="outline" onClick={() => setDone(false)}>{t.submitAnother}</Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2 pr-8">
                                <h2 className="font-display text-xl font-bold text-neutral-gray-dark">{t.title}</h2>
                                <p className="text-sm leading-relaxed text-neutral-gray-medium">{t.intro}</p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label className="text-neutral-gray-dark" htmlFor="frw-text">{t.fields.text}</Label>
                                <Textarea
                                    id="frw-text"
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    placeholder={t.fields.textPlaceholder}
                                    required
                                    minLength={5}
                                    maxLength={TEXT_MAX}
                                    rows={5}
                                />
                                <span className="self-end text-xs text-neutral-gray-medium">{text.length}/{TEXT_MAX}</span>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label className="text-neutral-gray-dark" htmlFor="frw-contact">{t.fields.contact}</Label>
                                <Input
                                    id="frw-contact"
                                    value={contact}
                                    onChange={e => setContact(e.target.value)}
                                    placeholder={t.fields.contactPlaceholder}
                                    maxLength={CONTACT_MAX}
                                />
                                <span className="text-xs text-neutral-gray-medium">{t.fields.contactHint}</span>
                            </div>

                            {/* 蜜罐：真人不可见不可聚焦；机器人填了会被服务端静默丢弃 */}
                            <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
                                <input
                                    type="text"
                                    name="hp"
                                    tabIndex={-1}
                                    autoComplete="off"
                                    value={hp}
                                    onChange={e => setHp(e.target.value)}
                                />
                            </div>

                            {error && (
                                <FormNotice variant="error">{error}</FormNotice>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <p className="text-xs text-neutral-gray-medium">
                                    {t.privacyNote}{' '}
                                    <Link href={`/${lang}/legal/privacy`} className="underline hover:text-king-forest">{t.privacyLink}</Link>
                                </p>
                                <Button type="submit" disabled={submitting || text.trim().length < 5} className="min-w-28 font-bold">
                                    {submitting ? t.submitting : t.submit}
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
