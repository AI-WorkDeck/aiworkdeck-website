import { NextResponse, type NextRequest } from 'next/server';
import { toZhHant } from '@/lib/zh-hant';
import { listSkills } from '@/lib/skills-store';
import { findUserById } from '@/lib/users';
import { siteConfig } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

/**
 * 公开 Skill 注册表 —— 桌面端在线广场（SkillMarketService）消费的契约接口。
 * 返回字段勿随意改名/删除，桌面端按此结构解析。
 */
export async function GET(request?: NextRequest) {
  // ?lang=zh-hant serves Traditional (Taiwan) name/description in place; every entry also carries i18n['zh-hant']
  // so a client that fetches once (the desktop backend) can pick per UI language (POLISH X47). Additive only.
  const hant = request?.nextUrl?.searchParams.get('lang')?.toLowerCase() === 'zh-hant';
  const skills = listSkills({ sort: 'newest' });
  const entries = skills.map(skill => {
    const author = findUserById(skill.authorId);
    return {
      id: skill.id,
      name: hant ? toZhHant(skill.name) : skill.name,
      description: hant ? toZhHant(skill.description) : skill.description,
      icon: skill.icon,
      version: skill.version,
      author: author?.username || 'unknown',
      authorDisplayName: author?.displayName || 'Unknown',
      triggers: skill.triggers,
      allowedTools: skill.allowedTools,
      category: skill.category ?? 'other',
      downloads: skill.downloads,
      updatedAt: skill.updatedAt,
      homepage: `${siteConfig.origin}/${siteConfig.defaultLocale}/skills/${skill.id}`,
      // PR-W3 只增不改：付费元数据，旧桌面端忽略未知字段
      priceCents: skill.priceCents ?? 0,
      pricingModel: skill.pricingModel ?? 'once',
      i18n: { 'zh-hant': { name: toZhHant(skill.name), description: toZhHant(skill.description), triggers: skill.triggers.map(toZhHant) } },
    };
  });
  return NextResponse.json(entries);
}
