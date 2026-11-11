/**
 * Apple App Store 内购充值（dev-board#426）验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-appstore.mts
 * 两个站点各跑一遍：
 *   NEXT_PUBLIC_AWD_SITE=cn ... / NEXT_PUBLIC_AWD_SITE=intl ...
 *
 * ## 为什么要自签一条测试链
 *
 * 苹果不会给我们一张能重放的生产收据，而「验签通过就入账」这条路正是整条链路
 * 上最不能猜的一段。所以这里用 openssl 现场造一条三级链
 * （root → intermediate → leaf），**带上库真正会检查的两个 Apple 私有扩展 OID**
 * （intermediate 要 1.2.840.113635.100.6.2.1、leaf 要 1.2.840.113635.100.6.11.1），
 * 再用 leaf 私钥签 ES256 JWS。验签器的根证书用 `setAppleRootCertificates` 换成
 * 这条链的 root——链校验、OID 检查、签名校验、bundleId/environment 比对四段
 * 跑的都是真代码，只有信任锚是测试的。
 *
 * 覆盖：
 * - 目录表：三档面值与币种；原型链键（constructor）不算档位
 * - create-recharge channel=appstore：档位/金额不符 → 400 product_mismatch；
 *   建单回 `present:'native'` + appAccountToken（UUID），订单记 appstore/CNY/skuId/providerRef；
 *   幂等键重放回**同一个** appAccountToken；同键换档位 → 409
 * - confirm-appstore 失败分支：验签失败 / appAccountToken 不符 / productId 不符 /
 *   沙盒交易打到生产部署 → 400 transaction_invalid；查无单 → 404 order_not_found；
 *   交易号重用 → 409 transaction_reused
 * - confirm-appstore 成功：入 topup 批次且 `sourceKind='appstore'`；
 *   **不发会员充值赠送**（同额度的微信单会发，作对照）；
 *   `getRefundableCents` 排除它而 `getBalance` 计入它；重复确认幂等
 * - 省略 outTradeNo 时用 appAccountToken 反查 providerRef
 * - Server Notifications V2：REFUND 追回 Credits、重复推送幂等、
 *   验签失败 → 401、其它类型 → 200、查无单 → 200
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { X509Certificate } from 'crypto';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const SECRET = 'test-appstore-secret-0123456789';
const BUNDLE_ID = 'com.aiworkdeck.mobile.cn';
const APP_APPLE_ID = '6803309103';

process.env.AWD_MOBILE_BILLING_SECRET = SECRET;
process.env.APPSTORE_BUNDLE_ID = BUNDLE_ID;
process.env.APPSTORE_APP_APPLE_ID = APP_APPLE_ID;
// 部署级常量：生产。沙盒交易打到这个部署必须被拒（见 [3]）。
process.env.APPSTORE_ENV = 'production';

// ===========================================================================
// 自签测试链（openssl）
// ===========================================================================
const CA_DIR = path.join(cwd, 'testca');
fs.mkdirSync(CA_DIR, { recursive: true });

fs.writeFileSync(
    path.join(CA_DIR, 'cfg'),
    [
        '[req]',
        'distinguished_name = dn',
        'prompt = no',
        '[dn]',
        'CN = test',
        '[root_ext]',
        'basicConstraints=critical,CA:TRUE',
        '[inter_ext]',
        'basicConstraints=critical,CA:TRUE',
        // 库要求 intermediate 必须带这个 Apple 私有扩展（jws_verification.ts getExtInfo）
        '1.2.840.113635.100.6.2.1=ASN1:NULL',
        '[leaf_ext]',
        'basicConstraints=critical,CA:FALSE',
        // 同上，leaf 的那一个
        '1.2.840.113635.100.6.11.1=ASN1:NULL',
        '',
    ].join('\n')
);

function openssl(...args: string[]): void {
    execFileSync('openssl', args, { cwd: CA_DIR, stdio: ['ignore', 'ignore', 'pipe'] });
}

function genChain(): void {
    openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'root.key');
    openssl('req', '-new', '-x509', '-key', 'root.key', '-sha256', '-days', '3650',
        '-subj', '/CN=Test Apple Root CA', '-config', 'cfg', '-extensions', 'root_ext', '-out', 'root.pem');
    for (const [name, issuer, ext, serial] of [
        ['inter', 'root', 'inter_ext', '2'],
        ['leaf', 'inter', 'leaf_ext', '3'],
    ] as [string, string, string, string][]) {
        openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`);
        openssl('req', '-new', '-key', `${name}.key`, '-subj', `/CN=Test Apple ${name}`, '-config', 'cfg', '-out', `${name}.csr`);
        openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`,
            '-set_serial', serial, '-days', '3650', '-sha256', '-extfile', 'cfg', '-extensions', ext, '-out', `${name}.pem`);
    }
    for (const n of ['root', 'inter', 'leaf']) {
        openssl('x509', '-in', `${n}.pem`, '-outform', 'DER', '-out', `${n}.der`);
    }
}
genChain();

const rootDer = fs.readFileSync(path.join(CA_DIR, 'root.der'));
const x5c = [
    fs.readFileSync(path.join(CA_DIR, 'leaf.der')).toString('base64'),
    fs.readFileSync(path.join(CA_DIR, 'inter.der')).toString('base64'),
    rootDer.toString('base64'),
];
const leafKey = fs.readFileSync(path.join(CA_DIR, 'leaf.key'));

function b64u(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64url');
}

/** 用测试 leaf 私钥签一条 ES256 JWS（x5c 三级链放 header，与苹果的形状一致）。 */
function signJws(payload: Record<string, unknown>, chain: string[] = x5c): string {
    const head = b64u(JSON.stringify({ alg: 'ES256', x5c: chain }));
    const body = b64u(JSON.stringify(payload));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), {
        key: leafKey,
        dsaEncoding: 'ieee-p1363',
    });
    return `${head}.${body}.${sig.toString('base64url')}`;
}

