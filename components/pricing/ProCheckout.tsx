'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPrice } from '@/lib/price';
import { siteConfig } from '@/lib/site-config';
import { SAAS_PRICE_FEN } from '@/lib/saas-pricing';
import { proCheckoutMode } from '@/lib/pro-purchase-flag';

/**
 * 个人 Pro 下单（定价页 ProCard「直接升级 Pro」）。
 *
 * 月付（monthly-only；年付不可购）→ POST /api/payment/create（kind=subscription, skuId=pro_monthly）→ 微信 Native 二维码
 * → 轮询 /api/payment/query → 跳 /[lang]/pricing/pro/success。与 BuyButton 同一套订单接口与轮询口径。
 *
 * - 仅国内站（微信）开放；国际站 Pro 不开售，按钮维持原来的 /account 链接。
 * - 未登录：建单接口回 401 → 带 next 跳账户页登录。
 * - 幂等键每次开窗换新：Pro 可续购，固定键会复用上一张已付订单、把续购误报为成功；
 *   同一次开窗里的「重试」复用同一个键，不会挂出多张可付订单。
 * - 条款文案只有「以协议为准」。
 * - 购买开关 PRO_PURCHASE_ENABLED 设 false 时：按钮禁用并显示「暂未开放」，不发起建单；
 *   服务端建单口同样拒绝（双保险）。
 */

export interface ProCheckoutLabels {
    choosePlan: string;
    monthly: string;
    yearly?: string;
    perMonth: string;
    perYear?: string;
    continue: string;
    creating: string;
    scan: string;
    qrHint: string;
    amountLabel: string;
    timeout: string;
    failed: string;
    retry: string;
    close: string;
    back: string;
    terms: string;
    comingSoon?: string;
    /** 包晴天律师：Pro 权益随包晴天会员，到包晴天 App 续费 */
    bqtRenewHint?: string;
}

type Plan = 'monthly' | 'yearly';
type Step = 'choose' | 'creating' | 'pending' | 'error';

const PLAN_PRICE: Record<Plan, number> = {
    monthly: SAAS_PRICE_FEN.proMonthly,
    yearly: SAAS_PRICE_FEN.proYearly,
};

