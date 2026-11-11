/**
 * 微信支付「公钥模式」验签验证脚本。
 * 用临时生成的 RSA 密钥对扮演微信侧签名，不需要任何真实凭据、不发网络请求。
 *
 * 必须在一个空目录里执行（notify 全链路那节会在 cwd 建 data/awd.db，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-wxpay-pubkey.mts
 *
 * 覆盖：
 * - PUB_KEY_ID_ 前缀走公钥路线且验签通过
 * - body 被篡改 → 拒绝
 * - 时间戳超出 5 分钟窗口 → 拒绝
 * - 报文 serial 与 WXPAY_PUBLIC_KEY_ID 不一致 → 拒绝（防伪造 serial 诱导用错密钥）
 * - 未配置 WXPAY_PUBLIC_KEY_ID → 拒绝（fail closed）
 * - 公钥文件缺失 / 格式不对 → 拒绝（fail closed，且不抛未捕获异常）
 * - 证书模式的 serial 仍走原平台证书路线（不被公钥分支截胡）
 * - 缺头（timestamp/nonce/signature）→ 拒绝
 * - notify 路由在公钥模式下的完整链路：验签 → AES-256-GCM 解密 → 订单置 paid
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
for (const f of ['awd.db', 'awd.db-wal', 'awd.db-shm']) {
  assert.ok(
    !fs.existsSync(path.join(cwd, 'data', f)),
    `隔离目录残留 data/${f}，请换空目录或清空后重跑`
  );
}

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}

// ---------- 0. 造一对 RSA 密钥，扮演「微信支付公钥 / 微信侧私钥」 ----------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxpay-pubkey-'));
const pubPath = path.join(tmpDir, 'pub_key.pem');
fs.writeFileSync(pubPath, pubPem);

const PUB_KEY_ID = 'PUB_KEY_ID_0111114077852026041700111649000001';

process.env.WXPAY_PUBLIC_KEY_PATH = pubPath;
process.env.WXPAY_PUBLIC_KEY_ID = PUB_KEY_ID;
// 指向不存在的商户私钥：证书模式分支若真去拉 /v3/certificates，会在签名阶段就失败，
// 保证本脚本不发任何网络请求、也不会误用本机真实凭据。
process.env.WXPAY_PRIVATE_KEY_PATH = path.join(tmpDir, 'no-such-apiclient_key.pem');
process.env.WXPAY_APIV3_KEY = '0'.repeat(32);

const { verifyWechatpayMessage, isTimestampFresh, verifySignatureWithKey, __setPlatformCertsForTest } =
  await import('@/lib/wxpay');

/** 用「微信侧私钥」按 timestamp\nnonce\nbody\n 签名。 */
function signAsWechat(timestamp: string, nonce: string, body: string, key = privPem): string {
  const s = crypto.createSign('RSA-SHA256');
  s.update(`${timestamp}\n${nonce}\n${body}\n`);
  return s.sign(key, 'base64');
}

const nowTs = () => Math.floor(Date.now() / 1000).toString();
const BODY = JSON.stringify({
  id: 'e1b8b0a0-0000-0000-0000-000000000001',
  event_type: 'TRANSACTION.SUCCESS',
  resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext: 'xxx', nonce: 'n', associated_data: 'transaction' },
});

function message(over: Partial<Record<'timestamp' | 'nonce' | 'serial' | 'signature' | 'body', string>> = {}) {
  const timestamp = over.timestamp ?? nowTs();
  const nonce = over.nonce ?? 'abcdefghijklmnop';
  const body = over.body ?? BODY;
  return {
    timestamp,
    nonce,
    serial: over.serial ?? PUB_KEY_ID,
    signature: over.signature ?? signAsWechat(timestamp, nonce, body),
    body,
  };
}

// ---------- 1. 公钥模式：正常报文验签通过 ----------
assert.strictEqual(await verifyWechatpayMessage(message()), true, '合法公钥模式报文应通过');
ok('PUB_KEY_ID_ 前缀 → 走公钥路线，合法签名验签通过');

// 再跑一次，确认走的是缓存（删掉公钥文件后仍能验通过，说明只读了一次）
fs.renameSync(pubPath, `${pubPath}.bak`);
assert.strictEqual(await verifyWechatpayMessage(message()), true, '公钥应已缓存，不每次读盘');
fs.renameSync(`${pubPath}.bak`, pubPath);
ok('公钥内容读一次后缓存');

