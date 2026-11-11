// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 包晴天积分通道的后台只读视图：通道状态、绑定律师、扣减台账与统计。
 * 写操作（设置、重发、重扣、放弃）全部走 lib/bqt-member.ts 的现成函数，这里不改任何状态。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isAdminRequest } from './admin';
import { SITE_ID } from './site-config';
import { getDb } from './db';
import { getAiConfig } from './ai-config';
import { clientIp } from './login-throttle';
import { mapDisplayNamesByIds, mapUsernamesByIds } from './users';
import {
  bqtEntitlementSnapshot, bqtMemberEnv, bqtTunnelActive, formatPoints, getBqtSettings, listBqtSettingsAudit,
  type BqtConsumeRow, type ConsumeState,
} from './bqt-member';

/** 每个包晴天后台接口的门：先鉴权，再要求是国内站（包晴天只在国内站运行）。 */
export function bqtAdminGuard(request: NextRequest): NextResponse | null {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (SITE_ID !== 'cn') return NextResponse.json({ error: 'bqt_cn_only' }, { status: 404 });
  return null;
}

/** 后台共用一个口令，留痕只能落到来源 IP。 */
export function adminActor(request: NextRequest): string {
  return `admin@${clientIp(request) || 'unknown'}`;
}

function maskMiddle(v: string, keepStart: number, keepEnd: number): string {
  if (v.length <= keepStart + keepEnd) return '*'.repeat(v.length);
  return v.slice(0, keepStart) + '*'.repeat(Math.min(6, v.length - keepStart - keepEnd)) + v.slice(v.length - keepEnd);
}

/** 连接状态：绝不返回 appSecret，只说有没有配。 */
export function bqtConnectionView() {
  const baseUrl = process.env.AWD_BQT_MEMBER_BASE_URL?.trim().replace(/\/+$/, '') || null;
  const appId = process.env.AWD_BQT_MEMBER_APP_ID?.trim() || null;
  return {
    baseUrl,
    appIdMasked: appId ? maskMiddle(appId, 3, 2) : null,
    secretConfigured: !!process.env.AWD_BQT_MEMBER_APP_SECRET?.trim(),
    envComplete: !!bqtMemberEnv(),
    tunnelActive: bqtTunnelActive(),
  };
}

export function bqtAdminOverview() {
  const settings = getBqtSettings();
  const globalMargin = getAiConfig().marginMultiplier;
  return {
    settings,
    globalMargin,
    effectiveMargin: settings.marginMultiplier ?? globalMargin,
    connection: bqtConnectionView(),
    audit: listBqtSettingsAudit(50),
    stats: bqtConsumeStats(),
  };
}

/** 上海时间的今日 0 点与本月 1 日 0 点（UTC ISO）。包晴天只在国内站。 */
/** 列表用的 id → { username, displayName }。 */
export function mapUsersBriefByIds(ids: string[]): Map<string, { username: string; displayName: string }> {
  const names = mapUsernamesByIds(ids);
  const display = mapDisplayNamesByIds(ids);
  return new Map([...names].map(([id, username]) => [id, { username, displayName: display.get(id) ?? username }]));
}

export function shanghaiCutoffs(now = Date.now()) {
  const sh = new Date(now + 8 * 3600_000);
  const y = sh.getUTCFullYear(), m = sh.getUTCMonth(), d = sh.getUTCDate();
  return {
    today: new Date(Date.UTC(y, m, d) - 8 * 3600_000).toISOString(),
    month: new Date(Date.UTC(y, m, 1) - 8 * 3600_000).toISOString(),
  };
}

/** 过了这么久还没发成的 pending/sending 进待处理队列（自动补发间隔是 30 秒）。 */
export const STALE_PENDING_MS = 10 * 60_000;

export function bqtConsumeStats(now = Date.now()) {
  const db = getDb();
  const { today, month } = shanghaiCutoffs(now);
  const sum = (since: string) => {
    const r = db.prepare(`SELECT COALESCE(SUM(pointsHundredths),0) p, COALESCE(SUM(cents),0) c, COUNT(*) n
      FROM bqt_consume WHERE state='succeeded' AND createdAt >= ?`).get(since) as { p: number; c: number; n: number };
    return { points: formatPoints(r.p), pointsHundredths: r.p, cents: r.c, count: r.n };
  };
  const staleCutoff = new Date(now - STALE_PENDING_MS).toISOString();
  const q = db.prepare(`SELECT
      COALESCE(SUM(state='failed'),0) failed,
      COALESCE(SUM(state IN ('pending','sending') AND updatedAt < ?),0) stale,
      COALESCE(SUM(state IN ('pending','sending')),0) pending,
      COALESCE(SUM(CASE WHEN state IN ('pending','sending','failed') THEN cents ELSE 0 END),0) outstandingCents
    FROM bqt_consume`).get(staleCutoff) as { failed: number; stale: number; pending: number; outstandingCents: number };
  return { today: sum(today), month: sum(month), ...q };
}

