'use client';

import { useEffect } from 'react';
import { PRICING_CLICK_EVENTS, TELEMETRY_EVENTS_ENDPOINT, WEB_INSTALL_ID } from '@/lib/pricing-analytics';

const ALLOWED = new Set<string>(PRICING_CLICK_EVENTS);

/**
 * 定价页点击上报（此前 data-analytics 只是属性，没有任何代码读它）。
 *
 * 文档级捕获阶段监听：点在 [data-analytics] 元素（或其子元素）上就发一条 sendBeacon，
 * 不阻塞跳转（mailto / 站内链接 / 打开下单弹窗都照常走）。
 *
 * 隐私口径与遥测承诺一致：固定 installId、无 Cookie、无 localStorage、无账户、不带 UA /
 * 来源页 / 停留时长；attrs 只有当前语言。sendBeacon 不可用或失败一律静默。
 */
export function PricingClickTracker({ lang }: { lang: string }) {
    useEffect(() => {
        const onClick = (ev: MouseEvent) => {
            const target = ev.target as Element | null;
            const el = target?.closest?.('[data-analytics]');
            const name = el?.getAttribute('data-analytics');
            if (!name || !ALLOWED.has(name)) return;
            try {
                const body = JSON.stringify({
                    installId: WEB_INSTALL_ID,
                    appVersion: 'web',
                    events: [{ ts: new Date().toISOString(), eventName: name, attrs: { lang } }],
                });
                navigator.sendBeacon?.(TELEMETRY_EVENTS_ENDPOINT, new Blob([body], { type: 'application/json' }));
            } catch {
                // 埋点永远不能影响点击本身
            }
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [lang]);
    return null;
}
