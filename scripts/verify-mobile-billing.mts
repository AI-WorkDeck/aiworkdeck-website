/**
 * 手机端统一账户内部记账口（dev-board#425，设计 §3.2）验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-mobile-billing.mts
 * 两个站点各跑一遍（币种/通道分叉）：
 *   NEXT_PUBLIC_AWD_SITE=cn ... / NEXT_PUBLIC_AWD_SITE=intl ...
 *
 * 覆盖：
 * - env 未设 AWD_MOBILE_BILLING_SECRET → 404；secret 错/缺 → 404（与不存在不可区分）
 * - 与 transfer 口的密钥**互不通用**（拿 AWD_TRANSFER_BILLING_SECRET 来敲一样 404）
 * - **两种 404 的形状必须可区分**：鉴权/配置失败 = 空体；业务未命中 = 带 JSON body
 * - resolve：`create` 缺省 false，未命中回带 body 的 404 且**一个账号都不建**；
 *   只有布尔 `true` 才算数（字符串 "true" / 数字 1 一律当没传）
 * - resolve：`create=true` 建号并发注册赠额（reward 批次 + signup_grant ref），重放幂等
 * - resolve：账号已存在时 `create=false` 的纯读路径照样回 accountId
 * - resolve：phone 与 email 同时给 / 都不给 → 400；号码非法 → 400
 * - balance：未过期批次之和 + 站点币种 + plan
 * - create-recharge：金额非正整数 / 超上限 / 缺幂等键 → 400；同幂等键复用同一单号
 * - create-recharge：同幂等键换金额 → 409；已付单重放 → 409
 * - query：跨用户拿别人的单号 → 404（越权与不存在同一响应）
 * - query：本地已 paid 直接回，pending 走通道回查并经 settleFromChannel 入账
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
// 空 users.json：本脚本的账号全部由 resolve 建出来，正好把建号这条路一起验了
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const SECRET = 'test-mobile-billing-secret-0123456789';
const TRANSFER_SECRET = 'test-transfer-secret-9876543210';
// 先不设 AWD_MOBILE_BILLING_SECRET：第一批用例要验证「未配置 = 404」。

const { siteConfig } = await import('@/lib/site-config');
const { getDb, withTransaction } = await import('@/lib/db');
const { grantCredits } = await import('@/lib/credits');
const { getThresholds } = await import('@/lib/gateway/config');
const { getPaymentAdapter } = await import('@/lib/payments');
const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/internal/account/route');

// 通道 adapter 打桩：真跑要微信商户私钥 / Stripe key，而本脚本要验的是
// 通道无关的那一层（幂等、归属、金额校验、结算收敛）。stripe 形态多一个
// providerRef，两站各自走自己的分支。
const adapter = getPaymentAdapter();
adapter.isConfigured = () => true;
let createChargeCalls = 0;
adapter.createCharge = async ({ outTradeNo }) => {
    createChargeCalls++;
    return adapter.id === 'stripe'
        ? {
              channel: 'stripe' as const,
              present: 'redirect' as const,
              redirectUrl: `https://checkout.test/${outTradeNo}`,
              providerRef: `cs_test_${outTradeNo}`,
          }
        : {
              channel: 'wxpay' as const,
              present: 'qrcode' as const,
              codeUrl: `weixin://wxpay/bizpayurl?pr=${outTradeNo}`,
              qrCode: 'data:image/png;base64,AA==',
          };
};
/** 通道回查的可编程返回：默认「没收到钱」。 */
let queryChargeResult: Awaited<ReturnType<typeof adapter.queryCharge>> = null;
adapter.queryCharge = async () => queryChargeResult;

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

/** 本站账号本体：cn 站是手机号、intl 站是邮箱。resolve 的入参形状随之分叉。 */
const IDENTIFIERS = siteConfig.id === 'intl'
    ? [{ email: 'mb-one@test.local' }, { email: 'mb-two@test.local' }]
    : [{ phone: '13800138001' }, { phone: '13800138002' }];

// ===========================================================================
console.log('\n[1] env 未设 AWD_MOBILE_BILLING_SECRET → 404');
// ===========================================================================
{
    delete process.env.AWD_MOBILE_BILLING_SECRET;
    const res = await POST(req({ action: 'resolve', ...IDENTIFIERS[0] }));
    assert.strictEqual(res.status, 404, '功能未开通时必须回 404，不能回 401/403 暴露端点存在');
    assert.strictEqual(await res.text(), '', '必须是空体，与「路由不存在」不可区分');
    ok('env 未配置 → 空体 404');
}