// ===========================================================================
const { siteConfig } = await import('@/lib/site-config');
const { getDb } = await import('@/lib/db');
const { createOrder, getOrder } = await import('@/lib/orders');
const {
    appstoreAdapter,
    appstoreFaceValue,
    APPSTORE_PRODUCTS,
    APPSTORE_CURRENCY,
    setAppleRootCertificates,
    verifyTransaction,
} = await import('@/lib/payments');
const { appstoreBundleId, appstoreAppAppleId } = await import('@/lib/payments/appstore-adapter');
const { getBalance, getBalanceBreakdown, getRefundableCents, settleOrderPaid } = await import(
    '@/lib/wallet'
);
const { NextRequest } = await import('next/server');
const { POST } = await import('@/app/api/internal/account/route');
const notify = await import('@/app/api/appstore/notifications/route');

// 信任锚换成测试链的 root：验证脚本跑在空目录里，仓库那三张 DER 也读不到。
setAppleRootCertificates([rootDer]);

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

let seq = 0;
function identifier(): Record<string, string> {
    seq += 1;
    return siteConfig.id === 'intl'
        ? { email: `appstore-${seq}@test.local` }
        : { phone: `1390013${String(8000 + seq).padStart(4, '0')}` };
}

async function newAccount(): Promise<string> {
    const res = await POST(req({ action: 'resolve', ...identifier(), create: true }));
    assert.strictEqual(res.status, 200);
    return (await res.json()).accountId as string;
}

let txSeq = 0;
function nextTransactionId(): string {
    txSeq += 1;
    return `20000000000${String(txSeq).padStart(5, '0')}`;
}

interface TxOverrides {
    transactionId?: string;
    productId?: string;
    appAccountToken?: string;
    bundleId?: string;
    environment?: string;
    price?: number;
    currency?: string;
    revocationDate?: number;
}

function transactionPayload(o: TxOverrides = {}): Record<string, unknown> {
    const now = Date.now();
    const txId = o.transactionId ?? nextTransactionId();
    return {
        transactionId: txId,
        originalTransactionId: txId,
        bundleId: o.bundleId ?? BUNDLE_ID,
        productId: o.productId ?? 'credits.cny.50',
        purchaseDate: now,
        originalPurchaseDate: now,
        quantity: 1,
        type: 'Consumable',
        appAccountToken: o.appAccountToken ?? crypto.randomUUID(),
        inAppOwnershipType: 'PURCHASED',
        signedDate: now,
        environment: o.environment ?? 'Production',
        transactionReason: 'PURCHASE',
        storefront: 'CHN',
        storefrontId: '143465',
        // 币种坑的样本：苹果实收写的是买家 storefront 的币种，这里故意给 JPY，
        // 结算必须按目录表面值走，不能被它带偏。
        price: o.price ?? 82500,
        currency: o.currency ?? 'JPY',
        ...(o.revocationDate ? { revocationDate: o.revocationDate, revocationReason: 0 } : {}),
    };
}

async function confirm(accountId: string, signedTransaction: string, outTradeNo?: string) {
    return POST(
        req({
            action: 'confirm-appstore',
            accountId,
            ...(outTradeNo ? { outTradeNo } : {}),
            signedTransaction,
        })
    );
}

