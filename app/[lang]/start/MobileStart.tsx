'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Laptop, Mail, Smartphone, Sparkles } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { AuthForms } from '../account/AuthForms';
import type { CaptchaConfig } from '@/components/captcha/Captcha';
import { readApiJson } from '@/lib/api-result';
import type { getDictionary } from '@/get-dictionary';

/**
 * /start 的移动端形态（dev-board#304）。
 *
 * 设计裁决：手机装不了桌面软件，移动落点的目标不是「完成安装」而是**抓住扫码
 * 瞬间的意愿**——先 30 秒注册成账号（登录门已建成，账号即留资），再引导回电脑。
 * 小程序与下方表单共用首次验证、创建密码流程，之后回到客户端使用密码登录。
 */
export function MobileStart({ lang, dict, loggedIn, email, desktopUrl, captcha, codeChannelReady, bqtEnabled = false, wxStart, startRef }: {
    lang: Locale;
    dict: Awaited<ReturnType<typeof getDictionary>>;
    loggedIn: boolean;
    /** 已登录账号的邮箱（没有则不渲染邮件发送） */
    email: string | null;
    /** 要在电脑上打开的地址（本站 /start 完整 URL） */
    desktopUrl: string;
    captcha: CaptchaConfig | null;
    codeChannelReady: boolean;
    bqtEnabled?: boolean;
    /** 微信内 + 小程序链路已开通：未登录分支优先展示「打开小程序」（dev-board#305） */
    wxStart: boolean;
    /** 来源标记（u-<username>），透传进小程序或内嵌注册表单，与落地统计同源 */
    startRef: string;
}) {
    const t = dict.startPage.mobile;
    const [copied, setCopied] = useState(false);
    const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
    const [wxState, setWxState] = useState<'idle' | 'opening' | 'failed'>('idle');

    const openWeapp = async () => {
        setWxState('opening');
        try {
            const res = await fetch('/api/start/wx-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ref: startRef }),
            });
            const data = await readApiJson(res);
            if (res.ok && typeof data?.url === 'string') {
                window.location.href = data.url;
                // 跳转由微信接管，按钮停在 opening 态即可；真失败会走 catch/下面的分支
                return;
            }
            setWxState('failed');
        } catch {
            setWxState('failed');
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(desktopUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch { /* 剪贴板被拒绝时用户仍可看着地址手输 */ }
    };

    const sendMail = async () => {
        setMailState('sending');
        try {
            const res = await fetch('/api/start/email-link', { method: 'POST' });
            await readApiJson(res);
            setMailState(res.ok ? 'sent' : 'failed');
        } catch {
            setMailState('failed');
        }
    };

    if (!loggedIn) {
        return (
            <div className="mx-auto max-w-md">
                <div className="mb-6 rounded-xl border border-king-forest/25 bg-king-mint-lightest px-5 py-4">
                    <p className="flex items-start gap-2.5 text-sm leading-relaxed text-king-forest">
                        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                        {t.loggedOutHint}
                    </p>
                </div>
                {wxStart && (
                    <div className="mb-6 rounded-xl border border-king-forest/40 bg-white p-6 shadow-[0_18px_40px_-18px_rgba(46,90,80,0.25)]">
                        <p className="flex items-center gap-2 font-display text-[15px] font-bold text-neutral-dark-bg">
                            <Smartphone className="h-4 w-4 flex-shrink-0 text-king-forest" strokeWidth={1.75} />
                            {t.wxTitle}
                        </p>
                        <p className="mt-2 text-[13px] leading-relaxed text-neutral-gray-medium">{t.wxDesc}</p>
                        <Button
                            variant="default"
                            className="mt-4 w-full gap-2 font-bold"
                            disabled={wxState === 'opening'}
                            onClick={openWeapp}
                        >
                            {wxState === 'opening' ? t.wxOpening : t.wxButton}
                        </Button>
                        {wxState === 'failed' && (
                            <p className="mt-2.5 text-[12.5px] leading-relaxed text-neutral-gray-medium">{t.wxFailed}</p>
                        )}
                        <p className="mt-4 border-t border-neutral-gray-light/80 pt-3 text-center text-[12px] text-neutral-gray-medium">
                            {t.wxOr}
                        </p>
                    </div>
                )}
                <div className="rounded-xl border border-[#dce2de] bg-white p-6">
                    <AuthForms bqtEnabled={bqtEnabled} lang={lang} dict={dict} bare defaultTab="register" next={`/${lang}/start`}
                        captcha={captcha} codeChannelReady={codeChannelReady} startRef={startRef} />
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-md">
            <div className="rounded-xl border border-[#dce2de] bg-white p-6">
                <p className="flex items-center gap-2 font-display text-lg font-bold text-neutral-dark-bg">
                    <Check className="h-5 w-5 text-king-forest" strokeWidth={2} />
                    {t.readyTitle}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-gray-medium">{t.readyDesc}</p>

                <div className="mt-5 rounded-xl border border-neutral-gray-light bg-neutral-gray-pale/70 px-4 py-3.5">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-neutral-gray-dark">
                        <Laptop className="h-4 w-4 text-king-forest" strokeWidth={1.75} />
                        {t.desktopStep}
                    </p>
                    <p className="mt-1.5 break-all font-mono text-[13px] font-bold text-king-forest">{desktopUrl}</p>
                </div>

                <div className="mt-4 flex flex-col gap-2.5">
                    <Button variant="default" className="w-full gap-2 font-bold" onClick={copy}>
                        {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
                        {copied ? t.copied : t.copyLink}
                    </Button>
                    {email && (
                        <Button variant="outline" className="w-full gap-2 border-king-forest font-bold text-king-forest"
                            disabled={mailState === 'sending' || mailState === 'sent'} onClick={sendMail}>
                            <Mail className="h-4 w-4" strokeWidth={1.75} />
                            {mailState === 'sent' ? t.emailSent : mailState === 'sending' ? t.emailSending : mailState === 'failed' ? t.emailFailed : t.emailLink}
                        </Button>
                    )}
                </div>
            </div>

            <p className="mt-5 text-center text-[13px] leading-relaxed text-neutral-gray-medium">
                {t.browseHint}{' '}
                <Link href={`/${lang}/marketplace`} className="font-medium text-king-forest hover:underline">
                    {t.browseCta}
                </Link>
            </p>
        </div>
    );
}
