/**
 * 微信小程序虚拟支付（dev-board#427）+ 官网账户注销传导（dev-board#434）验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-wxvp.mts
 * 两个站点各跑一遍：
 *   NEXT_PUBLIC_AWD_SITE=cn ... / NEXT_PUBLIC_AWD_SITE=intl ...
 *
 * 覆盖：
 * - **签名与官方示例向量对拍**：pay_sig 与用户态 signature 各一条，取自微信官方文档
 *   §2.6「参考的 Python 脚本」里的两条 assert（uri / post_body / appkey / session_key
 *   全部写死）。这两条是整条链路里唯一无法靠联调兜底的部分：算错了微信只回
 *   -15005 / -15006 两个数字，不会告诉你错在哪一步。
 * - signData 的形状与 `wx.requestVirtualPayment` 文档字段表一致，且**两个签名
 *   算的必须是同一个 signData 字符串**
 * - 消息推送验签：GET echostr（通过 / 失败）、POST（通过 / 失败）、未配 Token 整路由 404、
 *   安全模式（encrypt_type=aes）400
 * - 推送入账：不信推送里的金额，回查复核后 settleFromChannel；重复推送幂等；
 *   回查说没付 → ErrCode 非 0 让微信重推
 * - create-recharge：`channel:'wxvp'` 的档位校验（product_mismatch）、wxCode 必填、
 *   未知 channel 400、同幂等键换通道 409
 * - delete-account 四分支：deleted:true / blocked / key_disable_failed / account_not_found
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const SECRET = 'test-wxvp-secret-0123456789';
const PUSH_TOKEN = 'test-wxvp-push-token';

process.env.AWD_MOBILE_BILLING_SECRET = SECRET;
// OPENROUTER_PROVISIONING_KEY 刻意不设：key_disable_failed 那一分支要的就是「管理面未配置」。
delete process.env.OPENROUTER_PROVISIONING_KEY;

const { siteConfig } = await import('@/lib/site-config');
const { getDb } = await import('@/lib/db');
const { getOrder } = await import('@/lib/orders');
const { wxvpAdapter, calcPaySig, calcUserSignature, wxvpEnv } = await import(
    '@/lib/payments/wxvp-adapter'
);
const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/internal/account/route');
const push = await import('@/app/api/wx-mini/push/route');

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

/** 本站账号本体：cn 站是手机号、intl 站是邮箱。 */
let seq = 0;
function identifier(): Record<string, string> {
    seq += 1;
    return siteConfig.id === 'intl'
        ? { email: `wxvp-${seq}@test.local` }
        : { phone: `1380013${String(8000 + seq).padStart(4, '0')}` };
}

async function newAccount(): Promise<string> {
    const res = await POST(req({ action: 'resolve', ...identifier(), create: true }));
    assert.strictEqual(res.status, 200);
    return (await res.json()).accountId as string;
}

// ===========================================================================
console.log('\n[1] 签名算法与微信官方文档的示例向量对拍');
// ===========================================================================
{
    // 官方文档 §2.6：uri / post_body / appkey 全部写死，assert 的期望值原样抄来。
    const uri = '/xpay/query_user_balance';
    const postBody = '{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}';
    const appkey = '12345';
    assert.strictEqual(
        calcPaySig(uri, postBody, appkey),
        'c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5',
        'pay_sig 与官方示例向量不符'
    );

    // 同上：session_key 是 base64 文本，但**按 utf-8 原文当 HMAC key**，不解码。
    const sessionKey = '9hAb/NEYUlkaMBEsmFgzig==';
    assert.strictEqual(
        calcUserSignature(postBody, sessionKey),
        '089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7',
        '用户态 signature 与官方示例向量不符'
    );
    ok('pay_sig / signature 两条官方示例向量都对得上');

    // uri 拼法：pay_sig 签的是 `uri + '&' + body`，少一个 & 就是另一个签名
    assert.notStrictEqual(calcPaySig(uri, postBody, appkey), calcPaySig(uri + '&', postBody, appkey));
    ok('pay_sig 的 uri 与 body 之间恰好一个 &');
}

