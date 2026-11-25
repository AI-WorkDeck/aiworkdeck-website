/** FAQ links keep the visitor's language (zh-hant reads the zh text, other locales the en text). */
import assert from 'node:assert/strict';
const { communityFaq } = await import('@/lib/community-faq');
const { i18n } = await import('@/i18n-config');
for (const lang of i18n.locales) {
    const hrefs = communityFaq(lang).sections.flatMap(s => s.items).map(i => i.href).filter((h): h is string => !!h && h.startsWith('/'));
    assert.ok(hrefs.length > 0, `${lang}: FAQ has internal links`);
    for (const href of hrefs) assert.ok(href.startsWith(`/${lang}/`), `${lang}: ${href} keeps the visitor's language`);
}
assert.ok(communityFaq('zh-hant').sections.flatMap(s => s.items).some(i => i.href === '/zh-hant/legal/privacy'), 'zh-hant privacy link goes to the zh-hant page');
console.log('PASS FAQ links keep the visitor language in all locales');
