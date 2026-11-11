// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac, timingSafeEqual } from 'crypto';
import { getDb } from '../db';
import { hashApiKey } from '../api-keys';
import { findUserById, isDeletedUser } from '../users';
import { SITE_ID } from '../site-config';
function signature(payload: string) {
  const secret = process.env.AWD_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error('not_configured');
  return createHmac('sha256', secret).update(`platform-ai-v1:${SITE_ID}:${payload}`).digest('base64url');
}
/** Stable, AI-only runtime credential; revoking its parent account key revokes it immediately. */
export function issueRuntimeToken(userId: string, request: Request): string {
  const bearer = /^Bearer\s+(awdk_\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!bearer) throw new Error('account_key_required');
  const row = getDb().prepare('SELECT id FROM api_keys WHERE userId=? AND keyHash=? AND revokedAt IS NULL')
    .get(userId, hashApiKey(bearer)) as { id: number } | undefined;
  if (!row) throw new Error('unauthorized');
  const payload = Buffer.from(JSON.stringify({ v: 1, userId, keyId: row.id })).toString('base64url');
  return `awdai_${payload}.${signature(payload)}`;
}
export function resolveRuntimeUser(request: Request) {
  const token = /^Bearer\s+awdai_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/i.exec(request.headers.get('authorization') || '');
  if (!token || token[0].length > 1024) return null;
  try {
    const expected = Buffer.from(signature(token[1])), actual = Buffer.from(token[2]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8'));
    if (claims.v !== 1 || typeof claims.userId !== 'string' || !Number.isSafeInteger(claims.keyId)) return null;
    if (!getDb().prepare('SELECT 1 FROM api_keys WHERE id=? AND userId=? AND revokedAt IS NULL').get(claims.keyId, claims.userId)) return null;
    const user = findUserById(claims.userId);
    return user && !isDeletedUser(user) ? user : null;
  } catch { return null; }
}
