/**
 * 微信手机号一键登录的内部换号口（dev-board#534，规格
 * `2026-09-09-miniprogram-entry-and-wx-login.md` §2「官网」一段）验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-wx-phone.mts
 * 两个站点各跑一遍（国际站没有小程序主体，整条能力恒未开通）：
 *   NEXT_PUBLIC_AWD_SITE=cn ... / NEXT_PUBLIC_AWD_SITE=intl ...
 *
 * 覆盖 `{action:"wx-phone", code}` 的五种出口：
 * - 成功 → 200 `{phone}`（normalizePhone 后的大陆号）
 * - 非 86 号码 / countryCode 说 86 但号码不合法 → 400 unsupported_region
 * - 微信侧 errcode（code 无效/过期/重放）→ 401 invalid_wx_code
 * - 未配 WX_MINI_APP_SECRET（国际站恒如此）→ 503 wx_not_configured
 * - code 缺失 / 非字符串 / 空串 / 超 128 → 400 bad_request
 * 外加两条不变量：
 * - 鉴权仍然管着这条 action（密钥错 → **空体** 404）
 * - **一个字节都不写**：换号成功后官网既没有这个手机号的账户，也没有任何赠额批次
 *   （这正是它与公开路由 /api/auth/wx-phone 的区别）
 *
 * 微信接口用 fetch 打桩（比替换 wxGetPhoneNumber 更贴真实：stable_token 取用、
 * errcode → WxError 的映射、phone_info 的解析都跑的是真代码）。
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const SECRET = 'test-wx-phone-secret-0123456789';
process.env.AWD_MOBILE_BILLING_SECRET = SECRET;
// 先不设 AppSecret：第一批用例验的就是「未配置 → 503」。
delete process.env.WX_MINI_APP_SECRET;

const { siteConfig } = await import('@/lib/site-config');
const { getDb } = await import('@/lib/db');
const { findUserByPhone } = await import('@/lib/users');
const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/internal/account/route');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

function req(body: Record<string, unknown>, secretHeader?: string | null) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secretHeader !== null) headers['x-internal-secret'] = secretHeader ?? SECRET;
    return new NextRequest('https://test.local/api/internal/account', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

/**
 * 只拦微信的两条出站（stable_token / getuserphonenumber），别的原样放行。
 * `phone` 给对象 = 换号成功，给数字 = 微信回这个 errcode。
 */
const realFetch = globalThis.fetch;
let phoneReply: { purePhoneNumber: string; countryCode: string } | number = 0;
let phoneCalls = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.includes('/cgi-bin/stable_token')) {
        return json({ access_token: 'stub-token', expires_in: 7200 });
    }
    if (url.includes('/wxa/business/getuserphonenumber')) {
        phoneCalls += 1;
        assert.ok(url.includes('access_token=stub-token'), '换号必须带 access_token');
        if (typeof phoneReply === 'number') {
            return json({ errcode: phoneReply, errmsg: 'stubbed failure' });
        }
        return json({ errcode: 0, errmsg: 'ok', phone_info: phoneReply });
    }
    return realFetch(input, init);
}) as typeof fetch;

// ===========================================================================
console.log('\n[1] 未配 AppSecret → 503 wx_not_configured');
// ===========================================================================
{
    const r = await POST(req({ action: 'wx-phone', code: 'the-code' }));
    assert.strictEqual(r.status, 503);
    assert.strictEqual((await r.json()).error, 'wx_not_configured');
    assert.strictEqual(phoneCalls, 0, '未开通时不许出站打微信接口');
    ok('WX_MINI_APP_SECRET 未配置 → 503 wx_not_configured（不出站）');
}

process.env.WX_MINI_APP_SECRET = 'stub-app-secret';

