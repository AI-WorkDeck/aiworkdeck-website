// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'node:crypto';
import { getDb, withTransaction } from './db';
import { findUserById, isDeletedUser, type User } from './users';

import { DEVELOPER_PERMISSIONS, type DeveloperData, type DeveloperProfile } from './developer-contract';
export type { DeveloperData, DeveloperProfile } from './developer-contract';
export class DeveloperError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
function fail(code: string, status = 400): never { throw new DeveloperError(code, status); }
function text(v: unknown, max: number, required = true): string {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) fail('invalid_profile');
  return v.trim();
}
function validate(value: unknown): DeveloperData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_profile');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['kind', 'displayName', 'organization', 'contactType', 'contact', 'experience', 'plan', 'permissions'].includes(k))) fail('invalid_profile');
  if (!['individual', 'organization'].includes(String(v.kind)) || !['email', 'phone', 'other'].includes(String(v.contactType))) fail('invalid_profile');
  const contact = text(v.contact, 200);
  if (v.contactType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) fail('invalid_contact');
  if (v.contactType === 'phone' && !/^\+?[0-9 ()-]{7,30}$/.test(contact)) fail('invalid_contact');
  if (!Array.isArray(v.permissions) || v.permissions.some(p => typeof p !== 'string' || !(DEVELOPER_PERMISSIONS as readonly string[]).includes(p)) || new Set(v.permissions).size !== v.permissions.length) fail('invalid_permissions');
  return { kind: v.kind as DeveloperData['kind'], displayName: text(v.displayName, 80), organization: text(v.organization, 120, v.kind === 'organization'), contactType: v.contactType as DeveloperData['contactType'], contact, experience: text(v.experience, 2000), plan: text(v.plan, 2000), permissions: v.permissions as string[] };
}
function decode(row: unknown): DeveloperProfile | null {
  if (!row) return null;
  const { data, ...meta } = row as { data: string } & Omit<DeveloperProfile, keyof DeveloperData>;
  return { ...JSON.parse(data), ...meta };
}
export function getDeveloper(userId: string): DeveloperProfile | null {
  return decode(getDb().prepare('SELECT * FROM developer_profile WHERE userId=?').get(userId));
}
export function listDevelopers(): DeveloperProfile[] {
  return getDb().prepare('SELECT * FROM developer_profile ORDER BY updatedAt DESC').all().map(r => decode(r)!);
}
export function developerHistory(userId: string) {
  return getDb().prepare('SELECT version,action,note,actor,snapshot,createdAt FROM developer_review WHERE userId=? ORDER BY id DESC').all(userId).map(row => { const r = row as Record<string, unknown>; return { ...r, snapshot: JSON.parse(String(r.snapshot)) }; });
}
function current(userId: string, expectedVersion: unknown): DeveloperProfile | null {
  const p = getDeveloper(userId);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== (p?.version ?? 0)) fail('version_conflict', 409);
  return p;
}
function accountVerification(user: User, data: DeveloperData): string | null {
  if (data.contactType === 'email' && user.emailVerifiedAt && data.contact.toLowerCase() === user.email.toLowerCase()) return 'account-email';
  if (data.contactType === 'phone' && user.phone && data.contact === user.phone) return 'account-phone';
  return null;
}
function audit(userId: string, version: number, action: string, note = '') {
  getDb().prepare('INSERT INTO developer_review(userId,version,action,note,actor,snapshot,createdAt) VALUES(?,?,?,?,?,?,?)').run(userId, version, action, note, ['approve', 'reject', 'suspend'].includes(action) ? 'admin' : userId, JSON.stringify(getDeveloper(userId)), new Date().toISOString());
}
export function saveDeveloper(user: User, value: unknown, expectedVersion: unknown) {
  const data = validate(value);
  return withTransaction(d => {
    const freshUser = findUserById(user.id);
    if (!freshUser || isDeletedUser(freshUser)) fail('unauthorized', 401);
    const old = current(freshUser.id, expectedVersion); const now = new Date().toISOString();
    const status = old?.status === 'suspended' ? 'suspended' : 'draft';
    const version = (old?.version ?? 0) + 1;
    d.prepare(`INSERT INTO developer_profile(userId,data,status,version,contactVerification,reviewNote,createdAt,updatedAt) VALUES(?,?,?,?,?,'',?,?)
      ON CONFLICT(userId) DO UPDATE SET data=excluded.data,status=excluded.status,version=excluded.version,contactVerification=excluded.contactVerification,reviewNote=excluded.reviewNote,updatedAt=excluded.updatedAt`)
      .run(user.id, JSON.stringify(data), status, version, accountVerification(freshUser, data), old?.createdAt ?? now, now);
    audit(user.id, version, 'save'); return getDeveloper(user.id)!;
  });
}
export function applyDeveloper(user: User, expectedVersion: unknown) {
  return withTransaction(d => {
    const freshUser = findUserById(user.id);
    if (!freshUser || isDeletedUser(freshUser)) fail('unauthorized', 401);
    const p = current(freshUser.id, expectedVersion);
    if (!p || !['draft', 'rejected'].includes(p.status)) fail('invalid_state', 409);
    const version = p.version + 1;
    d.prepare('UPDATE developer_profile SET status=?,version=?,contactVerification=?,updatedAt=? WHERE userId=?')
      .run('pending', version, accountVerification(freshUser, p), new Date().toISOString(), user.id);
    audit(user.id, version, 'apply'); return getDeveloper(user.id)!;
  });
}
export function reviewDeveloper(userId: string, expectedVersion: unknown, action: unknown, note: unknown, contactChecked: unknown) {
  return withTransaction(d => {
    const p = current(userId, expectedVersion); const user = findUserById(userId);
    if (!p || !user || isDeletedUser(user)) fail('not_found', 404);
    if (!['approve', 'reject', 'suspend'].includes(String(action))) fail('invalid_action');
    if (action === 'approve' && !['pending', 'suspended'].includes(p.status) || action === 'reject' && p.status !== 'pending' || action === 'suspend' && p.status !== 'approved') fail('invalid_state', 409);
    const reason = text(note ?? '', 2000, action !== 'approve');
    const verification = accountVerification(user, p) || (contactChecked === true ? 'manual-review' : null);
    if (action === 'approve' && !verification) fail('contact_verification_required');
    const version = p.version + 1;
    d.prepare('UPDATE developer_profile SET status=?,version=?,contactVerification=?,reviewNote=?,updatedAt=? WHERE userId=?')
      .run(action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended', version, verification, reason, new Date().toISOString(), userId);
    audit(userId, version, String(action), reason); return getDeveloper(userId)!;
  });
}
export function requireApprovedDeveloper(userId: string) {
  const user = findUserById(userId);
  if (!user || isDeletedUser(user)) fail('unauthorized', 401);
  if (getDeveloper(userId)?.status !== 'approved') fail('developer_approval_required', 403);
  return user;
}
export function requireDeclaredPermissions(userId: string, permissions: string[]) {
  requireApprovedDeveloper(userId);
  if (permissions.some(p => !getDeveloper(userId)!.permissions.includes(p))) fail('developer_permissions_required', 403);
}
export function listSubmissionTokens(userId: string) {
  return getDb().prepare('SELECT id,label,createdAt,expiresAt,lastUsedAt,revokedAt FROM plugin_submission_token WHERE userId=? ORDER BY createdAt DESC').all(userId);
}
export function issueSubmissionToken(userId: string, label: unknown, days: unknown) {
  return withTransaction(d => {
    requireApprovedDeveloper(userId);
    const name = text(label ?? 'Agent', 80); const ttl = days ?? 30;
    if (!Number.isInteger(ttl) || Number(ttl) < 1 || Number(ttl) > 90) fail('invalid_expiry');
    const count = d.prepare('SELECT count(*) AS n FROM plugin_submission_token WHERE userId=? AND revokedAt IS NULL AND expiresAt>?').get(userId, new Date().toISOString()) as { n: number };
    if (count.n >= 10) fail('token_limit', 409);
    const token = `awd_plugin_${crypto.randomBytes(32).toString('base64url')}`; const id = crypto.randomUUID();
    const createdAt = new Date().toISOString(); const expiresAt = new Date(Date.now() + Number(ttl) * 86400000).toISOString();
    d.prepare('INSERT INTO plugin_submission_token(id,userId,label,tokenHash,createdAt,expiresAt) VALUES(?,?,?,?,?,?)')
      .run(id, userId, name, crypto.createHash('sha256').update(token).digest('hex'), createdAt, expiresAt);
    return { token, id, label: name, createdAt, expiresAt, scope: ['plugins:read', 'plugins:submit'] };
  });
}
export function revokeSubmissionToken(userId: string, id: unknown) {
  if (typeof id !== 'string') fail('invalid_token_id');
  const result = getDb().prepare('UPDATE plugin_submission_token SET revokedAt=COALESCE(revokedAt,?) WHERE id=? AND userId=?').run(new Date().toISOString(), id, userId);
  if (!result.changes) fail('not_found', 404);
}
export function submissionTokenUser(token: string, touch = false): User {
  if (!/^awd_plugin_[A-Za-z0-9_-]{43}$/.test(token)) fail('invalid_plugin_token', 401);
  const row = getDb().prepare('SELECT id,userId FROM plugin_submission_token WHERE tokenHash=? AND revokedAt IS NULL AND expiresAt>?')
    .get(crypto.createHash('sha256').update(token).digest('hex'), new Date().toISOString()) as { id: string; userId: string } | undefined;
  if (!row) fail('invalid_plugin_token', 401);
  const user = requireApprovedDeveloper(row.userId);
  if (touch) getDb().prepare('UPDATE plugin_submission_token SET lastUsedAt=? WHERE id=?').run(new Date().toISOString(), row.id);
  return user;
}
