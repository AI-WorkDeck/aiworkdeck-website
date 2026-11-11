import { NextRequest, NextResponse } from 'next/server';
import { getPlugin } from '@/lib/plugins-store';
import { resolveKeyUser } from '@/lib/account-auth';
import { hasEntitlement } from '@/lib/purchases';

export const dynamic = 'force-dynamic';

/**
 * 安装清单与签名（不含二进制）。桌面端先验签，再按 files 逐个下载并比对 SHA-256。
 * 契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md §6。
 *
 * 付费闸门（PR-W3）：priceCents > 0 要求 Bearer awdk_ Key 且已购，
 * 否则 402 { code: "payment_required", priceCents, itemName }。免费条目行为不变。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plugin = getPlugin(id);
  if (!plugin || plugin.status !== 'approved' || !plugin.signature) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const priceCents = plugin.priceCents ?? 0;
  if (priceCents > 0) {
    const keyUser = resolveKeyUser(request);
    if (!keyUser || !hasEntitlement(keyUser.id, `plugin:${plugin.id}`)) {
      return NextResponse.json(
        { code: 'payment_required', priceCents, itemName: plugin.name },
        { status: 402 }
      );
    }
  }
  return NextResponse.json({
    id: plugin.id,
    version: plugin.version,
    publishedAt: plugin.publishedAt,
    files: plugin.files,
    signature: plugin.signature,
  });
}
