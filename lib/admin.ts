import crypto from 'crypto';
import { NextRequest } from 'next/server';

/**
 * 管理后台鉴权：唯一凭据是服务器环境变量 AWD_ADMIN_TOKEN（部署时生成），
 * 登录后原样放入 HttpOnly cookie，请求时恒定时间比较。未配置 token 时后台整体不可用。
 */
export const ADMIN_COOKIE = 'awd_admin';

export function getAdminToken(): string | undefined {
  const token = process.env.AWD_ADMIN_TOKEN?.trim();
  return token && token.length >= 12 ? token : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function verifyAdminToken(candidate: string | undefined): boolean {
  const token = getAdminToken();
  return !!token && !!candidate && safeEqual(candidate, token);
}

export function isAdminRequest(request: NextRequest): boolean {
  return verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60, // 12 小时
  };
}
