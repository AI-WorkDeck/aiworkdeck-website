import { ReactNode } from 'react';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 全站内联提示条（成功 / 信息 / 报错）统一组件。
 *
 * 之前各表单各写一套 class（账户页灰底、插件/技能提交页红底……），同一件事长出
 * 好几种样子。这里收口成一套视觉：沿用账户页 SiteNotice 的体系——
 * success/info 用 king-forest 淡色卡，error 用红色卡，图标 + 文案横排。
 */

const VARIANT_STYLE: Record<'success' | 'info' | 'error', { box: string; icon: string }> = {
    success: {
        box: 'border-[#b8d8ce] bg-[#f0f6f4] text-[#1c352d]',
        icon: 'text-[#2E5A50]',
    },
    info: {
        box: 'border-[#b8d8ce] bg-[#f0f6f4] text-[#1c352d]',
        icon: 'text-[#2E5A50]',
    },
    error: {
        box: 'border-[#f0c4be] bg-[#fdf2f0] text-[#8a2a22]',
        icon: 'text-[#c23b2e]',
    },
};

const VARIANT_ICON = {
    success: CheckCircle2,
    info: Info,
    error: AlertCircle,
};

export function FormNotice({
    variant,
    children,
    className,
}: {
    variant: 'success' | 'info' | 'error';
    children: ReactNode;
    className?: string;
}) {
    const style = VARIANT_STYLE[variant];
    const Icon = VARIANT_ICON[variant];
    const isError = variant === 'error';

    return (
        <div
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={cn('flex gap-3 rounded-xl border px-4 py-3', style.box, className)}
        >
            <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', style.icon)} strokeWidth={1.75} />
            <p className="text-[13px] leading-relaxed">{children}</p>
        </div>
    );
}