function notifyReq(body: unknown) {
    return new NextRequest('https://test.local/api/appstore/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function notificationPayload(
    type: string,
    signedTransactionInfo: string | undefined,
    environment = 'Production'
): Record<string, unknown> {
    return {
        notificationType: type,
        notificationUUID: crypto.randomUUID(),
        version: '2.0',
        signedDate: Date.now(),
        data: {
            appAppleId: Number(APP_APPLE_ID),
            bundleId: BUNDLE_ID,
            bundleVersion: '1',
            environment,
            ...(signedTransactionInfo ? { signedTransactionInfo } : {}),
        },
    };
}

// ===========================================================================
console.log('\n[0] 仓库里那三张苹果根证书本身');
// ===========================================================================
{
    // 这一段**不用测试链**：验的是真正随镜像走的那三个文件还在、还能解析、还没过期。
    // 生产验签读的是 `process.cwd()/lib/payments/apple-roots`，而本脚本跑在隔离
    // 空目录里，所以这里按脚本自己的位置回溯仓库根。
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const rootsDir = path.join(repoRoot, 'lib', 'payments', 'apple-roots');
    const expected: Record<string, string> = {
        'AppleRootCA-G3.cer': '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179',
        'AppleRootCA-G2.cer': 'c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050',
        'AppleIncRootCertificate.cer':
            'b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024',
    };
    const now = Date.now();
    for (const [name, sha] of Object.entries(expected)) {
        const der = fs.readFileSync(path.join(rootsDir, name));
        assert.strictEqual(
            crypto.createHash('sha256').update(der).digest('hex'),
            sha,
            `${name} 的 sha256 与下载时不符（被改过或换过，见 DEPLOY.md §7.8）`
        );
        const cert = new X509Certificate(der);
        assert.ok(cert.ca, `${name} 不是 CA 证书`);
        assert.ok(cert.subject.includes('Apple'), `${name} 的 subject 不是苹果`);
        // 三张根都到 2035/2039 年。真到期前这条断言会先红，给运维留出换证书的时间。
        assert.ok(
            new Date(cert.validTo).getTime() > now,
            `${name} 已过期，必须从 apple.com/certificateauthority 重新下载`
        );
    }
    ok('三张苹果根证书在仓库里、sha256 与下载时一致、是 CA、未过期');
}

// ===========================================================================
console.log('\n[1] 目录表：三档面值、币种、原型链键');
// ===========================================================================
{
    assert.deepStrictEqual(APPSTORE_PRODUCTS, {
        'credits.cny.50': 5000,
        'credits.cny.100': 10000,
        'credits.cny.300': 30000,
    });
    assert.strictEqual(APPSTORE_CURRENCY, 'CNY');
    assert.strictEqual(appstoreAdapter.currency, 'CNY', '内购恒 CNY，与站点币种无关');
    assert.strictEqual(appstoreFaceValue('constructor'), undefined, '原型链键不许当档位');
    assert.strictEqual(appstoreFaceValue('credits.usd.10'), undefined, '国际版三档本轮不开');
    ok('目录表三档 + 币种恒 CNY + 原型链键取不到');

    assert.strictEqual(await appstoreAdapter.queryCharge('ANY'), null, '内购无从回查，恒 null');
    await assert.rejects(() => appstoreAdapter.parseWebhook(new Headers(), ''), /不走 parseWebhook/);
    ok('queryCharge 恒 null；parseWebhook 直接抛（到账不走那条路）');

    const savedBundle = process.env.APPSTORE_BUNDLE_ID;
    delete process.env.APPSTORE_BUNDLE_ID;
    assert.strictEqual(appstoreAdapter.isConfigured(), false, '缺 BUNDLE_ID 必须判未开通');
    process.env.APPSTORE_BUNDLE_ID = savedBundle;

    if (siteConfig.currency !== 'CNY') {
        // 站点币种闸：目录表是 CNY 面值，配在国际站会按 `5000` 发 5000 **美分**。
        assert.strictEqual(
            appstoreAdapter.isConfigured(),
            false,
            '站点币种不是 CNY 时内购通道必须判未开通'
        );
        const r = await POST(
            req({ action: 'create-recharge', accountId: await newAccount(), channel: 'appstore', productId: 'credits.cny.50', amountCents: 5000, idempotencyKey: 'k-intl-gate' })
        );
        assert.strictEqual(r.status, 503);
        assert.strictEqual((await r.json()).error, 'payment_channel_unavailable');
        ok('非 CNY 站点：内购通道恒未开通 → 503（档位表是 CNY 面值，配上去会按美分发币）');
        // 闸验过了就打开它，下面那些「通道之上的那一层」照样要在两个站点各跑一遍
        // （与 verify-wxvp 在国际站打桩 isConfigured 同一手法）。
        appstoreAdapter.isConfigured = () => Boolean(appstoreBundleId() && appstoreAppAppleId());
    }
    assert.strictEqual(appstoreAdapter.isConfigured(), true);
    ok('isConfigured 按调用读 env，不在模块加载时快照');
}

// ===========================================================================
console.log('\n[2] create-recharge channel=appstore');
// ===========================================================================
const accountA = await newAccount();
let orderNo = '';
let appAccountToken = '';
{
    for (const [label, productId, amountCents] of [
        ['金额与档位不符', 'credits.cny.50', 10000],
        ['不存在的档位', 'credits.cny.999', 5000],
        ['缺 productId', undefined, 5000],
        ['原型链上的键', 'constructor', 5000],
    ] as [string, string | undefined, number][]) {
        const r = await POST(
            req({
                action: 'create-recharge',
                accountId: accountA,
                channel: 'appstore',
                ...(productId === undefined ? {} : { productId }),
                amountCents,
                idempotencyKey: `k-pm-${label}`,
            })
        );
        assert.strictEqual(r.status, 400, `${label} → 400`);
        assert.strictEqual((await r.json()).error, 'product_mismatch', `${label} → product_mismatch`);
    }
    ok('三档之外的任何 productId/金额组合 → 400 product_mismatch（含原型链键）');

    const created = await POST(
        req({
            action: 'create-recharge',
            accountId: accountA,
            channel: 'appstore',
            productId: 'credits.cny.50',
            amountCents: 5000,
            idempotencyKey: 'k-ios-1',
        })
    );
    assert.strictEqual(created.status, 200);
    const body = await created.json();
    assert.strictEqual(body.present, 'native');
    assert.strictEqual(body.amountCents, 5000);
    assert.ok(typeof body.outTradeNo === 'string' && body.outTradeNo.length > 0);
    assert.ok(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.appAccountToken),
        'appAccountToken 必须是 UUID（StoreKit 的 PurchaseOption 只收 UUID）'
    );
    assert.ok(!('codeUrl' in body) && !('signData' in body) && !('redirectUrl' in body));
    orderNo = body.outTradeNo;
    appAccountToken = body.appAccountToken;

    const order = getOrder(orderNo)!;
    assert.strictEqual(order.channel, 'appstore');
    assert.strictEqual(order.currency, 'CNY', '内购恒 CNY，与站点币种无关');
    assert.strictEqual(order.skuId, 'credits.cny.50', 'productId 必须落 skuId 供确认时比对');
    assert.strictEqual(order.providerRef, appAccountToken, 'appAccountToken 必须落 providerRef');
    assert.strictEqual(order.status, 'pending');
    ok('建单 → present:native + UUID appAccountToken，订单记 appstore/CNY/skuId/providerRef');

    // 重放同一把幂等键：必须回**同一个** token，否则已发起的购买再也对不回这张单
    const replay = await POST(
        req({
            action: 'create-recharge',
            accountId: accountA,
            channel: 'appstore',
            productId: 'credits.cny.50',
            amountCents: 5000,
            idempotencyKey: 'k-ios-1',
        })
    );
    const rb = await replay.json();
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(rb.outTradeNo, orderNo);
    assert.strictEqual(rb.appAccountToken, appAccountToken, '重放必须回原来那个 appAccountToken');
    ok('同幂等键重放 → 同一张单、同一个 appAccountToken');

    // 同键换档位 / 换通道 → 409
    const swapped = await POST(
        req({
            action: 'create-recharge',
            accountId: accountA,
            channel: 'appstore',
            productId: 'credits.cny.100',
            amountCents: 10000,
            idempotencyKey: 'k-ios-1',
        })
    );
    assert.strictEqual(swapped.status, 409);
    assert.strictEqual((await swapped.json()).error, 'idempotency_conflict');
    ok('同幂等键换档位 → 409 idempotency_conflict');

    const unconf = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'appstore', productId: 'credits.cny.50', amountCents: 5000, idempotencyKey: 'k-ios-unconf' })
    );
    assert.strictEqual(unconf.status, 200, '配置齐备时正常建单（下一条才是未配置）');
    await (async () => {
        const saved = process.env.APPSTORE_APP_APPLE_ID;
        delete process.env.APPSTORE_APP_APPLE_ID;
        const r = await POST(
            req({ action: 'create-recharge', accountId: accountA, channel: 'appstore', productId: 'credits.cny.50', amountCents: 5000, idempotencyKey: 'k-ios-unconf2' })
        );
        assert.strictEqual(r.status, 503);
        assert.strictEqual((await r.json()).error, 'payment_channel_unavailable');
        process.env.APPSTORE_APP_APPLE_ID = saved;
    })();
    ok('APPSTORE_APP_APPLE_ID 缺失 → 503 payment_channel_unavailable');
}

