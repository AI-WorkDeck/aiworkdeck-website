import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { inboxConfigured, inboxFetch } from '@/lib/feedback-inbox';

export const dynamic = 'force-dynamic';

/** 反馈详情（含附件清单与运行现场），代理云端收件箱 GET /api/feedback/{id}。 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!inboxConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  try {
    const res = await inboxFetch(`/api/feedback/${id}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0) {
      return NextResponse.json(
        { error: 'inbox_error', detail: body?.message || `HTTP ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json(body.data);
  } catch {
    return NextResponse.json({ error: 'inbox_unreachable' }, { status: 502 });
  }
}
