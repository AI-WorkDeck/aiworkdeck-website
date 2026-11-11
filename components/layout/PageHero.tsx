import { cn } from '@/lib/utils';

/** Tailwind 类名必须写全，不能拼接（JIT 扫描不到动态类） */
const WIDTHS = {
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
} as const;

interface PageHeroProps {
    eyebrow: string;
    title: string;
    subtitle?: string;
    /** Kept for existing callers; the shared header no longer renders decoration. */
    watermark?: string;
    /** tall = 一级落地页（4xl/5xl 标题）；compact = 二级工具页（3xl/4xl） */
    size?: 'tall' | 'compact';
    /** 容器宽度，与页面正文同轴——单页只许一根对齐轴 */
    width?: keyof typeof WIDTHS;
    /** 副题之下的插槽：搜索框 / 统计条 / CTA */
    children?: React.ReactNode;
    /** 底缘页签条（编辑式下划线），贴着 hero 下缘细线 */
    tabs?: React.ReactNode;
}

export function PageHero({
    eyebrow,
    title,
    subtitle,
    size = 'tall',
    width = '6xl',
    children,
    tabs,
}: PageHeroProps) {
    const tall = size === 'tall';
    // 2026-11 全站「纸与墨」：页头与首页同一套纸面、横格、墨色衬线标题（原深林绿整块页头退役）。
    return (
        <section className="page-hero relative overflow-hidden border-b border-[#e3dccb]">
            <div className={cn(
                'relative container mx-auto px-4 md:px-8',
                WIDTHS[width],
                tall ? 'pt-28 md:pt-30' : 'pt-24 md:pt-26',
                tabs ? 'pb-0' : tall ? 'pb-8 md:pb-10' : 'pb-4 md:pb-6',
            )}>
                <p className="page-hero-eyebrow mb-4 inline-flex items-center gap-2.5">
                    <span aria-hidden className="h-px w-6 bg-[#d7c5a1]" />
                    {eyebrow}
                </p>
                <h1 className={cn(
                    'font-display text-[#14261f]',
                    tall ? 'text-[40px] md:text-[56px]' : 'text-[34px] md:text-[44px]',
                    'leading-[1.1]',
                )}>{title}</h1>
                {subtitle && <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-[#2a3a33] md:text-[19px]">{subtitle}</p>}
                {children && <div className="mt-7">{children}</div>}
                {tabs && <div className="mt-8">{tabs}</div>}
            </div>
        </section>
    );
}
