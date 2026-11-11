import { accountSubscriptionView } from '@/lib/account-subscription-view';
// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { subscriptionSnapshot, setWalletFallback } from '@/lib/subscription';
import { syncAiQuota } from '@/lib/ai-quota';
import { accountBillingFields, refreshBqtSnapshot } from '@/lib/bqt-account';

export async function GET(request: NextRequest) {
    const user = resolveKeyUser(request) ?? await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await refreshBqtSnapshot(user.id);
    return NextResponse.json({ subscription: accountSubscriptionView(user.id), ...accountBillingFields(user.id) });
}

/** Explicit consent only; disabling also lowers the provisioned AI key before confirming success. */
export async function PATCH(request: NextRequest) {
    const user = resolveKeyUser(request) ?? await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (typeof body?.walletFallbackEnabled !== 'boolean') return NextResponse.json({ error: 'invalid_preference' }, { status: 400 });
    setWalletFallback(user.id, body.walletFallbackEnabled);
    try {
        await syncAiQuota(user.id);
    } catch {
        return NextResponse.json({ error: 'quota_sync_unavailable', subscription: accountSubscriptionView(user.id) }, { status: 503 });
    }
    return NextResponse.json({ subscription: accountSubscriptionView(user.id) });
}
