import { NextResponse } from 'next/server';
import { listSkills } from '@/lib/skills-store';
import { findUserById } from '@/lib/users';
import { siteConfig } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

/**
 * 公开 Skill 注册表 —— 桌面端在线广场（SkillMarketService）消费的契约接口。
 * 返回字段勿随意改名/删除，桌面端按此结构解析。
 */
export async function GET() {
  const skills = listSkills({ sort: 'newest' });
  const entries = skills.map(skill => {
    const author = findUserById(skill.authorId);
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
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
    };
  });
  return NextResponse.json(entries);
}
