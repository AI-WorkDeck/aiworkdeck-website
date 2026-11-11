import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { requireDeclaredPermissions } from '@/lib/developers';
import { developerApiError } from '@/lib/developer-api';
import { isAdminRequest } from '@/lib/admin';
import { approvePlugin, rejectPlugin, revokePlugin, readPluginFile, getPlugin } from '@/lib/plugins-store';
import { notifySubmissionReviewed, type ReviewAction } from '@/lib/review-notify';

export const dynamic = 'force-dynamic';

/**
 * 审核结果通知：状态已经落库了，这一步只是转述给提交人。
 * `await` 是为了在同一次请求里把发信日志留下（Next 的路由响应后进程可能不再调度
 * 悬空的 Promise），但发信本身永不抛异常，也就永远拖不垮审核动作。
 *
 * `version` 为 '*'（通配封禁）时按 id 取最新一条拿作者与展示名。
 */
async function notifyAuthor(id: string, version: string, action: ReviewAction, note?: string) {
  const entry = getPlugin(id, version) || getPlugin(id);
  if (!entry) return;
  await notifySubmissionReviewed({
    kind: 'plugin',
    id: entry.id,
    version,
    name: entry.name,
    action,
    note,
    authorId: entry.authorId,
  });
}

/**
 * 审核动作。body: { version, action: 'approve' | 'reject' | 'revoke', note? }
 *
 * 没有自动通过路径——approve 只能由管理员在看过扫描报告后手动触发。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: { version?: string; action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const version = String(body.version || '').trim();
  const action = String(body.action || '');
  if (!version) return NextResponse.json({ error: 'version_required' }, { status: 400 });

  if (action === 'approve') {
    const entry = getPlugin(id, version);
    if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    let result: ReturnType<typeof approvePlugin>;
    try { result = withTransaction(() => { requireDeclaredPermissions(entry.authorId, entry.permissions); return approvePlugin(id, version); }); } catch (e) { return developerApiError(e); }
    const { ok, reason } = result;
    if (!ok) {
      const message =
        reason === 'signing_not_configured'
          ? '服务器未配置 AWD_PLUGIN_SIGNING_KEY，无法签名上架'
          : '插件版本不存在';
      return NextResponse.json({ error: reason, message }, { status: reason === 'not_found' ? 404 : 500 });
    }
    await notifyAuthor(id, version, 'approve');
    return NextResponse.json({ ok: true });
  }

  if (action === 'reject') {
    const note = String(body.note || '').trim();
    if (!note) return NextResponse.json({ error: 'note_required', message: '驳回必须填写原因' }, { status: 400 });
    if (!rejectPlugin(id, version, note)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await notifyAuthor(id, version, 'reject', note);
    return NextResponse.json({ ok: true });
  }

  if (action === 'revoke') {
    const note = String(body.note || '').trim();
    if (!note) return NextResponse.json({ error: 'note_required', message: '封禁必须填写原因' }, { status: 400 });
    if (!revokePlugin(id, version, note)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await notifyAuthor(id, version, 'revoke', note);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}

/** 审核时下载包内文件人工核查：?version=1.0.0&path=tool.jar */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const version = request.nextUrl.searchParams.get('version') || '';
  const relPath = request.nextUrl.searchParams.get('path') || '';
  if (!version || !relPath) {
    const entry = getPlugin(id);
    return entry ? NextResponse.json({ plugin: entry }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const buf = readPluginFile(id, version, relPath);
  if (!buf) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(relPath.replace(/\//g, '_'))}"`,
    },
  });
}
