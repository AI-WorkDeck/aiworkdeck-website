import { NextRequest, NextResponse } from 'next/server';
import { getPlugin, readPluginFile, incrementDownloads } from '@/lib/plugins-store';
import { resolveKeyUser } from '@/lib/account-auth';
import { hasEntitlement } from '@/lib/purchases';

export const dynamic = 'force-dynamic';

/**
 * 按 bundle 清单逐个下载包内文件：?path=tool.jar
 *
 * path 必须是该版本 files 里登记过的键（校验在 readPluginFile 内），
 * 否则 404——避免这个接口退化成任意文件读取。
 *
 * 付费闸门（PR-W3）：与 bundle 端点同口径，priceCents > 0 未购一律 402。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const relPath = request.nextUrl.searchParams.get('path') || '';
  if (!relPath) return NextResponse.json({ error: 'path_required' }, { status: 400 });

  const plugin = getPlugin(id);
  if (!plugin || plugin.status !== 'approved') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const priceCents = plugin.priceCents ?? 0;
  if (priceCents > 0) {
    const keyUser = resolveKeyUser(request);
    if (!keyUser || !hasEntitlement(keyUser.id, `plugin:${plugin.id}`)) {
      return NextResponse.json(
        { code: 'payment_required', priceCents, itemName: plugin.name },
        { status: 402, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } }
      );
    }
  }

  const buf = readPluginFile(plugin.id, plugin.version, relPath);
  if (!buf) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // 下载计数按 manifest 记一次，避免逐文件重复累加
  if (relPath === 'manifest.json') {
    incrementDownloads(plugin.id, plugin.version);
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Cache-Control': priceCents > 0 ? 'private, no-store' : 'public, max-age=86400, immutable',
      ...(priceCents > 0 ? { Vary: 'Authorization' } : {}),
    },
  });
}
