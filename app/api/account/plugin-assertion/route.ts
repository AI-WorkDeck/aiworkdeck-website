// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveSessionOrKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { getPluginSubscriptionStatus, supportsPluginSubscriptions } from '@/lib/plugin-subscriptions';
import { siteConfig } from '@/lib/site-config';

const ASSERTION_TTL_SECONDS = 600;
const MIN_SECRET_LENGTH = 32;

async function currentUser(request: NextRequest) {
  const byReq = resolveSessionOrKeyUser(request);
  if (byReq) return byReq;
  try {
    return await getSessionUser();
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) {
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

  const status = getPluginSubscriptionStatus(user.id, pluginId);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ASSERTION_TTL_SECONDS;
  const payload = {
    v: 1,
    iss: siteConfig.id === 'cn' ? 'aiworkdeck.com' : 'workdeck.ai',
    sub: user.id,
    displayName: user.displayName || user.username || '',
    pluginId,
    active: status.active,
    expiresAt: status.expiresAt,
    iat: nowSec,
    exp: expSec,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', secret)
    .update(`awdpa1.${payloadB64}`, 'utf8')
    .digest('base64url');

  return NextResponse.json(
    {
      token: `awdpa1.${payloadB64}.${sigB64}`,
      active: status.active,
      expiresAt: status.expiresAt,
      exp: expSec,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
