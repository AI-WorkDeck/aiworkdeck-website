'use client';

import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { pickLocale, type Locale } from '@/i18n-config';
import { TOOL_GROUPS, isKnownTool, toolLabel } from '@/lib/skill-tools';

interface ToolPickerProps {
    lang: Locale;
    /** 已选工具代号（最终提交给后端的原始名） */
    value: string[];
    onChange: (next: string[]) => void;
    /** dict.submitPage.tools 文案（全是字符串模板） */
    t: Record<string, string>;
}

/**
 * 能力勾选器：把 90 多个工具代号收进 9 张「能力」卡片，律师勾能力、系统展开成工具名。
 * 想看到底有哪些工具的人，点开卡片就能看到全清单（中文名 + 代号）。
 */
export function ToolPicker({ lang, value, onChange, t }: ToolPickerProps) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [customInput, setCustomInput] = useState('');

    const selected = new Set(value);
    // 插件带来的、或历史投稿里目录未收录的工具名，不能因为不认识就丢掉
    const custom = value.filter(n => !isKnownTool(n));

    const setSelected = (next: Set<string>) => onChange([...next]);

    const toggleGroup = (key: string) => {
        const group = TOOL_GROUPS.find(g => g.key === key);
        if (!group) return;
        const names = group.tools.map(x => x.name);
        const next = new Set(selected);
        if (names.every(n => next.has(n))) {
            // 取消整组时保留仍被别组需要的工具（分组之间允许重叠）
            const keep = new Set(
                TOOL_GROUPS.filter(g => g.key !== key && g.tools.every(x => selected.has(x.name)))
                    .flatMap(g => g.tools.map(x => x.name))
            );
            names.forEach(n => { if (!keep.has(n)) next.delete(n); });
        } else {
            names.forEach(n => next.add(n));
        }
        setSelected(next);
    };

    const toggleTool = (name: string) => {
        const next = new Set(selected);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setSelected(next);
    };

    const addCustom = () => {
        const name = customInput.trim();
        if (!name || !/^[a-zA-Z0-9_-]{1,60}$/.test(name)) return;
        setSelected(new Set([...selected, name]));
        setCustomInput('');
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 items-start gap-3">
                {TOOL_GROUPS.map(group => {
                    const names = group.tools.map(x => x.name);
                    const hit = names.filter(n => selected.has(n)).length;
                    const all = hit === names.length;
                    const some = hit > 0 && !all;
                    const open = expanded === group.key;
                    return (
                        <div
                            key={group.key}
                            className={`flex flex-col rounded-xl border transition-colors ${
                                hit > 0
                                    ? 'border-king-forest/40 bg-king-mint-lightest/40'
                                    : 'border-neutral-gray-light bg-white'
                            }`}
                        >
                            <label className="flex items-start gap-3 px-4 pt-3.5 pb-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={all}
                                    ref={el => { if (el) el.indeterminate = some; }}
                                    onChange={() => toggleGroup(group.key)}
                                    className="mt-0.5 w-4 h-4 accent-king-forest flex-shrink-0"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-neutral-dark-bg">
                                        {pickLocale(group.label, lang)}
                                        {some && (
                                            <span className="ml-1.5 text-xs font-normal text-king-forest">
                                                {t.partial.replace('{n}', String(hit)).replace('{total}', String(names.length))}
                                            </span>
                                        )}
                                    </span>
                                    <span className="block mt-0.5 text-xs text-neutral-gray-medium leading-relaxed">
                                        {pickLocale(group.hint, lang)}
                                    </span>
                                </span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setExpanded(open ? null : group.key)}
                                className="w-full flex items-center justify-between px-4 pb-3 text-xs text-neutral-gray-medium hover:text-king-forest transition-colors"
                            >
                                {t.viewTools.replace('{n}', String(names.length))}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                            </button>
                            {open && (
                                <ul className="px-4 pb-3.5 flex flex-col gap-1.5 border-t border-neutral-gray-light/70 pt-3">
                                    {group.tools.map(tool => (
                                        <li key={tool.name}>
                                            <label className="flex items-center gap-2.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(tool.name)}
                                                    onChange={() => toggleTool(tool.name)}
                                                    className="w-3.5 h-3.5 accent-king-forest flex-shrink-0"
                                                />
                                                <span className="text-xs text-neutral-gray-dark">{pickLocale(tool, lang)}</span>
                                                <code className="text-[11px] font-mono text-neutral-gray-medium truncate">
                                                    {tool.name}
                                                </code>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 自定义工具：插件带来的工具名不在目录里，仍然可以手填 */}
            <details className="rounded-xl border border-neutral-gray-light bg-white px-4 py-3">
                <summary className="text-xs text-neutral-gray-medium cursor-pointer list-none flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    {t.customTitle}
                </summary>
                <p className="mt-2 text-xs text-neutral-gray-medium leading-relaxed">{t.customHint}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {custom.map(name => (
                        <span
                            key={name}
                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-neutral-gray-pale border border-neutral-gray-light text-xs font-mono text-neutral-gray-dark"
                        >
                            {name}
                            <button
                                type="button"
                                onClick={() => toggleTool(name)}
                                className="text-neutral-gray-medium hover:text-red-600"
                                aria-label={t.remove}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <div className="mt-2.5 flex gap-2">
                    <input
                        value={customInput}
                        onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
                        }}
                        placeholder={t.customPlaceholder}
                        className="flex-1 h-9 rounded-md border border-neutral-gray-light px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-king-mint"
                    />
                    <button
                        type="button"
                        onClick={addCustom}
                        className="px-3 h-9 rounded-md border border-neutral-gray-light text-xs text-neutral-gray-dark hover:border-king-forest/40 hover:text-king-forest transition-colors"
                    >
                        {t.customAdd}
                    </button>
                </div>
            </details>

            <p className="text-xs text-neutral-gray-medium">
                {value.length === 0
                    ? t.emptyWarning
                    : t.summary.replace('{n}', String(value.length))}
            </p>
        </div>
    );
}

export { toolLabel };