process.env.AWD_MOBILE_BILLING_SECRET = SECRET;
process.env.AWD_TRANSFER_BILLING_SECRET = TRANSFER_SECRET;

// ===========================================================================
console.log('\n[2] secret 错 / 缺 / 拿 transfer 那把 → 一律 404');
// ===========================================================================
{
    for (const [label, header] of [
        ['secret 错', 'wrong-secret'],
        ['缺 header', null],
        ['拿 transfer 口的密钥来敲', TRANSFER_SECRET],
    ] as [string, string | null][]) {
        const res = await POST(req({ action: 'resolve', ...IDENTIFIERS[0] }, header));
        assert.strictEqual(res.status, 404, `${label} → 404`);
        assert.strictEqual(await res.text(), '', `${label} → 空体`);
    }
    ok('三种鉴权失败路径都回空体 404，且两把 secret 互不通用');

    // 业务未命中同样是 404，但**必须带 JSON body**：调用方（云后端）要靠这个
    // 区分「密钥配错/功能没开」与「这个用户没有账户」。第一版两者都是空体 404，
    // 于是密钥配错一个字符就会让全量用户被告知「还没关联统一账户」。
    const r = await POST(req({ action: 'balance', accountId: crypto.randomUUID() }));
    assert.strictEqual(r.status, 404, 'secret 对但 accountId 查无 → 404');
    assert.deepStrictEqual(await r.json(), { error: 'account_not_found' }, '业务 404 必须带 body');
    ok('accountId 查无 → 带 body 的 404 account_not_found（与鉴权失败的空体 404 可区分）');
}

// ===========================================================================
console.log('\n[3] resolve：create 缺省 false（读永不建号）、create=true 建号并发赠额');
// ===========================================================================
const GRANT_CENTS = getThresholds().signupGrantCents;
assert.ok(GRANT_CENTS > 0, '本用例要求注册赠额活动是开着的（默认 1990 分）');
function userCount(): number {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'users.json'), 'utf-8')).length;
}
function grantLots(userId: string) {
    return getDb()
        .prepare('SELECT pool, originalCents, refOrderId FROM credit_lots WHERE userId = ?')
        .all(userId) as { pool: string; originalCents: number; refOrderId: string | null }[];
}

