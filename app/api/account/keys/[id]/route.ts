import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { revokeApiKey } from '@/lib/api-keys';

/** 吊销 AWD Key（awd_session Cookie 鉴权），只能吊销本人的。 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const keyId = Number(id);
  if (!Number.isInteger(keyId)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const ok = revokeApiKey(user.id, keyId);
  if (!ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
