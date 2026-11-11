import type { ComponentType, ReactNode } from 'react';

/**
 * 后台通用视觉件。
 *
 * 后台与官网共用一套设计语言（见 DESIGN.md）：衬线展示字做标题与数字、
 * 细线分隔替代重边框、森林绿单一强调色、状态用色点而非满屏胶囊。
 * 所有后台页面一律从这里取件，不要在页面里各写各的灰阶与圆角。
 */

/** 眉标：细线 + 全大写小字，全站统一的区块引子 */
export function Eyebrow({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2.5 text-[11px] font-medium tracking-[0.22em] uppercase text-neutral-gray-medium">
            <span className="w-8 h-px bg-king-forest/40" />
            {children}
        </span>
    );
}

/** 区块标题：每个后台分区的开场（眉标 + 衬线标题 + 说明 + 右侧操作） */
export function SectionHeader({
    eyebrow,
    title,
    description,
    actions,
}: {
    eyebrow: string;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <Eyebrow>{eyebrow}</Eyebrow>
                <h2 className="font-display text-2xl font-semibold text-neutral-dark-bg mt-2.5">{title}</h2>
                {description && (
                    <p className="text-sm leading-relaxed text-neutral-gray-medium mt-1.5 max-w-2xl">{description}</p>
                )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

/** 白卡：与广场 SkillCard 同一模板（半透明白 + 毛玻璃 + 细边） */
export function Panel({
    title,
    description,
    actions,
    children,
    padded = true,
    className = '',
}: {
    title?: string;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    /** 表格类内容自己控制内边距，传 false 让内容贴边 */
    padded?: boolean;
    className?: string;
}) {
    return (
        <section
            className={`bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl overflow-hidden ${className}`}
        >
            {(title || actions) && (
                <header className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-neutral-gray-light/70">
                    <div className="min-w-0">
                        {title && <h3 className="font-display text-lg font-semibold text-neutral-dark-bg">{title}</h3>}
                        {description && (
                            <p className="text-sm leading-relaxed text-neutral-gray-medium mt-1 max-w-2xl">
                                {description}
                            </p>
                        )}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </header>
            )}
            <div className={padded ? 'p-6' : ''}>{children}</div>
        </section>
    );
}

/** 概览数字：衬线数字 + 细线眉标，等宽保证多位数不跳动 */
export function MetricTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
    return (
        <div className="bg-white/65 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl px-5 py-5">
            <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-neutral-gray-medium">{label}</p>
            <p className="font-display text-3xl font-bold text-neutral-dark-bg tabular-nums mt-2.5 leading-none">
                {value}
            </p>
            {hint && <p className="text-xs text-neutral-gray-medium mt-2">{hint}</p>}
        </div>
    );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'muted';

const DOT_CLASS: Record<Tone, string> = {
    ok: 'bg-king-mint',
    warn: 'bg-amber-500',
    danger: 'bg-red-500',
    muted: 'bg-neutral-gray-medium/50',
};

/**
 * 状态标：色点承载语义、文字保持中性灰。
 * 刻意不用彩色胶囊——一屏十几个状态时胶囊会把版面搅成调色盘。
 */
export function StatusDot({ tone, children }: { tone: Tone; children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-neutral-gray-dark">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASS[tone]}`} />
            {children}
        </span>
    );
}

/** 配置项开关状态：已配置/未配置这类运维事实，未配置是要能一眼看见的红 */
export function ConfigStatus({
    ok,
    label,
    detail,
    okText = '已配置',
    failText = '未配置',
}: {
    ok: boolean;
    label: string;
    detail?: ReactNode;
    okText?: string;
    failText?: string;
}) {
    return (
        <div className="flex items-start gap-3 py-3">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2 ${ok ? 'bg-king-mint' : 'bg-red-500'}`} />
            <div className="min-w-0">
                <p className="text-sm text-neutral-gray-dark">
                    {label}
                    <span className={`ml-2 font-medium ${ok ? 'text-king-forest' : 'text-red-600'}`}>
                        {ok ? okText : failText}
                    </span>
                </p>
                {detail && <p className="text-xs leading-relaxed text-neutral-gray-medium mt-1">{detail}</p>}
            </div>
        </div>
    );
}

const NOTICE_CLASS = {
    info: 'border-neutral-gray-light bg-neutral-gray-pale/80 text-neutral-gray-dark',
    warn: 'border-amber-200 bg-amber-50/70 text-amber-900',
    danger: 'border-red-200 bg-red-50/70 text-red-700',
} as const;

export function Notice({ tone = 'info', children }: { tone?: keyof typeof NOTICE_CLASS; children: ReactNode }) {
    return (
        <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${NOTICE_CLASS[tone]}`}>{children}</div>
    );
}

/** 空态：虚线细框 + 线性图标，绝不留一句孤零零的灰字 */
export function EmptyState({
    icon: Icon,
    title,
    hint,
}: {
    icon: ComponentType<{ className?: string; strokeWidth?: number }>;
    title: string;
    hint?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <Icon className="w-6 h-6 text-neutral-gray-medium/60" strokeWidth={1.5} />
            <p className="text-sm text-neutral-gray-dark">{title}</p>
            {hint && <p className="text-xs text-neutral-gray-medium max-w-sm leading-relaxed">{hint}</p>}
        </div>
    );
}

/** 骨架条：加载中不要用「加载中…」四个字打发，会让后台显得是半成品 */
export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`rounded bg-neutral-gray-light/70 animate-pulse ${className}`} />;
}

export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="px-6 py-5 flex flex-col gap-4">
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {Array.from({ length: cols }).map((_, c) => (
                        <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-full' : 'w-2/3'}`} />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** 表单字段：标签 + 输入 + 提示，三者间距全站一致 */
export function Field({
    label,
    hint,
    suffix,
    children,
    className = '',
}: {
    label: string;
    hint?: ReactNode;
    /** 标签右侧的次要信息，如字段 key */
    suffix?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <label className="text-sm font-medium text-neutral-gray-dark">
                {label}
                {suffix && <span className="ml-2 font-mono text-xs font-normal text-neutral-gray-medium">{suffix}</span>}
            </label>
            {children}
            {hint && <p className="text-xs leading-relaxed text-neutral-gray-medium">{hint}</p>}
        </div>
    );
}

/* ---------- 表格 ---------- */

/** 表头单元格：全大写小字 + 字距，压住表头不与正文抢视觉 */
export const TH = 'px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium';
export const TH_RIGHT = `${TH} text-right`;
export const TD = 'px-5 py-3.5 align-middle text-sm text-neutral-gray-dark';
/** 数字列：等宽 + 表格数字，右对齐后小数点才对得齐 */
export const TD_NUM = `${TD} text-right font-mono tabular-nums`;
export const TR = 'border-t border-neutral-gray-light/70 transition-colors hover:bg-neutral-gray-pale/70';

export function TableShell({ children }: { children: ReactNode }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">{children}</table>
        </div>
    );
}

export function Thead({ children }: { children: ReactNode }) {
    return <thead className="bg-neutral-gray-pale/60">{children}</thead>;
}
