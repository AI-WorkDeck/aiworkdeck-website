/** zh-hant visitors get Traditional text in modules that carry their own zh copy: tier names and /updates (Q12). */
import assert from 'node:assert/strict';
const { tierDisplayName } = await import('@/lib/membership-display');
const { MEMBERSHIP_TIERS } = await import('@/lib/membership');
const { RELEASES } = await import('@/content/releases');
const { pickLocale } = await import('@/i18n-config');
const SIMPLIFIED = /[们这说为个时来对会过发问应该关于电话号码钱账户设请无与软网络数库项创载录邮级资师权员审计]/;
for (const tier of MEMBERSHIP_TIERS) {
    const hant = tierDisplayName(tier, 'zh-hant');
    assert.ok(hant && !SIMPLIFIED.test(hant), `tier ${tier.key}: "${hant}" is Traditional`);
    assert.equal(tierDisplayName(tier, 'zh'), tier.nameZh);
    assert.equal(tierDisplayName(tier, 'en'), tier.nameEn);
}
let checked = 0;
for (const r of RELEASES) {
    if ('contentKey' in r) continue;
    for (const text of [r.headline, ...r.items]) {
        assert.ok(text['zh-hant'], `${r.version}: zh-hant text present`);
        assert.ok(!SIMPLIFIED.test(pickLocale(text, 'zh-hant')), `${r.version}: "${pickLocale(text, 'zh-hant').slice(0, 30)}…" has no Simplified characters`);
        assert.equal(pickLocale(text, 'zh'), text.zh);
        checked++;
    }
}
console.log(`PASS zh-hant tier names (${MEMBERSHIP_TIERS.length}) and release notes (${checked} texts)`);
