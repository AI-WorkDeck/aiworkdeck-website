/**
 * Short legal URLs (/<lang>/privacy, /<lang>/terms) redirect permanently to /<lang>/legal/… in every locale (CEO, 11-26).
 *   npx tsx --tsconfig tsconfig.json scripts/verify-legal-redirects.mts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { i18n } = await import('@/i18n-config');

const mod: any = await import('../next.config');
const nextConfig = mod.default?.redirects ? mod.default : mod.default.default;
const redirects: { source: string; destination: string; permanent?: boolean }[] = await nextConfig.redirects();
for (const page of ['privacy', 'terms']) {
  assert.ok(fs.existsSync(`app/[lang]/legal/${page}`), `legal/${page} page exists`);
  const r = redirects.find(x => x.source.endsWith(`/${page}`) && x.destination === `/:lang/legal/${page}`);
  assert.ok(r, `redirect for /:lang/${page}`);
  assert.equal(r.permanent, true, `${page} redirect is permanent (308)`);
  const group = /^\/:lang\((.+)\)\//.exec(r.source)![1];
  const re = new RegExp(`^(?:${group})$`);
  for (const lang of i18n.locales) assert.ok(re.test(lang), `${page}: locale ${lang} is covered`);
  assert.ok(!re.test('legal') && !re.test('api'), `${page}: does not catch non-locale segments`);
}
console.log(`PASS /<lang>/privacy and /<lang>/terms -> 308 /<lang>/legal/… for all ${i18n.locales.length} locales`);