// ===========================================================================
console.log('\n[2] createCharge：真适配器 + 打桩的 jscode2session');
// ===========================================================================
{
    process.env.WXVP_OFFER_ID = '1450637533';
    process.env.WXVP_APP_KEY = 'prod-app-key';
    process.env.WXVP_APP_KEY_SANDBOX = 'sandbox-app-key';
    delete process.env.WXVP_ENV;
    assert.strictEqual(wxvpEnv(), 0, 'WXVP_ENV 缺省必须是现网（0）');
    process.env.WXVP_ENV = 'sandbox';
    assert.strictEqual(wxvpEnv(), 1, 'WXVP_ENV=sandbox → 沙箱（1）');

    // 只拦 jscode2session：整段跑的是**真的** createCharge，签名不是这里重算的。
    const SESSION_KEY = '9hAb/NEYUlkaMBEsmFgzig==';
    const realFetch = globalThis.fetch;
    let sessionCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('/sns/jscode2session')) {
            sessionCalls += 1;
            assert.ok(url.includes('grant_type=authorization_code'), 'jscode2session 缺 grant_type');
            assert.ok(url.includes('js_code=the-code'), 'jscode2session 必须带 wx.login 的 code');
            return new Response(JSON.stringify({ openid: 'oTest_openid', session_key: SESSION_KEY }), {
                headers: { 'content-type': 'application/json' },
            });
        }
        return realFetch(input, init);
    }) as typeof fetch;

    const outTradeNo = 'RECHARGETEST0001';
    const amountCents = 1000;
    try {
        for (const [label, envValue, expectedEnv, expectedKey] of [
            ['沙箱', 'sandbox', 1, 'sandbox-app-key'],
            ['现网', 'production', 0, 'prod-app-key'],
        ] as [string, string, number, string][]) {
            process.env.WXVP_ENV = envValue;
            const charge = await wxvpAdapter.createCharge({
                outTradeNo,
                description: '钱包充值',
                amountMinor: amountCents,
                baseUrl: 'https://test.local',
                productId: 'credits_cny_10',
                wxCode: 'the-code',
            });
            assert.strictEqual(charge.channel, 'wxvp');
            assert.ok(charge.channel === 'wxvp');
            assert.strictEqual(charge.present, 'virtual');
            assert.strictEqual(charge.providerRef, 'oTest_openid', 'openid 要回给路由落库');

            // signData 的字段表照 wx.requestVirtualPayment 文档
            const parsed = JSON.parse(charge.signData);
            assert.deepStrictEqual(
                Object.keys(parsed).sort(),
                ['attach', 'buyQuantity', 'currencyType', 'env', 'goodsPrice', 'offerId', 'outTradeNo', 'productId'],
                `${label}：signData 字段与文档字段表不符`
            );
            assert.strictEqual(parsed.offerId, '1450637533');
            assert.strictEqual(parsed.buyQuantity, 1);
            assert.strictEqual(parsed.currencyType, 'CNY', 'currencyType 目前只能是 CNY（-15004）');
            assert.strictEqual(parsed.goodsPrice, amountCents, 'buyQuantity=1 时 goodsPrice 就是整单金额');
            assert.strictEqual(parsed.outTradeNo, outTradeNo);
            assert.strictEqual(parsed.env, expectedEnv, `${label}：env 必须跟着 WXVP_ENV 走`);

            // 两个签名必须是对**这个 signData 字符串**算的（uri 固定 requestVirtualPayment）
            assert.strictEqual(
                charge.paySig,
                calcPaySig('requestVirtualPayment', charge.signData, expectedKey),
                `${label}：paySig 必须用对应环境的 AppKey`
            );
            assert.strictEqual(
                charge.signature,
                calcUserSignature(charge.signData, SESSION_KEY),
                `${label}：signature 必须用 session_key 算`
            );
            assert.notStrictEqual(charge.paySig, charge.signature);
            assert.ok(
                !JSON.stringify(charge).includes(SESSION_KEY),
                'session_key 绝不许出现在 createCharge 的返回里'
            );
            // 单号要满足文档的 8-32 字符、只含数字/大小写字母/ _-|*@ 且不以 _ 开头
            assert.ok(/^[0-9A-Za-z_\-|*@]{8,32}$/.test(outTradeNo) && !outTradeNo.startsWith('_'));
        }
        assert.strictEqual(sessionCalls, 2, '每次建单都要用一次性的 code 换一次 session_key');
    } finally {
        globalThis.fetch = realFetch;
    }
    process.env.WXVP_ENV = 'production';
    ok('createCharge：signData 字段表对得上，paySig/signature 跟着 env 换 AppKey，session_key 不外泄');

    // 缺 productId / wxCode 时不许拿空串去签一个废签名
    for (const missing of [{ wxCode: 'c' }, { productId: 'credits_cny_10' }]) {
        await assert.rejects(
            () => wxvpAdapter.createCharge({ outTradeNo, description: 'x', amountMinor: 1000, baseUrl: 'https://test.local', ...missing }),
            /缺 (productId|wxCode)/
        );
    }
    ok('createCharge 缺 productId / wxCode → 直接抛错');
}

