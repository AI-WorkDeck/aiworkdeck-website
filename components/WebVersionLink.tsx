'use client';

import { useEffect, useRef } from 'react';
import { WEB_ENGINE_PREFETCH_URLS, shouldPrefetchWebEngine } from '@/lib/web-engine-prefetch';

let started = false;
function prefetchEngine() {
    if (started) return;
    started = true;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!shouldPrefetchWebEngine(connection)) return;
    for (const href of WEB_ENGINE_PREFETCH_URLS) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
    }
}

/** The /start page's "open the web version" link; it starts fetching the editor engine once the visitor shows interest. */
export function WebVersionLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
    const ref = useRef<HTMLAnchorElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                observer.disconnect();
                const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
                if (idle) idle(prefetchEngine); else setTimeout(prefetchEngine, 1500);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return (
        <a ref={ref} href={href} className={className} onPointerEnter={prefetchEngine} onFocus={prefetchEngine}>
            {children}
        </a>
    );
}
