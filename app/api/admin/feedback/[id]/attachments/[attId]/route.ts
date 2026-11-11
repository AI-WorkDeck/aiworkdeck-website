import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { inboxConfigured, inboxFetch } from '@/lib/feedback-inbox';

export const dynamic = 'force-dynamic';

/**
 * 附件字节流（截图 / 语音）代理。浏览器端 <img>/<audio> 直接以本路由为 src——
 * 同源带 admin cookie，取件密钥只在服务端出现。响应透传收件箱的
 * Content-Type / Content-Disposition，音频播放器据此选解码器。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attId: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!inboxConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { id, attId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(attId)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  try {
    const res = await inboxFetch(`/api/feedback/${id}/attachment/${attId}`);
    if (!res.ok || !res.body) {
      return new NextResponse(null, { status: res.status === 404 ? 404 : 502 });
    }
    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('content-type') || 'application/octet-stream');
    const disposition = res.headers.get('content-disposition');
    if (disposition) headers.set('Content-Disposition', disposition);
    headers.set('Cache-Control', 'private, no-store');
    return new NextResponse(res.body, { headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