// ===========================================================================
console.log('\n[3] 消息推送：未配 Token → 整路由 404');
// ===========================================================================
function pushUrl(params: Record<string, string>): string {
    return `https://test.local/api/wx-mini/push?${new URLSearchParams(params).toString()}`;
}
function sign(timestamp: string, nonce: string, token = PUSH_TOKEN): string {
    return crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
}
function pushGet(params: Record<string, string>) {
    return new NextRequest(pushUrl(params), { method: 'GET' });
}
function pushPost(params: Record<string, string>, body: unknown) {
    return new NextRequest(pushUrl(params), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}
{
    delete process.env.WXVP_PUSH_TOKEN;
    const g = await push.GET(pushGet({ signature: 'x', timestamp: '1', nonce: 'n', echostr: 'hello' }));
    assert.strictEqual(g.status, 404);
    assert.strictEqual(await g.text(), '', '未配置必须是空体 404，与路由不存在不可区分');
    const p = await push.POST(pushPost({ signature: 'x', timestamp: '1', nonce: 'n' }, {}));
    assert.strictEqual(p.status, 404);
    ok('WXVP_PUSH_TOKEN 未配置 → GET/POST 都是空体 404');
}

process.env.WXVP_PUSH_TOKEN = PUSH_TOKEN;

// ===========================================================================
console.log('\n[4] 消息推送验签：GET echostr / POST / 安全模式');
// ===========================================================================
{
    const ts = '1757400000';
    const nonce = 'abc123';
    const good = { signature: sign(ts, nonce), timestamp: ts, nonce, echostr: 'echo-me' };

    const okRes = await push.GET(pushGet(good));
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(await okRes.text(), 'echo-me', '验签通过必须原样回 echostr（纯文本）');
    assert.ok(
        (okRes.headers.get('content-type') || '').startsWith('text/plain'),
        'echostr 回 JSON 会被公众平台判失败'
    );

    for (const [label, params] of [
        ['签名错', { ...good, signature: 'deadbeef'.repeat(5) }],
        ['缺签名', { timestamp: ts, nonce, echostr: 'echo-me' }],
        ['换了 token 算的签名', { ...good, signature: sign(ts, nonce, 'other-token') }],
        ['时间戳被改', { ...good, timestamp: '1757400001' }],
    ] as [string, Record<string, string>][]) {
        const r = await push.GET(pushGet(params));
        assert.strictEqual(r.status, 401, `${label} 必须被拒`);
    }
    ok('GET：验签通过回 echostr；签名错/缺失/换 token/改时间戳一律 401');

    const badPost = await push.POST(pushPost({ signature: 'bad', timestamp: ts, nonce }, { Event: 'x' }));
    assert.strictEqual(badPost.status, 401);
    ok('POST：验签失败 → 401（不解析报文体）');

    const aes = await push.POST(
        pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce, encrypt_type: 'aes' }, { Encrypt: '...' })
    );
    assert.strictEqual(aes.status, 400);
    assert.strictEqual((await aes.json()).error, 'encrypt_mode_unsupported');
    ok('POST：安全模式（encrypt_type=aes）→ 400，不做半套解密');

    const other = await push.POST(
        pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce }, { Event: 'xpay_refund_notify' })
    );
    assert.deepStrictEqual(await other.json(), { ErrCode: 0, ErrMsg: 'success' }, '其它事件收妥即可');
    const missing = await push.POST(
        pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce }, { Event: 'xpay_goods_deliver_notify' })
    );
    assert.strictEqual((await missing.json()).ErrCode, -1, '缺 OutTradeNo → 非 0');
    const unknownOrder = await push.POST(
        pushPost(
            { signature: sign(ts, nonce), timestamp: ts, nonce },
            { Event: 'xpay_goods_deliver_notify', OutTradeNo: 'RECHARGENOSUCHORDER' }
        )
    );
    assert.strictEqual((await unknownOrder.json()).ErrCode, -1, '查无此单 → 非 0，让微信重推并留日志');
    ok('推送体异常（缺单号 / 查无此单）→ ErrCode 非 0；无关事件 → ErrCode 0');
}