// ---------- 2. body 被篡改 → 拒绝 ----------
{
  const m = message();
  const tampered = { ...m, body: m.body.replace('TRANSACTION.SUCCESS', 'TRANSACTION.HACKED') };
  assert.strictEqual(await verifyWechatpayMessage(tampered), false, '篡改 body 必须被拒');
  ok('body 被篡改 → 验签失败被拒');
}

// ---------- 3. 时间戳超窗 → 拒绝（即便签名本身是对的） ----------
{
  const oldTs = String(Math.floor(Date.now() / 1000) - 6 * 60);
  assert.strictEqual(isTimestampFresh(oldTs), false, '6 分钟前应判为过期');
  assert.strictEqual(await verifyWechatpayMessage(message({ timestamp: oldTs })), false);
  const futureTs = String(Math.floor(Date.now() / 1000) + 6 * 60);
  assert.strictEqual(await verifyWechatpayMessage(message({ timestamp: futureTs })), false);
  // 窗口内（4 分钟前）仍应通过，确认不是把所有时间戳都拒了
  const freshTs = String(Math.floor(Date.now() / 1000) - 4 * 60);
  assert.strictEqual(await verifyWechatpayMessage(message({ timestamp: freshTs })), true);
  ok('时间戳超出 ±5 分钟窗口 → 被拒；窗口内仍通过');
}

// ---------- 4. serial 与配置的公钥 ID 不一致 → 拒绝 ----------
{
  const fakeSerial = 'PUB_KEY_ID_9999999999999999999999999999999999999999';
  const m = message({ serial: fakeSerial });
  // 注意：签名本身用的是我们持有的私钥、是「有效」的；被拒必须是因为 serial 不匹配
  assert.strictEqual(
    verifySignatureWithKey(m.timestamp, m.nonce, m.body, m.signature, pubPem),
    true,
    '前置条件：该签名本身有效'
  );
  assert.strictEqual(await verifyWechatpayMessage(m), false, 'serial 与配置不符必须被拒');
  ok('serial 以 PUB_KEY_ID_ 开头但与 WXPAY_PUBLIC_KEY_ID 不一致 → 被拒');
}

// ---------- 5. 未配置 WXPAY_PUBLIC_KEY_ID → fail closed ----------
{
  const saved = process.env.WXPAY_PUBLIC_KEY_ID;
  delete process.env.WXPAY_PUBLIC_KEY_ID;
  assert.strictEqual(await verifyWechatpayMessage(message()), false, '缺 ID 配置必须 fail closed');
  process.env.WXPAY_PUBLIC_KEY_ID = saved;
  assert.strictEqual(await verifyWechatpayMessage(message()), true, '恢复配置后应重新通过');
  ok('未配置 WXPAY_PUBLIC_KEY_ID → fail closed（不放行）');
}

