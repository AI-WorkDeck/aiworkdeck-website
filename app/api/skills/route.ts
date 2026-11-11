import { NextRequest, NextResponse } from 'next/server';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { createSkill, logFailedSubmission } from '@/lib/skills-store';
import { evaluateUserBadges } from '@/lib/badges';

// 鉴权同时认官网 Cookie 与桌面端 `Bearer awdk_`：桌面端「发布到 Marketplace」经本地后端透传投稿。
export async function POST(request: NextRequest) {
  const user = resolveSessionOrKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const input = {
      id: String(body.id || '').trim().toLowerCase(),
      name: body.name,
      description: body.description,
      icon: body.icon,
      triggers: Array.isArray(body.triggers) ? body.triggers : [],
      allowedTools: Array.isArray(body.allowedTools) ? body.allowedTools : [],
      output: body.output,
      prompt: body.prompt,
      category: body.category || undefined,
      priceCents: body.priceCents !== undefined ? Number(body.priceCents) : undefined,
    };
    const { skill, error } = createSkill(input, user.id);
    if (error || !skill) {
      logFailedSubmission({ userId: user.id, error: error || 'unknown', input });
      return NextResponse.json({ error }, { status: 400 });
    }
    // 徽章评定（dev-board#300）：投稿成功即解锁里程碑/创始编号，返回给前端做「获得感」提示。
    // 评定失败不反噬投稿主路径。
    let badges: { badgeId: string; certId: string; seq?: number }[] = [];
    try {
      badges = evaluateUserBadges(user.id).map(a => ({ badgeId: a.badgeId, certId: a.id, seq: a.seq }));
    } catch { /* 见上 */ }
    return NextResponse.json({ skill, badges });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}
