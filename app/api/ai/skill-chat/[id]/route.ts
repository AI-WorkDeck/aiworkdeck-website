import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { getChatSession, deleteChatSession, saveChatSession } from '@/lib/skill-chat-store';
import { stripDraftBlocks } from '@/lib/skill-draft-shared';

export const dynamic = 'force-dynamic';

/** GET：取单个会话（续聊/回看）。消息正文已剥掉草稿块，草稿以结构化字段单独给。 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const session = getChatSession(user.id, id);
  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    conversation: {
      id: session.id,
      title: session.title,
      model: session.model,
      lang: session.lang,
      status: session.status,
      updatedAt: session.updatedAt,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.role === 'assistant' ? stripDraftBlocks(m.content) : m.content,
        at: m.at,
        model: m.model,
        costCents: m.costCents,
        charged: m.charged,
        draft: m.draft,
      })),
    },
  });
}

/** PATCH：改标题 / 标记已发布。 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const session = getChatSession(user.id, id);
  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    session.title = body.title.trim().slice(0, 60);
  }
  if (body.status === 'published') {
    session.status = 'published';
  }
  saveChatSession(session);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!deleteChatSession(user.id, id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