// ===========================================================================
console.log('\n[5] create-recharge channel=wxvp：档位校验与参数校验');
// ===========================================================================
const accountA = await newAccount();
{
    // 未知 channel 一律 400，不静默回落到站点默认通道
    const bad = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'alipay', amountCents: 1000, idempotencyKey: 'k-bad-channel' })
    );
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await bad.json()).error, 'unsupported_channel');

    // 档位与金额不符 → product_mismatch（**先于通道可用性判定**，两站行为一致）
    for (const [label, productId, amountCents] of [
        ['金额与档位不符', 'credits_cny_10', 5000],
        ['不存在的档位', 'credits_cny_999', 1000],
        ['缺 productId', undefined, 1000],
        ['原型链上的键', 'constructor', 1000],
    ] as [string, string | undefined, number][]) {
        const r = await POST(
            req({
                action: 'create-recharge',
                accountId: accountA,
                channel: 'wxvp',
                ...(productId === undefined ? {} : { productId }),
                amountCents,
                idempotencyKey: `k-pm-${label}`,
            })
        );
        assert.strictEqual(r.status, 400, `${label} → 400`);
        assert.strictEqual((await r.json()).error, 'product_mismatch', `${label} → product_mismatch`);
    }
    ok('三档之外的任何 productId/金额组合 → 400 product_mismatch（含原型链键）');

    const noCode = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'wxvp', productId: 'credits_cny_10', amountCents: 1000, idempotencyKey: 'k-nocode' })
    );
    assert.strictEqual(noCode.status, 400);
    assert.strictEqual((await noCode.json()).error, 'wx_code_required');
    ok('缺 wxCode → 400 wx_code_required');
}

// ===========================================================================
console.log('\n[6] 通道未开通 → 503（国际站与未配密钥的部署都是这条）');
// ===========================================================================
{
    const savedOffer = process.env.WXVP_OFFER_ID;
    delete process.env.WXVP_OFFER_ID;
    const r = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'wxvp', productId: 'credits_cny_10', amountCents: 1000, idempotencyKey: 'k-unconf', wxCode: 'code-1' })
    );
    assert.strictEqual(r.status, 503);
    assert.strictEqual((await r.json()).error, 'payment_channel_unavailable');
    process.env.WXVP_OFFER_ID = savedOffer;
    ok('WXVP_OFFER_ID 缺失 → 503 payment_channel_unavailable（不落单）');

    if (siteConfig.id === 'intl') {
        // 国际站没有小程序主体，wxMiniConfigured() 恒 false
        assert.strictEqual(wxvpAdapter.isConfigured(), false, '国际站必须判虚拟支付未开通');
        ok('国际站：虚拟支付通道恒未开通');
    }
}

