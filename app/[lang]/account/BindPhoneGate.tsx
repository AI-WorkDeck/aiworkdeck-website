'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormNotice } from '@/components/ui/notice';
import { interpolate } from '@/components/ui/interpolate';
import { RESEND_COOLDOWN_MS } from '@/lib/sms-constants';
import { readApiJson } from '@/lib/api-result';
import { Captcha, type CaptchaConfig, type CaptchaHandle } from '@/components/captcha/Captcha';

/**
 * 存量账号的强制补绑手机号弹窗（spec §5）。
 *
 * **不可跳过，但可以关掉窗口退出登录**——刻意不做「本次不再提示」：
 * 做了的话到期那天会有一批人从没见过这个弹窗，直接被挡在门外。
 *
 * 只在大陆站、且当前账号 `phone` 为空时由服务端决定挂载，这里不重复判站点。
 */
export function BindPhoneGate({ lang, dict, deadline, captcha = null }: {
    lang: Locale; dict: any; deadline: string;
    /** 人机验证配置，服务端算好传下来；null = 未启用。同 AuthForms。 */
    captcha?: CaptchaConfig | null;
}) {
    const t = dict.authPage;
    const captchaRef = useRef<CaptchaHandle | null>(null);
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [sending, setSending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [notice, setNotice] = useState<ReactNode>('');
    const [error, setError] = useState('');
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (cooldown <= 0) return;
        timer.current = setInterval(() => setCooldown(c => (c <= 1 ? 0 : c - 1)), 1000);
        return () => {
            if (timer.current) clearInterval(timer.current);
        };
    }, [cooldown > 0]);

    // 弹窗打开期间锁掉背景滚动：这是一道闸，不该让人滚开去看别的
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    const send = async () => {
        setSending(true); setError(''); setNotice('');
        try {
            let captchaToken = '';
            if (captcha) {
                captchaToken = await captchaRef.current?.getToken() ?? '';
                if (!captchaToken) { setError(t.errors.captcha_failed || t.errors.generic); setSending(false); return; }
            }
            const res = await fetch('/api/auth/sms/bind/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, captchaToken }),
            });
            const data = await readApiJson(res);
            if (!res.ok) setError(data.message || t.errors[data.error] || t.errors.generic);
            else {
                setNotice(interpolate(t.codeSent, { phone: <strong className="font-medium text-king-forest">{phone}</strong> }));
                setCooldown(Math.ceil(RESEND_COOLDOWN_MS / 1000));
            }
        } catch {
            setError(t.errors.generic);
        }
        setSending(false);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true); setError('');
        try {
            const res = await fetch('/api/auth/sms/bind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code }),
            });
            const data = await readApiJson(res);
            if (!res.ok) {
                setError(data.message || t.errors[data.error] || t.errors.generic);
                setSubmitting(false);
                return;
            }
            // 整页重载：绑完之后这道闸就不该再挂着了
            window.location.assign(`/${lang}/account`);
        } catch {
            setError(t.errors.generic);
            setSubmitting(false);
        }
    };

    const signOut = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
            // 退出失败也照样离开这一页，本地会话在服务端已尽力清掉
        }
        window.location.assign(`/${lang}`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-xl p-6 sm:p-8 shadow-lg" role="dialog" aria-modal="true">
                <h2 className="text-xl font-semibold text-king-forest">{t.bindTitle}</h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-gray-dark">
                    {t.bindBody.replace('{date}', deadline)}
                </p>

                <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <Label className="text-neutral-gray-dark" htmlFor="bind-phone">{t.phone}</Label>
                        <Input id="bind-phone" type="tel" inputMode="numeric" autoComplete="tel"
                            value={phone} onChange={e => setPhone(e.target.value)} required />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label className="text-neutral-gray-dark" htmlFor="bind-code">{t.smsCode}</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input id="bind-code" inputMode="numeric" autoComplete="one-time-code"
                                value={code} onChange={e => setCode(e.target.value)} required />
                            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap"
                                disabled={sending || cooldown > 0 || !phone} onClick={send}>
                                {cooldown > 0 ? t.resendIn.replace('{n}', String(cooldown)) : t.sendCode}
                            </Button>
                        </div>
                    </div>

                    {captcha && <Captcha config={captcha} handleRef={captchaRef} />}

                    {notice && (
                        <FormNotice variant="success">{notice}</FormNotice>
                    )}
                    {error && (
                        <FormNotice variant="error">{error}</FormNotice>
                    )}

                    <Button type="submit" disabled={submitting} className="font-bold">
                        {submitting ? t.submitting : t.bindBtn}
                    </Button>
                </form>

                {/* 唯一的出口：关窗即退出登录。没有「稍后再说」。 */}
                <button type="button" onClick={signOut}
                    className="mt-4 w-full text-center text-xs text-neutral-gray-medium hover:text-king-forest cursor-pointer">
                    {t.bindLater}
                </button>
            </div>
        </div>
    );
}
