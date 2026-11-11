/**
 * 审核专用账号旁路自测（dev-board#699）。
 *
 * 覆盖四块：配置解析与校验、邮箱通道的放行与**不**放行、短信通道同一套、发码不真发信。
 * 骨架与 `verify-mail.mts` / `verify-sms.mts` 一致。
 *
 * 这是一条**认证旁路**，所以「不放行」的那几条用例比「放行」的更重要：
 * 非审核身份拿着固定码必须失败，绑定场景（bind）必须不走旁路，没配 env 时必须整条不存在。
 *
 * 必须在一个空目录里执行（data/awd.db 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-review-account.mts
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

// fileURLToPath 而不是 url.pathname：仓库路径里有空格，pathname 会给出 %20 的转义形式，
// 拼出来的 tsconfig 路径读不到，症状是子进程里一坨与被测代码无关的 jsonc 解析栈。
const REPO = fileURLToPath(new URL('..', import.meta.url));

const IDENTITY_ENV = 'AUTH_REVIEW_ACCOUNT_IDENTITY';
const CODE_ENV = 'AUTH_REVIEW_ACCOUNT_CODE';
const REVIEW_EMAIL = 'appreview@example.com';
const REVIEW_PHONE = '13800138000';
const FIXED_CODE = '246813';

let passed = 0;
function ok(label: string) { passed++; console.log('  ok -', label); }

/** 配置这条旁路。传 null 表示清空。 */
function configure(identity: string | null, code: string | null) {
  if (identity === null) delete process.env[IDENTITY_ENV]; else process.env[IDENTITY_ENV] = identity;
  if (code === null) delete process.env[CODE_ENV]; else process.env[CODE_ENV] = code;
}

// 先确保导入时是关的：模块加载会校验码的格式，配着坏值导入就直接炸了
configure(null, null);

const {
  reviewAccountEnabled, isReviewIdentity, reviewCodeAccepts, ReviewAccountConfigError,
} = await import('@/lib/review-account');

// ---------- 1. 配置解析与校验 ----------
console.log('--- 配置解析与校验 ---');

assert.strictEqual(reviewAccountEnabled(), false, '两项都没配时必须是关的');
assert.strictEqual(isReviewIdentity(REVIEW_EMAIL), false);
assert.strictEqual(reviewCodeAccepts(REVIEW_EMAIL, FIXED_CODE), false);
ok('默认关：没配 env 时这条旁路整个不存在');

configure(REVIEW_EMAIL, null);
assert.strictEqual(reviewAccountEnabled(), false, '只配 identity 不算配');
configure(null, FIXED_CODE);
assert.strictEqual(reviewAccountEnabled(), false, '只配 code 不算配');
ok('配了一半 = 关（不存在半开的中间态）');

configure(REVIEW_EMAIL, '12345');
assert.throws(() => reviewAccountEnabled(), (e: unknown) => e instanceof ReviewAccountConfigError, '5 位码应抛');
configure(REVIEW_EMAIL, 'abcdef');
assert.throws(() => reviewAccountEnabled(), (e: unknown) => e instanceof ReviewAccountConfigError, '非数字码应抛');
configure(REVIEW_EMAIL, '1234567');
assert.throws(() => reviewAccountEnabled(), (e: unknown) => e instanceof ReviewAccountConfigError, '7 位码应抛');
ok('码不是 6 位数字就报错，不静默失效');

// 规范化必须走 mail-auth / sms-auth 那两个函数本身：配置里的写法与用户输入的写法
// 落不到同一个字符串的话，这条旁路会在「看起来配好了」的情况下完全不生效。
configure(`  ${REVIEW_EMAIL.toUpperCase()} , +86 138-0013-8000 , , notanidentity `, FIXED_CODE);
assert.strictEqual(reviewAccountEnabled(), true);
assert.strictEqual(isReviewIdentity(REVIEW_EMAIL), true, '邮箱要按 normalizeEmail 规范化后入表');
assert.strictEqual(isReviewIdentity(REVIEW_PHONE), true, '手机号要按 normalizePhone 规范化后入表');
ok('逗号分隔多身份；大小写/空格/+86/连字符都归一，空项与非法项被丢弃');

assert.strictEqual(reviewCodeAccepts(REVIEW_EMAIL, FIXED_CODE), true);
assert.strictEqual(reviewCodeAccepts(REVIEW_EMAIL, ` ${FIXED_CODE} `), true, '前后空格应容忍');
assert.strictEqual(reviewCodeAccepts(REVIEW_EMAIL, '000000'), false, '错码不认');
assert.strictEqual(reviewCodeAccepts(REVIEW_EMAIL, ''), false, '空码不认');
assert.strictEqual(reviewCodeAccepts('someone@example.com', FIXED_CODE), false, '非审核身份拿固定码必须不认');
assert.strictEqual(reviewCodeAccepts(null, FIXED_CODE), false);
ok('固定码只对列出的身份生效，别的身份一律不认');