// ===========================================================================
console.log('\n[7] 建单 → 推送入账 → 幂等（adapter 打桩，不打微信）');
// ===========================================================================
const ORDER_AMOUNT = 5000;
let orderNo = '';
{
    // 真跑要 AppSecret + 微信接口。本段验的是通道之上的那一层：
    // 落单形状、openid 落库、推送验签后的回查复核与结算收敛。
    wxvpAdapter.isConfigured = () => true;
    wxvpAdapter.createCharge = async ({ outTradeNo, amountMinor, productId, wxCode }) => {
        assert.ok(productId, 'createCharge 必须拿到 productId');
        assert.ok(wxCode, 'createCharge 必须拿到 wxCode');
        const signData = JSON.stringify({
            offerId: '1450637533',
            buyQuantity: 1,
            env: 0,
            currencyType: 'CNY',
            productId,
            goodsPrice: amountMinor,
            outTradeNo,
            attach: outTradeNo,
        });
        return {
            channel: 'wxvp' as const,
            present: 'virtual' as const,
            signData,
            paySig: calcPaySig('requestVirtualPayment', signData, 'prod-app-key'),
            signature: calcUserSignature(signData, 'stub-session-key'),
            providerRef: 'oStub_openid',
        };
    };
    let queryResult: Awaited<ReturnType<typeof wxvpAdapter.queryCharge>> = null;
    wxvpAdapter.queryCharge = async () => queryResult;

    const created = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'wxvp', productId: 'credits_cny_50', amountCents: ORDER_AMOUNT, idempotencyKey: 'k-wxvp-1', wxCode: 'code-1' })
    );
    assert.strictEqual(created.status, 200);
    const body = await created.json();
    assert.strictEqual(body.present, 'virtual');
    assert.strictEqual(body.amountCents, ORDER_AMOUNT);
    for (const key of ['signData', 'paySig', 'signature', 'outTradeNo']) {
        assert.ok(typeof body[key] === 'string' && body[key].length > 0, `响应缺 ${key}`);
    }
    assert.ok(!('sessionKey' in body) && !('session_key' in body), 'session_key 绝不许出现在响应里');
    // 两个签名必须是对回给小程序的那个 signData 算的，一个字节都不能差
    assert.strictEqual(body.paySig, calcPaySig('requestVirtualPayment', body.signData, 'prod-app-key'));
    assert.strictEqual(body.signature, calcUserSignature(body.signData, 'stub-session-key'));
    orderNo = body.outTradeNo;

    const order = getOrder(orderNo)!;
    assert.strictEqual(order.channel, 'wxvp', '订单必须记 wxvp 通道');
    assert.strictEqual(order.currency, 'CNY', '虚拟支付恒 CNY，与站点币种无关');
    assert.strictEqual(order.providerRef, 'oStub_openid', 'openid 必须落库供回查用');
    assert.strictEqual(order.status, 'pending');
    ok('channel=wxvp 建单 → present:virtual + 三件套，订单记 wxvp/CNY/openid');

    // 同一把幂等键换通道 → 409（不许一张单中途改通道）
    const conflict = await POST(
        req({ action: 'create-recharge', accountId: accountA, amountCents: ORDER_AMOUNT, idempotencyKey: 'k-wxvp-1' })
    );
    assert.strictEqual(conflict.status, 409);
    assert.strictEqual((await conflict.json()).error, 'idempotency_conflict');
    ok('同幂等键换通道 → 409 idempotency_conflict');

    const ts = '1757400100';
    const nonce = 'push1';
    const pushBody = {
        Event: 'xpay_goods_deliver_notify',
        OutTradeNo: orderNo,
        OpenId: 'oStub_openid',
        Env: 0,
        // 推送体里的金额是**假的**：只有回查说了算
        GoodsInfo: { ProductId: 'credits_cny_50', Quantity: 1, OrigPrice: 1, ActualPrice: 1 },
    };

    // 回查还没确认 → ErrCode 非 0，让微信重推
    queryResult = { channel: 'wxvp', outTradeNo: orderNo, paid: false, amountMinor: 0, currency: 'CNY' };
    const notYet = await push.POST(pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce }, pushBody));
    assert.strictEqual((await notYet.json()).ErrCode, -1);
    assert.strictEqual(getOrder(orderNo)!.status, 'pending', '未确认收款不许写状态');
    ok('推送到达但回查未确认 → ErrCode 非 0 且不入账');

    // 回查金额与订单不符 → 拒绝结算（推送体里那个 1 分就是这么被挡住的）
    queryResult = { channel: 'wxvp', outTradeNo: orderNo, paid: true, amountMinor: 1, currency: 'CNY' };
    const mismatch = await push.POST(pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce }, pushBody));
    assert.strictEqual((await mismatch.json()).ErrCode, -1);
    assert.strictEqual(getOrder(orderNo)!.status, 'pending', '金额不符一分钱都不许写');
    ok('回查金额与订单不符 → 拒绝结算，ErrCode 非 0');

    // 正常到账
    queryResult = {
        channel: 'wxvp',
        outTradeNo: orderNo,
        paid: true,
        amountMinor: ORDER_AMOUNT,
        currency: 'CNY',
        transactionId: '42000000000000000001',
        payerRef: 'oStub_openid',
    };
    const settled = await push.POST(pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce }, pushBody));
    assert.deepStrictEqual(await settled.json(), { ErrCode: 0, ErrMsg: 'success' });
    assert.strictEqual(getOrder(orderNo)!.status, 'paid');
    const topup = getDb()
        .prepare("SELECT originalCents FROM credit_lots WHERE userId = ? AND refOrderId = ? AND pool = 'topup'")
        .get(accountA, orderNo) as { originalCents: number } | undefined;
    assert.strictEqual(topup?.originalCents, ORDER_AMOUNT, '必须落 topup 批次');
    ok('推送 → 回查复核 → settleFromChannel 入账 topup 5000 分，回 ErrCode 0');

    // 重复推送：不再出站回查，直接收妥，也不许重复发币
    let queried = false;
    wxvpAdapter.queryCharge = async () => {
        queried = true;
        return queryResult;
    };
    const again = await push.POST(pushPost({ signature: sign(ts, nonce), timestamp: ts, nonce }, pushBody));
    assert.deepStrictEqual(await again.json(), { ErrCode: 0, ErrMsg: 'success' });
    assert.strictEqual(queried, false, '已付的单不该再出站回查一次');
    const lots = getDb()
        .prepare("SELECT COUNT(*) AS c FROM credit_lots WHERE refOrderId = ? AND pool = 'topup'")
        .get(orderNo) as { c: number };
    assert.strictEqual(lots.c, 1, '重复推送不许重复发币');
    ok('重复推送幂等：回 ErrCode 0、不回查、不重复发币');
}

