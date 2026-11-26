// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from '../db';
import { SITE_ID } from '../site-config';
import { bqtFunding } from '../bqt-ai';

export interface TurnCost {
  cents: number; currency: 'CNY' | 'USD'; calls: number; pending: number;
  subscriptionCents: number; walletCents: number; bqtCents: number;
}

/**
 * Q24: exact charge of one desktop chat turn, summed from the caller's own platform_ai_request rows.
 * Only settled rows count; released/refunded rows cost 0. `pending` counts calls not yet settled,
 * and the desktop shows the amount only when it is 0. An unknown tag (or another account's) is all
 * zeros, so the endpoint never reveals whether a tag exists.
 */
export function turnCost(userId: string, tag: string): TurnCost {
  const rows = getDb().prepare(`
    SELECT r.state, r.chargedCents, r.fundingJson,
           CAST(json_extract(l.meta, '$.subscriptionCents') AS INTEGER) AS subscriptionCents
      FROM platform_ai_request r LEFT JOIN wallet_ledger l ON l.id = r.settleLedgerId
     WHERE r.userId = ? AND r.turnTag = ?`).all(userId, tag) as
    { state: string; chargedCents: number | null; fundingJson: string; subscriptionCents: number | null }[];
  const out: TurnCost = { cents: 0, currency: SITE_ID === 'cn' ? 'CNY' : 'USD', calls: rows.length, pending: 0,
    subscriptionCents: 0, walletCents: 0, bqtCents: 0 };
  for (const r of rows) {
    if (r.state === 'reserved' || r.state === 'submitted' || r.state === 'usage_pending') { out.pending++; continue; }
    if (r.state !== 'settled') continue;
    const cents = r.chargedCents ?? 0;
    out.cents += cents;
    if (bqtFunding(r.fundingJson)) { out.bqtCents += cents; continue; }
    const sub = Math.min(cents, Math.max(0, r.subscriptionCents ?? 0));
    out.subscriptionCents += sub;
    out.walletCents += cents - sub;
  }
  return out;
}
