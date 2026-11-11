import { NextRequest, NextResponse } from 'next/server';
import { getDeveloper } from '@/lib/developers';
import { isAdminRequest } from '@/lib/admin';
import { listPlugins, type PluginStatus } from '@/lib/plugins-store';
import { isSigningConfigured } from '@/lib/plugin-signing';

export const dynamic = 'force-dynamic';

const STATUSES: PluginStatus[] = ['pending', 'approved', 'rejected', 'revoked'];

/** 审核队列：默认返回全部，可按 status 过滤 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const raw = request.nextUrl.searchParams.get('status');
  const status = STATUSES.includes(raw as PluginStatus) ? (raw as PluginStatus) : undefined;
  return NextResponse.json({
    plugins: listPlugins(status ? { status } : undefined).map(p => ({ ...p, developerStatus: getDeveloper(p.authorId)?.status ?? 'not_applied' })),
    // 未配置签名私钥时不能上架，后台据此禁用「通过」按钮并提示
    signingConfigured: isSigningConfigured(),
  });
}
