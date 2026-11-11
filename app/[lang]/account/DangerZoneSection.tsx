'use client';

import { useState } from 'react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { siteConfig } from '@/lib/site-config';
import { CheckCircle2, Loader2, Mail, TriangleAlert } from 'lucide-react';

/**
 * 自助注销账户。后端契约见 app/api/auth/delete/route.ts。
 *
 * ## 二次确认为什么不用 window.confirm
 *
 * 同页 DesktopConnectSection 吊销 Key 用的是 window.confirm——那是可逆操作，
 * 点错了再生成一把就是了。注销不可逆：一个系统弹窗、一次回车就能把账户连同
 * 已购权益一起抹掉，太便宜了。这里要求逐字输入自己的用户名，把「确认」
 * 从一次点击变成一次抄写。
 *
 * ## 服务端 message 的语种
 *
 * 409/503 的 message 由服务端按**站点默认语言**生成（lib/account-deletion.ts 的 L()），
 * 它带着具体金额与笔数，值得原样呈现；但国内站的 /en 页面会因此看到中文。
 * 所以标题与「写信给谁」这两句必须走本页词典——真正可执行的那部分，
 * 任何语种下都读得懂。
 */
export function DangerZoneSection({ lang, dict }: { lang: Locale; dict: any }) {
    const t = dict.accountPage;
    const email = siteConfig.legalEntity.contactEmail;

    const [open, setOpen] = useState(false);
    const [username, setUsername] = useState('');
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    /** 需人工介入的那一类失败（409/503），文案由服务端出 */
    const [blocked, setBlocked] = useState('');
    const [error, setError] = useState('');
    /** 非 null 即已注销完成，值是服务端给的处理结果说明 */
    const [notes, setNotes] = useState<string[] | null>(null);

    const facts: string[] = Array.isArray(t.dangerFacts) ? t.dangerFacts : [];

    const leave = () => window.location.assign(`/${lang}`);

    const openDialog = async () => {
        setTyped('');
        setBlocked('');
        setError('');
        setNotes(null);
        setOpen(true);
        // 把用户名摆在弹窗里，让「逐字输入」是一次抄写而不是一次记忆测验。
        // 取不到就退化为纯输入，服务端仍会逐字校验。
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            setUsername(data.user?.username ?? '');
        } catch {
            setUsername('');
        }
    };

    /** 完成态下无论从哪个出口关闭都要整页离开：会话 cookie 已被清，留在原页只会看到一堆失效数据 */
    const handleOpenChange = (next: boolean) => {
        if (!next && notes) {
            leave();
            return;
        }
        if (!busy) setOpen(next);
    };

    const handleDelete = async () => {
        setBusy(true);
        setBlocked('');
        setError('');
        try {
            const res = await fetch('/api/auth/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmUsername: typed.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setNotes(Array.isArray(data.notes) ? data.notes : []);
                return;
            }
            if (data.message) {
                setBlocked(data.message);
                return;
            }
            setError(
                data.error === 'confirm_mismatch'
                    ? t.dangerMismatch
                    : data.error === 'unauthorized'
                        ? t.dangerUnauthorized
                        : t.dangerFailed
            );
        } catch {
            setError(t.dangerFailed);
        } finally {
            setBusy(false);
        }
    };

    const typedOk = typed.trim().length > 0 && (!username || typed.trim() === username);

    return (
        <div className="mt-12 rounded-xl border border-red-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="flex flex-1 items-start gap-3">
                    <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" strokeWidth={1.75} />
                    <div className="min-w-0">
                        <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.dangerTitle}</h2>
                        <p className="mt-1.5 text-sm leading-relaxed text-neutral-gray-medium">{t.dangerDesc}</p>
                    </div>
                </div>
                <Button variant="destructive" onClick={openDialog} className="flex-shrink-0 font-bold">
                    {t.dangerButton}
                </Button>
            </div>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="mx-4 max-h-[85vh] overflow-y-auto">
                    {notes ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-display flex items-center gap-2 text-neutral-dark-bg">
                                    <CheckCircle2 className="h-5 w-5 text-king-forest" strokeWidth={1.75} />
                                    {t.dangerDoneTitle}
                                </DialogTitle>
                            </DialogHeader>
                            <p className="mt-4 text-sm text-neutral-gray-medium">{t.dangerDoneLead}</p>
                            <ul className="mt-3 space-y-2">
                                {notes.map((note, i) => (
                                    <li
                                        key={i}
                                        className="border-l-2 border-neutral-gray-light pl-3 text-[13px] leading-relaxed text-neutral-gray-dark"
                                    >
                                        {note}
                                    </li>
                                ))}
                            </ul>
                            <DialogFooter className="mt-6">
                                <Button onClick={leave} className="font-bold">
                                    {t.dangerDoneBtn}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-display flex items-center gap-2 text-neutral-dark-bg">
                                    <TriangleAlert className="h-5 w-5 text-red-600" strokeWidth={1.75} />
                                    {t.dangerDialogTitle}
                                </DialogTitle>
                            </DialogHeader>

                            <p className="mt-4 text-sm text-neutral-gray-dark">{t.dangerLead}</p>
                            <ul className="mt-3 space-y-2">
                                {facts.map((fact, i) => (
                                    <li
                                        key={i}
                                        className="border-l-2 border-red-200 pl-3 text-[13px] leading-relaxed text-neutral-gray-medium"
                                    >
                                        {fact}
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-6">
                                <p className="text-sm text-neutral-gray-dark">{t.dangerConfirmHint}</p>
                                {username && (
                                    <p className="mt-1.5 font-mono text-sm font-bold text-neutral-dark-bg select-all">
                                        {username}
                                    </p>
                                )}
                                <Input
                                    value={typed}
                                    onChange={e => setTyped(e.target.value)}
                                    placeholder={t.dangerConfirmPlaceholder}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="mt-2 font-mono"
                                />
                            </div>

                            {blocked && (
                                <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
                                    <p className="text-sm font-bold text-neutral-dark-bg">{t.dangerBlockedTitle}</p>
                                    <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-gray-dark">
                                        {blocked}
                                    </p>
                                    <a
                                        href={`mailto:${email}`}
                                        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-king-forest hover:underline"
                                    >
                                        <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                                        {(t.dangerBlockedAction ?? '').replaceAll('{email}', email)}
                                    </a>
                                </div>
                            )}

                            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                            <DialogFooter className="mt-6 gap-2">
                                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                                    {t.dangerCancel}
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={busy || !typedOk}
                                    className="gap-2 font-bold"
                                >
                                    {busy && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
                                    {busy ? t.dangerDeleting : t.dangerConfirmBtn}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
