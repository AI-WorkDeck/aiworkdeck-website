import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { listApiKeys, revokeApiKey } from '@/lib/api-keys';
import { auditAccountKey } from '@/lib/firm-audit-account';

/** 吊销 AWD Key（awd_session Cookie 鉴权），只能吊销本人的。 */
export async function DELETE(
  request: NextRequest,
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
  const prefix = listApiKeys(user.id).find(k => k.id === keyId)?.prefix ?? null;
  const ok = revokeApiKey(user.id, keyId);
  if (!ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  auditAccountKey(user, 'ACCOUNT_API_KEY_REVOKED', { id: keyId, prefix }, 'user', request);
  return NextResponse.json({ success: true });
}
