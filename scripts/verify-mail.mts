/**
 * 邮箱验证码登录自测（国际站）。
 *
 * 覆盖四块：地址规范化、验证码存储的策略边界、邮箱账号的建/命中/证实、站点闸门。
 * 与 `verify-sms.mts` 是同一套骨架——两边的策略只要漂了，一眼能看出来漂在哪一条。
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-mail.mts
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
  normalizeEmail, maskEmail, verifyCode, mailEnabled, MailError,
  MAIL_MAX_ATTEMPTS, SCENE_SIGNIN,
} = await import('@/lib/mail-auth');

let passed = 0;
function ok(label: string) { passed++; console.log('  ok -', label); }
function throws(fn: () => unknown, label: string) {
  assert.throws(fn, (e: unknown) => e instanceof MailError, label);
  ok(label);
}

// ---------- 1. 地址规范化 ----------
console.log('--- 地址规范化 ---');
assert.strictEqual(normalizeEmail('  Alice@Example.COM '), 'alice@example.com');
ok('去空格并转小写（否则同一地址会变成两个账号）');
// 校验必须与 lib/users.ts createUser 的那条同样宽松：收紧只会误伤合法地址
assert.strictEqual(normalizeEmail('user+tag@sub.example.co.uk'), 'user+tag@sub.example.co.uk');
assert.strictEqual(normalizeEmail('a-b_c@my-domain.io'), 'a-b_c@my-domain.io');
ok('放行带 +tag / 连字符 / 多级域名的合法地址');
throws(() => normalizeEmail('not-an-email'), '缺 @ 应拒绝');
throws(() => normalizeEmail('a@b'), '缺顶级域应拒绝');
throws(() => normalizeEmail('a b@c.com'), '含空格应拒绝');
throws(() => normalizeEmail(''), '空应拒绝');
throws(() => normalizeEmail(null), 'null 应拒绝');
throws(() => normalizeEmail('x'.repeat(250) + '@example.com'), '超过 254 字符应拒绝');

assert.strictEqual(maskEmail('alice@example.com'), 'a****@example.com');
assert.strictEqual(maskEmail('a@example.com'), 'a*@example.com');
assert.strictEqual(maskEmail('nope'), '');
ok('打码只留本地部分首字符');

// ---------- 2. 验证码存储 ----------
console.log('--- 验证码存储 ---');
assert.strictEqual(mailEnabled(), false, '未配 AWD_MAIL_* 时必须报未启用');
ok('未配密钥即未启用（上线中间态不会静默变成谁都进不来）');

// 直接驱动存储层：把「已发出去的码」注入库里，绕开真实发信
const { getDb } = await import('@/lib/db');
const crypto = await import('crypto');
const EMAIL = 'alice@example.com';
function seedCode(code: string, expiresInMs = 15 * 60 * 1000, email = EMAIL) {
  const hash = crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
  getDb().prepare(
    `INSERT INTO mail_code (scene, email, codeHash, expiresAt, attempts) VALUES (?,?,?,?,0)
     ON CONFLICT(scene, email) DO UPDATE SET codeHash=excluded.codeHash, expiresAt=excluded.expiresAt, attempts=0`
  ).run(SCENE_SIGNIN, email, hash, Date.now() + expiresInMs);
}

seedCode('123456');
assert.strictEqual(verifyCode(SCENE_SIGNIN, '  Alice@Example.COM ', '123456'), EMAIL);
ok('正确验证码通过，且大小写/空格不同的写法能对上同一枚码');

throws(() => verifyCode(SCENE_SIGNIN, EMAIL, '123456'), '核销后重放必须失败（一次性）');

// 错码与过期必须一字不差，否则等于告诉攻击者哪一步猜对了
let wrongMsg = '', expiredMsg = '', neverMsg = '';
seedCode('111111');
try { verifyCode(SCENE_SIGNIN, EMAIL, '999999'); } catch (e) { wrongMsg = (e as Error).message; }
seedCode('222222', -1000);
try { verifyCode(SCENE_SIGNIN, EMAIL, '222222'); } catch (e) { expiredMsg = (e as Error).message; }
try { verifyCode(SCENE_SIGNIN, 'nobody@example.com', '222222'); } catch (e) { neverMsg = (e as Error).message; }
assert.strictEqual(wrongMsg, expiredMsg, '错码与过期的文案必须一致');
assert.strictEqual(wrongMsg, neverMsg, '「从没发过码的地址」也必须同一句话');
ok('错码 / 过期 / 从没发过码，三者同一句话');

seedCode('333333');
for (let i = 0; i < MAIL_MAX_ATTEMPTS; i++) {
  try { verifyCode(SCENE_SIGNIN, EMAIL, '000000'); } catch { /* 预期 */ }
}
throws(() => verifyCode(SCENE_SIGNIN, EMAIL, '333333'), `错 ${MAIL_MAX_ATTEMPTS} 次后正确码也应失效`);

// 场景隔离：signin 的码不能拿去核销别的场景（将来加 bind 场景时这条就是闸）
seedCode('444444');
throws(() => verifyCode('bind', EMAIL, '444444'), '跨场景核销必须失败');

