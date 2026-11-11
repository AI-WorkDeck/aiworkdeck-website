import { pickLocale, type Locale } from '@/i18n-config';

/**
 * Skill 分类。服务端校验与前端过滤共用，不得引入 Node 依赖（会进客户端 bundle）。
 */
export const SKILL_CATEGORIES = [
  { id: 'contract', zh: '合同', en: 'Contracts' },
  { id: 'litigation', zh: '诉讼与争议', en: 'Litigation' },
  { id: 'compliance', zh: '合规风控', en: 'Compliance' },
  { id: 'research', zh: '法律研究', en: 'Research' },
  { id: 'corporate', zh: '公司与投融资', en: 'Corporate' },
  { id: 'office', zh: '办公效率', en: 'Productivity' },
  { id: 'other', zh: '其他', en: 'Other' },
] as const;

export type SkillCategoryId = (typeof SKILL_CATEGORIES)[number]['id'];

export function isSkillCategory(id: string): id is SkillCategoryId {
  return SKILL_CATEGORIES.some(c => c.id === id);
}

export function categoryLabel(id: string | undefined, lang: Locale = 'zh'): string | undefined {
  const c = SKILL_CATEGORIES.find(c => c.id === id);
  return c ? pickLocale(c, lang) : undefined;
}