// ---------- 2. 启动即抛错 ----------
// 上面那几条验的是「调用时抛」。这一条验的是「模块加载就抛」——配歪了要在部署当时炸，
// 而不是等审核员来试。只能另起一个进程验：本进程里模块早就加载过了。
console.log('--- 启动即抛错 ---');
{
  const boot = path.join(cwd, 'boot-review-account.mts');
  fs.writeFileSync(boot, "await import('@/lib/review-account');\nconsole.log('loaded');\n");
  // 干净的 env：本进程自己就是 `npx tsx` 起来的，继承下来的 npm_config_* 会让内层
  // npx 解析到外层那份配置而崩在 tsx 里（症状是一坨 jsonc 解析栈，与被测代码无关）。
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('npm_'))
  ) as NodeJS.ProcessEnv;
  const run = (code: string) => spawnSync(
    'npx', ['--yes', 'tsx', '--tsconfig', path.join(REPO, 'tsconfig.json'), boot],
    {
      cwd,
      encoding: 'utf8',
      env: { ...baseEnv, [IDENTITY_ENV]: REVIEW_EMAIL, [CODE_ENV]: code },
    }
  );
  const bad = run('abc');
  assert.notStrictEqual(bad.status, 0, '码格式非法时导入模块必须失败');
  assert.ok(
    (bad.stderr || '').includes(CODE_ENV),
    `报错里要指名是哪个变量配错了，实际 stderr: ${(bad.stderr || '').slice(0, 400)}`
  );
  const good = run(FIXED_CODE);
  assert.strictEqual(good.status, 0, `码格式合法时导入必须成功，stderr: ${(good.stderr || '').slice(0, 400)}`);
  assert.ok(
    (good.stderr || '').includes('审核账号旁路已启用'),
    '启用时必须打一行 warn，否则「生产上开着这条口子」这件事没有任何痕迹'
  );
  ok('码格式非法时模块加载即失败；合法时加载成功并 warn 一次');
}

// ---------- 3. 邮箱通道 ----------
console.log('--- 邮箱通道（mail-auth）---');
configure(`${REVIEW_EMAIL},${REVIEW_PHONE}`, FIXED_CODE);

const mail = await import('@/lib/mail-auth');
const { getDb } = await import('@/lib/db');
const crypto = await import('crypto');

const SCENE_SIGNIN = mail.SCENE_SIGNIN;
const NORMAL_EMAIL = 'alice@example.com';

function seedMailCode(code: string, email: string, expiresInMs = 15 * 60 * 1000) {
  const hash = crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
  getDb().prepare(
    `INSERT INTO mail_code (scene, email, codeHash, expiresAt, attempts) VALUES (?,?,?,?,0)
     ON CONFLICT(scene, email) DO UPDATE SET codeHash=excluded.codeHash, expiresAt=excluded.expiresAt, attempts=0`
  ).run(SCENE_SIGNIN, email, hash, Date.now() + expiresInMs);
}
function mailRow(email: string) {
  return getDb().prepare('SELECT codeHash, attempts FROM mail_code WHERE scene = ? AND email = ?')
    .get(SCENE_SIGNIN, email) as { codeHash: string; attempts: number } | undefined;
}

assert.strictEqual(
  mail.verifyCode(SCENE_SIGNIN, ` ${REVIEW_EMAIL.toUpperCase()} `, FIXED_CODE),
  REVIEW_EMAIL,
  '审核邮箱 + 固定码必须放行，并返回规范化地址'
);
ok('审核邮箱用固定码直接登录（大小写/空格不影响）');

// 不放行的那几条——这条旁路的安全性全在这里
assert.throws(
  () => mail.verifyCode(SCENE_SIGNIN, NORMAL_EMAIL, FIXED_CODE),
  (e: unknown) => e instanceof mail.MailError,
  '非审核邮箱拿固定码必须失败'
);
ok('非审核邮箱用固定码必须失败');

assert.throws(
  () => mail.verifyCode(SCENE_SIGNIN, REVIEW_EMAIL, '000000'),
  (e: unknown) => e instanceof mail.MailError,
  '审核邮箱拿错码必须失败'
);
ok('审核邮箱用错码仍然失败（旁路认的是码，不是身份）');

