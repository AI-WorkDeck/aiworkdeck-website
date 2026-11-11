import { NextRequest, NextResponse } from 'next/server';
import { readAvatar } from '@/lib/avatars';

/**
 * 读头像字节。公开可读——头像本来就要在公开主页与广场卡片上露出。
 *
 * 走 API 路由而不是 public/ 静态文件：public/ 下的文件会**遮挡同名 app 路由**
 * （favicon 那次踩过，官网 PR #30/#31），而且用户上传物不该混进随构建走的静态资源。
 *
 * 找不到就 404，前端 onError 降级回首字母方块——DESIGN.md 要求图片缺失时
 * 只留中性底，绝不露占位文字。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const bytes = readAvatar(userId);
  if (!bytes) return new NextResponse(null, { status: 404 });

  // 带 ?v=<avatarUpdatedAt> 的请求才敢挂 immutable：URL 会随每次换头像变化，
  // 缓存自然失效。不带戳的裸地址可能被任何人拼出来，只给短缓存。
  const versioned = new URL(request.url).searchParams.has('v');
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes.length),
      'Cache-Control': versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=60, must-revalidate',
    },
  });
}
