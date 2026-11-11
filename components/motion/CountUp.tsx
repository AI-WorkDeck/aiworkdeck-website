'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

/** 进入视口时数字滚动到目标值；reduced-motion 直接显示终值。 */
export function CountUp({ value, className }: { value: number; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const counter = { n: 0 };
        let played = false;
        let guarantee: ReturnType<typeof setTimeout> | undefined;
        const play = () => {
            if (played) return;
            played = true;
            animate(counter, {
                n: value,
                duration: 1100,
                ease: 'outExpo',
                onUpdate: () => {
                    el.textContent = String(Math.round(counter.n));
                },
            });
            // 终态保险：rAF 被节流时也要显示终值
            guarantee = setTimeout(() => {
                el.textContent = String(value);
            }, 1800);
        };

        // 已在视口内直接播放；否则 observer + 兜底（个别内嵌 WebView 不派发 IO 回调）
        if (el.getBoundingClientRect().top < window.innerHeight) {
            play();
            return () => {
                if (guarantee) clearTimeout(guarantee);
            };
        }
        const observer = new IntersectionObserver(
            entries => {
                if (!entries[0].isIntersecting) return;
                observer.disconnect();
                play();
            },
            { threshold: 0.4 }
        );
        observer.observe(el);
        const failsafe = setTimeout(() => {
            played = true;
            el.textContent = String(value);
        }, 2500);
        return () => {
            observer.disconnect();
            clearTimeout(failsafe);
            if (guarantee) clearTimeout(guarantee);
        };
    }, [value]);

    return (
        <span ref={ref} className={className}>
            {value}
        </span>
    );
}