assert.throws(
  () => mail.verifyCode('bind', REVIEW_EMAIL, FIXED_CODE),
  (e: unknown) => e instanceof mail.MailError,
  '非 signin 场景不得走旁路'
);
ok('旁路只开在 signin 上，别的场景不放行');

// 不消耗在途验证码：真人刚收到的那枚码不该因为审核员登了一次就作废
seedMailCode('654321', REVIEW_EMAIL);
const before = mailRow(REVIEW_EMAIL);
mail.verifyCode(SCENE_SIGNIN, REVIEW_EMAIL, FIXED_CODE);
assert.deepStrictEqual(mailRow(REVIEW_EMAIL), before, '走旁路不得改动 mail_code 行');
assert.strictEqual(mail.verifyCode(SCENE_SIGNIN, REVIEW_EMAIL, '654321'), REVIEW_EMAIL, '在途码仍应可用');
ok('走旁路不消耗在途验证码、不改动 mail_code');

// 不计失败次数：固定码不该被「猜码计数」耗掉
seedMailCode('777777', REVIEW_EMAIL);
for (let i = 0; i < mail.MAIL_MAX_ATTEMPTS + 2; i++) {
  try { mail.verifyCode(SCENE_SIGNIN, REVIEW_EMAIL, FIXED_CODE); } catch { assert.fail('旁路不该抛'); }
}
assert.strictEqual(mailRow(REVIEW_EMAIL)?.attempts, 0, '走旁路不得累计 attempts');
ok('旁路不计失败次数（审核员可以无限次登录）');

// ---------- 4. 发码：审核身份不真发信、不落流水 ----------
console.log('--- 发码不真发信 ---');
process.env.AWD_MAIL_RESEND_KEY = 're_fake_for_test';
process.env.AWD_MAIL_FROM = 'AI WorkDeck <no-reply@example.com>';

const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  return { status: 200, text: async () => '{"id":"fake"}' } as unknown as Response;
}) as typeof fetch;

function sendLogCount(email: string) {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM mail_send_log WHERE email = ?').get(email) as { n: number }).n;
}

getDb().prepare('DELETE FROM mail_code WHERE email = ?').run(REVIEW_EMAIL);
await mail.sendCode(SCENE_SIGNIN, REVIEW_EMAIL, '203.0.113.7');
assert.strictEqual(fetchCalls, 0, '审核身份不得触发任何外发调用');
assert.strictEqual(sendLogCount(REVIEW_EMAIL), 0, '审核身份不得落 mail_send_log（否则会被自己的限速挡住）');
assert.strictEqual(mailRow(REVIEW_EMAIL), undefined, '审核身份不该产生新的一次性码');
ok('给审核邮箱发码：不发信、不落流水、不产码，对外仍是成功');

// 对照组：正常地址走的是原路，一封信一条流水
await mail.sendCode(SCENE_SIGNIN, NORMAL_EMAIL, '203.0.113.8');
assert.strictEqual(fetchCalls, 1, '正常地址必须真的走发信');
assert.strictEqual(sendLogCount(NORMAL_EMAIL), 1, '正常地址必须落一条流水');
ok('对照组：正常地址照常发信并落流水（旁路没有波及别人）');

// 限速：把某个 IP 的额度用满，正常地址会被挡，审核身份照进不误
const { MAX_PER_IP_PER_WINDOW } = await import('@/lib/code-send-guard');
const BUSY_IP = '203.0.113.9';
const stmt = getDb().prepare('INSERT INTO mail_send_log (scene, email, sentAt, ip) VALUES (?,?,?,?)');
for (let i = 0; i < MAX_PER_IP_PER_WINDOW; i++) stmt.run(SCENE_SIGNIN, `filler${i}@example.com`, Date.now(), BUSY_IP);
const { CodeSendBlocked } = await import('@/lib/code-send-guard');
await assert.rejects(
  () => mail.sendCode(SCENE_SIGNIN, 'bob@example.com', BUSY_IP),
  (e: unknown) => e instanceof CodeSendBlocked,
  '额度用满的 IP 上，正常地址应被挡'
);
await mail.sendCode(SCENE_SIGNIN, REVIEW_EMAIL, BUSY_IP);
ok('IP 额度用满时审核身份仍能走完（旁路早退在限流之前）');

globalThis.fetch = realFetch;
delete process.env.AWD_MAIL_RESEND_KEY;
delete process.env.AWD_MAIL_FROM;

// ---------- 5. 短信通道 ----------
// 国内站以后手机端/小程序审核复用同一条，改法必须与邮箱这边对称。
console.log('--- 短信通道（sms-auth）---');
const sms = await import('@/lib/sms-auth');
const NORMAL_PHONE = '13900139000';

