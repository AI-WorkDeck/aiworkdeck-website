'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, BadgeCheck } from 'lucide-react';
import { formatPrice } from '@/lib/price';
import { siteConfig } from '@/lib/site-config';

/**
 * 付费条目购买入口（PR-W3）。与充值对话框同一套订单接口（kind=purchase + skuId），
 * 不动钱包余额，只是支付形态按站点分叉：
 * - 微信（国内站）：站内二维码 + 轮询 /api/payment/query 确认
 * - Stripe（国际站）：整页跳去托管收银台，回跳落地后由账户页继续轮询同一个接口确认
 */

export interface PurchaseLabels {
    buy: string;
    owned: string;
    loginToBuy: string;
    title: string;
    /** 跳转收银台形态的对话框标题（国际站） */
    titleRedirect: string;
    /** 正在跳往收银台 */
    redirecting: string;
    scan: string;
    qrHint: string;
    success: string;
    successHint: string;
    close: string;
    timeout: string;
    failed: string;
    retry: string;
    creating: string;
    amountLabel: string;
}

interface BuyButtonProps {
    lang: string;
    labels: PurchaseLabels;
    skuId: string;
    priceCents: number;
    itemName: string;
    owned: boolean;
    loggedIn: boolean;
    /** 紧凑模式：列表卡片里用小号按钮 */
    compact?: boolean;
}

export function BuyButton({
    lang,
    labels,
    skuId,
    priceCents,
    itemName,
    owned,
    loggedIn,
    compact,
}: BuyButtonProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<'creating' | 'pending' | 'redirecting' | 'success' | 'error'>(
        'creating'
    );
    const [qrCode, setQrCode] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRedirectChannel = siteConfig.paymentChannel === 'stripe';

    const stopPolling = () => {
        if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
        }
    };

    useEffect(() => stopPolling, []);

    if (owned) {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full bg-king-mint-lightest text-king-forest font-medium ${
                    compact ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
                }`}
            >
                <BadgeCheck className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2} />
                {labels.owned}
            </span>
        );
    }

    if (!loggedIn) {
        return (
            <Link href={`/${lang}/account?next=${encodeURIComponent(pathname || `/${lang}`)}`}>
                <Button size={compact ? 'sm' : 'default'} variant="outline" className="border-king-forest text-king-forest font-bold">
                    {labels.loginToBuy}
                </Button>
            </Link>
        );
    }

    const pollPaymentStatus = (orderNo: string) => {
        let count = 0;
        stopPolling();
        pollTimer.current = setInterval(async () => {
            count++;
            try {
                const res = await fetch(`/api/payment/query?outTradeNo=${orderNo}`);
                const data = await res.json();
                if (data.order?.status === 'paid') {
                    stopPolling();
                    setStatus('success');
                    return;
                }
            } catch {
                // 网络抖动继续轮询
            }
            if (count >= 60) {
                stopPolling();
                setStatus('error');
                setErrorMsg(labels.timeout);
            }
        }, 2000);
    };

    const createOrder = async () => {
        setStatus('creating');
        setErrorMsg('');
        setQrCode('');
        try {
            const res = await fetch('/api/payment/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: priceCents,
                    kind: 'purchase',
                    skuId,
                    // 同一用户同一 SKU 同一标价 → 固定幂等键：反复开窗复用同一 pending 订单，
                    // 避免同 SKU 挂多个可支付订单导致重复扣款（改价后键变化，自然换新单）
                    idempotencyKey: `purchase:${skuId}:${priceCents}`,
                }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.status === 'paid') {
                    setStatus('success');
                    return;
                }
                // 判别联合：没有 present 字段的是老响应，只可能是二维码形态
                const present = data.present ?? (data.redirectUrl ? 'redirect' : 'qrcode');
                if (present === 'redirect') {
                    if (!data.redirectUrl) {
                        setStatus('error');
                        setErrorMsg(labels.failed);
                        return;
                    }
                    setStatus('redirecting');
                    // 收银台在站外，回跳后由账户页凭 URL 上的订单号继续轮询确认
                    window.location.href = data.redirectUrl;
                    return;
                }
                setQrCode(data.qrCode);
                setStatus('pending');
                pollPaymentStatus(data.outTradeNo);
            } else {
                setStatus('error');
                setErrorMsg(data.error || labels.failed);
            }
        } catch {
            setStatus('error');
            setErrorMsg(labels.failed);
        }
    };

    const handleOpen = () => {
        setOpen(true);
        createOrder();
    };

    const handleClose = () => {
        stopPolling();
        setOpen(false);
        if (status === 'success') {
            // 已购状态由服务端渲染，刷新后按钮变为「已拥有」
            router.refresh();
        }
    };

    return (
        <>
            <Button
                size={compact ? 'sm' : 'default'}
                onClick={handleOpen}
                className="bg-king-forest hover:bg-king-forest/90 font-bold"
            >
                {labels.buy} {formatPrice(priceCents)}
            </Button>

            <Dialog open={open} onOpenChange={v => (v ? setOpen(true) : handleClose())}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl font-display">
                            {status === 'success'
                                ? labels.success
                                : isRedirectChannel
                                  ? labels.titleRedirect
                                  : labels.title}
                        </DialogTitle>
                    </DialogHeader>

                    {status === 'creating' && (
                        <div className="py-10 flex flex-col items-center gap-3">
                            <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                            <p className="text-sm text-neutral-gray-medium">{labels.creating}</p>
                        </div>
                    )}

                    {status === 'redirecting' && (
                        <div className="py-10 flex flex-col items-center gap-3">
                            <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                            <p className="text-sm text-neutral-gray-medium">{labels.redirecting}</p>
                        </div>
                    )}

                    {status === 'pending' && qrCode && (
                        <div className="space-y-6 py-4">
                            <div className="text-center">
                                <p className="text-lg font-medium mb-2">{labels.scan}</p>
                                <p className="text-sm text-neutral-gray-medium">
                                    {itemName} · {labels.amountLabel} {formatPrice(priceCents)}
                                </p>
                            </div>
                            <div className="flex justify-center">
                                <div className="p-4 bg-white border-2 border-king-forest/20 rounded-lg">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={qrCode} alt={labels.scan} className="w-48 h-48" />
                                </div>
                            </div>
                            <p className="text-center text-sm text-neutral-gray-medium">{labels.qrHint}</p>
                            <div className="flex justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                            </div>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="space-y-6 py-8 text-center">
                            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                            <p className="text-sm text-neutral-gray-medium">{labels.successHint}</p>
                            <Button onClick={handleClose} className="bg-king-forest hover:bg-king-forest/90">
                                {labels.close}
                            </Button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="space-y-6 py-8 text-center">
                            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                            <div>
                                <p className="text-lg font-medium">{labels.failed}</p>
                                <p className="text-sm text-neutral-gray-medium mt-2">{errorMsg}</p>
                            </div>
                            <div className="flex gap-2 justify-center">
                                <Button variant="outline" onClick={createOrder}>
                                    {labels.retry}
                                </Button>
                                <Button onClick={handleClose} className="bg-king-forest hover:bg-king-forest/90">
                                    {labels.close}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
