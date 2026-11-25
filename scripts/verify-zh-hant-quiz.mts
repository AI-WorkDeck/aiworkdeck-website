/** Quiz in zh-hant (Q12): every type name, line, question and option has a Traditional rendering; the card renders. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'package.json'));
const f = req.resolve('server-only'); req.cache[f] = { id: f, filename: f, loaded: true, exports: {} } as unknown as NodeJS.Module;
const { QUIZ_TYPES, QUIZ_QUESTIONS } = await import('@/lib/quiz-data');
const { QUIZ_ZH_HANT } = await import('@/lib/quiz-data.zh-hant');
const { renderQuizCardPng } = await import('@/lib/quiz-card');
const SIMPLIFIED = /[们这说为个时来对会过发问应该关于电话号码钱账户设请无与软网络数库项创载录邮级资师权员审计务签证验费预时间运维备区压锋扫测绩诉讼]/;
const hant = (s: string) => QUIZ_ZH_HANT[s] ?? s;
const texts = [
    ...QUIZ_TYPES.flatMap(t => [t.nameZh, t.toilZh, t.praiseZh, t.pitchZh, ...(t.bizZh ? [t.bizZh] : [])]),
    ...QUIZ_QUESTIONS.flatMap(q => [q.zh, ...q.options.map(o => o.zh)]),
    '抗压', '锋利', '扫码测测', '你是哪种法律人', '仅供娱乐 · 非心理学测评', '全国仅 {r}% 的法律人是这个类型', '全国第 {seq} 位解锁 · 仅 {r}% 的法律人是这个类型',
];
for (const t of texts) assert.ok(!SIMPLIFIED.test(hant(t)), `zh-hant still Simplified (re-run scripts/map-zh-hant.cjs): "${t.slice(0, 30)}"`);
const png = await renderQuizCardPng({ typeId: QUIZ_TYPES[0].id, dims: QUIZ_TYPES[0].dims, lang: 'zh-hant' });
assert.ok(png && png.subarray(1, 4).toString('ascii') === 'PNG', 'zh-hant result card renders');
console.log(`PASS quiz zh-hant (${texts.length} texts) and card render`);
