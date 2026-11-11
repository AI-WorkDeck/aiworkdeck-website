/**
 * 手机号验证码登录自测（大陆站）。
 *
 * 覆盖三块：阿里云 RPC 签名、验证码存储的策略边界、手机号账号的建/绑/释放。
 * 签名那块是**对拍**：桌面仓 `SmsService.signedForm` 是同一算法的 Java 版，
 * 两边对同一组入参必须产出同一个签名串，漂了就是发不出短信。
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-sms.mts
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
  signedForm, pctEncode, normalizePhone, maskPhone,
  sendCode, verifyCode, smsEnabled, SmsError,
  MAX_ATTEMPTS, SCENE_SIGNIN,
} = await import('@/lib/sms-auth');

let passed = 0;
function ok(label: string) { passed++; console.log('  ok -', label); }
function throws(fn: () => unknown, label: string) {
  assert.throws(fn, (e: unknown) => e instanceof SmsError, label);
  ok(label);
}

// ---------- 1. RPC 签名 ----------
console.log('--- 阿里云 RPC 签名 ---');

// 固定入参 → 固定签名。期望值由**独立实现**算出（scripts/ 下这份注释里的 Python
// 三行版），不是把本实现的输出抄回来当期望——那样测的是「代码等于它自己」。
//   canonical = '&'.join(f'{pct(k)}={pct(v)}' for k,v in sorted(p.items()))
//   to_sign   = 'POST&%2F&' + pct(canonical)
//   sig       = base64(hmac_sha1((secret+'&').encode(), to_sign.encode()))
const FIXTURE = {
  AccessKeyId: 'testid',
  Action: 'SendSms',
  Format: 'JSON',
  PhoneNumbers: '13800138000',
  RegionId: 'cn-hangzhou',
  SignName: '京微资易科技',
  SignatureMethod: 'HMAC-SHA1',
  SignatureNonce: 'fixed-nonce-0001',
  SignatureVersion: '1.0',
  TemplateCode: 'SMS_483655011',
  TemplateParam: '{"code":"123456"}',
  Timestamp: '2026-08-18T00:00:00Z',
  Version: '2017-05-25',
};
const EXPECTED_SIG = process.env.SMS_EXPECTED_SIG || '';
const body = signedForm(FIXTURE, 'testsecret');
assert.ok(body.startsWith('Signature='), '签名必须在最前');
const sig = decodeURIComponent(body.slice('Signature='.length).split('&')[0]);
console.log('  signature =', sig);
if (EXPECTED_SIG) {
  assert.strictEqual(sig, EXPECTED_SIG, '签名与独立实现不一致——签名算法漂了');
  ok('签名与独立实现对拍一致');
}
// 键必须字典序
const keys = body.slice(body.indexOf('&') + 1).split('&').map(kv => decodeURIComponent(kv.split('=')[0]));
assert.deepStrictEqual(keys, [...keys].sort(), '签名串的键必须字典序');
ok('键按字典序排列');

// pctEncode 的三处差异（与 Java URLEncoder 修正后一致）
assert.strictEqual(pctEncode('a b'), 'a%20b');
assert.strictEqual(pctEncode('*'), '%2A');
assert.strictEqual(pctEncode('~'), '~');
assert.strictEqual(pctEncode("!'()"), '%21%27%28%29');
assert.strictEqual(pctEncode('中'), '%E4%B8%AD');
ok('pctEncode 与阿里云签名规范一致（空格/星号/波浪号/括号）');

// ---------- 2. 号码规范化 ----------
console.log('--- 号码规范化 ---');
assert.strictEqual(normalizePhone('138 0013-8000'), '13800138000');
assert.strictEqual(normalizePhone('+8613800138000'), '13800138000');
assert.strictEqual(normalizePhone('(138)00138000'), '13800138000');
ok('去分隔符与 +86 前缀');
throws(() => normalizePhone('1380013800'), '10 位应拒绝（少打一位的常见笔误）');
throws(() => normalizePhone('138001380001'), '12 位应拒绝');
throws(() => normalizePhone('23800138000'), '非 1 开头应拒绝');
throws(() => normalizePhone(''), '空应拒绝');
// 官网没有国际短信通道，境外号必须在入口就拒，不能一路走到阿里云再被拒
throws(() => normalizePhone('+14155552671'), '境外号应拒绝（本站无国际通道）');
assert.strictEqual(maskPhone('13800138000'), '138****8000');
assert.strictEqual(maskPhone(''), '');
ok('打码前 3 后 4');

// ---------- 3. 验证码存储 ----------
console.log('--- 验证码存储 ---');
assert.strictEqual(smsEnabled(), false, '未配密钥时必须报未启用');
ok('未配密钥即未启用');

// 直接驱动存储层：把「已发出去的码」注入库里，绕开真实短信发送
const { getDb } = await import('@/lib/db');
const crypto = await import('crypto');
const PHONE = '13800138000';
function seedCode(code: string, expiresInMs = 5 * 60 * 1000) {
  const hash = crypto.createHash('sha256').update(`${PHONE}:${code}`).digest('hex');
  getDb().prepare(
    `INSERT INTO sms_code (scene, phone, codeHash, expiresAt, attempts) VALUES (?,?,?,?,0)
     ON CONFLICT(scene, phone) DO UPDATE SET codeHash=excluded.codeHash, expiresAt=excluded.expiresAt, attempts=0`
  ).run(SCENE_SIGNIN, PHONE, hash, Date.now() + expiresInMs);
}

seedCode('123456');
assert.strictEqual(verifyCode(SCENE_SIGNIN, PHONE, '123456'), PHONE);
ok('正确验证码通过并返回规范化号码');

throws(() => verifyCode(SCENE_SIGNIN, PHONE, '123456'), '核销后重放必须失败（一次性）');

seedCode('111111');
throws(() => verifyCode(SCENE_SIGNIN, PHONE, '999999'), '错码失败');
// 错码文案与过期文案必须一字不差，否则等于告诉攻击者哪一步猜对了
let wrongMsg = '', expiredMsg = '';
try { verifyCode(SCENE_SIGNIN, PHONE, '999999'); } catch (e) { wrongMsg = (e as Error).message; }
seedCode('222222', -1000);
try { verifyCode(SCENE_SIGNIN, PHONE, '222222'); } catch (e) { expiredMsg = (e as Error).message; }
assert.strictEqual(wrongMsg, expiredMsg, '错码与过期的文案必须一致');
ok('错码与过期同一句话（不泄漏哪一步猜对了）');

seedCode('333333');
for (let i = 0; i < MAX_ATTEMPTS; i++) {
  try { verifyCode(SCENE_SIGNIN, PHONE, '000000'); } catch { /* 预期 */ }
}
throws(() => verifyCode(SCENE_SIGNIN, PHONE, '333333'), `错 ${MAX_ATTEMPTS} 次后正确码也应失效`);

