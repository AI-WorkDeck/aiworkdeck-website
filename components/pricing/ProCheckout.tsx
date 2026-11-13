'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPrice } from '@/lib/price';
import { siteConfig } from '@/lib/site-config';
import { PRO_INTRO_MONTHS, SAAS_PRICE_FEN, SAAS_PRICING, SUBSCRIPTION_LIMITS } from '@/lib/saas-pricing';
import { proCheckoutMode } from '@/lib/pro-purchase-flag';

/**
 * 个人 Pro 一键扫码下单（定价页 ProCard 与账户页 SubscriptionSection 共用）。
 *
 * - 国内站（wxpay + PRO_PURCHASE_ENABLED）：点击后直接建单出微信 Native 二维码（一步直达）。
 * - 默认优先请求 pro_monthly_intro（¥9.9 / 首 3 月限次）；若服务端返回 409 intro_quota_exhausted，自动回落为 pro_monthly（¥149）。
 * - 未登录（401）跳转 /[lang]/account?next=<currentPath>?checkout=pro，注册/登录后自动回跳并弹出扫码窗。
 * - PRO_PURCHASE_ENABLED=false 时按钮禁用并显示 comingSoon，不触发任何建单请求。
 */

export interface ProIntroOfferState {
    eligible: boolean;
    priceCents: number;
    standardPriceCents: number;
    totalMonths: number;
    usedMonths: number;
    remainingMonths: number;
}

export interface ProCheckoutLabels {
    choosePlan: string;
    monthly: string;
    perMonth: string;
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
    introSummary?: string;
    valueSummary?: string;
    /** 包晴天律师：Pro 权益随包晴天会员，到包晴天 App 续费 */
    bqtRenewHint?: string;
}

type Step = 'creating' | 'pending' | 'error';
type ProSkuId = 'pro_monthly_intro' | 'pro_monthly';

export const OPEN_PRO_CHECKOUT_EVENT = 'awd:open-pro-checkout';

export function ProCheckout({
    lang,
    ctaLabel,
    labels,
    purchaseEnabled = false,
    bqtMember = false,
    introOffer,
}: {
    lang: string;
    ctaLabel: string;
    labels: ProCheckoutLabels;
    /** 服务端读 PRO_PURCHASE_ENABLED 后传入；缺省 false 以防漏传时误建单 */
    purchaseEnabled?: boolean;
    /** 包晴天律师（积分通道开着）：本站不卖 Pro，改为提示去包晴天 App 续费会员 */
    bqtMember?: boolean;
    /** 当前账号首 3 月 ¥9.9 资格；未传时默认按可选体验价发起，由服务端校验并按需回落正价 */
    introOffer?: ProIntroOfferState;
}) {
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

    return <ProCheckoutModal lang={lang} ctaLabel={ctaLabel} labels={labels} introOffer={introOffer} />;
}

