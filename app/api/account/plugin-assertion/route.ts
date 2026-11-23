// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { issuePluginAssertion, supportsPluginSubscriptions } from '@/lib/plugin-subscriptions';

const MIN_SECRET_LENGTH = 32;

async function currentUserId(request: NextRequest): Promise<string | null> {
  const byReq = resolveSessionOrKeyUser(request);
  if (byReq) return byReq.id;
  try {
    const byCookie = await getSessionUser();
    return byCookie ? byCookie.id : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  let body: { pluginId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const pluginId = typeof body.pluginId === 'string' ? body.pluginId.trim() : '';
  if (!supportsPluginSubscriptions(pluginId)) {
    return NextResponse.json({ error: 'unsupported_plugin' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const secret = process.env.AIFIRM_PLUGIN_ASSERTION_SECRET || '';
  if (secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json(
      { error: 'assertion_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const assertion = await issuePluginAssertion(userId, pluginId, secret);
  return NextResponse.json(assertion, { headers: { 'Cache-Control': 'no-store' } });
}