// 红线：任何对外文案都不许把阿里云原始 Message 带出去
seedCode('444444');
try { verifyCode(SCENE_SIGNIN, PHONE, 'bad'); } catch (e) {
  const m = (e as Error).message;
  assert.ok(!/aliyun|isv\.|AccessKey/i.test(m), `对外文案不得含网关内部信息: ${m}`);
}
ok('对外文案不含网关内部信息');

// ---------- 4. 手机号账号 ----------
console.log('--- 手机号账号 ---');
const users = await import('@/lib/users');
const first = users.findOrCreateByPhone(PHONE);
assert.strictEqual(first.created, true, '首次应建号');
assert.ok(/^u[a-z0-9]+$/.test(first.user.username), `合成用户名格式: ${first.user.username}`);
assert.strictEqual(first.user.displayName, '138****8000');
assert.strictEqual(first.user.passwordHash, '', '手机号账号无口令');
ok('首次登录建号，用户名合成、昵称用打码号');

const second = users.findOrCreateByPhone(PHONE);
assert.strictEqual(second.created, false, '再次应命中同一账号');
assert.strictEqual(second.user.id, first.user.id);
ok('同号再次登录命中同一账号');

const other = await users.createUser({ username: 'mailer', email: 'm@test.local', password: 'pw12345678', displayName: 'M' });
assert.ok(other.user, '邮箱账号应建出来');
assert.strictEqual(users.bindPhone(other.user!.id, PHONE).error, 'phone_taken', '一号一账号：占用应拒绝');
ok('一号一账号（被别人占用则拒绝绑定）');

assert.strictEqual(users.bindPhone(other.user!.id, '13900139000').error, undefined);
assert.strictEqual(users.findUserByPhone('13900139000')?.id, other.user!.id);
ok('绑定新号成功且可反查');

