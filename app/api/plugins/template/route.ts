import { NextRequest, NextResponse } from 'next/server';
import { buildTemplateZip } from '@/lib/plugin-template';

/**
 * 插件模板下载。
 *
 * 主仓是私有仓库，外部开发者拿不到 examples/hello-plugin，所以这里动态生成一份
 * 骨架工程。内容见 lib/plugin-template.ts。
 *
 * ?type=web 取 Web 插件模板（manifest + web/ + SDK + 宿主模拟器），
 * 缺省或其它值一律给 Java 模板——老链接 /api/plugins/template 行为不变。
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const web = request.nextUrl.searchParams.get('type') === 'web';
  const zip = buildTemplateZip(web ? 'web' : 'java');
  const filename = web ? 'aiworkdeck-web-plugin-template.zip' : 'aiworkdeck-plugin-template.zip';
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zip.length),
      // 模板随规范变化，不长缓存
      'Cache-Control': 'public, max-age=300',
    },
  });
}
