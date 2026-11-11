'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';

/**
 * 校徽（dev-board#307）：走本站 /api/school-icon 代理（服务端按名录白名单惰性抓取
 * 学校官网 icon 并缓存——直链各校 favicon 命中率太低）。拉不到/无域名回退学位帽圆徽。
 */
export function SchoolLogo({ domain, size = 22, className = '' }: {
    domain?: string;
    size?: number;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);
    if (!domain || failed) {
        return (
            <span className={`inline-flex items-center justify-center rounded-full border border-current/25 ${className}`}
                style={{ width: size, height: size }}>
                <GraduationCap style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={1.5} />
            </span>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`/api/school-icon/${encodeURIComponent(domain)}`}
            alt=""
            width={size}
            height={size}
            className={`rounded-full bg-white object-contain ${className}`}
            onError={() => setFailed(true)}
        />
    );
}
