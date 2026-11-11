import { NextRequest, NextResponse } from 'next/server';
import { getSkill, incrementDownloads, toSkillYaml } from '@/lib/skills-store';
import { findUserById } from '@/lib/users';
import { resolveKeyUser } from '@/lib/account-auth';
import { hasEntitlement } from '@/lib/purchases';

export const dynamic = 'force-dynamic';

/**
 * Skill 安装包：桌面端把 files 里的两个文件落盘到 skills/{id}/ 后 rescan 即完成安装。
 *
 * 付费闸门（PR-W3）：priceCents > 0 的条目要求 Bearer awdk_ Key 且已购对应权益，
 * 否则 402 { code: "payment_required", priceCents, itemName }。免费条目行为一字不变。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = getSkill(id);
  if (!skill) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const priceCents = skill.priceCents ?? 0;
  if (priceCents > 0) {
    const keyUser = resolveKeyUser(request);
    if (!keyUser || !hasEntitlement(keyUser.id, `skill:${skill.id}`)) {
      return NextResponse.json(
        { code: 'payment_required', priceCents, itemName: skill.name },
        { status: 402 }
      );
    }
  }
  const author = findUserById(skill.authorId);
  incrementDownloads(id);
  return NextResponse.json({
    id: skill.id,
    version: skill.version,
    files: {
      'skill.yml': toSkillYaml(skill, author?.username || 'unknown'),
      'prompt.md': skill.prompt,
    },
  });
}