let accountA: string;
let accountB: string;
{
    // --- 读路径：默认不建号 ---
    // 这是 C1 的核心。第一版 resolve 无条件 findOrCreate，于是「新用户打开一次
    // 设置页」这个纯读动作就在官网建出一行含明文手机号的真账户，用户未同意、
    // 且 App 内的注销流程删不掉它（只删 Java 侧绑定，从不通知官网）。
    for (const [label, extra] of [
        ['不传 create', {}],
        ['create: false', { create: false }],
        // 只认布尔 true：漏传/传串/传 1 都不算，默认值必须站在「不建」那边
        ['create: "true"（字符串）', { create: 'true' }],
        ['create: 1（数字）', { create: 1 }],
    ] as [string, Record<string, unknown>][]) {
        const res = await POST(req({ action: 'resolve', ...IDENTIFIERS[0], ...extra }));
        assert.strictEqual(res.status, 404, `${label} → 404`);
        assert.deepStrictEqual(
            await res.json(),
            { error: 'account_not_found' },
            `${label} → 带 body 的 404（调用方要能与鉴权失败的空体 404 区分）`
        );
        assert.strictEqual(userCount(), 0, `${label} 不得建出任何账号`);
    }
    ok('resolve 读路径永不建号：四种「非布尔 true」入参一律 404 account_not_found，users.json 仍为空');

    // --- 建号路径：显式 create=true ---
    const r1 = await POST(req({ action: 'resolve', ...IDENTIFIERS[0], create: true }));
    assert.strictEqual(r1.status, 200);
    const b1 = await r1.json();
    assert.ok(typeof b1.accountId === 'string' && b1.accountId.length > 0, 'resolve 必须回 accountId');
    assert.deepStrictEqual(Object.keys(b1), ['accountId'], 'resolve 只回 accountId，不多回身份信息');
    accountA = b1.accountId;
    assert.strictEqual(userCount(), 1, 'create=true 建出一个账号');

    // 建号即发注册赠额：与官网 sms-login / mail-login 同款。不发的后果是这个用户
    // 此后在官网正常登录时 created=false，**永久拿不到注册赠额**。
    const lots1 = grantLots(accountA);
    assert.strictEqual(lots1.length, 1, 'create=true 建号必须恰好发一笔注册赠额');
    assert.strictEqual(lots1[0].pool, 'reward', '赠额必须落 reward 池（不可退现，合规红线）');
    assert.strictEqual(lots1[0].originalCents, GRANT_CENTS, `赠额金额 = ${GRANT_CENTS} 分`);
    assert.strictEqual(lots1[0].refOrderId, `signup_grant:${accountA}`, '幂等键必须是 signup_grant:<userId>');
    ok(`resolve create=true：建号并发注册赠额 reward ${GRANT_CENTS} 分`);

    // 重放：同一标识再来一次 create=true，账号复用、赠额不重复发
    const r2 = await POST(req({ action: 'resolve', ...IDENTIFIERS[0], create: true }));
    assert.strictEqual((await r2.json()).accountId, accountA, '同一手机号/邮箱必须复用同一账号');
    assert.strictEqual(userCount(), 1, '重放不得建出第二个账号');
    assert.strictEqual(grantLots(accountA).length, 1, '重放不得重复发赠额（幂等靠 refOrderId）');
    ok('resolve create=true 重放：复用同一 accountId，赠额仍只有一笔');

    // 账号存在之后，纯读路径照常回 accountId（读余额走的就是这条）
    const r3 = await POST(req({ action: 'resolve', ...IDENTIFIERS[0], create: false }));
    assert.strictEqual(r3.status, 200);
    assert.strictEqual((await r3.json()).accountId, accountA, 'create=false 在账号已存在时必须查得到');
    ok('resolve create=false：账号已存在时正常回 accountId（读余额走这条）');

    // 第二个账号故意在「活动没开」的配置下建，用来验证赠额受活动开关约束，
    // 同时给下面的 balance 用例留一个余额干净的账户。
    process.env.GW_SIGNUP_GRANT_CENTS = '0';
    const r4 = await POST(req({ action: 'resolve', ...IDENTIFIERS[1], create: true }));
    delete process.env.GW_SIGNUP_GRANT_CENTS;
    accountB = (await r4.json()).accountId;
    assert.notStrictEqual(accountB, accountA, '不同标识必须是不同账号');
    assert.strictEqual(userCount(), 2, '第二个标识建出第二个账号');
    assert.strictEqual(grantLots(accountB).length, 0, '活动金额为 0 时建号不得发任何批次');
    ok('resolve：第二个标识建出独立账号；活动关掉时不发赠额');

    const grantRows = getDb()
        .prepare("SELECT COUNT(*) AS n FROM credit_lots WHERE refOrderId LIKE 'signup_grant:%'")
        .get() as { n: number };
    assert.strictEqual(grantRows.n, 1, '全库只应有 accountA 那一笔 signup_grant');
}

// ===========================================================================
console.log('\n[4] resolve 的入参校验');
// ===========================================================================
{
    // 四条都带 create: true——要验的正是「入参校验先于建号」，用 create=false
    // 跑等于什么都没验（那条路本来就不建号）。
    const both = await POST(
        req({ action: 'resolve', phone: '13800138003', email: 'x@test.local', create: true })
    );
    assert.strictEqual(both.status, 400);
    assert.strictEqual((await both.json()).error, 'phone_or_email_required');

    const neither = await POST(req({ action: 'resolve', create: true }));
    assert.strictEqual(neither.status, 400);
    assert.strictEqual((await neither.json()).error, 'phone_or_email_required');
    ok('phone 与 email 必须恰好给一个（都给/都不给 → 400）');

    // 本站不支持的那一半标识：cn 站给 email、intl 站给 phone
    const wrongHalf = siteConfig.id === 'intl' ? { phone: '13800138004' } : { email: 'x@test.local' };
    const wrong = await POST(req({ action: 'resolve', ...wrongHalf, create: true }));
    assert.strictEqual(wrong.status, 400);
    assert.match((await wrong.json()).error, /not_supported_on_site$/);
    ok('本站非账号本体的标识 → 400 *_not_supported_on_site');

    const bad = siteConfig.id === 'intl' ? { email: 'not-an-email' } : { phone: '1380013' };
    const badRes = await POST(req({ action: 'resolve', ...bad, create: true }));
    assert.strictEqual(badRes.status, 400);
    assert.match((await badRes.json()).error, /^invalid_(phone|email)$/);
    ok('标识格式非法 → 400 invalid_phone / invalid_email');

    const usersNow = JSON.parse(fs.readFileSync(path.join(cwd, 'data', 'users.json'), 'utf-8'));
    assert.strictEqual(usersNow.length, 2, '四条拒绝路径都不得建出账号');
    ok('resolve 的拒绝路径无副作用（没有多建账号）');
}

