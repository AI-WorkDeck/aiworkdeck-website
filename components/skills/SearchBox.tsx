'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Locale } from '@/i18n-config';

interface SearchBoxProps {
    lang: Locale;
    defaultValue?: string;
    activeSort: string;
    /** 自动轮播打字的热门触发词 */
    suggestions: string[];
    placeholder: string;
}

/**
 * 广场搜索框：毛玻璃质感 + 占位词自动打字轮播。
 * 用户聚焦或已有输入时暂停轮播，reduced-motion 显示静态占位。
 */
export function SearchBox({ lang, defaultValue, activeSort, suggestions, placeholder }: SearchBoxProps) {
    const [ghost, setGhost] = useState('');
    const [idle, setIdle] = useState(true);
    const hasValue = useRef(!!defaultValue);

    useEffect(() => {
        if (suggestions.length === 0) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let word = 0;
        let char = 0;
        let deleting = false;
        let timer: ReturnType<typeof setTimeout>;

        const tick = () => {
            const current = suggestions[word % suggestions.length];
            if (!deleting) {
                char += 1;
                setGhost(current.slice(0, char));
                if (char >= current.length) {
                    deleting = true;
                    timer = setTimeout(tick, 1600);
                    return;
                }
                timer = setTimeout(tick, 110);
            } else {
                char -= 1;
                setGhost(current.slice(0, char));
                if (char <= 0) {
                    deleting = false;
                    word += 1;
                    timer = setTimeout(tick, 350);
                    return;
                }
                timer = setTimeout(tick, 45);
            }
        };
        timer = setTimeout(tick, 900);
        return () => clearTimeout(timer);
    }, [suggestions]);

    const showGhost = idle && !hasValue.current && ghost;

    return (
        <form action={`/${lang}/marketplace`} method="GET" className="relative max-w-xl">
            {activeSort !== 'newest' && <input type="hidden" name="sort" value={activeSort} />}
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#7d877f] pointer-events-none z-10" strokeWidth={1.75} />
            <input
                type="text"
                name="q"
                defaultValue={defaultValue || ''}
                placeholder={showGhost ? '' : placeholder}
                aria-label={placeholder}
                onFocus={() => setIdle(false)}
                onBlur={e => {
                    hasValue.current = !!e.target.value;
                    setIdle(true);
                }}
                className="w-full h-13 pl-13 pr-5 py-3.5 rounded-lg bg-[#fffdf8] border border-[#e3dccb] text-[#14261f] placeholder:text-[#7d877f] focus:outline-none focus:border-[#1f3b34] focus:bg-white transition-colors duration-300"
            />
            {showGhost && (
                <span className="absolute left-13 top-1/2 -translate-y-1/2 text-[#7d877f] pointer-events-none select-none">
                    {ghost}
                    <span className="animate-caret text-[#1f3b34]">▏</span>
                </span>
            )}
        </form>
    );
}