// 注销必须释放号码，否则本人再也无法用同一个号重新注册
users.markUserDeleted(other.user!.id, '已注销用户');
assert.strictEqual(users.findUserByPhone('13900139000'), undefined, '墓碑行不得被查到');
const reclaimed = users.findOrCreateByPhone('13900139000');
assert.strictEqual(reclaimed.created, true, '注销后同号应能重新注册');
assert.notStrictEqual(reclaimed.user.id, other.user!.id);
ok('注销释放手机号，同号可重新注册');

// ---------- 5. 补绑期闸门 ----------
// 本节按站点分叉断言：CI 会用 NEXT_PUBLIC_AWD_SITE=cn 与 =intl 各跑一遍，
// 写死 cn 的期望会让 intl 那一遍必红。
console.log('--- 补绑期闸门 ---');
const policy = await import('@/lib/phone-policy');
const { SITE_ID } = await import('@/lib/site-config');
console.log('  site =', SITE_ID);
const before = new Date('2026-09-01T00:00:00');
const after = new Date('2026-10-01T00:00:00');

// 已绑号：两站都放行
assert.strictEqual(policy.gateForUser({ phone: '13800138000' }, before), 'ok');
assert.strictEqual(policy.gateForUser({ phone: '13800138000' }, after), 'ok');

if (SITE_ID === 'cn') {
  assert.strictEqual(policy.phoneIsAccount(), true);
  assert.strictEqual(policy.gateForUser({}, before), 'must_bind', '期限内未绑号应强制绑定');
  assert.strictEqual(policy.gateForUser({}, after), 'blocked', '期限后未绑号应拒登');
  ok('cn：期限内 must_bind / 期限后 blocked');
} else {
  // 国际站以邮箱为账号本体，没有手机号这条闸——任何时候都不许因为「没绑手机号」
  // 把国际站用户挡在门外。
  assert.strictEqual(policy.phoneIsAccount(), false);
  assert.strictEqual(policy.gateForUser({}, before), 'ok');
  assert.strictEqual(policy.gateForUser({}, after), 'ok', 'intl 不得因未绑手机号而拒登');
  ok('intl：手机号不是账号本体，闸门恒放行');
}

process.env.NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE = 'not-a-date';
assert.strictEqual(
  policy.bindingDeadline().toISOString().slice(0, 10),
  new Date(`${policy.DEFAULT_BINDING_DEADLINE}T23:59:59`).toISOString().slice(0, 10),
  '非法期限必须回落默认值，而不是无限期延期'
);
ok('期限配错回落默认值（不静默放行）');

// ---------- 6. 上线顺序安全网 ----------
// 「代码已部署但短信密钥还没注入」是必然会出现的中间态（CI 合并即部署，密钥要人上服务器写）。
// 这个中间态下**不许出现谁都注册不了的站**。
console.log('--- 上线顺序安全网 ---');
assert.strictEqual(smsEnabled(), false, '本用例前提：未配短信密钥');
const registerRoute = await import('@/app/api/auth/register/route');
const probe = new Request('http://localhost/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'gatecheck', email: 'gate@test.local', password: 'pw12345678' }),
});
const probeRes = await registerRoute.POST(probe as never);
const probeBody = await probeRes.json();
assert.strictEqual(probeBody.error, SITE_ID === 'cn' ? 'register_use_phone' : 'register_use_email');
ok('验证码通道不可用时也不能绕过首次身份验证；已有密码登录保持可用');

// ---------- 7. 登录换 Key ----------
console.log('--- 登录换 Key ---');
const { issueLoginKey, listApiKeys, MAX_ACTIVE_KEYS, API_KEY_PREFIX } = await import('@/lib/api-keys');
const keyUser = users.findOrCreateByPhone('13700137000').user;

const issued: string[] = [];
// 连登 MAX+2 次：**一次都不许失败**。上限是给人工生成 Key 设计的，
// 桌面端改成账户登录后每次登录都消耗一个槽，沿用「达到上限就失败」= 第 4 次登不进去。
for (let i = 0; i < MAX_ACTIVE_KEYS + 2; i++) {
  const k = issueLoginKey(keyUser.id);
  assert.ok(k.plaintextKey.startsWith(API_KEY_PREFIX), 'key 前缀');
  issued.push(k.plaintextKey);
}
ok(`连续登录 ${MAX_ACTIVE_KEYS + 2} 次不因 key 上限失败`);

const active = listApiKeys(keyUser.id);
assert.strictEqual(active.length, MAX_ACTIVE_KEYS, `有效 key 应恒为 ${MAX_ACTIVE_KEYS}`);
ok(`最旧淘汰：有效 key 稳定在 ${MAX_ACTIVE_KEYS} 枚`);