// ===========================================================================
console.log('\n[5] balance：未过期批次之和 + 站点币种 + plan');
// ===========================================================================
{
    // accountB 是在「活动关掉」时建的，余额干净：验 free 这一档
    const fresh = await POST(req({ action: 'balance', accountId: accountB }));
    assert.strictEqual(fresh.status, 200);
    const bf = await fresh.json();
    assert.strictEqual(bf.balanceCents, 0, '没领过赠额的新账号余额为 0');
    assert.strictEqual(bf.currency, siteConfig.currency, '币种必须取站点常量');
    assert.strictEqual(bf.plan, 'free', '没有任何付费关系 → free');
    // plan 取值 'paid' / 'free' / 'expired'（到期 Pro），**永远不为 null**（lib/wallet.ts getPlan）
    assert.ok(['paid', 'free', 'expired'].includes(bf.plan), "plan 只能是 'paid' | 'free' | 'expired'");

    // accountA 领过注册赠额：余额就是那笔赠额，且 gift 账本行已经让它算 paid
    // （官网既有口径，见 lib/wallet.ts getPlan 的 kind IN ('recharge','gift')）
    const granted = await (await POST(req({ action: 'balance', accountId: accountA }))).json();
    assert.strictEqual(granted.balanceCents, GRANT_CENTS, '注册赠额必须计入余额');
    assert.strictEqual(granted.plan, 'paid', 'gift 账本行 → paid');

    withTransaction((d) =>
        grantCredits(d, { userId: accountA, pool: 'topup', amountCents: 12345, ledgerKind: 'recharge' })
    );
    const filled = await (await POST(req({ action: 'balance', accountId: accountA }))).json();
    assert.strictEqual(filled.balanceCents, GRANT_CENTS + 12345);
    assert.strictEqual(filled.plan, 'paid', '有 recharge 账本行 → paid');
    ok(`balance：free/0 → ${GRANT_CENTS} → ${GRANT_CENTS + 12345}，币种 ${siteConfig.currency}`);

    // 到期的 reward 批次不计入余额（余额是未过期批次之和，不是账本最后一行）
    withTransaction((d) =>
        grantCredits(d, {
            userId: accountB,
            pool: 'reward',
            amountCents: 500,
            ledgerKind: 'gift',
            nowIso: '2020-01-01T00:00:00.000Z',
        })
    );
    const expired = await (await POST(req({ action: 'balance', accountId: accountB }))).json();
    assert.strictEqual(expired.balanceCents, 0, '2020 年发的 reward 批次早已过期，不得计入余额');
    assert.strictEqual(expired.plan, 'paid', 'gift 账本行照样算 paid（余额与 plan 是两回事）');
    ok('balance 取未过期批次之和：已过期的 reward 批次不计入');
}

// ===========================================================================
console.log('\n[6] create-recharge：金额与幂等键的校验');
// ===========================================================================
{
    const cases: [string, Record<string, unknown>, string][] = [
        ['金额 0', { amountCents: 0, idempotencyKey: 'k' }, 'invalid_amount'],
        ['金额负数', { amountCents: -100, idempotencyKey: 'k' }, 'invalid_amount'],
        ['金额小数', { amountCents: 10.5, idempotencyKey: 'k' }, 'invalid_amount'],
        ['金额字符串', { amountCents: '100', idempotencyKey: 'k' }, 'invalid_amount'],
        ['超单笔上限', { amountCents: 1000001, idempotencyKey: 'k' }, 'amount_too_large'],
        ['缺幂等键', { amountCents: 100 }, 'idempotency_key_required'],
        ['幂等键空串', { amountCents: 100, idempotencyKey: '' }, 'idempotency_key_required'],
        ['幂等键超长', { amountCents: 100, idempotencyKey: 'x'.repeat(129) }, 'idempotency_key_required'],
    ];
    for (const [label, extra, expected] of cases) {
        const res = await POST(req({ action: 'create-recharge', accountId: accountA, ...extra }));
        assert.strictEqual(res.status, 400, `${label} → 400`);
        assert.strictEqual((await res.json()).error, expected, `${label} → ${expected}`);
    }
    const orders = getDb().prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number };
    assert.strictEqual(orders.n, 0, '被拒的建单请求不得落库');
    ok('八条金额/幂等键拒绝路径全部 400 且不落单');
}