// ===========================================================================
console.log('\n[3] confirm-appstore 的失败分支');
// ===========================================================================
{
    // 验签失败：改一个字节的签名
    const goodJws = signJws(transactionPayload({ appAccountToken }));
    const tampered = goodJws.slice(0, -2) + (goodJws.endsWith('AA') ? 'BB' : 'AA');
    const bad = await confirm(accountA, tampered, orderNo);
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await bad.json()).error, 'transaction_invalid');
    assert.strictEqual(getOrder(orderNo)!.status, 'pending', '验签失败一分钱都不许写');
    ok('签名被改 → 400 transaction_invalid，订单不动');

    // 别人的合法收据（appAccountToken 不是这张单的）
    const otherToken = await confirm(accountA, signJws(transactionPayload()), orderNo);
    assert.strictEqual(otherToken.status, 400);
    assert.strictEqual((await otherToken.json()).error, 'transaction_invalid');
    ok('appAccountToken 与订单 providerRef 不符 → 400 transaction_invalid');

    // 买 50 的档拿去结 50 的单但 productId 写成 300：档位不符
    const wrongProduct = await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken, productId: 'credits.cny.300' })),
        orderNo
    );
    assert.strictEqual(wrongProduct.status, 400);
    assert.strictEqual((await wrongProduct.json()).error, 'transaction_invalid');
    ok('productId 与订单 skuId 不符 → 400 transaction_invalid');

    // 沙盒交易打到生产部署
    const sandbox = await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken, environment: 'Sandbox' })),
        orderNo
    );
    assert.strictEqual(sandbox.status, 400);
    assert.strictEqual((await sandbox.json()).error, 'transaction_invalid');
    ok('沙盒交易打到 APPSTORE_ENV=production 的部署 → 400（免费换 Credits 的口被堵死）');

    // bundleId 不符
    const otherBundle = await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken, bundleId: 'com.evil.app' })),
        orderNo
    );
    assert.strictEqual(otherBundle.status, 400);
    ok('bundleId 不符 → 400 transaction_invalid');

    // 查无单：省略 outTradeNo 且 appAccountToken 没建过单
    const ghost = await confirm(accountA, signJws(transactionPayload()));
    assert.strictEqual(ghost.status, 404);
    assert.strictEqual((await ghost.json()).error, 'order_not_found');
    ok('appAccountToken 反查不到单 → 404 order_not_found');

    // 越权：别人的账户拿这张单号来确认
    const accountX = await newAccount();
    const cross = await confirm(accountX, signJws(transactionPayload({ appAccountToken })), orderNo);
    assert.strictEqual(cross.status, 404);
    assert.strictEqual((await cross.json()).error, 'order_not_found');
    ok('跨账户确认 → 404 order_not_found（越权与不存在同一响应）');

    // 请求体形状
    for (const body of [{}, { signedTransaction: '' }, { signedTransaction: 'x'.repeat(40000) }]) {
        const r = await POST(req({ action: 'confirm-appstore', accountId: accountA, ...body }));
        assert.strictEqual(r.status, 400);
        assert.strictEqual((await r.json()).error, 'transaction_invalid');
    }
    ok('signedTransaction 缺失 / 空 / 超长 → 400 transaction_invalid');
}

