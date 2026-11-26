/**
 * Round-2 first-time-lawyer fixes (W23, W27, W30, W31, W34 is in verify-legal-redirects).
 *   npx tsx --tsconfig tsconfig.json scripts/verify-w-round2.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { i18n } = await import('@/i18n-config');
const dict = (l: string) => JSON.parse(fs.readFileSync(`dictionaries/${l}.json`, 'utf8'));
// W30: the password field has its own label; the tab label (密码登录) is not reused for it
for (const l of i18n.locales) assert.ok(dict(l).authPage.passwordLabel, `${l}: authPage.passwordLabel`);
assert.equal(dict('zh').authPage.passwordLabel, '密码');
assert.equal(dict('zh-hant').authPage.passwordLabel, '密碼');
const auth = fs.readFileSync('app/[lang]/account/AuthForms.tsx', 'utf8');
assert.match(auth, /t\.newPassword : t\.passwordLabel/);
assert.equal((auth.match(/t\.bqtScanTab/g) || []).length, 2, 'scan sign-in appears as the tab (and title) only, not again as a footer link');
// W23: membership rates name the site's currency through {unit}, never a hard-coded CNY
for (const l of i18n.locales) {
  const m = dict(l).membership;
  for (const k of ['subtitle', 'algoTopup', 'algoSpend']) {
    assert.ok(m[k].includes('{unit}'), `${l}: membership.${k} uses {unit}`);
    assert.ok(!/CNY/.test(m[k]), `${l}: membership.${k} has no literal CNY`);
  }
  assert.ok(m.unitCny && m.unitUsd, `${l}: membership units`);
}
assert.match(fs.readFileSync('app/[lang]/membership/page.tsx', 'utf8'), /SITE_ID === 'intl' \? t\.unitUsd : t\.unitCny/);
// W27: the Pro-allowance footnote is cn-only
assert.match(fs.readFileSync('components/pricing/PricingPageView.tsx', 'utf8'), /t\.heroAside && !isIntl &&/);
// W31: German terms heading is nominative
for (const f of ['content/legal/terms-de.ts', 'content/legal/terms-intl-de.ts']) assert.match(fs.readFileSync(f, 'utf8'), /"title": "Allgemeine Geschäftsbedingungen"/);
assert.ok(!fs.readFileSync('dictionaries/de.json', 'utf8').includes('"terms": "Allgemeinen'), 'de standalone terms label is nominative');
// W26: a single chart board is centred, not stranded in a two-column grid; the lead promises no hidden boards
const charts = fs.readFileSync('app/[lang]/skills/charts/page.tsx', 'utf8');
assert.match(charts, /filter\(Boolean\)\.length > 1 \? 'lg:grid-cols-2' : 'mx-auto max-w-3xl'/);
for (const l of i18n.locales) assert.ok(!/open seats|Open seat/i.test(dict(l).chartsPage.lead), `${l}: charts lead`);
// W32: the floating request button sits on the logical end side and the page leaves room for it on phones
assert.match(fs.readFileSync('components/FeatureRequestWidget.tsx', 'utf8'), /fixed bottom-4 end-4/);
assert.match(fs.readFileSync('app/[lang]/layout.tsx', 'utf8'), /min-h-screen flex-col pb-16 md:pb-0/);
// W35: the home hero links the no-install web version (plain link, no engine prefetch)
const home = fs.readFileSync('components/home/IdeHome.tsx', 'utf8');
assert.match(home, /href=\{`\/web\/\?lang=\$\{lang\}`\}/);
assert.ok(!/WebVersionLink/.test(home), 'home does not prefetch the engine');
console.log('PASS round-2 fixes: W23, W26, W27, W30, W31, W32, W35');
