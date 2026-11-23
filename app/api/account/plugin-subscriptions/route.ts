// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import {
  getPluginSubscriptionCatalog,
  getPluginSubscriptionStatus,
  supportsPluginSubscriptions,
} from '@/lib/plugin-subscriptions';
import { siteConfig } from '@/lib/site-config';

async function currentUser(request: NextRequest) {
  const byReq = resolveSessionOrKeyUser(request);
  if (byReq) return byReq;
  try {
    return await getSessionUser();
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pluginId = (searchParams.get('pluginId') || 'aifirm-partner').trim();
  if (!supportsPluginSubscriptions(pluginId)) {
    return NextResponse.json({ error: 'unsupported_plugin' }, { status: 400 });
  }
  const user = await currentUser(request);
  const plans = getPluginSubscriptionCatalog(pluginId, siteConfig.currency);
  const subscription = user ? getPluginSubscriptionStatus(user.id, pluginId) : null;
  return NextResponse.json(
    {
      pluginId,
      currency: siteConfig.currency,
      channel: siteConfig.paymentChannel,
      site: siteConfig.id,
      autoRenew: false,
      plans,
      subscription,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
