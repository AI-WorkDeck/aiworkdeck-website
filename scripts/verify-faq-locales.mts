/**
 * W22: every locale gets a translated FAQ with the same structure as the English source.
 *   npx tsx --tsconfig tsconfig.json scripts/verify-faq-locales.mts
 */
import assert from 'node:assert/strict';
const { i18n } = await import('@/i18n-config');
const { communityFaq } = await import('@/lib/community-faq');
const en = communityFaq('en');
let n = 0;
for (const lang of i18n.locales) {
  if (lang === 'en' || lang === 'zh' || lang === 'zh-hant') continue;
  const t = communityFaq(lang);
  assert.notEqual(t.title, en.title, `${lang}: FAQ is translated`);
  for (const k of Object.keys(en) as (keyof typeof en)[]) if (k !== 'sections') assert.ok(typeof t[k] === 'string' && (t[k] as string).trim(), `${lang}: ${k}`);
  assert.equal(t.sections.length, en.sections.length, `${lang}: sections`);
  en.sections.forEach((s, i) => {
    const ts = t.sections[i];
    assert.equal(ts.id, s.id, `${lang}: section ${s.id}`);
    assert.equal(ts.items.length, s.items.length, `${lang}: items in ${s.id}`);
    s.items.forEach((q, j) => {
      const tq = ts.items[j];
      assert.equal(tq.id, q.id, `${lang}: item ${q.id}`);
      assert.ok(tq.q && tq.a && tq.a !== q.a, `${lang}: ${q.id} translated`);
      assert.equal(tq.href ?? null, q.href ? q.href.replace(/^\/en/, `/${lang}`) : null, `${lang}: ${q.id} link stays in the visitor's language`);
      assert.equal((tq.a.match(/\n\n/g) || []).length, (q.a.match(/\n\n/g) || []).length, `${lang}: ${q.id} paragraphs`);
    });
  });
  if (lang !== 'ja') assert.ok(!/[一-鿿]/.test(JSON.stringify(t)), `${lang}: no Chinese characters`);
  n++;
}
console.log(`PASS FAQ translated for ${n} locales with the English structure, links and paragraphs`);