// ===========================================================================
console.log('\n[7] create-recharge：同一幂等键复用同一张单');
// ===========================================================================
let orderNo: string;
const orderKey = 'mb-idem-' + crypto.randomUUID();
{
    const key = orderKey;
    createChargeCalls = 0;
    const r1 = await POST(
        req({ action: 'create-recharge', accountId: accountA, amountCents: 5000, idempotencyKey: key })
    );
    assert.strictEqual(r1.status, 200);
    const b1 = await r1.json();
    assert.strictEqual(b1.amountCents, 5000, '回的是 amountCents（整数分），不是档位 id');
    assert.ok(typeof b1.outTradeNo === 'string' && b1.outTradeNo.startsWith('RECHARGE'));
    if (siteConfig.paymentChannel === 'stripe') {
        assert.strictEqual(b1.present, 'redirect');
        assert.ok(typeof b1.redirectUrl === 'string');
    } else {
        assert.strictEqual(b1.present, 'qrcode');
        assert.ok(typeof b1.codeUrl === 'string' && typeof b1.qrCode === 'string');
    }
    orderNo = b1.outTradeNo;

    const r2 = await POST(
        req({ action: 'create-recharge', accountId: accountA, amountCents: 5000, idempotencyKey: key })
    );
    assert.strictEqual(r2.status, 200);
    const b2 = await r2.json();
    assert.strictEqual(b2.outTradeNo, orderNo, '同一幂等键必须复用同一单号');

    const rows = getDb().prepare('SELECT * FROM orders').all() as { kind: string; channel: string; currency: string; userId: string }[];
    assert.strictEqual(rows.length, 1, '重放不得产生第二张订单');
    assert.strictEqual(rows[0].kind, 'recharge', '订单 kind 固定 recharge');
    assert.strictEqual(rows[0].userId, accountA, '订单必须挂在 accountId 对应的用户上');
    assert.strictEqual(rows[0].channel, siteConfig.paymentChannel);
    assert.strictEqual(rows[0].currency, siteConfig.currency);
    assert.strictEqual(createChargeCalls, 2, '重放会重新问通道要收款凭据，但不再建单');
    ok('create-recharge 幂等：同键复用同一单号，库里只有一张 recharge 单');

    const conflict = await POST(
        req({ action: 'create-recharge', accountId: accountA, amountCents: 9900, idempotencyKey: key })
    );
    assert.strictEqual(conflict.status, 409);
    const cb = await conflict.json();
    assert.strictEqual(cb.error, 'idempotency_conflict');
    assert.strictEqual(cb.outTradeNo, orderNo);
    ok('同键换金额 → 409 idempotency_conflict（不复用出一张金额不符的单）');
}

// ===========================================================================
console.log('\n[8] query：归属校验——别人的单号一律 404');
// ===========================================================================
{
    const mine = await POST(req({ action: 'query', accountId: accountA, outTradeNo: orderNo }));
    assert.strictEqual(mine.status, 200);
    const mb = await mine.json();
    assert.deepStrictEqual(mb, { status: 'pending', paid: false, amountCents: 5000 });
    ok('本人查自己的单 → pending / paid:false / amountCents');

    const other = await POST(req({ action: 'query', accountId: accountB, outTradeNo: orderNo }));
    assert.strictEqual(other.status, 404, '拿别人的单号查必须 404');
    assert.deepStrictEqual(await other.json(), { error: 'order_not_found' }, '越权与不存在同一响应');

    const ghost = await POST(req({ action: 'query', accountId: accountA, outTradeNo: 'RECHARGE-NOPE' }));
    assert.strictEqual(ghost.status, 404);
    assert.deepStrictEqual(await ghost.json(), { error: 'order_not_found' });
    ok('跨用户越权 → 带 body 的 404 order_not_found，且与「单号不存在」在响应上不可区分');

    const noNo = await POST(req({ action: 'query', accountId: accountA }));
    assert.strictEqual(noNo.status, 400);
    assert.strictEqual((await noNo.json()).error, 'out_trade_no_required');
    ok('缺 outTradeNo → 400');
}

