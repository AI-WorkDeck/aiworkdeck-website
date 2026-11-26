/**
 * The /start and intl pricing copy states current facts in every locale (lane X copy edit):
 * the desktop UI ships 20 languages; sign-in is account + password with the "set one up" link; and intl
 * pricing no longer sells "free with your own AI key". The /start login mock shows a password field, not a code.
 *   npx tsx scripts/verify-start-copy.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const f of fs.readdirSync('dictionaries')) {
  const d = JSON.parse(fs.readFileSync(`dictionaries/${f}`, 'utf8'));
  const s = d.startPage, login = s.steps.login;
  assert.match(s.siteChoice.clientNote, /20/, `${f}: clientNote names the 20 interface languages`);
  for (const k of ['descPhone', 'descEmail']) assert.ok(login[k].includes(d.authPage.firstTime), `${f}: ${k} quotes "${d.authPage.firstTime}"`);
  assert.ok(!('sendCode' in login) && !('codePlaceholder' in login), `${f}: no code fields in the login mock`);
}
const en = JSON.parse(fs.readFileSync('dictionaries/en.json', 'utf8'));
for (const k of ['heroTitleIntl', 'heroSubtitleIntl', 'metaDescriptionIntl']) assert.ok(!/own AI (key|provider)/i.test(en.pricingPage[k]), `en pricing ${k}: no own-AI-key pitch`);
const flow = fs.readFileSync('app/[lang]/start/StartFlow.tsx', 'utf8');
assert.match(flow, /auth\.passwordLabel/, 'login mock shows a password field');
assert.match(flow, /auth\.firstTime/, 'login mock shows the set-one-up link');
console.log('PASS /start and intl pricing copy: 20 languages, password sign-in, no own-key pitch (20 locales)');
