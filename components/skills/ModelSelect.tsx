'use client';

import { pickLocale, type Locale } from '@/i18n-config';

export interface AiModelInfo {
  id: string;
  label: string;
  note: { zh: string; en: string };
  deep: boolean;
}

/**
 * AI 模型选择器：真实模型名 + 速度标注（用户拍板不做档位化抽象）。
 * 深浅两种底色场景都要能用：深色卡（Tab A 帮写卡）传 onDark。
 */
export function ModelSelect({
  lang,
  models,
  value,
  onChange,
  disabled,
  onDark,
  ariaLabel,
}: {
  lang: Locale;
  models: AiModelInfo[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  onDark?: boolean;
  ariaLabel: string;
}) {
  if (!models.length) return null;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={
        onDark
          ? 'h-8 rounded-md border border-white/20 bg-white/10 px-2 text-[13px] text-white focus:outline-none focus:ring-2 focus:ring-king-mint disabled:opacity-50 [&>option]:text-neutral-dark-bg'
          : 'h-8 rounded-md border border-neutral-gray-light bg-white px-2 text-[13px] text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint disabled:opacity-50'
      }
    >
      {models.map(m => (
        <option key={m.id} value={m.id}>
          {m.label} · {pickLocale(m.note, lang)}
        </option>
      ))}
    </select>
  );
}