// ===========================================================================
console.log('\n[4] confirm-appstore 成功入账');
// ===========================================================================
const PAID_TX = nextTransactionId();
{
    const jws = signJws(transactionPayload({ appAccountToken, transactionId: PAID_TX }));
    // 先验一遍 verifyTransaction 本身：面值不许取苹果的 price/currency
    const decoded = await verifyTransaction(jws);
    assert.strictEqual(decoded.currency, 'JPY', '苹果那侧确实可能是别的币种');
    assert.strictEqual(decoded.price, 82500);

    const res = await confirm(accountA, jws, orderNo);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: 'paid', paid: true, amountCents: 5000 });

    const order = getOrder(orderNo)!;
    assert.strictEqual(order.status, 'paid');
    assert.strictEqual(order.transactionId, PAID_TX);
    const meta = JSON.parse(order.providerMeta!);
    assert.strictEqual(meta.currency, 'JPY', '苹果实收币种要落对账字段');
    assert.strictEqual(meta.price, 82500);
    assert.strictEqual(meta.storefront, 'CHN');
    ok('验签通过 → 结算成 paid，苹果实收 price/currency/storefront 落 providerMeta');

    const lot = getDb()
        .prepare("SELECT pool, originalCents, sourceKind, expiresAt FROM credit_lots WHERE refOrderId = ?")
        .all(orderNo) as { pool: string; originalCents: number; sourceKind: string; expiresAt: string | null }[];
    assert.strictEqual(lot.length, 1, '内购单只该产生一个批次（不发会员赠送）');
    assert.strictEqual(lot[0].pool, 'topup');
    assert.strictEqual(lot[0].originalCents, 5000, '面值取目录表 5000 分，不是苹果的 82500 JPY');
    assert.strictEqual(lot[0].sourceKind, 'appstore', 'IAP 批次必须打上可区分的 sourceKind');
    assert.strictEqual(lot[0].expiresAt, null, 'IAP 买来的 Credits 不许设有效期（3.1.1）');
    ok('入账：topup 批次 5000 分、sourceKind=appstore、无有效期、无赠送批次');

    // 重复确认（客户端在 finish 之前会一直重放）
    const again = await confirm(accountA, jws, orderNo);
    assert.strictEqual(again.status, 200);
    assert.deepStrictEqual(await again.json(), { status: 'paid', paid: true, amountCents: 5000 });
    const lots2 = getDb()
        .prepare('SELECT COUNT(*) AS c FROM credit_lots WHERE refOrderId = ?')
        .get(orderNo) as { c: number };
    assert.strictEqual(lots2.c, 1, '重复确认不许重复发币');
    ok('同一张收据重复确认 → 幂等回 paid，不重复发币');
}

// ===========================================================================
console.log('\n[5] 可退现口径 + 不发会员赠送（与微信单对照）');
// ===========================================================================
{
    // 再充一张 300 的内购单，把成长值顶到「主办律师」（20‰）——
    // 若内购也发赠送，这里必然多出一个 gift 批次。
    const created = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'appstore', productId: 'credits.cny.300', amountCents: 30000, idempotencyKey: 'k-ios-300' })
    );
    const b = await created.json();
    const res = await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken: b.appAccountToken, productId: 'credits.cny.300' })),
        b.outTradeNo
    );
    assert.strictEqual(res.status, 200);

    const gifts = getDb()
        .prepare("SELECT COUNT(*) AS c FROM credit_lots WHERE userId = ? AND sourceKind = 'membership_bonus'")
        .get(accountA) as { c: number };
    assert.strictEqual(gifts.c, 0, '内购单一律不发会员充值赠送（设计 §4.3）');
    ok('内购单不发会员充值赠送：成长值已到 20‰ 档，仍然零 gift 批次');

    // 账户里还有注册赠额（reward 池），所以只比 topup 那一半：
    // 两笔内购 5000 + 30000 全部计入余额，但一分都不可退现。
    assert.strictEqual(getBalanceBreakdown(accountA).topupCents, 35000, '余额要计入内购买来的 Credits');
    assert.strictEqual(getRefundableCents(accountA), 0, '内购买来的 Credits 一分都不可退现');
    ok('getBalance 计入内购、getRefundableCents 排除内购（堵掉 84% 买入、100% 退现的套利）');

    // 对照：同额度的站点默认通道充值，既发赠送也可退现
    const accountB = await newAccount();
    const wxNo = `RECHARGECTRL${Date.now().toString(36).toUpperCase()}`;
    createOrder({
        id: wxNo,
        outTradeNo: wxNo,
        description: '钱包充值',
        amount: 30000,
        status: 'pending',
        userId: accountB,
        kind: 'recharge',
        channel: siteConfig.paymentChannel,
        currency: siteConfig.currency,
    });
    settleOrderPaid(wxNo, { transactionId: 'ctrl-1' });
    const ctrlGift = getDb()
        .prepare("SELECT originalCents FROM credit_lots WHERE userId = ? AND sourceKind = 'membership_bonus'")
        .get(accountB) as { originalCents: number } | undefined;
    assert.strictEqual(ctrlGift?.originalCents, 600, '对照组：同额度的普通充值该发 20‰ = 600 分赠送');
    assert.strictEqual(getRefundableCents(accountB), 30000, '对照组：普通充值全额可退现');
    ok('对照组（站点默认通道）照发 600 分赠送、30000 分全额可退现——差异确实来自 channel');
}

// ===========================================================================
console.log('\n[6] 交易号重用');
// ===========================================================================
{
    const created = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'appstore', productId: 'credits.cny.50', amountCents: 5000, idempotencyKey: 'k-ios-reuse' })
    );
    const b = await created.json();
    // 拿已经结过单的那张收据的 transactionId，换一个 appAccountToken 去结新单
    const reused = await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken: b.appAccountToken, transactionId: PAID_TX })),
        b.outTradeNo
    );
    assert.strictEqual(reused.status, 409);
    assert.strictEqual((await reused.json()).error, 'transaction_reused');
    assert.strictEqual(getOrder(b.outTradeNo)!.status, 'pending', '重用的交易一分钱都不许写');
    ok('同一个 transactionId 结第二张单 → 409 transaction_reused');

    // 已付的单收到**另一张**收据：也是 409（说明用户被扣了两次钱，留人工）
    const second = await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken })),
        orderNo
    );
    assert.strictEqual(second.status, 409);
    assert.strictEqual((await second.json()).error, 'transaction_reused');
    ok('已付单收到另一张收据 → 409 transaction_reused（不静默当成功）');
}