export function ProCheckout({
    lang,
    ctaLabel,
    labels,
    purchaseEnabled = false,
    bqtMember = false,
}: {
    lang: string;
    ctaLabel: string;
    labels: ProCheckoutLabels;
    /** 服务端读 PRO_PURCHASE_ENABLED 后传入（ProCard 总会显式传）；缺省 false 以防漏传时误建单 */
    purchaseEnabled?: boolean;
    /** 包晴天律师（积分通道开着）：本站不卖 Pro，改为提示去包晴天 App 续费会员 */
    bqtMember?: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState<Plan>('monthly');
    const [step, setStep] = useState<Step>('choose');
    const [qrCode, setQrCode] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const nonce = useRef('');
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = () => {
        if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
        }
    };
    useEffect(() => stopPolling, []);

    const mode = proCheckoutMode(siteConfig.paymentChannel, purchaseEnabled);

    if (bqtMember) {
        return <p className="text-sm leading-relaxed text-neutral-gray-medium" data-pro-purchase="bqt">{labels.bqtRenewHint}</p>;
    }

    if (mode === 'account-link') {
        return (
            <Link href={`/${lang}/account`} className="w-full" data-analytics="pricing_pro_upgrade">
                <Button variant="outline" className="w-full">
                    {ctaLabel}
                </Button>
            </Link>
        );
    }

    if (mode === 'coming-soon') {
        return (
            <Button
                variant="outline"
                className="w-full"
                disabled
                aria-disabled="true"
                data-pro-purchase="disabled"
            >
                {labels.comingSoon ?? 'Coming soon'}
            </Button>
        );
    }

    const successUrl = (orderNo: string) =>
        `/${lang}/pricing/pro/success?order=${encodeURIComponent(orderNo)}`;

    const poll = (orderNo: string) => {
        let count = 0;
        stopPolling();
        pollTimer.current = setInterval(async () => {
            count++;
            try {
                const res = await fetch(`/api/payment/query?outTradeNo=${encodeURIComponent(orderNo)}`);
                const data = await res.json();
                if (data.order?.status === 'paid') {
                    stopPolling();
                    router.push(successUrl(orderNo));
                    return;
                }
            } catch {
                // 网络抖动继续轮询
            }
            if (count >= 90) {
                stopPolling();
                setStep('error');
                setErrorMsg(labels.timeout);
            }
        }, 2000);
    };

    const createOrder = async () => {
        setStep('creating');
        setErrorMsg('');
        setQrCode('');
        // monthly-only：年付不可购（服务端同样拒 pro_yearly），只建 pro_monthly
        const skuId = 'pro_monthly';
        const amount = PLAN_PRICE.monthly;
        try {
            const res = await fetch('/api/payment/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount,
                    kind: 'subscription',
                    skuId,
                    idempotencyKey: `${skuId}:${amount}:${nonce.current}`,
                }),
            });
            if (res.status === 401) {
                window.location.href = `/${lang}/account?next=${encodeURIComponent(`/${lang}/pricing`)}`;
                return;
            }
            const data = await res.json();
            if (!data.success) {
                setStep('error');
                setErrorMsg(data.error || labels.failed);
                return;
            }
            if (data.status === 'paid') {
                router.push(successUrl(data.outTradeNo));
                return;
            }
            if (!data.qrCode) {
                setStep('error');
                setErrorMsg(labels.failed);
                return;
            }
            setQrCode(data.qrCode);
            setStep('pending');
            poll(data.outTradeNo);
        } catch {
            setStep('error');
            setErrorMsg(labels.failed);
        }
    };

    const handleOpen = () => {
        nonce.current = crypto.randomUUID();
        setStep('choose');
        setOpen(true);
    };
    const handleClose = () => {
        stopPolling();
        setOpen(false);
    };

    const planButton = (p: Plan, name: string, unit: string) => (
        <button
            type="button"
            onClick={() => setPlan(p)}
            aria-pressed={plan === p}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                plan === p ? 'border-king-forest bg-king-mint-lightest' : 'border-neutral-200 hover:border-king-forest/50'
            }`}
        >
            <span className="font-medium">{name}</span>
            <span className="text-neutral-dark-bg">
                {formatPrice(PLAN_PRICE[p])} <span className="text-sm text-neutral-gray-medium">{unit}</span>
            </span>
        </button>
    );

    return (
        <>
            <Button className="w-full bg-king-forest hover:bg-king-forest/90" onClick={handleOpen} data-analytics="pricing_pro_upgrade">
                {ctaLabel}
            </Button>

            <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl font-display">
                            {step === 'pending' ? labels.scan : labels.choosePlan}
                        </DialogTitle>
                    </DialogHeader>

                    {step === 'choose' && (
                        <div className="space-y-4 py-2">
                            {planButton('monthly', labels.monthly, labels.perMonth)}
                            <Button className="w-full bg-king-forest hover:bg-king-forest/90" onClick={createOrder}>
                                {labels.continue} {formatPrice(PLAN_PRICE.monthly)}
                            </Button>
                            <p className="text-center text-xs text-neutral-gray-medium" data-legal-pending="zewei-counsel">
                                {labels.terms}
                            </p>
                        </div>
                    )}

                    {step === 'creating' && (
                        <div className="flex flex-col items-center gap-3 py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                            <p className="text-sm text-neutral-gray-medium">{labels.creating}</p>
                        </div>
                    )}

                    {step === 'pending' && qrCode && (
                        <div className="space-y-6 py-4">
                            <p className="text-center text-sm text-neutral-gray-medium">
                                {labels.monthly} · {labels.amountLabel} {formatPrice(PLAN_PRICE.monthly)}
                            </p>
                            <div className="flex justify-center">
                                <div className="rounded-lg border-2 border-king-forest/20 bg-white p-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={qrCode} alt={labels.scan} className="h-48 w-48" />
                                </div>
                            </div>
                            <p className="text-center text-sm text-neutral-gray-medium">{labels.qrHint}</p>
                            <div className="flex justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                            </div>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="space-y-6 py-8 text-center">
                            <XCircle className="mx-auto h-16 w-16 text-red-500" />
                            <div>
                                <p className="text-lg font-medium">{labels.failed}</p>
                                <p className="mt-2 text-sm text-neutral-gray-medium">{errorMsg}</p>
                            </div>
                            <div className="flex justify-center gap-2">
                                <Button variant="outline" onClick={() => setStep('choose')}>
                                    {labels.back}
                                </Button>
                                <Button className="bg-king-forest hover:bg-king-forest/90" onClick={createOrder}>
                                    {labels.retry}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
