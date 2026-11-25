// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Pricing cards stack their buttons (POLISH X35): side by side, "Top up and unlock" overflowed the ~350 px
// card by 26 px in English and 146 px in German at 1440 px (measured on production 2026-11-25).
import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const card of ['OpenSourceCard', 'ProCard', 'TeamCard']) {
  const src = fs.readFileSync(`components/pricing/${card}.tsx`, 'utf8');
  const footer = /<CardFooter className="([^"]*)"/.exec(src)?.[1] ?? '';
  assert.ok(footer.includes('flex-col'), `${card} footer stacks its buttons`);
  assert.ok(!/(^|\s)(sm|md|lg|xl):flex-row/.test(footer), `${card} footer never switches to a row inside the narrow card`);
}
console.log('PASS pricing card buttons stack in every card');
