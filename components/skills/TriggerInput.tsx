'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface TriggerInputProps {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    addHint: string;
    max?: number;
}

/**
 * 触发词输入：回车 / 逗号 / 顿号 成词。
 * 原来是「每行一个」的 textarea——律师写成一行逗号分隔就变成一个 40 字的废触发词。
 */
export function TriggerInput({ value, onChange, placeholder, addHint, max = 20 }: TriggerInputProps) {
    const [draft, setDraft] = useState('');

    const commit = (raw: string) => {
        const items = raw
            .split(/[,，、\n]/)
            .map(s => s.trim())
            .filter(s => s && s.length <= 40 && !value.includes(s));
        if (items.length) onChange([...value, ...items].slice(0, max));
        setDraft('');
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="min-h-10 flex flex-wrap items-center gap-2 rounded-md border border-neutral-gray-light bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-king-mint">
                {value.map(item => (
                    <span
                        key={item}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-king-mint-lightest text-sm text-king-forest"
                    >
                        {item}
                        <button
                            type="button"
                            onClick={() => onChange(value.filter(x => x !== item))}
                            className="text-king-forest/60 hover:text-red-600"
                            aria-label={item}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、') {
                            e.preventDefault();
                            commit(draft);
                        } else if (e.key === 'Backspace' && !draft && value.length) {
                            onChange(value.slice(0, -1));
                        }
                    }}
                    onBlur={() => commit(draft)}
                    placeholder={value.length ? '' : placeholder}
                    className="flex-1 min-w-32 h-7 bg-transparent text-sm outline-none placeholder:text-neutral-gray-medium"
                />
            </div>
            <p className="text-xs text-neutral-gray-medium">{addHint}</p>
        </div>
    );
}
