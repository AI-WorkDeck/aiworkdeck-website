import { NextResponse } from 'next/server';
import { phoneIsAccount } from '@/lib/phone-policy';
export async function POST(_request?: Request) {
  // Verified first-contact setup is required even while the delivery service is unavailable.
  return NextResponse.json({ error: phoneIsAccount() ? 'register_use_phone' : 'register_use_email' }, { status: 400 });
}