// ---------- 6. 公钥文件缺失 / 格式不对 → fail closed 且不抛异常 ----------
{
  const savedPath = process.env.WXPAY_PUBLIC_KEY_PATH;

  process.env.WXPAY_PUBLIC_KEY_PATH = path.join(tmpDir, 'does-not-exist.pem');
  let threw = false;
  let result = true;
  try {
    result = await verifyWechatpayMessage(message());
  } catch {
    threw = true;
  }
  assert.strictEqual(threw, false, '文件缺失不应抛出未捕获异常');
  assert.strictEqual(result, false, '文件缺失必须 fail closed');
  // 连续两次都不抛，确认不是「第一次抛、后续走缓存」
  assert.strictEqual(await verifyWechatpayMessage(message()), false);
  ok('公钥文件缺失 → fail closed 且不抛未捕获异常');

  // 放一份证书（BEGIN CERTIFICATE）而不是公钥，属于典型的配错，同样必须拒
  const wrongPath = path.join(tmpDir, 'wrong.pem');
  fs.writeFileSync(wrongPath, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
  process.env.WXPAY_PUBLIC_KEY_PATH = wrongPath;
  assert.strictEqual(await verifyWechatpayMessage(message()), false, '非公钥 PEM 必须 fail closed');
  ok('公钥文件格式不对（放成证书）→ fail closed');

  process.env.WXPAY_PUBLIC_KEY_PATH = savedPath;
  assert.strictEqual(await verifyWechatpayMessage(message()), true, '恢复路径后应重新通过');
  ok('恢复正确公钥路径后验签恢复（缓存按路径失效）');
}

// ---------- 7. 证书模式 serial 仍走原平台证书路线 ----------
{
  const certSerial = '4A1BC2DE3F45678901234567890ABCDEF1234567';
  __setPlatformCertsForTest({ [certSerial]: pubPem });
  assert.strictEqual(
    await verifyWechatpayMessage(message({ serial: certSerial })),
    true,
    '证书模式 serial 应查证书表并验签通过'
  );
  ok('非 PUB_KEY_ID_ 的 serial → 仍走平台证书路线，未被公钥分支截胡');

  // 证书表里没有的序列号：因为没有可用凭据拉取证书，刷新会失败 → fail closed
  const unknownSerial = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
  assert.strictEqual(await verifyWechatpayMessage(message({ serial: unknownSerial })), false);
  ok('证书模式下未知序列号 → fail closed');
}

// ---------- 8. 缺头一律拒绝 ----------
{
  for (const field of ['timestamp', 'nonce', 'signature', 'serial'] as const) {
    const m = { ...message(), [field]: '' };
    assert.strictEqual(await verifyWechatpayMessage(m), false, `缺 ${field} 必须被拒`);
  }
  ok('timestamp/nonce/signature/serial 任一缺失 → 被拒');
}

// ---------- 9. notify 路由公钥模式全链路：验签 → 解密 → 订单置 paid ----------
{
  const { createOrder, getOrder } = await import('@/lib/orders');
  const { POST: notifyPOST } = await import('@/app/api/payment/notify/route');
  const { NextRequest } = await import('next/server');

  const outTradeNo = 'PUBKEY-NOTIFY-1';
  createOrder({
    id: outTradeNo,
    outTradeNo,
    description: '公钥模式回调链路验证',
    amount: 100,
    status: 'pending',
    kind: 'support',
  });

  // 按微信回调的真实形状造报文：resource 是 AES-256-GCM 密文（APIv3 key 解密）
  function buildNotifyBody(payload: unknown) {
    const aesNonce = 'abcdefghijkl';
    const aad = 'transaction';
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.WXPAY_APIV3_KEY!, 'utf-8'),
      Buffer.from(aesNonce, 'utf-8')
    );
    cipher.setAAD(Buffer.from(aad, 'utf-8'));
    const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf-8'), cipher.final()]);
    return JSON.stringify({
      id: crypto.randomUUID(),
      event_type: 'TRANSACTION.SUCCESS',
      resource_type: 'encrypt-resource',
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        original_type: 'transaction',
        nonce: aesNonce,
        associated_data: aad,
        ciphertext: Buffer.concat([enc, cipher.getAuthTag()]).toString('base64'),
      },
    });
  }

  const notifyBody = buildNotifyBody({
    out_trade_no: outTradeNo,
    transaction_id: 'wx-txn-pubkey-1',
    trade_state: 'SUCCESS',
    amount: { total: 100, payer_total: 100, currency: 'CNY' },
    payer: { openid: 'o-fake-openid' },
  });

  const postNotify = (body: string, serial: string) => {
    const timestamp = nowTs();
    const nonce = 'notifynonce12345';
    return notifyPOST(
      new NextRequest('https://www.aiworkdeck.com/api/payment/notify', {
        method: 'POST',
        body,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Serial': serial,
          'Wechatpay-Signature': signAsWechat(timestamp, nonce, body),
        },
      })
    );
  };

  // 先证明修复前的症状：serial 与配置不符 → 401，订单仍是 pending
  const bad = await postNotify(notifyBody, 'PUB_KEY_ID_0000000000000000000000000000000000');
  assert.strictEqual(bad.status, 401, '伪造 serial 的回调必须 401');
  assert.strictEqual(getOrder(outTradeNo)!.status, 'pending', '验签没过就不能改订单状态');
  ok('notify 路由：验签失败 → 401 且订单状态不动（fail closed 语义保留）');

  const good = await postNotify(notifyBody, PUB_KEY_ID);
  assert.strictEqual(good.status, 200, '合法回调应 200');
  assert.deepStrictEqual(await good.json(), { code: 'SUCCESS', message: '成功' });
  const settled = getOrder(outTradeNo)!;
  assert.strictEqual(settled.status, 'paid', '订单应置为已支付');
  assert.strictEqual(settled.transactionId, 'wx-txn-pubkey-1');
  ok('notify 路由公钥模式全链路：验签 → AES-256-GCM 解密 → 订单置 paid');

  // 重复回调幂等：仍 200，不重复入账
  const dup = await postNotify(notifyBody, PUB_KEY_ID);
  assert.strictEqual(dup.status, 200);
  assert.strictEqual(getOrder(outTradeNo)!.status, 'paid');
  ok('公钥模式下重复回调仍幂等');
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n全部通过：${passed} 项`);
