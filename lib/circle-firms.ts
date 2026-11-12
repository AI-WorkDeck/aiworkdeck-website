// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { getDb, withTransaction } from './db';
import { getAiConfig } from './ai-config';
import { getBalance, getBalanceBreakdown, grantCredits } from './credits';
import { captureServiceFunding, subscriptionFundingBudget } from './subscription';
import { findUserById, isDeletedUser, mapDisplayNamesByIds, mapUsernamesByIds, updateProfile } from './users';
import { bqtLinkedLawyer } from './bqt-member';

export const CIRCLE_DEEPSEEK_SOURCE_KIND = 'circle_deepseek_grant';

export interface CircleFirm {
  code: string;
  country: string;
  name: string;
  suffix: string;
  marginMultiplier: number;
  freeDeepseekCents: number;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserCircleFirmInfo {
  code: string;
  country: string;
  name: string;
  suffix: string;
  marginMultiplier: number;
  freeDeepseekCents: number;
  deepseekRemainingCents: number;
  boundAt: string;
}

interface CircleFirmRow {
  code: string;
  country: string;
  name: string;
  suffix: string;
  marginMultiplier: number;
  freeDeepseekCents: number;
  enabled: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToFirm(row: CircleFirmRow): CircleFirm {
  return {
    code: row.code,
    country: row.country,
    name: row.name,
    suffix: row.suffix,
    marginMultiplier: row.marginMultiplier,
    freeDeepseekCents: row.freeDeepseekCents,
    enabled: row.enabled === 1,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function normalizeCircleCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isCircleCodeCandidate(raw: string): boolean {
  const norm = normalizeCircleCode(raw);
  if (/^KW-[A-Z0-9-]+$/.test(norm)) return true;
  const row = getDb().prepare('SELECT 1 FROM circle_firms WHERE code = ?').get(norm);
  return Boolean(row);
}

export function getCircleFirm(rawCode: string): CircleFirm | undefined {
  const code = normalizeCircleCode(rawCode);
  if (!code) return undefined;
  const row = getDb()
    .prepare('SELECT * FROM circle_firms WHERE code = ?')
    .get(code) as CircleFirmRow | undefined;
  return row ? rowToFirm(row) : undefined;
}

export function stripCircleSuffix(displayName: string, suffix: string): string {
  const trimmed = displayName.trim();
  const tail = ` (${suffix})`;
  if (trimmed.endsWith(tail)) {
    return trimmed.slice(0, trimmed.length - tail.length).trim();
  }
  return trimmed;
}

export function applyCircleSuffixToName(displayName: string, suffix: string): string {
  const base = stripCircleSuffix(displayName, suffix);
  return base ? `${base} (${suffix})` : `(${suffix})`;
}

export function getCircleDeepseekBalanceCents(
  userId: string,
  nowIso = new Date().toISOString()
): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(remainingCents), 0) AS total
         FROM credit_lots
        WHERE userId = ?
          AND sourceKind = ?
          AND remainingCents > 0
          AND (expiresAt IS NULL OR expiresAt > ?)`
    )
    .get(userId, CIRCLE_DEEPSEEK_SOURCE_KIND, nowIso) as { total: number };
  return row.total;
}

export function getUserCircleFirm(
  userId: string,
  nowIso = new Date().toISOString()
): UserCircleFirmInfo | null {
  const row = getDb()
    .prepare(
      `SELECT f.*, b.boundAt
         FROM user_circle_binding b
         JOIN circle_firms f ON f.code = b.code
        WHERE b.userId = ?`
    )
    .get(userId) as (CircleFirmRow & { boundAt: string }) | undefined;
  if (!row) return null;
  return {
    code: row.code,
    country: row.country,
    name: row.name,
    suffix: row.suffix,
    marginMultiplier: row.marginMultiplier,
    freeDeepseekCents: row.freeDeepseekCents,
    deepseekRemainingCents: getCircleDeepseekBalanceCents(userId, nowIso),
    boundAt: row.boundAt,
  };
}

export function getUserMarginMultiplier(userId: string): number {
  const firm = getUserCircleFirm(userId);
  if (firm && Number.isFinite(firm.marginMultiplier) && firm.marginMultiplier >= 1) {
    return firm.marginMultiplier;
  }
  return getAiConfig().marginMultiplier;
}

export function canCircleUserCallOverseasModel(
  userId: string,
  nowIso = new Date().toISOString()
): boolean {
  const firm = getUserCircleFirm(userId, nowIso);
  if (!firm) return true;
  const breakdown = getBalanceBreakdown(userId, nowIso);
  if (breakdown.topupCents > 0) return true;
  const funding = captureServiceFunding(userId, nowIso);
  if (subscriptionFundingBudget(userId, funding) > 0) return true;
  return false;
}

export type CircleBindError =
  | 'bqt_member'
  | 'invalid_code'
  | 'disabled'
  | 'expired'
  | 'already_bound_same'
  | 'already_bound_other'
  | 'user_not_found';

export function validateCircleFirmCode(
  rawCode: string,
  userId?: string,
  nowIso = new Date().toISOString()
): { ok: true; firm: CircleFirm } | { ok: false; error: CircleBindError } {
  const firm = getCircleFirm(rawCode);
  if (!firm) return { ok: false, error: 'invalid_code' };
  if (!firm.enabled) return { ok: false, error: 'disabled' };
  if (firm.expiresAt && firm.expiresAt <= nowIso) return { ok: false, error: 'expired' };
  if (userId) {
    const existing = getDb()
      .prepare('SELECT code FROM user_circle_binding WHERE userId = ?')
      .get(userId) as { code: string } | undefined;
    if (existing) {
      return {
        ok: false,
        error: existing.code === firm.code ? 'already_bound_same' : 'already_bound_other',
      };
    }
  }
  return { ok: true, firm };
}

export type BindCircleFirmResult =
  | {
      ok: true;
      kind: 'circle_firm';
      code: string;
      firmName: string;
      country: string;
      suffix: string;
      amountCents: number;
      balanceCents: number;
      displayName: string;
    }
  | {
      ok: false;
      error: CircleBindError;
    };

export function bindCircleFirm(
  userId: string,
  rawCode: string,
  nowIso = new Date().toISOString()
): BindCircleFirmResult {
  const res = withTransaction((db) => {
    // 包晴天律师（通道开着）计费走包晴天，不能再挂联盟律所线。
    if (bqtLinkedLawyer(userId, db)) return { ok: false as const, error: 'bqt_member' as const };
    const check = validateCircleFirmCode(rawCode, userId, nowIso);
    if (!check.ok) return check;
    const { firm } = check;

    const user = findUserById(userId);
    if (!user || isDeletedUser(user)) return { ok: false as const, error: 'user_not_found' as const };

    let grantLedgerId: number | null = null;
    const grantCents = Math.max(0, Math.floor(firm.freeDeepseekCents));
    if (grantCents > 0) {
      const ledger = grantCredits(db, {
        userId,
        pool: 'reward',
        amountCents: grantCents,
        ledgerKind: 'gift',
        sourceKind: CIRCLE_DEEPSEEK_SOURCE_KIND,
        nowIso,
        meta: {
          circleFirmCode: firm.code,
          circleFirmName: firm.name,
          circleFirmSuffix: firm.suffix,
          deepseekOnly: true,
        },
      });
      grantLedgerId = ledger.id;
    }

    db.prepare(
      `INSERT INTO user_circle_binding (userId, code, boundAt, grantLedgerId)
       VALUES (?, ?, ?, ?)`
    ).run(userId, firm.code, nowIso, grantLedgerId);

    const baseName = stripCircleSuffix(user.displayName, firm.suffix) || user.username;
    const updated = updateProfile(userId, { displayName: baseName });
    const newDisplayName = updated.user?.displayName ?? applyCircleSuffixToName(baseName, firm.suffix);

    return {
      ok: true as const,
      kind: 'circle_firm' as const,
      code: firm.code,
      firmName: firm.name,
      country: firm.country,
      suffix: firm.suffix,
      amountCents: grantCents,
      balanceCents: getBalance(userId, nowIso),
      displayName: newDisplayName,
    };
  });

  return res;
}

export function listCircleFirmsAdmin(): Array<CircleFirm & { boundUsersCount: number }> {
  const rows = getDb()
    .prepare(
      `SELECT f.*,
              (SELECT COUNT(*) FROM user_circle_binding b WHERE b.code = f.code) AS boundUsersCount
         FROM circle_firms f
        ORDER BY f.code ASC`
    )
    .all() as Array<CircleFirmRow & { boundUsersCount: number }>;
  return rows.map((r) => ({
    ...rowToFirm(r),
    boundUsersCount: r.boundUsersCount,
  }));
}

// ─── 后台管理（新建 / 修改 / 绑定用户） ────────────────────────────────

export type CircleFirmInputError =
  | 'invalid_code'
  | 'invalid_name'
  | 'invalid_country'
  | 'invalid_suffix'
  | 'invalid_margin'
  | 'invalid_cents'
  | 'invalid_enabled'
  | 'invalid_expires_at';

export interface CircleFirmPatch {
  name?: string;
  country?: string;
  suffix?: string;
  marginMultiplier?: number;
  freeDeepseekCents?: number;
  enabled?: boolean;
  expiresAt?: string | null;
}

const MAX_FREE_DEEPSEEK_CENTS = 10_000_000;

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

/** 校验后台提交的字段（只校验出现的字段）。margin 1.0 = 不加价，上限 10。 */
export function parseCircleFirmPatch(
  body: Record<string, unknown>
): { ok: true; patch: CircleFirmPatch } | { ok: false; error: CircleFirmInputError } {
  const patch: CircleFirmPatch = {};
  if (body.name !== undefined) {
    const v = text(body.name, 120);
    if (!v) return { ok: false, error: 'invalid_name' };
    patch.name = v;
  }
  if (body.country !== undefined) {
    const v = text(body.country, 60);
    if (!v) return { ok: false, error: 'invalid_country' };
    patch.country = v;
  }
  if (body.suffix !== undefined) {
    const v = text(body.suffix, 40);
    if (!v || /[()]/.test(v)) return { ok: false, error: 'invalid_suffix' };
    patch.suffix = v;
  }
  if (body.marginMultiplier !== undefined) {
    const v = typeof body.marginMultiplier === 'number' ? body.marginMultiplier : Number.NaN;
    if (!Number.isFinite(v) || v < 1 || v > 10) return { ok: false, error: 'invalid_margin' };
    patch.marginMultiplier = v;
  }
  if (body.freeDeepseekCents !== undefined) {
    const v = body.freeDeepseekCents;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > MAX_FREE_DEEPSEEK_CENTS) {
      return { ok: false, error: 'invalid_cents' };
    }
    patch.freeDeepseekCents = v;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return { ok: false, error: 'invalid_enabled' };
    patch.enabled = body.enabled;
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === '') patch.expiresAt = null;
    else {
      const ms = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : Number.NaN;
      if (!Number.isFinite(ms)) return { ok: false, error: 'invalid_expires_at' };
      patch.expiresAt = new Date(ms).toISOString();
    }
  }
  return { ok: true, patch };
}

/** 邀请码：大写字母、数字、连字符，2–40 位。 */
export function isValidCircleCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,39}$/.test(code);
}

export function createCircleFirm(
  code: string,
  patch: CircleFirmPatch,
  nowIso = new Date().toISOString()
): { ok: true; firm: CircleFirm } | { ok: false; error: 'code_exists' } {
  return withTransaction((db) => {
    if (db.prepare('SELECT 1 FROM circle_firms WHERE code = ?').get(code)) {
      return { ok: false as const, error: 'code_exists' as const };
    }
    db.prepare(
      `INSERT INTO circle_firms
         (code, country, name, suffix, marginMultiplier, freeDeepseekCents, enabled, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      code,
      patch.country!,
      patch.name!,
      patch.suffix!,
      patch.marginMultiplier ?? 1.0,
      patch.freeDeepseekCents ?? 0,
      patch.enabled === false ? 0 : 1,
      patch.expiresAt ?? null,
      nowIso,
      nowIso
    );
    return { ok: true as const, firm: getCircleFirm(code)! };
  });
}