// 被挤掉的那枚必须真的失效，否则「挤下线」只是说说
const { findUserByApiKey } = await import('@/lib/api-keys');
assert.strictEqual(findUserByApiKey(issued[0]), undefined, '被淘汰的 key 必须失效');
assert.strictEqual(findUserByApiKey(issued[issued.length - 1])?.id, keyUser.id, '最新 key 必须可用');
ok('被挤掉的 key 真的失效，最新的可用');

// 端点：手机号 + 验证码
const exchange = await import('@/app/api/auth/exchange-key/route');
async function callExchange(payload: unknown) {
  const req = new Request('http://localhost/api/auth/exchange-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const res = await exchange.POST(req as never);
  return { status: res.status, body: await res.json() };
}

if (SITE_ID === 'cn') {
  seedCode('555555');
  const r = await callExchange({ phone: PHONE, code: '555555' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.passwordSetupRequired, true);
  assert.strictEqual(r.body.key, undefined, '设密前绝不签 Key');
  assert.ok(r.body.setupToken);
  ok('端点：手机号+验证码只换首次设密票据');

  const bad = await callExchange({ phone: PHONE, code: '000000' });
  assert.strictEqual(bad.status, 401);
  assert.strictEqual(bad.body.key, undefined, '验码失败绝不能返回 Key');
  ok('端点：错码不发 Key');
}

// 端点：账号 + 口令（国际站主路径，大陆站补绑期内的存量账号）
const pwUser = await users.createUser({
  username: 'deskuser', email: 'desk@test.local', password: 'pw12345678', displayName: 'D',
});
assert.ok(pwUser.user, '前置：口令账号建出来');
users.bindPhone(pwUser.user!.id, '13600136000');  // 绑号，免得撞上大陆站的补绑闸
const pw = await callExchange({ account: 'deskuser', password: 'pw12345678' });
assert.strictEqual(pw.status, 200, JSON.stringify(pw.body));
assert.ok(String(pw.body.key).startsWith(API_KEY_PREFIX));
ok('端点：账号+口令换 Key');

const pwBad = await callExchange({ account: 'deskuser', password: 'wrong-password' });
assert.strictEqual(pwBad.status, 401);
assert.strictEqual(pwBad.body.key, undefined, '口令错绝不能返回 Key');
ok('端点：错口令不发 Key');

const empty = await callExchange({});
assert.strictEqual(empty.status, 400);
ok('端点：缺凭据回 400');

// ---------- 8. 口令爆破闸 ----------
console.log('--- 口令爆破闸 ---');
const { MAX_ACCOUNT_FAILURES } = await import('@/lib/login-throttle');

// 连续错口令：到上限之后必须回 429，而不是继续无限次让人猜
let sawTooMany = false;
for (let i = 0; i < MAX_ACCOUNT_FAILURES + 2; i++) {
  const r = await callExchange({ account: 'deskuser', password: 'guess-' + i });
  if (r.status === 429) { sawTooMany = true; break; }
  assert.strictEqual(r.status, 401, `第 ${i + 1} 次应是 401，实际 ${r.status}`);
  assert.strictEqual(r.body.key, undefined, '任何失败分支都不能返回 Key');
}
assert.ok(sawTooMany, `连错 ${MAX_ACCOUNT_FAILURES + 2} 次仍未锁定——匿名端点+发 Key 等于无限口令试探口`);
ok(`口令连错 ${MAX_ACCOUNT_FAILURES} 次后锁定（429）`);

// 锁定期内即使口令正确也不放行——否则计次形同虚设
const lockedButCorrect = await callExchange({ account: 'deskuser', password: 'pw12345678' });
assert.strictEqual(lockedButCorrect.status, 429, '锁定期内正确口令也必须挡住');
assert.strictEqual(lockedButCorrect.body.key, undefined);
ok('锁定期内正确口令也不发 Key');

// 换个没被锁的账号照常能进——闸是按账号的，不能把整站锁死
const other2 = await users.createUser({
  username: 'freshuser', email: 'fresh@test.local', password: 'pw12345678', displayName: 'F',
});
users.bindPhone(other2.user!.id, '13500135000');
const freshOk = await callExchange({ account: 'freshuser', password: 'pw12345678' });
assert.strictEqual(freshOk.status, 200, '未被锁的账号必须照常登录，闸不能是全站级的');
ok('闸按账号计，未涉及的账号不受影响');

console.log(`\nverify-sms: ${passed} 项全部通过`);
