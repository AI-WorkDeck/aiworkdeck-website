import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { inboxConfigured, inboxFetch } from '@/lib/feedback-inbox';

export const dynamic = 'force-dynamic';

/** 反馈列表：代理云端收件箱 GET /api/feedback（信封 {code,data:{items}}），admin cookie 鉴权。 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!inboxConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const status = request.nextUrl.searchParams.get('status') || '';
  const qs = new URLSearchParams({ limit: '100' });
  if (status) qs.set('status', status);
  try {
    const res = await inboxFetch(`/api/feedback?${qs}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0) {
      return NextResponse.json(
        { error: 'inbox_error', detail: body?.message || `HTTP ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ configured: true, items: body.data?.items ?? [] });
  } catch {
    return NextResponse.json({ error: 'inbox_unreachable' }, { status: 502 });
  }
}