if (siteConfig.id === 'intl') {
    // 国际站的小程序主体在大陆，wxMiniConfigured() 恒 false：配了 AppSecret 也一样。
    const r = await POST(req({ action: 'wx-phone', code: 'the-code' }));
    assert.strictEqual(r.status, 503);
    assert.strictEqual((await r.json()).error, 'wx_not_configured');
    assert.strictEqual(phoneCalls, 0);
    ok('国际站：即便配了 AppSecret 也恒 503 wx_not_configured');
} else {
    // =======================================================================
    console.log('\n[2] code 形状不合格 → 400 bad_request（不出站）');
    // =======================================================================
    {
        for (const [label, body] of [
            ['缺 code', {}],
            ['空串', { code: '' }],
            ['只有空白', { code: '   ' }],
            ['非字符串', { code: 12345 }],
            ['超 128', { code: 'x'.repeat(129) }],
        ] as [string, Record<string, unknown>][]) {
            const r = await POST(req({ action: 'wx-phone', ...body }));
            assert.strictEqual(r.status, 400, `${label} → 400`);
            assert.strictEqual((await r.json()).error, 'bad_request', `${label} → bad_request`);
        }
        assert.strictEqual(phoneCalls, 0, 'code 形状就不对时不该白打一趟微信接口');
        ok('缺 code / 空串 / 非字符串 / 超 128 → 400 bad_request（不出站）');
    }

    // =======================================================================
    console.log('\n[3] 微信 errcode → 401 invalid_wx_code');
    // =======================================================================
    {
        // 40029 = code 无效；-1 = 系统繁忙。都归到「让用户重点一次授权」这一类。
        for (const errcode of [40029, 40163, -1]) {
            phoneReply = errcode;
            const r = await POST(req({ action: 'wx-phone', code: 'bad-code' }));
            assert.strictEqual(r.status, 401, `errcode ${errcode} → 401`);
            assert.strictEqual((await r.json()).error, 'invalid_wx_code');
        }
        ok('微信回非 0 errcode（code 无效/过期/重放）→ 401 invalid_wx_code');
    }

    // =======================================================================
    console.log('\n[4] 非大陆号 → 400 unsupported_region');
    // =======================================================================
    {
        phoneReply = { purePhoneNumber: '61234567', countryCode: '852' };
        const hk = await POST(req({ action: 'wx-phone', code: 'hk-code' }));
        assert.strictEqual(hk.status, 400);
        assert.strictEqual((await hk.json()).error, 'unsupported_region');

        // countryCode 说 86，号码却不是大陆 11 位 → normalizePhone 抛 SmsError，
        // 同一个出口：云后端只有「仅支持中国大陆手机号」这一句话要说。
        phoneReply = { purePhoneNumber: '12345', countryCode: '86' };
        const bad = await POST(req({ action: 'wx-phone', code: 'bad-number' }));
        assert.strictEqual(bad.status, 400);
        assert.strictEqual((await bad.json()).error, 'unsupported_region');
        ok('countryCode 非 86 / 号码非大陆 11 位 → 400 unsupported_region');
    }

    // =======================================================================
    console.log('\n[5] 成功 → 200 {phone}，且官网这侧一个字节都没写');
    // =======================================================================
    {
        const PHONE = '13800138000';
        phoneReply = { purePhoneNumber: PHONE, countryCode: '86' };
        const r = await POST(req({ action: 'wx-phone', code: 'good-code' }));
        assert.strictEqual(r.status, 200);
        const body = await r.json();
        assert.strictEqual(body.phone, PHONE, '回的是 normalizePhone 后的大陆号');
        assert.deepStrictEqual(Object.keys(body), ['phone'], '只回 phone：不签票据、不回 accountId');

        // 与公开路由 /api/auth/wx-phone 的区别就在这里：不建号、不发赠额。
        assert.strictEqual(findUserByPhone(PHONE), undefined, 'wx-phone 绝不许建出官网账户');
        const lots = getDb().prepare('SELECT COUNT(*) AS c FROM credit_lots').get() as { c: number };
        assert.strictEqual(lots.c, 0, 'wx-phone 绝不许发任何赠额批次');
        ok('换号成功 → 200 {phone}；不建账户、不发赠额、不签会话');

        // 带 +86 / 空格的写法也要收敛到同一个 11 位（与短信通道同口径）
        phoneReply = { purePhoneNumber: '+86 138 0013 8001', countryCode: '86' };
        const norm = await POST(req({ action: 'wx-phone', code: 'good-code-2' }));
        assert.strictEqual(norm.status, 200);
        assert.strictEqual((await norm.json()).phone, '13800138001');
        ok('purePhoneNumber 带 +86/空格 → normalizePhone 收敛成 11 位');
    }
}

// ===========================================================================
console.log('\n[6] 鉴权：这条 action 同样受共享密钥保护');
// ===========================================================================
{
    for (const [label, secretHeader] of [
        ['密钥错', 'wrong-secret'],
        ['缺 header', null],
    ] as [string, string | null][]) {
        const r = await POST(req({ action: 'wx-phone', code: 'good-code' }, secretHeader));
        assert.strictEqual(r.status, 404, `${label} → 404`);
        assert.strictEqual(await r.text(), '', `${label} 必须是空体 404，与路由不存在不可区分`);
    }
    ok('密钥错 / 缺 header → 空体 404（与 resolve 等 action 同一道闸）');
}

globalThis.fetch = realFetch;
console.log(`\n微信手机号内部换号口全绿：${passed} 项`);