assert.strictEqual(
  sms.verifyCode(sms.SCENE_SIGNIN, '+86 138-0013-8000', FIXED_CODE),
  REVIEW_PHONE,
  '审核手机号 + 固定码必须放行，并返回规范化号码'
);
ok('审核手机号用固定码直接登录');

assert.throws(
  () => sms.verifyCode(sms.SCENE_SIGNIN, NORMAL_PHONE, FIXED_CODE),
  (e: unknown) => e instanceof sms.SmsError,
  '非审核号码拿固定码必须失败'
);
ok('非审核号码用固定码必须失败');

assert.throws(
  () => sms.verifyCode(sms.SCENE_BIND, REVIEW_PHONE, FIXED_CODE),
  (e: unknown) => e instanceof sms.SmsError,
  '绑定场景不得走旁路'
);
ok('绑定手机号（SCENE_BIND）不走旁路');

assert.strictEqual(sms.smsEnabled(), false, '本测试没配阿里云凭据');
await sms.sendCode(sms.SCENE_SIGNIN, REVIEW_PHONE, '203.0.113.7');
const smsLogs = (getDb().prepare('SELECT COUNT(*) AS n FROM sms_send_log WHERE phone = ?')
  .get(REVIEW_PHONE) as { n: number }).n;
assert.strictEqual(smsLogs, 0, '审核号码不得落 sms_send_log');
await assert.rejects(
  () => sms.sendCode(sms.SCENE_SIGNIN, NORMAL_PHONE, '203.0.113.7'),
  (e: unknown) => e instanceof sms.SmsError,
  '对照组：没配短信凭据时正常号码应报发送失败'
);
ok('给审核号码发码：不发短信、不落流水；正常号码照旧走原路');

// ---------- 6. 关掉就是真的关掉 ----------
console.log('--- 清空 identity 即关闭 ---');
configure(null, FIXED_CODE);
assert.throws(
  () => mail.verifyCode(SCENE_SIGNIN, REVIEW_EMAIL, FIXED_CODE),
  (e: unknown) => e instanceof mail.MailError,
  '清空 identity 后固定码必须立刻失效'
);
assert.throws(
  () => sms.verifyCode(sms.SCENE_SIGNIN, REVIEW_PHONE, FIXED_CODE),
  (e: unknown) => e instanceof sms.SmsError
);
ok('审核结束清空 AUTH_REVIEW_ACCOUNT_IDENTITY 即关闭，无需改代码');

// ---------- 7. 审核邮箱登录链路不会被别的闸拦住 ----------
// exchange-key 是插件登录的落点：验完码 → findOrCreateByEmail 自动建号 → gateForUser。
// 国际站 gateForUser 恒 ok（账号本体不是手机号），所以审核账号不会撞上 phone_binding_required。
console.log('--- exchange-key 的两道后置闸 ---');
{
  const { SITE_ID } = await import('@/lib/site-config');
  const { gateForUser, phoneIsAccount } = await import('@/lib/phone-policy');
  const { emailIsAccount } = await import('@/lib/mail-policy');
  console.log('  site =', SITE_ID);

  const src = fs.readFileSync(path.join(REPO, 'app/api/auth/exchange-key/route.ts'), 'utf8');
  assert.ok(/verifyFirstContact/.test(src), 'exchange-key 必须走首次验证而非直接签 Key');

  if (emailIsAccount()) {
    assert.strictEqual(phoneIsAccount(), false);
    assert.strictEqual(gateForUser({}), 'ok', 'intl 站没绑手机号也必须放行，否则审核账号第一次登录就被 403');
    ok('intl：审核邮箱首次登录自动建号后不会被 phone_binding_required 拦住');
  } else {
    // cn 站的账号本体是手机号，邮箱那条凭据形状本就走不通（exchange-key 会回
    // mail_not_supported_on_site），所以这条不适用；审核账号在 cn 走手机号那条。
    assert.strictEqual(emailIsAccount(), false);
    ok('cn：邮箱不是账号本体，审核账号走手机号那条（本条不适用）');
  }
}

const users = await import('@/lib/users');
const created = users.findOrCreateByEmail(REVIEW_EMAIL);
assert.strictEqual(created.created, true, '审核邮箱首次登录应自动建号');
assert.strictEqual(created.user.passwordHash, '', '建出来的账号无口令');
ok('审核邮箱首次登录自动建号（无需人工预建）');

console.log(`\n全部通过：${passed} 项`);
