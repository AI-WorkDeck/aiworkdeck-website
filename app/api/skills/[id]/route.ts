import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { getSkill, updateSkill } from '@/lib/skills-store';
import { hasEntitlement } from '@/lib/purchases';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = getSkill(id);
  if (!skill) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // 付费闸门（PR-W3 审查修复）：付费 Skill 的 prompt 只对作者与已购用户可见，
  // 否则等于把付费内容全文白送（bundle 402 闸门形同虚设）。
  const priceCents = skill.priceCents ?? 0;
  if (priceCents > 0) {
    const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
    const canView =
      !!user && (user.id === skill.authorId || hasEntitlement(user.id, `skill:${skill.id}`));
    if (!canView) {
      const { prompt: _prompt, ...rest } = skill;
      return NextResponse.json({ skill: { ...rest, promptLocked: true } });
    }
  }
  return NextResponse.json({ skill });
}

// 与 POST /api/skills 同口径：桌面端以 `Bearer awdk_` 更新自己发布的 Skill。
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = resolveSessionOrKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    // 请求里**没带**的定价/分类/图标沿用已发布值：桌面端「更新到 Marketplace」只发正文相关字段，
    // 不能因此把作者在官网设好的价格清成免费（付费正文随之公开）。带了（含空值）才算要改。
    const current = getSkill(id);
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
    if (current) {
      if (!has('icon')) body.icon = current.icon;
      if (!has('category')) body.category = current.category;
      if (!has('priceCents')) body.priceCents = current.priceCents ?? 0;
    }
    const { skill, error } = updateSkill(
      id,
      {
        id,
        name: body.name,
        description: body.description,
        icon: body.icon,
        triggers: Array.isArray(body.triggers) ? body.triggers : [],
        allowedTools: Array.isArray(body.allowedTools) ? body.allowedTools : [],
        output: body.output,
        prompt: body.prompt,
        category: body.category || undefined,
        priceCents: body.priceCents !== undefined ? Number(body.priceCents) : undefined,
      },
      user.id
    );
    if (error || !skill) {
      const status = error === 'not_found' ? 404 : error === 'forbidden' ? 403 : 400;
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ skill });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}