// ===========================================================================
console.log('\n[9] query：通道说收到钱 → 经 settleFromChannel 入账；金额不符不结算');
// ===========================================================================
{
    // 先来一发金额对不上的：必须 409、订单仍 pending、余额不动
    const balanceBefore = (await (await POST(req({ action: 'balance', accountId: accountA }))).json())
        .balanceCents as number;
    queryChargeResult = {
        channel: siteConfig.paymentChannel,
        outTradeNo: orderNo,
        paid: true,
        amountMinor: 1,
        currency: siteConfig.currency,
        transactionId: 'mb-tx-bad',
    };
    // 限频是 2 秒一次，测第二发之前要绕开——直接换一次时间戳不现实，
    // 这里靠「上一次回查发生在 [8] 的第一发」自然过期不可靠，所以用等待。
    await new Promise((r) => setTimeout(r, 2100));
    const mismatch = await POST(req({ action: 'query', accountId: accountA, outTradeNo: orderNo }));
    assert.strictEqual(mismatch.status, 409);
    assert.strictEqual((await mismatch.json()).error, 'settlement_mismatch');
    const stillPending = getDb().prepare('SELECT status FROM orders WHERE outTradeNo = ?').get(orderNo) as { status: string };
    assert.strictEqual(stillPending.status, 'pending', '金额对不上必须一分钱都不写');
    const balanceMid = (await (await POST(req({ action: 'balance', accountId: accountA }))).json()).balanceCents;
    assert.strictEqual(balanceMid, balanceBefore, '拒绝结算不得改余额');
    ok('通道金额与订单不符 → 409 settlement_mismatch，订单仍 pending、余额不动');

    // 再来一发金额相符的：结算并入账
    queryChargeResult = {
        channel: siteConfig.paymentChannel,
        outTradeNo: orderNo,
        paid: true,
        amountMinor: 5000,
        currency: siteConfig.currency,
        transactionId: 'mb-tx-good',
    };
    await new Promise((r) => setTimeout(r, 2100));
    const settled = await POST(req({ action: 'query', accountId: accountA, outTradeNo: orderNo }));
    assert.strictEqual(settled.status, 200);
    assert.deepStrictEqual(await settled.json(), { status: 'paid', paid: true, amountCents: 5000 });
    // 入账口径认账本行：会员充值赠送（reward 批次）会让余额多于 5000，
    // 但充值本身必须恰好是订单金额、且落 topup 池。
    const rechargeRow = getDb()
        .prepare("SELECT amountCents FROM wallet_ledger WHERE userId = ? AND kind = 'recharge' AND refOrderId = ?")
        .get(accountA, orderNo) as { amountCents: number } | undefined;
    assert.ok(rechargeRow, '结算必须写一行 recharge 账本');
    assert.strictEqual(rechargeRow!.amountCents, 5000, '充值入账金额必须等于订单金额');
    const topupLot = getDb()
        .prepare("SELECT pool, originalCents FROM credit_lots WHERE userId = ? AND refOrderId = ? AND pool = 'topup'")
        .get(accountA, orderNo) as { originalCents: number } | undefined;
    assert.strictEqual(topupLot?.originalCents, 5000, '必须落 topup 批次 5000 分');
    const balanceAfter = (await (await POST(req({ action: 'balance', accountId: accountA }))).json()).balanceCents;
    assert.ok(balanceAfter >= balanceBefore + 5000, '余额至少 +5000（会员赠送另计）');
    ok('通道确认收款 → 结算入账 topup 5000 分，query 回 paid:true');

    // 已付的单再 create-recharge（同一幂等键）：不能回放一张过期收款码
    const replay = await POST(
        req({ action: 'create-recharge', accountId: accountA, amountCents: 5000, idempotencyKey: orderKey })
    );
    assert.strictEqual(replay.status, 409);
    const rb = await replay.json();
    assert.strictEqual(rb.error, 'order_already_paid');
    assert.strictEqual(rb.outTradeNo, orderNo, '已付单的 409 要带回单号，供调用方转去 query');
    ok('已付单重放 create-recharge → 409 order_already_paid（带 outTradeNo）');
}

// ===========================================================================
console.log('\n[10] 未知 action / 坏 JSON');
// ===========================================================================
{
    const unknown = await POST(req({ action: 'drain-wallet', accountId: accountA }));
    assert.strictEqual(unknown.status, 400);
    assert.strictEqual((await unknown.json()).error, 'unknown_action');

    const badJson = new NextRequest('https://test.local/api/internal/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
        body: '{not json',
    });
    const r = await POST(badJson);
    assert.strictEqual(r.status, 400);
    assert.strictEqual((await r.json()).error, 'bad_request');
    ok('未知 action → 400 unknown_action；坏 JSON → 400 bad_request');
}

console.log(`\n手机端内部记账口全绿：${passed} 项`);