// ===========================================================================
console.log('\n[8] delete-account 四分支（dev-board#434）');
// ===========================================================================
{
    // --- 分支一：blocked。accountA 刚充了 5000 分 topup，是可退余额 ---
    const blocked = await POST(req({ action: 'delete-account', accountId: accountA }));
    assert.strictEqual(blocked.status, 200, 'blocked 是账户状态不是请求错误，回 200');
    const bb = await blocked.json();
    assert.strictEqual(bb.deleted, false);
    assert.strictEqual(bb.blocker, 'has_pending_balance');
    assert.ok(typeof bb.message === 'string' && bb.message.length > 0, 'blocker 必须带可读 message');
    assert.strictEqual(getOrder(orderNo)!.userId, accountA, 'blocked 时一个字节都不许写');
    ok('有可退余额 → 200 {deleted:false, blocker:has_pending_balance, message}，本地未动');

    // --- 分支二：key_disable_failed。有活的 provisioned key 而管理面未配置 ---
    const accountC = await newAccount();
    getDb()
        .prepare('INSERT INTO openrouter_keys (userId, orKeyHash, limitUsd, createdAt) VALUES (?, ?, ?, ?)')
        .run(accountC, 'hash-c', 5, new Date().toISOString());
    const keyFail = await POST(req({ action: 'delete-account', accountId: accountC }));
    assert.strictEqual(keyFail.status, 502);
    const kb = await keyFail.json();
    assert.strictEqual(kb.error, 'key_disable_failed');
    const stillActive = getDb()
        .prepare('SELECT COUNT(*) AS c FROM openrouter_keys WHERE userId = ? AND disabledAt IS NULL')
        .get(accountC) as { c: number };
    assert.strictEqual(stillActive.c, 1, '作废失败时什么都不许删');
    ok('远端 AI 通道作废失败 → 502 key_disable_failed，未做任何改动');

    // --- 分支三：deleted:true ---
    const accountB = await newAccount();
    const done = await POST(req({ action: 'delete-account', accountId: accountB }));
    assert.strictEqual(done.status, 200);
    const db2 = await done.json();
    assert.strictEqual(db2.deleted, true);
    assert.ok(typeof db2.deletedAt === 'string' && db2.deletedAt.length > 0);
    assert.ok(Array.isArray(db2.notes) && db2.notes.length > 0, '要回可读的处置说明');
    ok('可注销的账户 → 200 {deleted:true, deletedAt, notes}');

    // --- 分支四：再删一次 / 删不存在的 → 404 account_not_found（云后端视为已删）---
    const again = await POST(req({ action: 'delete-account', accountId: accountB }));
    assert.strictEqual(again.status, 404);
    assert.strictEqual((await again.json()).error, 'account_not_found');
    const ghost = await POST(req({ action: 'delete-account', accountId: crypto.randomUUID() }));
    assert.strictEqual(ghost.status, 404);
    assert.strictEqual((await ghost.json()).error, 'account_not_found');
    ok('墓碑账户 / 查无账户 → 404 account_not_found（重复调用幂等）');

    // 鉴权仍然管着这条 action：密钥不对一律空体 404
    const noAuth = await POST(req({ action: 'delete-account', accountId: accountA }, 'wrong'));
    assert.strictEqual(noAuth.status, 404);
    assert.strictEqual(await noAuth.text(), '', '鉴权失败必须是空体 404');
    ok('delete-account 同样受共享密钥保护（密钥错 → 空体 404）');
}

console.log(`\n虚拟支付 + 注销传导全绿：${passed} 项`);
