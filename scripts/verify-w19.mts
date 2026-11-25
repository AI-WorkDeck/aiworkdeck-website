/**
 * POLISH W19: the sign-in card is titled "Sign in" (not the "Password" tab label), and the password rule
 * ("min 8 chars") only appears where a password is set, never on sign-in.
 *   npx tsx scripts/verify-w19.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('app/[lang]/account/AuthForms.tsx', 'utf8');
assert.match(src, /mode === 'password' \? t\.loginTitle :/, 'password sign-in card uses the Sign in title');
assert.match(src, /newPassword \? t\.newPassword : t\.passwordTab/, 'sign-in password label is plain "Password"');
assert.ok(!/\bt\.password\b/.test(src), 'no "Password (min 8 chars)" label on sign-in');
for (const f of fs.readdirSync('dictionaries')) {
  const a = JSON.parse(fs.readFileSync(`dictionaries/${f}`, 'utf8')).authPage;
  assert.ok(!('password' in a), `${f}: unused authPage.password removed`);
  assert.ok(a.loginTitle && a.passwordTab && a.passwordRule, `${f}: loginTitle, passwordTab and passwordRule present`);
}
console.log('PASS W19 sign-in card title and password label');
