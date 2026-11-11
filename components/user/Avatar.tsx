'use client';

import { useState } from 'react';

/**
 * 用户头像。全站唯一出口——account 概览头部与公开主页共用同一套降级规则。
 *
 * 有 `avatarUpdatedAt` 就渲染图片，否则渲染昵称首字渲染的方块。
 * 图片加载失败（文件被删、磁盘故障）也落回方块：DESIGN.md 要求图片缺失时
 * 只留中性底，绝不露占位文字或裂图。
 */

export interface AvatarProps {
    userId: string;
    displayName: string;
    avatarUpdatedAt?: string;
    /** 边长（px）。字号按边长派生，不另外传。 */
    size: number;
    /**
     * 配色。light = account 白卡；dark = 公开主页深色 hero；
     * brand / brandInvert = 导航栏与作者署名那种实心小圆片（后者用于深色导航栏）。
     */
    variant?: 'light' | 'dark' | 'brand' | 'brandInvert';
    /** 大头像用圆角方块，行内小署名沿用原来的圆形 */
    shape?: 'rounded' | 'circle';
    className?: string;
}

const SURFACE = {
    light: 'border bg-king-forest-lightest/60 border-king-forest/15 text-king-forest',
    dark: 'border bg-white/[0.08] border-white/15 backdrop-blur-md text-king-mint',
    brand: 'bg-king-forest text-white',
    brandInvert: 'bg-white text-king-forest-darker',
} as const;

export function Avatar({
    userId,
    displayName,
    avatarUpdatedAt,
    size,
    variant = 'light',
    shape = 'rounded',
    className = '',
}: AvatarProps) {
    const [failed, setFailed] = useState(false);
    const showImage = !!avatarUpdatedAt && !failed;

    return (
        <div
            className={`overflow-hidden flex-shrink-0 ${
                shape === 'circle' ? 'rounded-full' : 'rounded-xl'
            } ${SURFACE[variant]} ${className}`}
            style={{ width: size, height: size }}
        >
            {showImage ? (
                // 服务端已把所有输入统一成 256px 见方的 webp，不需要再过 next/image
                // 二次优化——那只会为每个请求平白多跑一遍 sharp。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`/api/avatar/${userId}?v=${encodeURIComponent(avatarUpdatedAt)}`}
                    alt={displayName}
                    width={size}
                    height={size}
                    className="w-full h-full object-cover"
                    onError={() => setFailed(true)}
                />
            ) : (
                <div
                    className="w-full h-full flex items-center justify-center font-display font-bold uppercase select-none"
                    style={{ fontSize: Math.round(size * 0.44) }}
                    aria-hidden
                >
                    {displayName.charAt(0)}
                </div>
            )}
        </div>
    );
}
