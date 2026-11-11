'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormNotice } from '@/components/ui/notice';
import { Captcha, type CaptchaConfig, type CaptchaHandle } from '@/components/captcha/Captcha';
import { readApiJson } from '@/lib/api-result';

/** Both proofs finish on the website before the app is allowed to bridge the legacy identity. */
export function LegacyEmailForm({ lang, dict, phoneLabel, mailReady, captcha, mobileHandoff = false }: {
    lang: Locale; dict: any; phoneLabel: string; mailReady: boolean; captcha: CaptchaConfig | null; mobileHandoff?: boolean;
}) {
    const t = dict.authPage;
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    const [complete, setComplete] = useState(false);
    const captchaRef = useRef<CaptchaHandle | null>(null);
    useEffect(() => {
        if (!cooldown) return;
        const timer = setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);
    async function post(path: string, body: object) {
        const response = await fetch(`/api/auth/legacy-email/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(t.errors[data.error] || t.errors.generic);
    }
    async function send() {
        setSending(true); setError(''); setSent(false);
        try {
            const captchaToken = captcha ? await captchaRef.current?.getToken() ?? '' : '';
            if (captcha && !captchaToken) throw new Error(t.errors.captcha_failed);
            await post('send-code', { email, captchaToken });
            setSent(true); setCooldown(60);
        } catch (e) { setError(e instanceof Error ? e.message : t.errors.generic); }
        finally { setSending(false); }
    }
    async function submit(e: React.FormEvent) {
        e.preventDefault(); setBusy(true); setError('');
        try { await post('verify', { email, code }); setComplete(true); setCode(''); }
        catch (e) { setError(e instanceof Error ? e.message : t.errors.generic); }
        finally { setBusy(false); }
    }
    async function switchAccount() {
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (!response.ok) throw new Error(t.errors.generic);
            window.location.assign(mobileHandoff ? `/mobile-account/${lang}?legacyEmail=1` : `/${lang}/account?legacyEmail=1`);
        } catch (e) { setError(e instanceof Error ? e.message : t.errors.generic); setBusy(false); }
    }
    return <div className="bg-white border border-neutral-gray-light rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-king-forest mb-3">{t.legacyEmailTitle}</h2>
        {complete ? <>
            <FormNotice variant="success">{t.legacyEmailComplete}</FormNotice>
            {!mobileHandoff && <Link className="mt-5 inline-block text-sm text-king-forest underline" href={`/${lang}/account`}>{t.legacyEmailAccountLink}</Link>}
        </> : <>
            <p className="text-sm text-neutral-gray-medium mb-4">{t.legacyEmailPhoneReady.replace('{phone}', phoneLabel)}</p>
            <p className="text-sm text-neutral-gray-medium mb-6">{t.legacyEmailStay}</p>
            <form onSubmit={submit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2"><Label htmlFor="legacy-email">{t.legacyEmailLabel}</Label>
                    <Input id="legacy-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy || sending} />
                </div>
                <div className="flex flex-col gap-2"><Label htmlFor="legacy-email-code">{t.mailCode}</Label>
                    <div className="flex gap-2"><Input id="legacy-email-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required disabled={busy || sending} />
                        <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={send} disabled={busy || sending || cooldown > 0 || !email || !mailReady}>{cooldown ? t.resendIn.replace('{n}', String(cooldown)) : t.sendCode}</Button>
                    </div>
                </div>
                {captcha && <Captcha config={captcha} handleRef={captchaRef} />}
                {!mailReady && <FormNotice variant="error">{t.legacyEmailUnavailable}</FormNotice>}
                {sent && <FormNotice variant="success">{t.codeSentSimple}</FormNotice>}
                {error && <FormNotice variant="error">{error}</FormNotice>}
                <Button type="submit" disabled={busy || sending || !mailReady}>{busy ? t.submitting : t.legacyEmailSubmit}</Button>
                <button type="button" className="text-sm text-king-forest underline" onClick={switchAccount} disabled={busy || sending}>{t.legacyEmailRetryLogin}</button>
            </form>
        </>}
    </div>;
}
