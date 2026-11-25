/** Deployment planner in zh-hant: every [zh, en] copy renders in Traditional (Q12); the generated map can't go stale. */
import assert from 'node:assert/strict';
const content = await import('@/components/deployment/content');
const SIMPLIFIED = /[们这说为个时来对会过发问应该关于电话号码钱账户设请无与软网络数库项创载录邮级资师权员审计务签证验费预时间运维备区]/;
const copies: (readonly [string, string])[] = [];
const collect = (v: unknown) => {
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') { copies.push(v as [string, string]); return; }
    if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
for (const [name, value] of Object.entries(content)) if (name !== 'pick') collect(value);
assert.ok(copies.length > 100, `found ${copies.length} planner strings`);
for (const c of copies) {
    const hant = content.pick('zh-hant', c);
    assert.ok(!SIMPLIFIED.test(hant), `zh-hant planner text still Simplified (re-run scripts/map-zh-hant.cjs): "${c[0].slice(0, 40)}"`);
    assert.equal(content.pick('zh', c), c[0]);
    assert.equal(content.pick('en', c), c[1]);
}
console.log(`PASS deployment planner zh-hant (${copies.length} strings)`);
