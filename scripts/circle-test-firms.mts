/**
 * Synthetic Circle Alliance firms for tests. The real invitation codes live only in production's
 * circle_firms table (owner, 11-27): migration 44 seeds nothing, so tests insert these themselves.
 */
import type Database from 'better-sqlite3';

export const TEST_CIRCLE_FIRMS: Array<[string, string, string, string]> = [
  ['KW-QA01-2026', 'Indonesia', 'Indonesia: ABNR', 'ABNR'],
  ['KW-QA02-2026', 'Indonesia', 'Indonesia: S&T', 'S&T'],
  ['KW-QA03-2026', 'Malaysia', 'Malaysia: Skrine', 'Skrine'],
  ['KW-QA04-2026', 'Malaysia', 'Malaysia: ZRP', 'ZRP'],
  ['KW-QA05-2026', 'Thailand', 'Thailand: Weerawong', 'Weerawong'],
  ['KW-QA06-2026', 'Thailand', 'Thailand: Chandler MHM', 'Chandler MHM'],
  ['KW-QA07-2026', 'Vietnam', 'Vietnam: Frasers', 'Frasers'],
  ['KW-QA08-2026', 'Vietnam', 'Vietnam: VILAF', 'VILAF'],
  ['KW-QA09-2026', 'Singapore', 'Singapore: ICONLAW', 'ICONLAW'],
  ['KW-QA10-2026', 'Singapore', 'Singapore: KWM SG pilot', 'KWM SG'],
];

export function seedTestCircleFirms(db: Database.Database) {
  const now = new Date().toISOString();
  const ins = db.prepare(`
    INSERT OR IGNORE INTO circle_firms
      (code, country, name, suffix, marginMultiplier, freeDeepseekCents, enabled, expiresAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 1.0, 2000, 1, NULL, ?, ?)
  `);
  for (const [code, country, name, suffix] of TEST_CIRCLE_FIRMS) ins.run(code, country, name, suffix, now, now);
}
