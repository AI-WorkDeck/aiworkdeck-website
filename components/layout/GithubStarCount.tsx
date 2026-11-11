'use client';

import { useEffect, useState } from 'react';

/**
 * 导航栏 Star 数。服务端给了值（动态页）就直接用；没给（静态页构建期为 null）则挂载后
 * 向 /api/github-stars 补一次。拿不到或非正数一律不渲染，绝不显示 0。
 */
export function GithubStarCount({ initial, bcp47, className }: { initial: number | null; bcp47: string; className?: string }) {
    const [stars, setStars] = useState<number | null>(initial);

    useEffect(() => {
        if (initial !== null) return;
        let cancelled = false;
        fetch('/api/github-stars')
            .then(res => (res.ok ? res.json() : null))
            .then((data: { stars?: unknown } | null) => {
                if (!cancelled && typeof data?.stars === 'number' && data.stars > 0) setStars(data.stars);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [initial]);

    if (stars === null || stars <= 0) return null;
    return <span className={className}>{stars.toLocaleString(bcp47)}</span>;
}