function ProCheckoutModal({
    lang,
    ctaLabel,
    labels,
    introOffer,
}: {
    lang: string;
    ctaLabel: string;
    labels: ProCheckoutLabels;
    introOffer?: ProIntroOfferState;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>('creating');
    const [activeSku, setActiveSku] = useState<ProSkuId>(
        introOffer && !introOffer.eligible ? 'pro_monthly' : 'pro_monthly_intro'
    );
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

    const skuAmount = (sku: ProSkuId) =>
        sku === 'pro_monthly_intro' ? SAAS_PRICE_FEN.proIntroMonthly : SAAS_PRICE_FEN.proMonthly;

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

    const requestOrder = useCallback(async (skuId: ProSkuId) => {
        const amount = skuAmount(skuId);
        setActiveSku(skuId);
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
            const currentPath = typeof window !== 'undefined' ? window.location.pathname : `/${lang}/pricing`;
            window.location.href = `/${lang}/account?next=${encodeURIComponent(`${currentPath}?checkout=pro`)}`;
            return { redirected: true as const, res, data: null };
        }
        const data = await res.json();
        return { redirected: false as const, res, data };
    }, [lang]);

    const createOrder = useCallback(async (initialSku?: ProSkuId) => {
        setStep('creating');
        setErrorMsg('');
        setQrCode('');
        const targetSku: ProSkuId = initialSku ?? (introOffer && !introOffer.eligible ? 'pro_monthly' : 'pro_monthly_intro');
        try {
            let result = await requestOrder(targetSku);
            if (result.redirected) return;
            if (!result.res.ok && targetSku === 'pro_monthly_intro' && result.data?.code === 'intro_quota_exhausted') {
                result = await requestOrder('pro_monthly');
                if (result.redirected) return;
            }
            const data = result.data;
            if (!data?.success) {
                setStep('error');
                setErrorMsg(data?.error || labels.failed);
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
    }, [introOffer, labels.failed, requestOrder, router]);

    const handleOpen = useCallback(() => {
        nonce.current = crypto.randomUUID();
        setOpen(true);
        void createOrder();
    }, [createOrder]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onEvent = () => handleOpen();
        window.addEventListener(OPEN_PRO_CHECKOUT_EVENT, onEvent);
        const url = new URL(window.location.href);
        const auto = url.searchParams.get('checkout') === 'pro' || url.searchParams.get('subscribe') === '1';
        if (auto) {
            url.searchParams.delete('checkout');
            url.searchParams.delete('subscribe');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
            handleOpen();
        }
        return () => window.removeEventListener(OPEN_PRO_CHECKOUT_EVENT, onEvent);
    }, [handleOpen]);

    const handleClose = () => {
        stopPolling();
        setOpen(false);
    };

    const currentAmount = skuAmount(activeSku);
    const isIntroActive = activeSku === 'pro_monthly_intro';
    const valueLine = labels.valueSummary
        ?.replace('{monthlyCredits}', String(SUBSCRIPTION_LIMITS.monthlyCents / 100))
        .replace('{weeklyCredits}', String(SUBSCRIPTION_LIMITS.weeklyCents / 100));
    const introLine = labels.introSummary
        ?.replace('{months}', String(introOffer?.totalMonths ?? PRO_INTRO_MONTHS))
        .replace('{intro}', SAAS_PRICING.proIntroMonthly)
        .replace('{standard}', SAAS_PRICING.proMonthly);

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

                    {valueLine && (
                        <p className="rounded-lg bg-king-mint-lightest/60 px-3 py-2 text-center text-xs leading-relaxed text-king-forest">
                            {valueLine}
                        </p>
                    )}

                    {step === 'creating' && (
                        <div className="flex flex-col items-center gap-3 py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                            <p className="text-sm text-neutral-gray-medium">{labels.creating}</p>
                        </div>
                    )}

                    {step === 'pending' && qrCode && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-1 text-center">
                                <p className="text-sm font-medium text-neutral-dark-bg">
                                    {labels.monthly} · {labels.amountLabel}{' '}
                                    <span className="text-lg font-bold text-king-forest">{formatPrice(currentAmount)}</span>
                                    {isIntroActive && (
                                        <span className="ms-2 text-xs text-neutral-gray-medium line-through">
                                            {formatPrice(SAAS_PRICE_FEN.proMonthly)}
                                        </span>
                                    )}
                                </p>
                                {isIntroActive && introLine && (
                                    <p className="text-xs text-king-forest">{introLine}</p>
                                )}
                            </div>
                            <div className="flex justify-center">
                                <div className="rounded-lg border-2 border-king-forest/20 bg-white p-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={qrCode} alt={labels.scan} className="h-48 w-48" />
                                </div>
                            </div>
                            <p className="text-center text-sm text-neutral-gray-medium">{labels.qrHint}</p>
                            <p className="text-center text-xs text-neutral-gray-medium" data-legal-pending="zewei-counsel">
                                {labels.terms}
                            </p>
                            <div className="flex justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-king-forest" />
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
                                <Button variant="outline" onClick={handleClose}>
                                    {labels.close}
                                </Button>
                                <Button className="bg-king-forest hover:bg-king-forest/90" onClick={() => void createOrder(activeSku)}>
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