// ===========================================================================
console.log('\n[7] Server Notifications V2：REFUND 追回');
// ===========================================================================
{
    // 验签失败 → 401（苹果会重试，不该被 200 吞掉）
    const goodTx = signJws(transactionPayload({ appAccountToken, transactionId: PAID_TX }));
    const badPayload = signJws(notificationPayload('REFUND', goodTx));
    const parts = badPayload.split('.');
    const signature = Buffer.from(parts[2], 'base64url');
    // Changing base64url padding bits can leave the signature bytes unchanged.
    signature[0] ^= 1;
    parts[2] = signature.toString('base64url');
    const bad = await notify.POST(notifyReq({ signedPayload: parts.join('.') }));
    assert.strictEqual(bad.status, 401);
    assert.strictEqual(getOrder(orderNo)!.refundedAt, undefined, '验签失败一个字节都不许写');
    ok('signedPayload 验签失败 → 401，订单不动');

    for (const body of [{}, { signedPayload: '' }, { signedPayload: 'x'.repeat(100000) }]) {
        const r = await notify.POST(notifyReq(body));
        assert.strictEqual(r.status, 400);
    }
    ok('signedPayload 缺失 / 空 / 超长 → 400');

    // 其它类型 → 200，不动任何东西
    const other = await notify.POST(
        notifyReq({ signedPayload: signJws(notificationPayload('CONSUMPTION_REQUEST', goodTx)) })
    );
    assert.strictEqual(other.status, 200);
    assert.strictEqual(getOrder(orderNo)!.refundedAt, undefined);
    ok('CONSUMPTION_REQUEST 等其它类型 → 200 收妥，不动订单');

    // 查无单 → 200（重推 5 次也不会有单出来）
    const unknown = await notify.POST(
        notifyReq({
            signedPayload: signJws(notificationPayload('REFUND', signJws(transactionPayload()))),
        })
    );
    assert.strictEqual(unknown.status, 200);
    assert.strictEqual((await unknown.json()).matched, false);
    ok('退款通知的交易在本站查无订单 → 200 matched:false（只留日志）');

    // 真退款：余额里还有这笔钱，应当全额追回
    const balanceBefore = getBalance(accountA);
    const refundJws = signJws(
        transactionPayload({
            appAccountToken,
            transactionId: PAID_TX,
            revocationDate: Date.now(),
        })
    );
    const refunded = await notify.POST(
        notifyReq({ signedPayload: signJws(notificationPayload('REFUND', refundJws)) })
    );
    assert.strictEqual(refunded.status, 200);
    const rb = await refunded.json();
    assert.strictEqual(rb.matched, true);
    assert.strictEqual(rb.clawedBackCents, 5000);
    assert.strictEqual(rb.shortfallCents, 0);
    assert.strictEqual(getBalance(accountA), balanceBefore - 5000, '追回后余额必须少掉这笔');
    const order = getOrder(orderNo)!;
    assert.ok(typeof order.refundedAt === 'string' && order.refundedAt.length > 0);
    assert.strictEqual(order.status, 'paid', '订单确实付过，status 不回退（否则重放的确认会再发一次币）');
    ok('REFUND → 记 refundedAt + 全额追回 5000 分，status 保持 paid');

    // 重复推送幂等
    const balanceAfter = getBalance(accountA);
    const dup = await notify.POST(
        notifyReq({ signedPayload: signJws(notificationPayload('REFUND', refundJws)) })
    );
    assert.strictEqual(dup.status, 200);
    assert.strictEqual((await dup.json()).alreadyRefunded, true);
    assert.strictEqual(getBalance(accountA), balanceAfter, '重复退款通知不许再扣一次');
    ok('重复 REFUND 推送 → alreadyRefunded:true，一分钱不再动');

    // 已经花掉的部分追不回来：欠账本轮未实现，只能记日志 + 200
    const created = await POST(
        req({ action: 'create-recharge', accountId: accountA, channel: 'appstore', productId: 'credits.cny.100', amountCents: 10000, idempotencyKey: 'k-ios-short' })
    );
    const cb = await created.json();
    const shortTx = nextTransactionId();
    await confirm(
        accountA,
        signJws(transactionPayload({ appAccountToken: cb.appAccountToken, productId: 'credits.cny.100', transactionId: shortTx })),
        cb.outTradeNo
    );
    // 把这张单发出来的批次花掉 6000 分（直接改批次，模拟用户已消费）
    getDb()
        .prepare('UPDATE credit_lots SET remainingCents = remainingCents - 6000 WHERE refOrderId = ?')
        .run(cb.outTradeNo);
    const shortRes = await notify.POST(
        notifyReq({
            signedPayload: signJws(
                notificationPayload(
                    'REVOKE',
                    signJws(
                        transactionPayload({
                            appAccountToken: cb.appAccountToken,
                            productId: 'credits.cny.100',
                            transactionId: shortTx,
                            revocationDate: Date.now(),
                        })
                    )
                )
            ),
        })
    );
    assert.strictEqual(shortRes.status, 200);
    const sb = await shortRes.json();
    assert.strictEqual(sb.clawedBackCents, 4000, '只能追回还剩的 4000 分');
    assert.strictEqual(sb.shortfallCents, 6000, '花掉的 6000 分追不回来（无欠账能力）');
    ok('REVOKE 且批次已被花掉一部分 → 追回剩余、回报 shortfall（欠账未实现，记日志）');
}

console.log(`\nApple 内购充值全绿：${passed} 项`);

