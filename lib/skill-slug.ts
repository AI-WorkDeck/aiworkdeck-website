import { pinyin } from 'pinyin-pro';
import { SKILL_ID_RE } from '@/lib/skill-id';

/**
 * 名称 → 合法 slug：中文转拼音，其余非法字符折叠成连字符；不足 2 位时补随机后缀。
 * 表单创建与对话式创建共用（原先内联在 SubmitForm 里）。
 */
export function slugFromName(name: string, suffix: string): string {
  // v: true 把 ü 输出成 v（律→lv），否则 ü 会被下面的非法字符清洗剥掉
  const ascii = pinyin(name, { toneType: 'none', type: 'array', nonZh: 'consecutive', v: true })
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  if (SKILL_ID_RE.test(ascii)) return ascii;
  if (!ascii) return `skill-${suffix}`;
  return `${ascii}-${suffix}`.slice(0, 50).replace(/-+$/, '');
}
