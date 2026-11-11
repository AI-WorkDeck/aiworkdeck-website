import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { getDb } from '@/lib/db';
import { membershipSnapshot } from '@/lib/membership';

export const dynamic = 'force-dynamic';

/**
 * 会员等级与成长值（Bearer 或 Cookie）。
 * 响应字段集是契约面（doc/desktop-contract.md），两站逐字相同。
 */
export async function GET(request: NextRequest) {
    const user = resolveKeyUser(request) ?? (await getSessionUser());
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json(membershipSnapshot(getDb(), user.id));
}
