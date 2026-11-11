import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { deleteSkill, getSkill, setSkillFeatured } from '@/lib/skills-store';
import { evaluateUserBadges } from '@/lib/badges';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!deleteSkill(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = await request.json();
    if (typeof body.featured === 'boolean') {
      if (!setSkillFeatured(id, body.featured)) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      // 入选精选会解锁「编辑精选」徽章（dev-board#300）；失败不影响精选操作本身
      if (body.featured) {
        try {
          const authorId = getSkill(id)?.authorId;
          if (authorId) evaluateUserBadges(authorId);
        } catch { /* 见上 */ }
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}
