import { NextResponse } from 'next/server';
import { listPlugins } from '@/lib/plugins-store';

export const dynamic = 'force-dynamic';

/**
 * 封禁列表 —— 桌面端启动时与每 24 小时拉取一次，命中则强制禁用已安装的该插件。
 * 契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md §6 / §8。
 */
export async function GET() {
  const revoked = listPlugins({ status: 'revoked' }).map((p) => ({
    id: p.id,
    version: p.version,
    reason: p.reviewNote || '平台已下架',
    revokedAt: p.reviewedAt,
  }));
  return NextResponse.json(revoked);
}
