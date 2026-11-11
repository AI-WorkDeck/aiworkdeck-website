import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';

export async function GET(request: NextRequest) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      // 导航栏那枚头像片要靠它决定渲染图片还是首字母
      avatarUpdatedAt: user.avatarUpdatedAt,
    },
  });
}
