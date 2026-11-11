'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Product Hunt「Find us on Product Hunt」徽章（dev-board#370）。
 *
 * 2026-09-02（PST）在 PH 发布，官方 Launch Embeds 的 featured 徽章会实时显示票数，
 * 是 PH 认可的「drive support」方式。post_id 是本次发布的固定编号，不随站点变化。
 *
 * 徽章图走本站 `/api/ph-badge` 代理（境内直连 api.producthunt.com 不通，见该 route 注释），
 * 代理有静态兜底，正常情况下不会挂。仍保留「图挂了整个锚点收起」作最后一道兜底
 * （仓内惯例——图片缺失 display:none 收场，绝不露占位）。
 * 注意 SSR 出来的 img 常常在 React 水合**之前**就已经失败，onError 根本轮不到触发
 * （本地沙箱浏览器实测：complete=true、naturalWidth=0、锚点照样显示），
 * 所以挂载后要再补查一次 `complete && naturalWidth === 0`。
 */
const SLUG = 'ai-workdeck';

export type ProductHuntBadgeTheme = 'light' | 'neutral' | 'dark';

interface ProductHuntBadgeProps {
    theme?: ProductHuntBadgeTheme;
    className?: string;
}

export function ProductHuntBadge({ theme = 'light', className }: ProductHuntBadgeProps) {
    const href = `https://www.producthunt.com/posts/${SLUG}?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-${SLUG}`;
    const src = `/api/ph-badge?theme=${theme}`;
    const linkRef = useRef<HTMLAnchorElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const hide = () => {
        if (linkRef.current) linkRef.current.style.display = 'none';
    };

    useEffect(() => {
        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth === 0) hide();
    }, []);

    return (
        <a
            ref={linkRef}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('inline-block transition-opacity duration-200 hover:opacity-85', className)}
        >
            <img
                ref={imgRef}
                src={src}
                alt="AI WorkDeck - Your whole case in one window, an IDE for document work | Product Hunt"
                width={250}
                height={54}
                style={{ width: 250, height: 54 }}
                onError={hide}
            />
        </a>
    );
}
