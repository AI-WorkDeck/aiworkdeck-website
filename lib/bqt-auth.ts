// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import crypto from 'crypto';
import { getDb, withTransaction } from './db';
import { getAiConfig } from './ai-config';
import { grantCredits } from './credits';
import { bqtChargeTarget } from './bqt-member';
import { createExternalIdentityUser, findOrCreateByPhone, findUserById, isDefaultDisplayName, isDeletedUser, updateProfile, type User } from './users';

export const BQT_QINGTIAN_SOURCE_KIND = 'bqt_qingtian';
export function bqtScanEnabled(): boolean {
  return process.env.AWD_BQT_SCAN_ENABLED === 'true' && !!process.env.AWD_BQT_SCAN_AK?.trim() && !!process.env.AWD_BQT_SCAN_SK?.trim();
}

export const BQT_QR_TTL_MS = 5 * 60 * 1000;

/** Callback credentials remain in the deployment environment, never in source. */
function resolveSecretForAk(ak: string): string | undefined {
  const envAk = process.env.AWD_BQT_SCAN_AK?.trim();
  const envSk = process.env.AWD_BQT_SCAN_SK?.trim();
  return envAk && envSk && ak === envAk ? envSk : undefined;
}

/**
 * 对应 bqt-cloud SignJinduUtil.getSign：
 * 1. 取除 sign 以外所有非空参数
 * 2. 按参数名 ASCII 升序排列，拼接为 k1=v1&k2=v2
 * 3. HMAC-SHA256(str, sk) 转大写 Hex
 */
export function computeBqtJinduSign(params: Record<string, string | undefined>, sk: string): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
    .sort();
  const canonical = keys.map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHmac('sha256', sk).update(canonical, 'utf8').digest('hex').toUpperCase();
}

export function verifyBqtJinduSign(params: Record<string, string | undefined>): boolean {
  const ak = (params.ak ?? '').trim();
  const sign = (params.sign ?? '').trim().toUpperCase();
  if (!ak || !sign) return false;
  const timestamp = Number(params.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > BQT_QR_TTL_MS) return false;
  const sk = resolveSecretForAk(ak);
  if (!sk) return false;
  const expected = computeBqtJinduSign(params, sk);
  if (expected.length !== sign.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sign, 'utf8'));
}

export interface BqtScanSession {
  qrid: string;
  timestamp: string;
  source: string;
  qrContent: string;
  pollToken: string;
  expiresAt: number;
}

export function createBqtScanSession(sourceOverride?: string): BqtScanSession {
  const now = Date.now();
  const qrid = crypto.randomUUID().replace(/-/g, '');
  const timestamp = String(now);
  const pollToken = crypto.randomBytes(32).toString('hex');
  const pollTokenHash = crypto.createHash('sha256').update(pollToken).digest('hex');
  // 默认使用 bqt-laywer 全版本支持的 source（可通过 AWD_BQT_SCAN_SOURCE 配置为 aiworkdeck-prd 或 jindu）
  const source =
    sourceOverride?.trim() ||
    process.env.AWD_BQT_SCAN_SOURCE?.trim() ||
    'aiworkdeck-prd';
  const expiresAt = now + BQT_QR_TTL_MS;

  const db = getDb();
  // 顺手清理超过 1 小时的历史会话行
  db.prepare('DELETE FROM bqt_scan_session WHERE expiresAt < ?').run(now - 3600_000);
  db.prepare(
    `INSERT INTO bqt_scan_session (qrid, timestamp, source, status, createdAt, expiresAt, pollTokenHash)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)`
  ).run(qrid, timestamp, source, now, expiresAt, pollTokenHash);

  const qrContent = JSON.stringify({ qrid, timestamp, source });
  return { qrid, timestamp, source, qrContent, expiresAt, pollToken };
}