// #1655: real JWS verifier + internal HTTP routes + shared entitlement/allowance ledger.
{
    const { APPSTORE_PRO_MONTHLY } = await import('@/lib/appstore-subscription');
    const { subscriptionSnapshot } = await import('@/lib/subscription');
    const { listEntitlements } = await import('@/lib/purchases');
    const account = await newAccount();
    const startingBalance = getBalance(account);
    const prepare = () => POST(req({ action: 'prepare-appstore-subscription', accountId: account }));
    if (siteConfig.currency !== 'CNY') {
        assert.equal((await prepare()).status, 409);
        ok('subscription unavailable on USD deployment');
    } else {
        delete process.env.APPSTORE_SUBSCRIPTIONS_ENABLED;
        assert.equal((await prepare()).status, 409);
        const capability = () => POST(req({ action: 'appstore-subscription-capability' }));
        assert.equal((await (await capability()).json()).available, false);
        process.env.APPSTORE_SUBSCRIPTIONS_ENABLED = 'true';
        assert.equal((await (await capability()).json()).available, true);
        const prepared = await prepare();
        assert.equal(prepared.status, 200);
        const purchase = await prepared.json();
        assert.equal(purchase.productId, APPSTORE_PRO_MONTHLY);
        assert.deepEqual(await (await prepare()).json(), purchase);
        const now = Date.now();
        const firstStart = Date.UTC(2026, 0, 31), firstEnd = Date.UTC(2026, 1, 28);
        const original = nextTransactionId();
        const tx = {
            ...transactionPayload({ transactionId: original, productId: APPSTORE_PRO_MONTHLY, appAccountToken: purchase.appAccountToken }),
            type: 'Auto-Renewable Subscription', purchaseDate: firstStart, expiresDate: firstEnd,
        };
        const confirmSub = (body: Record<string, unknown>, who = account) => POST(req({
            action: 'confirm-appstore-subscription', accountId: who, signedTransaction: signJws(body),
        }));
        assert.equal((await confirmSub(tx)).status, 200);
        assert.equal((await confirmSub(tx)).status, 200);
        let periods = getDb().prepare('SELECT * FROM subscription_period WHERE userId=?').all(account) as any[];
        assert.equal(periods.length, 1);
        assert.equal(periods[0].startsAt, new Date(firstStart).toISOString());
        assert.equal(periods[0].endsAt, new Date(firstEnd).toISOString());
        assert.equal(getBalance(account), startingBalance, 'subscription never creates refundable cash');
        assert.equal(subscriptionSnapshot(account, new Date(firstStart + 1).toISOString()).availableCents, 20000);
        const other = await newAccount();
        assert.equal((await confirmSub(tx, other)).status, 409);
        assert.equal((await confirmSub({ ...tx, environment: 'Sandbox' })).status, 400);
        assert.equal((await confirmSub({ ...tx, bundleId: 'wrong.bundle' })).status, 400);
        assert.equal((await confirmSub({ ...tx, type: 'Consumable' })).status, 409);
        assert.equal((await confirmSub({ ...tx, inAppOwnershipType: 'FAMILY_SHARED' })).status, 409);
        assert.equal((await confirmSub({ ...tx, productId: 'credits.cny.50' })).status, 409);
        assert.equal((await confirm(account, signJws(tx))).status, 404, 'subscription cannot redeem as recharge');
        ok('subscription prepare/token, month boundaries, replay and cross-account/environment/product guards');

        const secondId = nextTransactionId();
        const second = { ...tx, transactionId: secondId, originalTransactionId: original,
            purchaseDate: now - 86400000, expiresDate: now + 27 * 86400000, signedDate: now + 1 };
        const renewal = { originalTransactionId: original, productId: APPSTORE_PRO_MONTHLY,
            autoRenewProductId: APPSTORE_PRO_MONTHLY, environment: 'Production', autoRenewStatus: 1, signedDate: now + 2 };
        const send = async (type: string, transaction: Record<string, unknown>, info?: Record<string, unknown>) => {
            const p = notificationPayload(type, signJws(transaction));
            if (info) (p.data as any).signedRenewalInfo = signJws(info);
            return notify.POST(notifyReq({ signedPayload: signJws(p) }));
        };
        assert.equal((await send('DID_RENEW', second, renewal)).status, 200);
        assert.equal((await send('DID_RENEW', second, renewal)).status, 200);
        assert.equal(subscriptionSnapshot(account).active, true);
        assert.equal(subscriptionSnapshot(account).autoRenew?.enabled, true);
        assert.ok(listEntitlements(account).some(e => e.feature === 'cloud.storage.3gb'));
        assert.equal((await send('DID_CHANGE_RENEWAL_STATUS', second, { ...renewal, autoRenewStatus: 0, signedDate: now + 3 })).status, 200);
        assert.equal(subscriptionSnapshot(account).autoRenew?.enabled, false);
        assert.equal(subscriptionSnapshot(account).active, true, 'cancel leaves paid time available');
        await send('DID_RENEW', second, renewal);
        assert.equal(subscriptionSnapshot(account).autoRenew?.enabled, false, 'old metadata cannot undo cancellation');
        await send('REFUND', { ...tx, revocationDate: firstEnd - 86400000, signedDate: now + 4 });
        assert.equal(subscriptionSnapshot(account).active, true, 'old-period refund does not revoke later renewal');
        await send('REFUND', { ...second, revocationDate: now - 1, signedDate: now + 5 });
        assert.equal(subscriptionSnapshot(account).active, false);
        await confirmSub(second);
        assert.equal(subscriptionSnapshot(account).active, false, 'old purchase cannot resurrect refunded period');
        assert.equal((getDb().prepare('SELECT COUNT(*) AS n FROM subscription_period WHERE userId=?').get(account) as any).n, 2);
        assert.equal(getBalance(account), startingBalance);
        ok('notification renewal/cancel/old refund/current refund/late replay preserve paid periods and wallet');

        getDb().prepare("INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES (?,'pro','other-paid',?,?)")
            .run(account, new Date(now).toISOString(), new Date(now + 86400000).toISOString());
        assert.ok(listEntitlements(account).some(e => e.feature === 'cloud.storage.3gb'), 'independently paid Pro survives refund');
        assert.equal((await send('DID_RENEW', second, { ...renewal, originalTransactionId: 'wrong' })).status, 409);
        assert.equal((await send('DID_RENEW', { ...second, appAccountToken: crypto.randomUUID() }, renewal)).status, 409);
        await send('REFUND_REVERSED', { ...second, signedDate: now + 6 });
        assert.equal(subscriptionSnapshot(account).active, true);
        await send('REFUND', { ...second, revocationDate: now - 1, signedDate: now + 5 });
        assert.equal(subscriptionSnapshot(account).active, true, 'old refund cannot undo newer reversal');
        assert.equal((await prepare()).status, 409, 'do not sell overlapping Pro');
        getDb().prepare("UPDATE entitlements SET expiresAt=NULL WHERE userId=? AND feature='pro'").run(account);
        assert.equal(subscriptionSnapshot(account).expiresAt, null, 'permanent Pro is never shortened');
        delete process.env.APPSTORE_SUBSCRIPTIONS_ENABLED;
        assert.equal((await confirmSub(second)).status, 200, 'closing sales does not drop paid transactions');
        ok('renewal binding, refund reversal, purchase gate and independent/permanent Pro preserved');
        const deletion = await POST(req({ action: 'delete-account', accountId: account }));
        assert.equal(deletion.status, 200);
        assert.equal((await deletion.json()).deleted, true);
        assert.equal((await confirmSub(second)).status, 404);
        assert.equal((await send('DID_RENEW', { ...second, transactionId: nextTransactionId(), signedDate: now + 7 }, renewal)).status, 409);
        assert.equal((getDb().prepare('SELECT COUNT(*) AS n FROM appstore_subscription_account WHERE userId=?').get(account) as any).n, 0);
        ok('deleted account binding and delayed notifications cannot revive account');

    }
}

