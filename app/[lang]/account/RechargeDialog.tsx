'use client';

import { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, Info } from 'lucide-react';
import { siteConfig, formatSiteAmount } from '@/lib/site-config';

/**
 * 钱包充值。两站两种支付形态，同一个订单接口：
 * - 微信（国内站）：站内渲染 Native 二维码，扫码后轮询 /api/payment/query 确认
 * - Stripe（国际站）：整页跳去 Stripe 托管收银台，付完回跳本站
 *
 * **回跳不是已支付凭据。** success_url 是用户可以直接敲进地址栏的地址，
 * 回跳后仍然只认 /api/payment/query 的结论——那条路径背后是通道回查 + 验签。
 */

/** 快捷档位（本币整数单位）。美元档不按汇率折算人民币档，各取本地习惯的心理价位。 */
const PRESET_UNITS: number[] = siteConfig.currency === 'USD' ? [10, 20, 50] : [50, 100, 300];
/** 单笔上限，与服务端 ORDER_MAX_CENTS（1,000,000 个最小单位）保持同一个数。 */
const MAX_UNITS = 10000;
const DEFAULT_UNITS = siteConfig.currency === 'USD' ? '20' : '100';
/** 回跳落地后的确认窗口：webhook 与回跳并行，落地那一刻可能还没入账。 */
const RETURN_CONFIRM_TRIES = 10;
const SCAN_CONFIRM_TRIES = 60;

interface RechargeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dict: any;
    /** 支付确认成功后回调（刷新余额与流水） */
    onPaid: () => void;
}

