/**
 * 人机验证的服务端校验自测。
 *
 * 最要紧的一条是**阿里云回包的两层**：外层 `Success` 只表示「这次 API 调用成功」，
 * `Result.VerifyResult` 才是「这个人过了没」。只看外层会把**所有失败的校验都当成通过**——
 * 这个闸会变成完全的摆设，而且从日志上看一切正常。本脚本专门钉住它。
 *
 * 必须在一个空目录里执行：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-captcha.mts
 */
import assert from 'assert';

let passed = 0;
const ok = (l: string) => { passed++; console.log('  ok -', l); };

const { SITE_ID } = await import('@/lib/site-config');
console.log('site =', SITE_ID);

// ---------- 1. 未配置时完全惰性 ----------
console.log('--- 未配置 ---');
delete process.env.AWD_TURNSTILE_SECRET;
delete process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID;
delete process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET;
const c1 = await import('@/lib/captcha');
assert.strictEqual(c1.captchaEnabled(), false, '没配密钥必须判为未启用');
assert.strictEqual(c1.captchaClientConfig(), null, '未启用时不得下发公开参数（否则控件渲染了却没人校验）');
const origFetch = globalThis.fetch;
let fetched = 0;
globalThis.fetch = (async () => { fetched++; throw new Error('不该发生的网络调用'); }) as any;
await c1.verifyCaptcha('', '1.2.3.4');
await c1.verifyCaptcha('whatever', '1.2.3.4');
assert.strictEqual(fetched, 0, '未启用时一次网络调用都不该有');
ok('未配置 = 完全惰性：不校验、不下发公开参数、不发网络请求');

// ---------- 2. 站点分叉 ----------
console.log('--- 站点分叉 ---');
const { captchaProvider } = await import('@/lib/captcha-config');
assert.strictEqual(captchaProvider(), SITE_ID === 'intl' ? 'turnstile' : 'aliyun');
ok(`${SITE_ID} 用 ${captchaProvider()}（intl 走 Turnstile，cn 走阿里云——大陆访问 Cloudflare 不稳）`);

// ---------- 3. 阿里云回包的两层（最容易写错的地方） ----------
console.log('--- 阿里云两层判定 ---');
process.env.NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID = 'scene';
process.env.NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX = 'pfx';
process.env.NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY = 'sitekey';
process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID = 'ak';
process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET = 'sk';
process.env.AWD_TURNSTILE_SECRET = 'secret';

async function withReply(body: any, fn: (m: typeof import('@/lib/captcha')) => Promise<void>) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
  // 不需要重新 import：captcha-config 全是调用时读 env 的函数，没有顶层 const
  await fn(c1);
}
const rejects = async (mod: typeof import('@/lib/captcha'), label: string) => {
  await assert.rejects(() => mod.verifyCaptcha('tok', '1.2.3.4'), (e: unknown) => e instanceof mod.CaptchaRejected, label);
  ok(label);
};

if (SITE_ID === 'cn') {
  // 外层成功、里层失败 —— 必须拒。这是本脚本存在的主要理由。
  await withReply({ Success: true, Code: 'Success', Result: { VerifyResult: false, VerifyCode: 'F001' } },
    m => rejects(m, '外层 Success=true 但 Result.VerifyResult=false 必须拒（只看外层=闸门形同虚设）'));
  await withReply({ Success: true, Code: 'Success', Result: { VerifyResult: true } },
    async m => { await m.verifyCaptcha('tok', '1.2.3.4'); ok('两层都为 true 才放行'); });
  await withReply({ Success: false, Code: 'Forbidden' },
    m => rejects(m, '外层就失败当然要拒'));
  await withReply({ Success: true, Code: 'Success' },
    m => rejects(m, '缺 Result 字段要拒，不能当成通过'));
} else {
  await withReply({ success: true }, async m => { await m.verifyCaptcha('tok', '1.2.3.4'); ok('Turnstile success=true 放行'); });
  await withReply({ success: false, 'error-codes': ['invalid-input-response'] },
    m => rejects(m, 'Turnstile success=false 必须拒'));
  await withReply({}, m => rejects(m, '回包没有 success 字段要拒，不能当成通过'));
}

// ---------- 4. 启用后缺 token 一律拒 ----------
console.log('--- 缺 token ---');
await withReply({ Success: true, Result: { VerifyResult: true }, success: true }, async m => {
  assert.strictEqual(m.captchaEnabled(), true, '配齐后必须判为启用');
  await assert.rejects(() => m.verifyCaptcha('', '1.2.3.4'), (e: unknown) => e instanceof m.CaptchaRejected);
  await assert.rejects(() => m.verifyCaptcha(undefined, '1.2.3.4'), (e: unknown) => e instanceof m.CaptchaRejected);
  ok('启用后缺 token 一律拒——否则不带 token 就绕过去了，这条闸就是摆设');
  assert.ok(m.captchaClientConfig(), '启用后必须下发公开参数，否则控件渲染不出来');
  ok('启用后才下发公开参数');
});

// ---------- 5. 校验服务连不上 → 放行但告警 ----------
console.log('--- 上游不可达 ---');
globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as any;
{
  await c1.verifyCaptcha('tok', '1.2.3.4');
  ok('校验服务不可达时放行（否则 Cloudflare/阿里云抖一下我们就全站登不进来；Layer 1 的 IP 限流仍在）');
}
globalThis.fetch = origFetch;

// ---------- 6. 公开配置端点：只出公开参数，密钥一个都不许漏 ----------
console.log('--- captcha-config 端点 ---');
{
  const { GET } = await import('@/app/api/auth/captcha-config/route');
  const body = await (await GET()).json();
  const text = JSON.stringify(body);
  for (const leak of ['secret', 'AccessKeySecret', process.env.AWD_TURNSTILE_SECRET, process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET]) {
    if (leak) assert.ok(!text.includes(leak), `公开端点泄漏了密钥: ${leak.slice(0, 6)}...`);
  }
  ok('公开配置端点不含任何密钥');
  assert.ok(body.provider, '启用时必须回 provider，客户端据此选控件');
  ok('启用时回 provider 与公开参数');
}
console.log(`\n全部通过：${passed} 项`);