// 红线：任何对外文案都不许把发信网关的内部信息带出去
seedCode('555555');
try { verifyCode(SCENE_SIGNIN, EMAIL, 'bad'); } catch (e) {
  const m = (e as Error).message;
  assert.ok(!/resend|api_key|bearer|re_[a-z0-9]/i.test(m), `对外文案不得含网关内部信息: ${m}`);
}
ok('对外文案不含网关内部信息');

// ---------- 3. 邮箱账号 ----------
console.log('--- 邮箱账号 ---');
const users = await import('@/lib/users');

const fresh = users.findOrCreateByEmail('new@example.com');
assert.strictEqual(fresh.created, true, '首次应建号');
assert.ok(/^u[a-z0-9]+$/.test(fresh.user.username), `合成用户名格式: ${fresh.user.username}`);
assert.strictEqual(fresh.user.passwordHash, '', '验证码建出来的账号无口令');
assert.ok(fresh.user.emailVerifiedAt, '新建账号的邮箱从第一天起就是证实过的');
ok('首次登录建号，用户名合成、无口令、已证实');

const again = users.findOrCreateByEmail('new@example.com');
assert.strictEqual(again.created, false, '再次应命中同一账号');
assert.strictEqual(again.user.id, fresh.user.id);
assert.strictEqual(again.user.emailVerifiedAt, fresh.user.emailVerifiedAt, '不得覆盖首次证实时点');
ok('同地址再次登录命中同一账号，首次证实时点不被覆盖');

// **本次改动的核心**：存量口令账号的邮箱此前从没被验证过，走一次验证码登录就该被证实。
const legacy = await users.createUser({
  username: 'legacy', email: 'legacy@example.com', password: 'pw12345678', displayName: 'L',
});
assert.ok(legacy.user, '存量账号应建出来');
assert.strictEqual(legacy.user!.emailVerifiedAt, undefined, '口令注册不证实邮箱——这正是要补的缺口');
const upgraded = users.findOrCreateByEmail('legacy@example.com');
assert.strictEqual(upgraded.created, false, '存量账号不该被重复建号');
assert.strictEqual(upgraded.user.id, legacy.user!.id);
assert.ok(upgraded.user.emailVerifiedAt, '存量账号走完验证码后必须被标记为已证实');
assert.strictEqual(users.findUserById(legacy.user!.id)?.emailVerifiedAt, upgraded.user.emailVerifiedAt, '证实时点必须落盘');
ok('存量账号首次验证码登录即证实邮箱，且落盘');

// 注销必须释放地址，否则本人再也无法用同一个邮箱重新注册
users.markUserDeleted(legacy.user!.id, 'Deleted user');
assert.strictEqual(users.findUserByAccount('legacy@example.com'), undefined, '墓碑行不得被查到');
assert.strictEqual(users.findUserById(legacy.user!.id)?.emailVerifiedAt, undefined, '墓碑行不得留着「已证实」');
const reclaimed = users.findOrCreateByEmail('legacy@example.com');
assert.strictEqual(reclaimed.created, true, '注销后同地址应能重新注册');
assert.notStrictEqual(reclaimed.user.id, legacy.user!.id);
ok('注销释放邮箱并清掉证实时点，同地址可重新注册');

// ---------- 4. 站点闸门 ----------
// CI 会用 NEXT_PUBLIC_AWD_SITE=cn 与 =intl 各跑一遍，写死一边的期望会让另一遍必红。
console.log('--- 站点闸门 ---');
const { emailIsAccount } = await import('@/lib/mail-policy');
const { phoneIsAccount } = await import('@/lib/phone-policy');
const { SITE_ID } = await import('@/lib/site-config');
console.log('  site =', SITE_ID);

// 两条闸恒互斥：都真或都假都说明站点分叉写坏了，那会让某个站没有任何登录入口
assert.notStrictEqual(emailIsAccount(), phoneIsAccount(), '账号本体必须恰好是手机号或邮箱之一');
ok('账号本体二选一（不会出现某个站两条路都没有）');

if (SITE_ID === 'intl') {
  assert.strictEqual(emailIsAccount(), true, 'intl 的账号本体是邮箱');
  ok('intl：邮箱是账号本体');
} else {
  assert.strictEqual(emailIsAccount(), false, 'cn 的账号本体是手机号，不是邮箱');
  ok('cn：邮箱不是账号本体');
}

// ---------- 5. exchange-key 必须接受 {email, code} ----------
// 这条是 2026-08-18 补的一个**已经上线的洞**：邮箱验证码注册出来的账号 passwordHash
// 是空串，而口令注册已随之关闭。exchange-key 少了这条凭据形状，新 intl 用户在官网
// 注册完就再也连不上桌面端——口令那条路对他无效。
console.log('--- exchange-key 的凭据形状 ---');
{
  const src = fs.readFileSync(new URL('../app/api/auth/exchange-key/route.ts', import.meta.url), 'utf8');
  assert.ok(/body\.email/.test(src), 'exchange-key 必须读 email');
  assert.ok(/verifyFirstContact/.test(src), 'exchange-key 必须转入邮箱首次验证/建密流程');
  ok('exchange-key 接受 {email, code}（否则 intl 验证码账号连不上桌面端）');
}

console.log(`\n全部通过：${passed} 项`);
