import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { rotateRetiredAccount, RotationError } from '@/lib/openrouter-rotation';

export const dynamic = 'force-dynamic';

/**
 * OpenRouter 账号轮换（见 doc/openrouter-account-rotation.md）。幂等。
 * 默认 dry-run；只有显式 {"dryRun": false} 才会结算、禁用、退役旧账号的 key。
 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const result = await rotateRetiredAccount({ dryRun: body?.dryRun !== false });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof RotationError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'rotation_failed' }, { status: 500 });
  }
}
