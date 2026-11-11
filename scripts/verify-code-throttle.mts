/**
 * 验证码发送的 IP 维度限流与全局熔断自测。
 *
 * 这条护栏挡的不是「猜码」（那是 sms-auth/mail-auth 里按号码算的冷却与配额），
 * 而是**换号烧钱**：每换一个目标就是一份全新配额，脚本轮换号码可以无限发，
 * 而短信是按条真金白银计费的（SMS pumping）。
 *
 * 必须在一个空目录里执行：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-code-throttle.mts
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const {
  assertCodeSendAllowed, CodeSendBlocked, globalDailyCap,
  MAX_PER_IP_PER_WINDOW, MAX_PER_IP_PER_DAY, IP_WINDOW_MS, DAY_MS,
} = await import('@/lib/code-send-guard');
const { getDb } = await import('@/lib/db');

let passed = 0;
const ok = (l: string) => { passed++; console.log('  ok -', l); };
function blocked(fn: () => unknown, label: string) {
  assert.throws(fn, (e: unknown) => e instanceof CodeSendBlocked, label);
  ok(label);
}

const NOW = 1_800_000_000_000;
/** 直接往流水表塞记录，模拟「已经发过这么多条」。 */
function seed(channel: 'sms' | 'mail', n: number, ip: string | null, agoMs: number) {
  const db = getDb();
  for (let i = 0; i < n; i++) {
    if (channel === 'sms') {
      db.prepare('INSERT INTO sms_send_log (scene, phone, sentAt, ip) VALUES (?,?,?,?)')
        .run('signin', `1380000${String(i).padStart(4, '0')}`, NOW - agoMs, ip);
    } else {
      db.prepare('INSERT INTO mail_send_log (scene, email, sentAt, ip) VALUES (?,?,?,?)')
        .run('signin', `u${i}@example.com`, NOW - agoMs, ip);
    }
  }
}
const reset = () => { getDb().prepare('DELETE FROM sms_send_log').run(); getDb().prepare('DELETE FROM mail_send_log').run(); };

// ---------- 1. 迁移是否真的加上了 ip 列 ----------
console.log('--- 迁移 19 ---');
for (const t of ['sms_send_log', 'mail_send_log']) {
  const cols = (getDb().prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map(c => c.name);
  assert.ok(cols.includes('ip'), `${t} 必须有 ip 列，否则 IP 维度整条是死的`);
}
ok('两张流水表都有 ip 列');

// ---------- 2. 正常用户不该被误伤 ----------
console.log('--- 正常用量 ---');
reset();
assert.doesNotThrow(() => assertCodeSendAllowed('1.2.3.4', NOW), '空库时必须放行');
seed('sms', MAX_PER_IP_PER_WINDOW - 1, '1.2.3.4', 60_000);
assert.doesNotThrow(() => assertCodeSendAllowed('1.2.3.4', NOW), '没到上限就要放行');
ok('未达上限一律放行（改个号重试是正常行为）');

// ---------- 3. 换号绕不过 IP 闸（本次要修的洞） ----------
console.log('--- 换号烧钱 ---');
reset();
// 每条都是不同的号码——单号冷却与单号日配额一条都不会触发
seed('sms', MAX_PER_IP_PER_WINDOW, '9.9.9.9', 60_000);
blocked(() => assertCodeSendAllowed('9.9.9.9', NOW), '同一 IP 换号发满短窗口上限后必须拒');

// ---------- 4. 两条通道合并计数（换通道也绕不过） ----------
console.log('--- 换通道 ---');
reset();
seed('sms', MAX_PER_IP_PER_WINDOW - 1, '8.8.8.8', 60_000);
seed('mail', 1, '8.8.8.8', 60_000);
blocked(() => assertCodeSendAllowed('8.8.8.8', NOW), '短信+邮件合并计数，换通道绕不过');

// ---------- 5. 窗口会滑出去，不是永久封 ----------
console.log('--- 窗口滑动 ---');
reset();
seed('sms', MAX_PER_IP_PER_WINDOW, '7.7.7.7', IP_WINDOW_MS + 60_000);
assert.doesNotThrow(() => assertCodeSendAllowed('7.7.7.7', NOW), '超出短窗口的旧记录不该再算数');
ok('短窗口会滑出去，不是永久封禁');

// ---------- 6. 日配额 ----------
console.log('--- 单 IP 日配额 ---');
reset();
// 全都放在短窗口之外、24 小时之内：短窗口闸不触发，只能是日配额挡的
seed('sms', MAX_PER_IP_PER_DAY, '6.6.6.6', IP_WINDOW_MS + 60_000);
blocked(() => assertCodeSendAllowed('6.6.6.6', NOW), '单 IP 日配额满后必须拒');
reset();
seed('sms', MAX_PER_IP_PER_DAY, '6.6.6.6', DAY_MS + 60_000);
assert.doesNotThrow(() => assertCodeSendAllowed('6.6.6.6', NOW), '超过 24 小时的记录不该再算数');
ok('日配额窗口同样会滑出去');

// ---------- 7. 拿不到 IP 时不互相拖累 ----------
console.log('--- 空 IP ---');
reset();
seed('sms', MAX_PER_IP_PER_DAY * 3, null, 60_000);
assert.doesNotThrow(() => assertCodeSendAllowed('', NOW),
  '拿不到 IP 的请求不能算进同一个桶——那样第一个正常用户就把桶占满了');
ok('空 IP 只走全局熔断，不做 IP 维度判断');

// ---------- 8. 全局熔断 ----------
console.log('--- 全局熔断 ---');
const cap = globalDailyCap();
assert.ok(cap > 0, '默认必须有熔断值');
reset();
// 分散到很多不同 IP：IP 维度一条都不触发，只能是全局熔断挡的
const db = getDb();
for (let i = 0; i < cap; i++) {
  db.prepare('INSERT INTO sms_send_log (scene, phone, sentAt, ip) VALUES (?,?,?,?)')
    .run('signin', `13800${String(i).padStart(6, '0')}`, NOW - 60_000, `10.0.${Math.floor(i / 250)}.${i % 250}`);
}
blocked(() => assertCodeSendAllowed('203.0.113.7', NOW), '分布式来源打满全局上限后必须熔断');
blocked(() => assertCodeSendAllowed('', NOW), '熔断对拿不到 IP 的请求同样生效');

// ---------- 9. 文案不得泄漏具体阈值 ----------
console.log('--- 文案 ---');
reset();
seed('sms', MAX_PER_IP_PER_WINDOW, '5.5.5.5', 60_000);
try { assertCodeSendAllowed('5.5.5.5', NOW); } catch (e) {
  const m = (e as Error).message;
  assert.ok(!/\d/.test(m), `文案不得含具体阈值数字（说了等于告诉脚本作者贴着线跑）: ${m}`);
  ok('限流文案不泄漏阈值');
}

console.log(`\n全部通过：${passed} 项`);