export function currentShanghaiMonthKey(now = new Date()): string {
  const shanghaiMs = now.getTime() + 8 * 3600_000;
  const d = new Date(shanghaiMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function endOfShanghaiMonthIso(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  // 下月 1 日 00:00:00 (UTC+8) 减 1 毫秒
  const nextMonthStartUtcMs = Date.UTC(year, month, 1, 0, 0, 0, 0) - 8 * 3600_000;
  return new Date(nextMonthStartUtcMs - 1).toISOString();
}

export interface BqtQingtianStatus {
  isBqtLawyer: true;
  bqtUserId: string;
  userName: string | null;
  monthKey: string;
  monthlyCoins: number;
  remainingCoins: number;
  remainingCents: number;
  centsPerCoin: number;
  creditsPerCoin: number;
  expiresAt: string;
}

export function ensureBqtMonthlyQingtianGrant(
  userId: string,
  now = new Date()
): { granted: boolean; monthKey: string; coins: number; amountCents: number } | null {
  const db = getDb();
  const binding = db
    .prepare('SELECT userId, bqtUserId FROM bqt_user_binding WHERE userId = ?')
    .get(userId) as { userId: string; bqtUserId: string } | undefined;
  if (!binding) return null;
  // 包晴天积分通道开着时不再发本站晴天币：花费一律扣包晴天积分。
  if (bqtChargeTarget(userId, db)) return null;

  const monthKey = currentShanghaiMonthKey(now);
  const existing = db
    .prepare('SELECT coins, amountCents FROM bqt_monthly_grant WHERE userId = ? AND monthKey = ?')
    .get(userId, monthKey) as { coins: number; amountCents: number } | undefined;
  if (existing) {
    return {
      granted: false,
      monthKey,
      coins: existing.coins,
      amountCents: existing.amountCents,
    };
  }

  const { bqtMonthlyQingtianCoins, centsPerQingtianCoin } = getAiConfig();
  const coins = Math.max(1, Math.round(bqtMonthlyQingtianCoins));
  const amountCents = Math.max(1, Math.round(coins * centsPerQingtianCoin));
  const nowIso = now.toISOString();
  const expiresAt = endOfShanghaiMonthIso(monthKey);

  return withTransaction((tx) => {
    const again = tx
      .prepare('SELECT coins, amountCents FROM bqt_monthly_grant WHERE userId = ? AND monthKey = ?')
      .get(userId, monthKey) as { coins: number; amountCents: number } | undefined;
    if (again) {
      return {
        granted: false,
        monthKey,
        coins: again.coins,
        amountCents: again.amountCents,
      };
    }

    // 清零往月未用完的晴天币批次（晴天币按月重置、当月有效）
    tx.prepare(
      `UPDATE credit_lots
          SET remainingCents = 0
        WHERE userId = ?
          AND sourceKind = ?
          AND remainingCents > 0`
    ).run(userId, BQT_QINGTIAN_SOURCE_KIND);

    const ledger = grantCredits(tx, {
      userId,
      pool: 'reward',
      amountCents,
      ledgerKind: 'gift',
      sourceKind: BQT_QINGTIAN_SOURCE_KIND,
      nowIso,
      expiresAt,
      meta: {
        bqtQingtianCoins: coins,
        centsPerQingtianCoin,
        monthKey,
      },
    });

    tx.prepare(
      `INSERT INTO bqt_monthly_grant (userId, monthKey, coins, amountCents, ledgerId, grantedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, monthKey, coins, amountCents, ledger.id, nowIso);

    return {
      granted: true,
      monthKey,
      coins,
      amountCents,
    };
  });
}

export function getBqtQingtianStatus(userId: string, now = new Date()): BqtQingtianStatus | null {
  const db = getDb();
  const binding = db
    .prepare('SELECT * FROM bqt_user_binding WHERE userId = ?')
    .get(userId) as
    | {
        userId: string;
        bqtUserId: string;
        mobile: string | null;
        userName: string | null;
        userType: string;
      }
    | undefined;
  if (!binding) return null;
  // 通道开着时晴天币一节整体由包晴天会员（bqtMember）取代。
  if (bqtChargeTarget(userId, db)) return null;

  const grantInfo = ensureBqtMonthlyQingtianGrant(userId, now);
  const monthKey = grantInfo?.monthKey ?? currentShanghaiMonthKey(now);
  const { bqtMonthlyQingtianCoins, centsPerQingtianCoin } = getAiConfig();
  const centsPerCoin = Math.max(1, Math.round(centsPerQingtianCoin));
  const nowIso = now.toISOString();

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(remainingCents), 0) AS total
         FROM credit_lots
        WHERE userId = ?
          AND sourceKind = ?
          AND remainingCents > 0
          AND (expiresAt IS NULL OR expiresAt > ?)`
    )
    .get(userId, BQT_QINGTIAN_SOURCE_KIND, nowIso) as { total: number };

  const remainingCents = row.total;
  const remainingCoins = Math.floor(remainingCents / centsPerCoin);
  const monthlyCoins = grantInfo?.coins ?? bqtMonthlyQingtianCoins;

  return {
    isBqtLawyer: true,
    bqtUserId: binding.bqtUserId,
    userName: binding.userName,
    monthKey,
    monthlyCoins,
    remainingCoins,
    remainingCents,
    centsPerCoin,
    creditsPerCoin: Number((centsPerCoin / 100).toFixed(4)),
    expiresAt: endOfShanghaiMonthIso(monthKey),
  };
}

export interface BqtCallbackInput {
  qrid: string;
  timestamp?: string;
  bqtUserId: string;
  userType: string;
  userName?: string;
  mobile?: string;
}

export function completeBqtScanCallback(
  input: BqtCallbackInput
): { code: number; msg: string; userId?: string } {
  const qrid = (input.qrid ?? '').trim();
  const bqtUserId = (input.bqtUserId ?? '').trim();
  const userType = (input.userType ?? '').trim().toLowerCase();
  const userName = (input.userName ?? '').trim();
  const rawMobile = (input.mobile ?? '').trim().replace(/^\+?86/, '');

  if (!qrid || !bqtUserId) {
    return { code: 1, msg: 'invalid_request' };
  }

  const db = getDb();
  const session = db
    .prepare('SELECT * FROM bqt_scan_session WHERE qrid = ?')
    .get(qrid) as
    | {
        qrid: string;
        status: string;
        userId: string | null;
        expiresAt: number;
      }
    | undefined;

  if (!session) {
    return { code: 1, msg: 'bqt_qr_expired' };
  }
  const now = Date.now();
  if (now > session.expiresAt || session.status === 'expired') {
    db.prepare("UPDATE bqt_scan_session SET status = 'expired' WHERE qrid = ?").run(qrid);
    return { code: 1, msg: 'bqt_qr_expired' };
  }
  if (session.status === 'rejected') return { code: 1, msg: 'bqt_qr_expired' };
  if (session.status === 'confirmed' && session.userId) {
    return { code: 0, msg: 'ok', userId: session.userId };
  }

  if (userType !== 'lawyer' && userType !== '1') {
    db.prepare(
      "UPDATE bqt_scan_session SET status = 'rejected', errorCode = 'bqt_not_lawyer' WHERE qrid = ?"
    ).run(qrid);
    return { code: 1, msg: 'bqt_not_lawyer' };
  }

  // 1. 优先查已绑定的 userId
  let user: User | undefined;
  const existingByBqt = db
    .prepare('SELECT userId FROM bqt_user_binding WHERE bqtUserId = ?')
    .get(bqtUserId) as { userId: string } | undefined;
  if (existingByBqt) {
    const found = findUserById(existingByBqt.userId);
    if (!found || isDeletedUser(found)) return { code: 1, msg: 'bqt_identity_unavailable' };
    user = found;
  }

  // 2. 未绑定过则按手机号查找或建号
  if (!user) {
    user = /^1[3-9]\d{9}$/.test(rawMobile)
      ? findOrCreateByPhone(rawMobile).user
      : createExternalIdentityUser(userName);
  }

  const boundIdentity = db.prepare('SELECT bqtUserId FROM bqt_user_binding WHERE userId = ?').get(user.id) as { bqtUserId: string } | undefined;
  if (boundIdentity && boundIdentity.bqtUserId !== bqtUserId) return { code: 1, msg: 'bqt_identity_conflict' };

  // 3. 若展示名仍是默认打码号且包晴天传了律师姓名，自动更新展示名
  if (userName && isDefaultDisplayName(user)) {
    const updated = updateProfile(user.id, { displayName: userName.slice(0, 24) });
    if (updated.user) user = updated.user;
  }

  const nowIso = new Date(now).toISOString();
  withTransaction((tx) => {
    tx.prepare('DELETE FROM bqt_user_binding WHERE bqtUserId = ? AND userId != ?').run(bqtUserId, user!.id);
    tx.prepare(
      `INSERT INTO bqt_user_binding (userId, bqtUserId, mobile, userName, userType, boundAt, updatedAt)
       VALUES (?, ?, ?, ?, 'lawyer', ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         bqtUserId = excluded.bqtUserId,
         mobile = COALESCE(excluded.mobile, bqt_user_binding.mobile),
         userName = COALESCE(excluded.userName, bqt_user_binding.userName),
         userType = 'lawyer',
         updatedAt = excluded.updatedAt`
    ).run(user!.id, bqtUserId, rawMobile || null, userName || null, nowIso, nowIso);

    tx.prepare(
      `UPDATE bqt_scan_session
          SET status = 'confirmed',
              userId = ?,
              errorCode = NULL,
              confirmedAt = ?
        WHERE qrid = ?`
    ).run(user!.id, now, qrid);
  });

  ensureBqtMonthlyQingtianGrant(user.id, new Date(now));
  return { code: 0, msg: 'ok', userId: user.id };
}

export type PollBqtScanResult =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'rejected'; error: string }
  | { status: 'confirmed'; user: User; qingtian: BqtQingtianStatus | null };

export function pollBqtScanSession(qrid: string, pollToken: string): PollBqtScanResult {
  const clean = (qrid ?? '').trim();
  if (!clean) return { status: 'expired' };
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM bqt_scan_session WHERE qrid = ?')
    .get(clean) as
    | {
        qrid: string;
        status: string;
        userId: string | null;
        errorCode: string | null;
        expiresAt: number;
        consumedAt: number | null;
        pollTokenHash: string;
      }
    | undefined;
  if (!row || !/^[a-f0-9]{64}$/.test(pollToken || '') || crypto.createHash('sha256').update(pollToken).digest('hex') !== row.pollTokenHash) return { status: 'expired' };

  const now = Date.now();
  if (now > row.expiresAt) {
    db.prepare("UPDATE bqt_scan_session SET status = 'expired' WHERE qrid = ?").run(clean);
    return { status: 'expired' };
  }
  if (row.status === 'expired') return { status: 'expired' };
  if (row.status === 'rejected') {
    return { status: 'rejected', error: row.errorCode || 'bqt_not_lawyer' };
  }
  if (row.status === 'confirmed' && row.userId) {
    if (row.consumedAt) {
      return { status: 'expired' };
    }
    const changed = db
      .prepare('UPDATE bqt_scan_session SET consumedAt = ? WHERE qrid = ? AND consumedAt IS NULL')
      .run(now, clean).changes;
    if (!changed) return { status: 'expired' };
    const user = findUserById(row.userId);
    if (!user || isDeletedUser(user)) return { status: 'expired' };
    const qingtian = getBqtQingtianStatus(user.id, new Date(now));
    return { status: 'confirmed', user, qingtian };
  }
  return { status: 'pending' };
}