export interface ConsumeFilter { state?: ConsumeState | 'attention'; q?: string; from?: string; to?: string; page?: number }
export const CONSUME_PAGE_SIZE = 50;
const STATES: ConsumeState[] = ['pending', 'sending', 'succeeded', 'failed', 'waived'];

export function parseConsumeFilter(sp: URLSearchParams): ConsumeFilter {
  const state = sp.get('state') ?? '';
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    state: state === 'attention' || (STATES as string[]).includes(state) ? (state as ConsumeFilter['state']) : undefined,
    q: sp.get('q')?.trim().slice(0, 80) || undefined,
    from: date(sp.get('from')),
    to: date(sp.get('to')),
    page: Math.max(1, Math.min(10_000, Number(sp.get('page')) || 1)),
  };
}

/** YYYY-MM-DD（上海日历日）→ 该日 0 点的 UTC ISO。 */
function shanghaiDayStart(day: string, plusDays = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + plusDays) - 8 * 3600_000).toISOString();
}

export function listBqtConsumes(f: ConsumeFilter, now = Date.now()) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.state === 'attention') {
    where.push("(state='failed' OR (state IN ('pending','sending') AND updatedAt < ?))");
    args.push(new Date(now - STALE_PENDING_MS).toISOString());
  } else if (f.state) { where.push('state = ?'); args.push(f.state); }
  if (f.q) { where.push("(userId = ? OR lawyerId = ? OR requestNo LIKE ? ESCAPE '\\')"); args.push(f.q, f.q, `%${f.q.replace(/[%_\\]/g, '\\$&')}%`); }
  if (f.from) { where.push('createdAt >= ?'); args.push(shanghaiDayStart(f.from)); }
  if (f.to) { where.push('createdAt < ?'); args.push(shanghaiDayStart(f.to, 1)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) n FROM bqt_consume ${clause}`).get(...args) as { n: number }).n;
  const page = f.page ?? 1;
  const rows = db.prepare(`SELECT * FROM bqt_consume ${clause} ORDER BY createdAt DESC, requestNo DESC LIMIT ? OFFSET ?`)
    .all(...args, CONSUME_PAGE_SIZE, (page - 1) * CONSUME_PAGE_SIZE) as BqtConsumeRow[];
  const users = mapUsersBriefByIds(rows.map(r => r.userId));
  return {
    total, page, pageSize: CONSUME_PAGE_SIZE,
    rows: rows.map(r => ({ ...r, points: formatPoints(r.pointsHundredths), user: users.get(r.userId) ?? null })),
  };
}

export const LAWYER_PAGE_SIZE = 30;

function maskMobile(m: string | null): string | null {
  return m ? maskMiddle(m, 3, 4) : null;
}

/** 绑定律师（扫码绑定的包晴天账号）+ 本地权益快照 + 欠账。users 在 users.json，只能内存里拼。 */
export function listBqtLawyers(opts: { q?: string; page?: number }) {
  const db = getDb();
  const bindings = db.prepare('SELECT * FROM bqt_user_binding ORDER BY boundAt DESC').all() as Array<{
    userId: string; bqtUserId: string; mobile: string | null; userName: string | null; userType: string; boundAt: string; updatedAt: string;
  }>;
  const users = mapUsersBriefByIds(bindings.map(b => b.userId));
  const q = opts.q?.trim().toLowerCase();
  const matched = q
    ? bindings.filter(b => {
      const u = users.get(b.userId);
      return [b.bqtUserId, b.mobile, b.userName, b.userId, u?.username, u?.displayName].some(v => v?.toLowerCase().includes(q));
    })
    : bindings;
  const page = Math.max(1, opts.page ?? 1);
  const slice = matched.slice((page - 1) * LAWYER_PAGE_SIZE, page * LAWYER_PAGE_SIZE);
  const owed = new Map<string, { cents: number; failed: number }>();
  if (slice.length) {
    const rows = db.prepare(`SELECT userId, COALESCE(SUM(cents),0) cents, COALESCE(SUM(state='failed'),0) failed FROM bqt_consume
      WHERE state IN ('pending','sending','failed') AND userId IN (${slice.map(() => '?').join(',')}) GROUP BY userId`)
      .all(...slice.map(b => b.userId)) as Array<{ userId: string; cents: number; failed: number }>;
    for (const r of rows) owed.set(r.userId, { cents: r.cents, failed: r.failed });
  }
  return {
    total: matched.length, page, pageSize: LAWYER_PAGE_SIZE,
    rows: slice.map(b => {
      const snap = bqtEntitlementSnapshot(b.bqtUserId);
      return {
        userId: b.userId, lawyerId: b.bqtUserId, bqtName: b.userName, mobileMasked: maskMobile(b.mobile), userType: b.userType, boundAt: b.boundAt,
        user: users.get(b.userId) ?? null,
        entitlement: snap ? { ...snap, points: formatPoints(snap.usablePointsHundredths) } : null,
        outstandingCents: owed.get(b.userId)?.cents ?? 0,
        failedCount: owed.get(b.userId)?.failed ?? 0,
      };
    }),
  };
}
