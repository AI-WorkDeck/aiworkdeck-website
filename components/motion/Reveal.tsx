'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

interface RevealProps {
    children: React.ReactNode;
    /** 动画延迟（ms），列表错落用 index * 60 */
    delay?: number;
    /** 上浮距离（px） */
    y?: number;
    className?: string;
}

/**
 * 浮现动画（anime.js）。可见性绝不押在 IntersectionObserver 上：
 * - 挂载时已在视口内 → 直接播放；
 * - 视口外 → observer 触发播放，另挂兜底定时器，observer 失灵（个别内嵌
 *   WebView 不派发回调）时静默显示，内容永远不会卡在隐藏态；
 * - prefers-reduced-motion / SSR / 无 JS → 保持可见。
 */
export function Reveal({ children, delay = 0, y = 22, className }: RevealProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let played = false;
        let guarantee: ReturnType<typeof setTimeout> | undefined;
        const settle = () => {
            // 终态保险：rAF 被节流/冻结（后台标签、内嵌 WebView）时也要落到可见终态
            el.style.opacity = '';
            el.style.transform = '';
        };
        const play = (animated: boolean) => {
            if (played) return;
            played = true;
            if (!animated) {
                settle();
                return;
            }
            animate(el, {
                opacity: [0, 1],
                translateY: [y, 0],
                duration: 750,
                delay,
                ease: 'outCubic',
                onComplete: settle,
            });
            guarantee = setTimeout(settle, delay + 1600);
        };

        el.style.opacity = '0';

        // 已在视口内：不等 observer，直接播放
        if (el.getBoundingClientRect().top < window.innerHeight) {
            play(true);
            return () => {
                if (guarantee) clearTimeout(guarantee);
            };
        }

        const observer = new IntersectionObserver(
            entries => {
                if (!entries[0].isIntersecting) return;
                observer.disconnect();
                play(true);
            },
            { threshold: 0.1, rootMargin: '0px 0px -24px 0px' }
        );
        observer.observe(el);
        // 兜底：observer 不工作也要能看到内容
        const failsafe = setTimeout(() => play(false), 2500);
        return () => {
            observer.disconnect();
            clearTimeout(failsafe);
            if (guarantee) clearTimeout(guarantee);
        };
    }, [delay, y]);

    return (
        <div ref={ref} className={className}>
            {children}
        </div>
    );
}
