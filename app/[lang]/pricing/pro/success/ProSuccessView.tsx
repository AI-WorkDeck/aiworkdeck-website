'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Pro 支付成功落地页的客户端部分。只凭 URL 上的订单号回查 /api/payment/query（属主校验在接口里），
 * 查到 paid 才显示成功——不能因为跳到了这个地址就宣布成功。
 * 成功文案：有服务端 expiresAt 时插值 {date}；paid 后若暂无到期日再轮询约 5s，仍无则用 successBodyPending（禁止「—」占位）。
 */
export function ProSuccessView({
    lang,
    orderNo,
    labels,
}: {
    lang: string;
    orderNo: string | null;
    labels: {
        successTitle: string;
        successBody: string;
        successBodyPending: string;
        successAccount: string;
        successDownload: string;
        successPending: string;
        successUnknown: string;
        terms: string;
    };
}) {
    const [state, setState] = useState<'pending' | 'paid' | 'unknown'>(orderNo ? 'pending' : 'unknown');
    const [expiresDate, setExpiresDate] = useState<string | null>(null);

    useEffect(() => {
        if (!orderNo) return;
        let tries = 0;
        let stopped = false;
        let paidSinceMs: number | null = null;
        const tick = async () => {
            tries++;
            try {
                const res = await fetch(`/api/payment/query?outTradeNo=${encodeURIComponent(orderNo)}`);
                const data = await res.json();
                if (data.order?.status === 'paid') {
                    const iso = typeof data.order.expiresAt === 'string' ? data.order.expiresAt : null;
                    if (iso) {
                        if (!stopped) {
                            setExpiresDate(iso.slice(0, 10));
                            setState('paid');
                        }
                        return;
                    }
                    // 已付但权益到期日尚未可读：再等最多约 5s，期间保持 pending，禁止用「—」插空日期
                    if (paidSinceMs === null) paidSinceMs = Date.now();
                    if (Date.now() - paidSinceMs >= 5000) {
                        if (!stopped) setState('paid');
                        return;
                    }
                    if (!stopped) setTimeout(tick, 1000);
                    return;
                }
            } catch {
                // 继续重试
            }
            if (tries >= 10 && paidSinceMs === null) {
                if (!stopped) setState('unknown');
                return;
            }
            if (!stopped) setTimeout(tick, paidSinceMs !== null ? 1000 : 2000);
        };
        tick();
        return () => {
            stopped = true;
        };
    }, [orderNo]);

    // 有到期日 → successBody；已付但无到期日 → successBodyPending；禁止「—」
    const successBody = expiresDate
        ? labels.successBody.replace('{date}', expiresDate)
        : labels.successBodyPending;

    return (
        <div className="mx-auto max-w-md space-y-6 py-16 text-center">
            {state === 'pending' && (
                <>
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-king-forest" />
                    <p className="text-neutral-gray-medium">{labels.successPending}</p>
                </>
            )}
            {state === 'paid' && (
                <>
                    <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
                    <h1 className="font-display text-2xl text-neutral-dark-bg">{labels.successTitle}</h1>
                    <p className="text-neutral-gray-medium">{successBody}</p>
                </>
            )}
            {state === 'unknown' && <p className="text-neutral-gray-medium">{labels.successUnknown}</p>}
            <div className="flex justify-center gap-3">
                <Link href={`/${lang}/account`}>
                    <Button className="bg-king-forest hover:bg-king-forest/90">{labels.successAccount}</Button>
                </Link>
                <Link href={`/${lang}/start`}>
                    <Button variant="outline">{labels.successDownload}</Button>
                </Link>
            </div>
            <p className="text-xs text-neutral-gray-medium" data-legal-pending="zewei-counsel">
                {labels.terms}
            </p>
        </div>
    );
}