// #1672: production verifier retries Sandbox only for an explicitly allowed test identity.
if (siteConfig.currency === 'CNY') {
    const { APPSTORE_PRO_MONTHLY } = await import('@/lib/appstore-subscription');
    const { subscriptionSnapshot } = await import('@/lib/subscription');
    const account = await newAccount(), other = await newAccount();
    process.env.APPSTORE_SANDBOX_ACCOUNT_IDS = account;
    delete process.env.APPSTORE_SUBSCRIPTIONS_ENABLED;
    const capability = (accountId?: string) => POST(req({ action: 'appstore-subscription-capability', accountId }));
    assert.equal((await (await capability()).json()).available, false);
    assert.equal((await (await capability(other)).json()).available, false);
    assert.equal((await (await capability(account)).json()).available, true);
    const prepared = await POST(req({ action: 'prepare-appstore-subscription', accountId: account }));
    assert.equal(prepared.status, 200);
    const purchase = await prepared.json();
    const balance = getBalance(account), now = Date.now(), transactionId = nextTransactionId();
    const tx = { ...transactionPayload({ transactionId, productId: APPSTORE_PRO_MONTHLY, appAccountToken: purchase.appAccountToken }),
        type: 'Auto-Renewable Subscription', environment: 'Sandbox', purchaseDate: now - 1000, expiresDate: now + 300000 };
    const confirm = (who: string, signed = signJws(tx)) => POST(req({ action: 'confirm-appstore-subscription', accountId: who, signedTransaction: signed }));
    assert.equal((await confirm(other)).status, 400);
    const response = await confirm(account);
    assert.equal(response.status, 200);
    const projection = (await response.json()).subscription;
    assert.equal(projection.sandbox, true); assert.equal(projection.sandboxSubscription.active, true); assert.equal(projection.availableCents, subscriptionSnapshot(account).availableCents);
    assert.equal(getBalance(account), balance);
    assert.equal(subscriptionSnapshot(account).active, false);
    assert.equal((getDb().prepare('SELECT COUNT(*) n FROM subscription_period WHERE userId=?').get(account) as any).n, 0);
    assert.equal((await confirm(account, 'invalid-signature')).status, 400);
    const current = await POST(req({ action: 'balance', accountId: account }));
    assert.equal((await current.json()).subscription.sandbox, true);
    // Same allowlisted identity buying for real on an App Store build: the Production transaction carries the
    // token prepare returned and must credit the production ledger (was account_mismatch: charged, never credited).
    const realId = nextTransactionId(), realOriginal = nextTransactionId();
    const real = { ...tx, transactionId: realId, originalTransactionId: realOriginal, environment: 'Production', signedDate: now + 10 };
    const realConfirm = await confirm(account, signJws(real));
    assert.equal(realConfirm.status, 200, 'allowlisted account Production purchase is credited');
    assert.equal(subscriptionSnapshot(account).active, true);
    assert.equal(getBalance(account), balance);
    const realRenewal = { ...real, transactionId: nextTransactionId(), purchaseDate: now, expiresDate: now + 600000, signedDate: now + 11 };
    const realNotify = notificationPayload('DID_RENEW', signJws(realRenewal));
    assert.equal((await notify.POST(notifyReq({ signedPayload: signJws(realNotify) }))).status, 200, 'production renewal maps to the allowlisted account');
    assert.equal((getDb().prepare('SELECT COUNT(*) n FROM subscription_period WHERE userId=?').get(account) as { n: number }).n, 2);
    ok('allowlisted account: Production purchase and renewal credit production, Sandbox stays isolated');
    delete process.env.APPSTORE_SANDBOX_ACCOUNT_IDS;
    assert.equal((await confirm(account)).status, 400);
    assert.equal((await (await capability(account)).json()).available, false);
    process.env.APPSTORE_SANDBOX_ACCOUNT_IDS = account;
    const sandboxNotify = () => notify.POST(notifyReq({ signedPayload: signJws(notificationPayload('DID_RENEW', signJws(tx), 'Sandbox')) }));
    assert.equal((await sandboxNotify()).status, 200);
    assert.equal((await POST(req({ action: 'delete-account', accountId: account }))).status, 200);
    assert.equal((await sandboxNotify()).status, 409, 'deleted review identity cannot receive delayed Sandbox notifications');
    assert.equal((await (await capability(account)).json()).available, false);
    delete process.env.APPSTORE_SANDBOX_ACCOUNT_IDS;
    ok('Sandbox account-only capability, real JWS environment fallback and display projection never fund production');
}
