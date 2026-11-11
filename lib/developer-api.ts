// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from './sessions';
import { DeveloperError, submissionTokenUser } from './developers';
import { siteOrigins } from './site-config';
export function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function developerApiError(e: unknown) {
  if (e instanceof DeveloperError) return privateJson({ error: e.code }, e.status);
  throw e;
}
export function cookieDeveloper(request: NextRequest) {
  // Personal settings never accept submission tokens, even alongside a valid cookie.
  if (request.headers.has('authorization')) throw new DeveloperError('cookie_required', 401);
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new DeveloperError('unauthorized', 401);
  return user;
}
export function pluginAuthor(request: NextRequest, touch = false) {
  if (request.headers.has('authorization')) {
    const match = /^Bearer (\S+)$/i.exec(request.headers.get('authorization')!);
    if (!match) throw new DeveloperError('invalid_plugin_token', 401);
    return submissionTokenUser(match[1], touch);
  }
  return cookieDeveloper(request);
}
export function sameOriginMutation(request: NextRequest) {
  const origin = request.headers.get('origin');
  let source: URL;
  try { source = new URL(origin || ''); } catch { throw new DeveloperError('origin_not_allowed', 403); }
  // Next may build nextUrl from its internal listener (localhost:3000). Nginx
  // preserves the public Host (DEPLOY.md); forwarded host/protocol are not an allowlist.
  const host = request.headers.get('host') ?? request.nextUrl.host;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)
    && ['http:', 'https:'].includes(source.protocol);
  if (origin !== source.origin || source.host !== host || (!siteOrigins.includes(origin) && !loopback)
      || request.headers.get('sec-fetch-site') === 'cross-site') throw new DeveloperError('origin_not_allowed', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new DeveloperError('json_required', 415);
}
export async function readDeveloperBody(request: NextRequest) {
  sameOriginMutation(request);
  const raw = await request.text();
  if (raw.length > 16000) throw new DeveloperError('body_too_large', 413);
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new DeveloperError('bad_request'); }
}
