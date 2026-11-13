'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormNotice } from '@/components/ui/notice';
import { phoneIsAccount } from '@/lib/phone-policy';
import { Captcha, type CaptchaConfig, type CaptchaHandle } from '@/components/captcha/Captcha';
import { readApiJson } from '@/lib/api-result';
import { mobileAccountCopy } from '@/content/mobile-account';

interface AuthFormsProps {
    bqtEnabled?: boolean;
    lang: Locale;
    dict: any;
    next?: string;
    /** Attribution supplied by an embedded /start flow; URL handoffs remain supported. */
    startRef?: string;
    legacyEmail?: boolean;
    defaultTab?: 'login' | 'register';
    bare?: boolean;
    codeChannelReady?: boolean;
    captcha?: CaptchaConfig | null;
    /** Mobile registration ends here, without navigating into web purchases. */
    mobileHandoff?: boolean;
}
const validSignupRef = (value: string) => value.length <= 64 && /^u-[a-z0-9][a-z0-9-]{2,29}$/.test(value) ? value : '';

type Mode = 'password' | 'register' | 'setup' | 'reset' | 'review' | 'bqt-scan';

/** One shared flow for account, onboarding, desktop and mobile browser handoffs. */
export function AuthForms({ lang, dict, next, startRef = '', legacyEmail = false, defaultTab = 'login', bare, codeChannelReady = true, captcha = null, mobileHandoff = false, bqtEnabled = false }: AuthFormsProps) {
    const t = dict.authPage;
    const mobileCopy = mobileAccountCopy(lang);
    const phoneSite = phoneIsAccount();
    const [mode, setMode] = useState<Mode>(defaultTab === 'register' ? 'register' : 'password');
    const [account, setAccount] = useState('');
    const [contact, setContact] = useState('');
    const [code, setCode] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [setupToken, setSetupToken] = useState('');
    const [referral, setReferral] = useState(() => validSignupRef(startRef));
    const [remember, setRemember] = useState(true);
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [compat, setCompat] = useState(false);
    const [challenge, setChallenge] = useState<{ id: string; image: string } | null>(null);
    const [challengeAnswer, setChallengeAnswer] = useState('');
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [mobileComplete, setMobileComplete] = useState(false);
    const [bqtPollToken, setBqtPollToken] = useState('');
    const [bqtQrid, setBqtQrid] = useState('');
    const [bqtQrDataUrl, setBqtQrDataUrl] = useState('');
    const [bqtExpired, setBqtExpired] = useState(false);
    const [bqtLoading, setBqtLoading] = useState(false);
    useEffect(() => { setChallenge(null); setChallengeAnswer(''); }, [contact, mode]);
    const captchaRef = useRef<CaptchaHandle | null>(null);
    // Only explicit public flow names are accepted. Never put tickets/passwords in URLs.
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const flow = query.get('flow');
        setReferral(validSignupRef(startRef || query.get('ref') || ''));
        if (flow === 'register' || flow === 'reset') setMode(flow);
    }, [startRef]);
    useEffect(() => {
        if (!cooldown) return;
        const timer = setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const targetAfterAuth = (data?: any) => {
        const candidate = next && next.startsWith('/') && !/[\\\x00-\x20]/.test(next) ? new URL(next, window.location.origin) : null;
        const safeNext = candidate?.origin === window.location.origin ? candidate.pathname + candidate.search + candidate.hash : `/${lang}/account`;
        return legacyEmail ? `/${lang}/account?legacyEmail=1` : data?.mustBindPhone ? `/${lang}/account` : safeNext;
    };

    const changeMode = (value: Mode) => {
        setMode(value); setError(''); setNotice(''); setPassword(''); setConfirmPassword(''); setCode(''); setSetupToken('');
    };
    const loadBqtQr = async () => {
        setBqtLoading(true); setBqtExpired(false); setError('');
        try {
            const { response, data } = await post('/api/auth/bqt-scan/create', {});
            if (!response.ok) { fail(data); return; }
            setBqtQrid(data.qrid || '');
            setBqtPollToken(data.pollToken || '');
            setBqtQrDataUrl(data.qrDataUrl || '');
        } catch {
            setError(t.errors.account_network_failed);
        } finally {
            setBqtLoading(false);
        }
    };
    useEffect(() => {
        if (mode !== 'bqt-scan') return;
        void loadBqtQr();
    }, [mode]);
    useEffect(() => {
        if (mode !== 'bqt-scan' || !bqtQrid || bqtExpired) return;
        let inFlight = false;
        let disposed = false;
        const timer = setInterval(async () => {
            if (inFlight || disposed) return;
            inFlight = true;
            try {
                const res = await fetch(`/api/auth/bqt-scan/status?qrid=${encodeURIComponent(bqtQrid)}`, { headers: { 'X-Bqt-Poll-Token': bqtPollToken } });
                const d = await readApiJson(res);
                if (d?.status === 'confirmed') {
                    clearInterval(timer);
                    if (mobileHandoff) { setMobileComplete(true); return; }
                    window.location.assign(targetAfterAuth());
                } else if (d?.status === 'expired') {
                    setBqtExpired(true);
                } else if (d?.status === 'rejected') {
                    setBqtExpired(true);
                    setError(t.errors[d.error] || t.errors.bqt_not_lawyer || t.errors.generic);
                }
            } catch { /* retry next tick */ } finally { inFlight = false; }
        }, 2000);
        return () => { disposed = true; clearInterval(timer); };
    }, [mode, bqtQrid, bqtPollToken, bqtExpired, lang, mobileHandoff, next]);
    const payload = () => phoneSite ? { phone: contact } : { email: contact };
    const showCode = mode === 'register' || mode === 'reset' || mode === 'review';
    const newPassword = mode === 'setup' || mode === 'reset';
    const showPassword = mode !== 'register' && mode !== 'review' && mode !== 'bqt-scan';
    const fail = (data: any) => setError((['sms_send_failed', 'mail_send_failed', 'code_send_failed'].includes(data?.error) && data.message) || t.errors[data?.error] || t.errors.generic);
    async function post(url: string, body: object) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { response, data: await readApiJson(response) };
    }
    async function loadChallenge() {
        if (!contact.trim()) { setError(t.compatContactFirst); return; }
        setCompat(true); setChallenge(null); setChallengeAnswer(''); setError(''); setChallengeLoading(true);
        try {
            const { response, data } = await post('/api/auth/captcha-challenge', { ...payload(), purpose: mode === 'reset' ? 'reset' : 'login' });
            if (!response.ok) { fail(data); return; }
            setChallenge(data);
        } catch { setError(t.errors.account_network_failed); }
        finally { setChallengeLoading(false); }
    }
    async function sendCode() {
        setSending(true); setError(''); setNotice('');
        try {
            if (compat && (!challenge || !/^[a-z0-9]{6}$/i.test(challengeAnswer.trim()))) { setError(t.compatAnswerFirst); return; }
            const captchaToken = compat ? `local:${challenge!.id}:${challengeAnswer.trim()}` : captcha ? await captchaRef.current?.getToken() ?? '' : '';
            if (!compat && captcha && !captchaToken) { setError(t.errors.captcha_failed); return; }
            const url = mode === 'reset' ? '/api/auth/password/reset/send-code' : `/api/auth/${phoneSite ? 'sms' : 'mail'}-login/send-code`;
            if (compat) { setChallenge(null); setChallengeAnswer(''); }
            const { response, data } = await post(url, { ...payload(), captchaToken });
            if (!response.ok) { fail(data); return; }
            setNotice(t.codeSentSimple); setCooldown(60);
        } catch { setError(t.errors.account_network_failed); }
        finally { setSending(false); }
    }
    async function submit(e: React.FormEvent) {
        e.preventDefault(); setError(''); setNotice('');
        if (newPassword && password !== confirmPassword) { setError(t.errors.password_mismatch); return; }
        setBusy(true);
        try {
            if (mode === 'register' || mode === 'review') {
                const trimmedInvite = !phoneSite && inviteCode.trim() ? inviteCode.trim() : '';
                const { response, data } = await post(`/api/auth/${phoneSite ? 'sms' : 'mail'}-login/verify`, {
                    ...payload(),
                    code,
                    rememberMe: remember,
                    ...(mode === 'register' && referral ? { ref: referral } : {}),
                    ...(trimmedInvite ? { inviteCode: trimmedInvite } : {}),
                });
                if (!response.ok) { fail(data); return; }
                if (mode === 'review' && data.user) { if (mobileHandoff) setMobileComplete(true); else window.location.assign(targetAfterAuth(data)); return; }
                if (!data.passwordSetupRequired || !data.setupToken || !data.account) { setError(t.errors.generic); return; }
                setSetupToken(data.setupToken); setAccount(data.account); setMode('setup'); setCode('');
                return;
            }
            if (newPassword) {
                const trimmedInvite = !phoneSite && inviteCode.trim() ? inviteCode.trim() : '';
                const { response, data } = await post(
                    mode === 'setup' ? '/api/auth/password/setup' : '/api/auth/password/reset',
                    mode === 'setup'
                        ? { setupToken, password, ...(trimmedInvite ? { inviteCode: trimmedInvite } : {}) }
                        : { ...payload(), code, password }
                );
                if (!response.ok) { fail(data); return; }
                if (mobileHandoff && !legacyEmail) { setMobileComplete(true); setSetupToken(''); setCode(''); setPassword(''); setConfirmPassword(''); return; }
                if (mode === 'setup' && !mobileHandoff) {
                    const login = await post('/api/auth/login', {
                        account,
                        password,
                        rememberMe: remember,
                        ...(trimmedInvite ? { inviteCode: trimmedInvite } : {}),
                    });
                    if (login.response.ok) {
                        setSetupToken(''); setCode(''); setPassword(''); setConfirmPassword('');
                        window.location.assign(targetAfterAuth(login.data));
                        return;
                    }
                }
                if (mode === 'reset') setAccount(contact);
                setMode('password'); setSetupToken(''); setCode(''); setPassword(''); setConfirmPassword('');
                setNotice(legacyEmail ? t.legacyPhonePasswordSaved : t.passwordSaved);
                return;
            }
            const trimmedInvite = !phoneSite && inviteCode.trim() ? inviteCode.trim() : '';
            const { response, data } = await post('/api/auth/login', {
                account,
                password,
                rememberMe: remember,
                ...(trimmedInvite ? { inviteCode: trimmedInvite } : {}),
            });
            if (!response.ok) { fail(data); return; }
            if (mobileHandoff) {
                if (legacyEmail) window.location.assign(`/mobile-account/${lang}?legacyEmail=1`);
                else { setMobileComplete(true); setPassword(''); }
                return;
            }
            window.location.assign(targetAfterAuth(data));
        } catch { setError(t.errors.account_network_failed); }
        finally { setBusy(false); }
    }

    const title = mode === 'bqt-scan' ? t.bqtScanTab : mode === 'review' ? t.reviewLogin : mode === 'password' ? t.passwordTab : mode === 'register' ? t.firstTime : mode === 'setup' ? t.createPassword : t.resetPassword;
    if (mobileComplete) return <div role="status" className="rounded-xl border border-[#dce2de] bg-white p-8 shadow-sm">
        <h2 className="mb-3 text-xl font-bold text-king-forest">{mobileCopy.completeTitle}</h2>
        <p className="text-neutral-gray-dark">{mobileCopy.completeBody}</p>
    </div>;
    return (
        <div className={bare ? '' : 'bg-white border border-[#dce2de] rounded-xl p-8 shadow-sm'}>
            {phoneSite && bqtEnabled && (mode === 'password' || mode === 'register' || mode === 'bqt-scan') && (
                <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-neutral-gray-pale/60 p-1 text-sm font-medium">
                    <button
                        type="button"
                        onClick={() => changeMode(defaultTab === 'register' && mode === 'bqt-scan' ? 'register' : 'password')}
                        disabled={busy || sending || challengeLoading}
                        className={`rounded-md py-2 transition-colors ${mode !== 'bqt-scan' ? 'bg-white text-king-forest shadow-sm' : 'text-neutral-gray-medium hover:text-neutral-dark-bg'}`}
                    >
                        {t.passwordTab}
                    </button>
                    <button
                        type="button"
                        onClick={() => changeMode('bqt-scan')}
                        disabled={busy || sending || challengeLoading}
                        className={`rounded-md py-2 transition-colors ${mode === 'bqt-scan' ? 'bg-white text-king-forest shadow-sm' : 'text-neutral-gray-medium hover:text-neutral-dark-bg'}`}
                    >
                        {t.bqtScanTab}
                    </button>
                </div>
            )}
            <h2 className="text-xl font-bold text-king-forest mb-3">{title}</h2>
            {legacyEmail && <p className="text-sm text-neutral-gray-medium mb-4">{t.legacyEmailIntro}</p>}
            <p className="text-sm text-neutral-gray-medium mb-6">{mode === 'bqt-scan' ? t.bqtScanHint : mode === 'review' ? t.reviewHint : mode === 'password' ? t.passwordHint : mode === 'setup' ? t.setupHint : mode === 'reset' ? t.resetHint : t.firstTimeHint}</p>
            {mode === 'bqt-scan' ? (
                <div className="flex flex-col items-center gap-4">
                    <p className="text-sm font-medium text-neutral-dark-bg">{t.bqtScanTitle}</p>
                    <div className="relative flex h-56 w-56 items-center justify-center rounded-xl border border-[#dce2de] bg-neutral-gray-pale/30 p-3">
                        {bqtQrDataUrl && <img src={bqtQrDataUrl} alt={t.bqtScanTitle} className="h-48 w-48 object-contain" />}
                        {bqtExpired && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/90 p-4 text-center">
                                <span className="text-sm font-medium text-neutral-dark-bg">{t.bqtScanExpired}</span>
                                <Button type="button" size="sm" onClick={loadBqtQr} disabled={bqtLoading}>{t.bqtScanRefresh}</Button>
                            </div>
                        )}
                    </div>
                    {error && <FormNotice variant="error">{error}</FormNotice>}
                    <div className="flex w-full justify-between pt-2 text-sm text-king-forest">
                        <button type="button" onClick={() => changeMode('password')}>{t.bqtScanBackPassword}</button>
                        <button type="button" onClick={loadBqtQr} disabled={bqtLoading}>{t.bqtScanRefresh}</button>
                    </div>
                </div>
            ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
                {mode === 'password' && <div className="flex flex-col gap-2">
                    <Label htmlFor="auth-account">{phoneSite ? t.phoneAccount : t.mailAccount}</Label>
                    <Input id="auth-account" value={account} onChange={e => setAccount(e.target.value)} required autoComplete="username" disabled={busy || sending || challengeLoading} />
                </div>}
                {mode === 'setup' && <p className="text-sm text-neutral-gray-medium">{account}</p>}
                {showCode && <>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="auth-code-id">{phoneSite ? t.phone : t.email}</Label>
                        <Input id="auth-code-id" type={phoneSite ? 'tel' : 'email'} autoComplete={phoneSite ? 'tel' : 'email'} value={contact} onChange={e => setContact(e.target.value)} required disabled={busy || sending || challengeLoading} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="auth-code">{phoneSite ? t.smsCode : t.mailCode}</Label>
                        <div className="flex gap-2">
                            <Input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required disabled={busy || sending || challengeLoading} />
                            {mode !== 'review' && <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" disabled={busy || sending || challengeLoading || cooldown > 0 || !contact || !codeChannelReady} onClick={sendCode}>{cooldown ? t.resendIn.replace('{n}', String(cooldown)) : t.sendCode}</Button>}
                        </div>
                    </div>
                    {!phoneSite && mode === 'register' && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="auth-circle-invite">{t.circleInviteLabel}</Label>
                            <Input
                                id="auth-circle-invite"
                                value={inviteCode}
                                placeholder={t.circleInvitePlaceholder}
                                onChange={e => setInviteCode(e.target.value)}
                                autoComplete="off"
                                disabled={busy || sending || challengeLoading}
                                className="font-mono"
                            />
                            <p className="text-xs text-neutral-gray-medium">{t.circleInviteHint}</p>
                        </div>
                    )}
                    {mode !== 'review' && <div className="flex flex-col gap-2">
                        <button type="button" className="text-sm text-king-forest underline text-left" disabled={busy || sending || challengeLoading} onClick={loadChallenge}>{challengeLoading ? t.compatLoading : compat ? t.compatRefresh : t.compatUse}</button>
                        {compat && <>
                            <p className="text-xs text-neutral-gray-medium">{t.compatHint}</p>
                            {challenge && <><img src={challenge.image} width={210} height={70} alt={t.compatImage} /><Input aria-label={t.compatAnswer} placeholder={t.compatAnswer} value={challengeAnswer} maxLength={6} autoComplete="off" onChange={e => setChallengeAnswer(e.target.value)} disabled={busy || sending || challengeLoading} /></>}
                        </>}
                        {!compat && captcha && <Captcha config={captcha} handleRef={captchaRef} />}
                    </div>}
                    {mode !== 'review' && !codeChannelReady && <FormNotice variant="error">{t.codeUnavailable}</FormNotice>}
                </>}
                {showPassword && <div className="flex flex-col gap-2">
                    <Label htmlFor="auth-password">{newPassword ? t.newPassword : t.password}</Label>
                    <Input id="auth-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={newPassword ? 8 : undefined} maxLength={72} autoComplete={newPassword ? 'new-password' : 'current-password'} disabled={busy || sending || challengeLoading} />
                    {newPassword && <p className="text-xs text-neutral-gray-medium">{t.passwordRule}</p>}
                </div>}
                {newPassword && <div className="flex flex-col gap-2">
                    <Label htmlFor="auth-confirm-password">{t.confirmPassword}</Label>
                    <Input id="auth-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" disabled={busy || sending || challengeLoading} />
                </div>}
                {mode === 'register' && <p className="text-xs text-neutral-gray-medium">{t.agreePrefix}<Link href={mobileHandoff ? `/mobile-account/${lang}/terms` : `/${lang}/legal/terms`} className="text-king-forest hover:underline">{t.termsLink}</Link>{t.agreeMid}<Link href={mobileHandoff ? `/mobile-account/${lang}/privacy` : `/${lang}/legal/privacy`} className="text-king-forest hover:underline">{t.privacyLink}</Link>{t.agreeSuffix}</p>}
                {notice && <FormNotice variant="success">{notice}</FormNotice>}
                {error && <FormNotice variant="error">{error}</FormNotice>}
                {mode === 'password' && <label className="flex items-center gap-2 text-sm text-neutral-gray-medium"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-king-forest" />{t.rememberMe}</label>}
                <Button type="submit" disabled={busy || sending || challengeLoading || (showCode && mode !== 'review' && !codeChannelReady)}>{busy ? t.submitting : mode === 'password' || mode === 'review' ? t.loginBtn : mode === 'register' ? t.verifyContinue : t.savePassword}</Button>
                <div className="flex flex-wrap justify-between gap-3 text-sm text-king-forest">
                    {mode === 'password' ? <><button type="button" className="font-medium underline underline-offset-4" onClick={() => changeMode('register')} disabled={busy || sending || challengeLoading}>{t.firstTime}</button>{phoneSite && bqtEnabled && <button type="button" onClick={() => changeMode('bqt-scan')} disabled={busy || sending || challengeLoading}>{t.bqtScanTab}</button>}<button type="button" onClick={() => changeMode('reset')} disabled={busy || sending || challengeLoading}>{t.forgotPassword}</button></> : <button type="button" onClick={() => changeMode('password')} disabled={busy || sending || challengeLoading}>{t.backToPassword}</button>}
                </div>
            </form>
            )}
            {mode === 'password' && !legacyEmail && !mobileHandoff && <button type="button" className="mt-5 text-xs text-neutral-gray-medium underline" onClick={() => changeMode('review')} disabled={busy || sending || challengeLoading}>{t.reviewLogin}</button>}
        </div>
    );
}