export function updateCircleFirm(code: string, patch: CircleFirmPatch, nowIso = new Date().toISOString()): CircleFirm | null {
  const existing = getCircleFirm(code);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  getDb()
    .prepare(
      `UPDATE circle_firms
          SET name = ?, country = ?, suffix = ?, marginMultiplier = ?, freeDeepseekCents = ?,
              enabled = ?, expiresAt = ?, updatedAt = ?
        WHERE code = ?`
    )
    .run(next.name, next.country, next.suffix, next.marginMultiplier, next.freeDeepseekCents,
      next.enabled ? 1 : 0, next.expiresAt, nowIso, existing.code);
  return getCircleFirm(code)!;
}

/** 某律所已绑定的用户及其 DeepSeek 专用额度剩余。 */
export function listCircleFirmUsers(rawCode: string, nowIso = new Date().toISOString()) {
  const code = normalizeCircleCode(rawCode);
  const db = getDb();
  const bindings = db
    .prepare('SELECT userId, boundAt FROM user_circle_binding WHERE code = ? ORDER BY boundAt DESC')
    .all(code) as Array<{ userId: string; boundAt: string }>;
  const remaining = new Map(
    (db
      .prepare(
        `SELECT b.userId, COALESCE(SUM(l.remainingCents), 0) AS cents
           FROM user_circle_binding b
           JOIN credit_lots l ON l.userId = b.userId
          WHERE b.code = ? AND l.sourceKind = ? AND l.remainingCents > 0
            AND (l.expiresAt IS NULL OR l.expiresAt > ?)
          GROUP BY b.userId`
      )
      .all(code, CIRCLE_DEEPSEEK_SOURCE_KIND, nowIso) as Array<{ userId: string; cents: number }>).map((r) => [r.userId, r.cents])
  );
  const ids = bindings.map((b) => b.userId);
  const usernames = mapUsernamesByIds(ids);
  const displayNames = mapDisplayNamesByIds(ids);
  return bindings.map((b) => ({
    userId: b.userId,
    username: usernames.get(b.userId) ?? null,
    displayName: displayNames.get(b.userId) ?? null,
    boundAt: b.boundAt,
    deepseekRemainingCents: remaining.get(b.userId) ?? 0,
  }));
}
