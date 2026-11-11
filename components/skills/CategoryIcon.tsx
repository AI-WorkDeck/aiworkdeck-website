import {
    FileText,
    Scale,
    ShieldCheck,
    BookOpen,
    Landmark,
    Briefcase,
    Asterisk,
    type LucideIcon,
} from 'lucide-react';

/** 分类 → 线性图标。全站禁用 emoji 图标，Skill 视觉标识一律从分类推导。 */
const ICONS: Record<string, LucideIcon> = {
    contract: FileText,
    litigation: Scale,
    compliance: ShieldCheck,
    research: BookOpen,
    corporate: Landmark,
    office: Briefcase,
    other: Asterisk,
};

export function categoryIconOf(category?: string): LucideIcon {
    return ICONS[category || ''] || Asterisk;
}

export function CategoryIcon({ category, className }: { category?: string; className?: string }) {
    const Icon = categoryIconOf(category);
    return <Icon className={className} strokeWidth={1.5} />;
}