export function RechargeDialog({ open, onOpenChange, dict, onPaid }: RechargeDialogProps) {
    const t = dict.accountPage;
    const isRedirectChannel = siteConfig.paymentChannel === 'stripe';
    const [units, setUnits] = useState<string>(DEFAULT_UNITS);
    const [loading, setLoading] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [status, setStatus] = useState<
        'idle' | 'pending' | 'redirecting' | 'confirming' | 'success' | 'error'
    >('idle');
    const [errorMsg, setErrorMsg] = useState('');
    /** 出错标题：回跳后「取消」「尚未确认」都不是失败，不能顶着「支付遇到问题」说。 */
    const [errorTitle, setErrorTitle] = useState('');
    /** 成功文案按订单类型定：同一个回跳落点会接到充值单，也会接到购买单。 */
    const [successMsg, setSuccessMsg] = useState('');
    /** 回跳落地待确认的订单；null = 本次进页面不是从收银台回来的。 */
    const [returnOrder, setReturnOrder] = useState<{ orderNo: string; canceled: boolean } | null>(null);
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = () => {
        if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
        }
    };

    const reset = () => {
        stopPolling();
        setStatus('idle');
        setQrCode('');
        setErrorMsg('');
        setErrorTitle('');
        setSuccessMsg('');
        setUnits(DEFAULT_UNITS);
        setLoading(false);
    };

    useEffect(() => {
        if (!open) reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /**
     * 停表**只挂卸载**，绝不挂在 [open] 上。
     *
     * 挂 [open] 会在「回跳落地自动打开对话框」的 false → true 那一跳触发上一轮 cleanup：
     * 回跳 effect 刚 setInterval 起的轮询会被当场 clear 掉，表现为永远停在「确认中」
     * 且一次 /api/payment/query 都不发（2026-08-08 真机付款复现，nginx 日志里 0 次调用）。
     * 关闭对话框时的清理由 reset() 负责，它内部已经 stopPolling。
     */
    useEffect(() => stopPolling, []);

    const pollPaymentStatus = (
        orderNo: string,
        maxTries: number,
        timeout: { title: string; msg: string }
    ) => {
        let count = 0;
        stopPolling();

        /** @returns 是否已确认（true 表示可以停表） */
        const checkOnce = async (): Promise<boolean> => {
            try {
                const res = await fetch(`/api/payment/query?outTradeNo=${encodeURIComponent(orderNo)}`);
                const data = await res.json();
                if (data.order?.status === 'paid') {
                    stopPolling();
                    // 同一个回跳落点会接到充值单，也会接到购买单
                    setSuccessMsg(data.order.kind === 'recharge' ? t.rechargeSuccess : t.payConfirmed);
                    setStatus('success');
                    onPaid();
                    return true;
                }
            } catch {
                // 网络抖动继续轮询
            }
            return false;
        };

        // 先立刻查一次再进轮询：webhook 往往比用户回跳更早到（真机实测早 2 秒），
        // 等满一个 2 秒周期才发第一次请求，等于让一笔已经结算的订单干等着
        void checkOnce().then((done) => {
            if (done) return;
            pollTimer.current = setInterval(async () => {
                count++;
                if (await checkOnce()) return;
                if (count >= maxTries) {
                    stopPolling();
                    setErrorTitle(timeout.title);
                    setErrorMsg(timeout.msg);
                    setStatus('error');
                }
            }, 2000);
        });
    };

    // 回跳落地：URL 上的参数只是「有单待确认」的线索，用完立刻从地址栏抹掉——
    // 留着会在刷新时反复弹窗，也不该被复制分享。
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const orderNo = params.get('order') || params.get('outTradeNo');
        if (!orderNo) return;
        const canceled = params.get('checkout') === 'cancel';
        params.delete('order');
        params.delete('outTradeNo');
        params.delete('checkout');
        const qs = params.toString();
        window.history.replaceState(
            null,
            '',
            window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
        );
        setReturnOrder({ orderNo, canceled });
    }, []);

    useEffect(() => {
        if (!returnOrder) return;
        // 借同一个对话框展示回跳结果，不另开一套 UI
        onOpenChange(true);
        if (returnOrder.canceled) {
            setErrorTitle(t.rechargeCanceledTitle);
            setErrorMsg(t.rechargeCanceled);
            setStatus('error');
            return;
        }
        setStatus('confirming');
        // 超时不当失败：用户可能真付了、只是 webhook 还没到，谎报失败比等一会儿更糟
        pollPaymentStatus(returnOrder.orderNo, RETURN_CONFIRM_TRIES, {
            title: t.rechargePendingTitle,
            msg: t.rechargePendingHint,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [returnOrder]);

    const handleCreateOrder = async () => {
        const unitsNum = Number(units);
        if (!Number.isInteger(unitsNum) || unitsNum <= 0 || unitsNum > MAX_UNITS) {
            setErrorMsg(
                t.rechargeInvalid.replace('{max}', String(MAX_UNITS)).replace('{currency}', siteConfig.currency)
            );
            return;
        }
        setLoading(true);
        setErrorMsg('');
        setErrorTitle('');
        try {
            const res = await fetch('/api/payment/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: unitsNum * 100,
                    kind: 'recharge',
                    description: t.rechargeOrderDesc || t.rechargeTitle,
                    idempotencyKey: crypto.randomUUID(),
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setStatus('error');
                setErrorMsg(data.error || t.rechargeFailed);
                return;
            }
            // 判别联合：没有 present 字段的是老响应，只可能是二维码形态
            const present = data.present ?? (data.redirectUrl ? 'redirect' : 'qrcode');
            if (present === 'redirect') {
                if (!data.redirectUrl) {
                    setStatus('error');
                    setErrorMsg(t.rechargeFailed);
                    return;
                }
                setStatus('redirecting');
                window.location.href = data.redirectUrl;
                return;
            }
            setQrCode(data.qrCode);
            setStatus('pending');
            pollPaymentStatus(data.outTradeNo, SCAN_CONFIRM_TRIES, {
                title: t.rechargeFailed,
                msg: t.rechargeTimeout,
            });
        } catch (error: any) {
            setStatus('error');
            setErrorMsg(error.message || t.rechargeFailed);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        reset();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-center text-xl font-display">
                        {/* 回跳落地时这个对话框是「支付结果」而不是「钱包充值」：
                            同一个落点也会接到购买单，顶着充值标题说话就是答非所问 */}
                        {status === 'success'
                            ? successMsg || t.rechargeSuccess
                            : returnOrder
                              ? t.paymentResultTitle
                              : t.rechargeTitle}
                    </DialogTitle>
                </DialogHeader>

                {status === 'idle' && (
                    <div className="space-y-6 py-4">
                        <p className="text-center text-sm text-neutral-gray-medium">
                            {isRedirectChannel ? t.rechargeHintRedirect : t.rechargeHint}
                        </p>

                        <div className="flex flex-wrap gap-2 justify-center">
                            {PRESET_UNITS.map(preset => (
                                <Button
                                    key={preset}
                                    variant={units === String(preset) ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setUnits(String(preset))}
                                    className={units === String(preset) ? 'bg-king-forest' : ''}
                                >
                                    {formatSiteAmount(preset * 100)}
                                </Button>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="recharge-amount" className="text-neutral-gray-dark">
                                {t.customAmount.replace('{currency}', siteConfig.currency)}
                            </Label>
                            <Input
                                id="recharge-amount"
                                type="number"
                                min="1"
                                max={MAX_UNITS}
                                step="1"
                                value={units}
                                onChange={e => setUnits(e.target.value)}
                                placeholder={t.customPlaceholder.replace('{max}', String(MAX_UNITS))}
                            />
                            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
                        </div>

                        <Button
                            onClick={handleCreateOrder}
                            disabled={loading}
                            className="w-full bg-king-forest hover:bg-king-forest/90"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.creating}
                                </>
                            ) : isRedirectChannel ? (
                                t.rechargeCreateRedirect
                            ) : (
                                t.rechargeCreate
                            )}
                        </Button>
                    </div>
                )}

                {status === 'redirecting' && (
                    <div className="py-12 flex flex-col items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                        <p className="text-sm text-neutral-gray-medium">{t.rechargeRedirecting}</p>
                    </div>
                )}

                {status === 'confirming' && (
                    <div className="py-12 flex flex-col items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                        <p className="text-sm text-neutral-gray-medium">{t.rechargeConfirming}</p>
                    </div>
                )}

                {status === 'pending' && qrCode && (
                    <div className="space-y-6 py-4">
                        <div className="text-center">
                            <p className="text-lg font-medium mb-2">{t.rechargeScan}</p>
                            <p className="text-sm text-neutral-gray-medium">
                                {t.rechargeAmountLabel}: {formatSiteAmount(Number(units) * 100)}
                            </p>
                        </div>
                        <div className="flex justify-center">
                            <div className="p-4 bg-white border-2 border-king-forest/20 rounded-lg">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qrCode} alt={t.rechargeScan} className="w-48 max-w-full h-auto" />
                            </div>
                        </div>
                        <p className="text-center text-sm text-neutral-gray-medium">{t.qrHint}</p>
                        <div className="flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-king-forest" />
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-6 py-8 text-center">
                        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                        <p className="text-sm text-neutral-gray-medium">
                            {successMsg || t.rechargeSuccess}
                        </p>
                        <Button onClick={handleClose} className="bg-king-forest hover:bg-king-forest/90">
                            {t.close}
                        </Button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="space-y-6 py-8 text-center">
                        {/* 取消与「尚未确认」不是失败：红叉会把刚付完钱的人吓一跳 */}
                        {errorTitle ? (
                            <Info className="h-16 w-16 text-neutral-gray-medium mx-auto" strokeWidth={1.5} />
                        ) : (
                            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                        )}
                        <div>
                            <p className="text-lg font-medium">{errorTitle || t.rechargeFailed}</p>
                            <p className="text-sm text-neutral-gray-medium mt-2">{errorMsg}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                            <Button variant="outline" onClick={() => { setStatus('idle'); setErrorMsg(''); }}>
                                {t.retryInput}
                            </Button>
                            <Button onClick={handleClose} className="bg-king-forest hover:bg-king-forest/90">
                                {t.close}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
