import { NextRequest, NextResponse } from 'next/server';
import { findUserByApiKey } from '@/lib/api-keys';
import { getPlan } from '@/lib/wallet';

/**
 * 解锁门校验（匿名，key 在 body 里）。契约见总 Spec §9。
 * POST /api/license/verify-key { key } → { valid, plan }
 * 无效 key 一律 { valid: false }，不区分不存在/已吊销/格式错误；
 * 比较路径恒定时间（见 lib/api-keys.ts findUserByApiKey）。
 */
export async function POST(request: NextRequest) {
  let key = '';
  try {
    const body = await request.json();
    if (typeof body?.key === 'string') key = body.key;
  } catch {
    // body 不合法与 key 不存在同响应，不泄露差异
  }
  const user = findUserByApiKey(key);
  if (!user) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({ valid: true, plan: getPlan(user.id) });
}
