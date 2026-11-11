/**
 * 微信支付验签「真实性探针」（只读，不改任何订单/账本状态）。
 *
 * 目的：用生产商户的真实凭据向微信要一个真实签名，再用本仓库 lib/wxpay.ts 的
 * 新公钥验签逻辑去验它。验通过即同时证明三件事都对：微信支付公钥、待签名串构造
 * （timestamp\nnonce\nbody\n）、RSA-SHA256 验签算法。
 *
 * 探针只调 GET /v3/certificates —— 该商户已切公钥模式，这个接口必然回 404
 * RESOURCE_NOT_EXISTS，但 **响应头里带的是真实签名**，正好当验签素材，且它不写任何状态。
 *
 * 分两半跑，因为商户私钥只在生产服务器上，而新代码只在本仓库里：
 *
 *   # 1) 采集（在服务器上执行，程序从 stdin 喂进 node，服务器上不落任何文件）
 *   npx tsx --tsconfig ./tsconfig.json ./scripts/probe-wxpay-signature.mts --capture-source \
 *     | ssh -i ~/.ssh/id_ed25519 root@<生产机> \
 *         'cd /www/wwwroot/www.aiworkdeck.com/new && node --input-type=module' \
 *     > /tmp/wxpay-envelope.json
 *
 *   # 2) 验签（本机执行，走本仓库的新代码；PEM 是公钥，可以从服务器 cat 下来）
 *   ssh -i ~/.ssh/id_ed25519 root@<生产机> \
 *     'cat /www/wwwroot/www.aiworkdeck.com/new/wxpay/pub_key.pem' > /tmp/pub_key.pem
 *   npx tsx --tsconfig ./tsconfig.json ./scripts/probe-wxpay-signature.mts \
 *     /tmp/wxpay-envelope.json /tmp/pub_key.pem
 *
 * 注意：报文时间戳有 ±5 分钟窗口，两步要连着跑完。
 * 采集程序只输出 status/headers/body（微信的 404 错误报文），不输出任何密钥材料。
 */
import fs from 'fs';
import assert from 'assert';

/**
 * 在生产服务器上执行的采集程序。纯 ESM + 仅 node 内置模块，
 * 不 import 本仓库任何文件，因此可以直接 pipe 给服务器上的 node 跑，无需 tsx、无需落盘。
 */
const CAPTURE_SOURCE = `
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

// 只读 .env.local，取 mchid / 商户证书序列号 / 商户私钥路径
const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const env = {};
for (const line of envText.split('\\n')) {
  const m = line.match(/^\\s*([A-Z0-9_]+)\\s*=\\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const mchid = env.WXPAY_MCHID;
const serialNo = env.WXPAY_SERIAL_NO;
const keyPath = env.WXPAY_PRIVATE_KEY_PATH || './wxpay/apiclient_key.pem';
if (!mchid || !serialNo) throw new Error('缺 WXPAY_MCHID / WXPAY_SERIAL_NO');
const privateKey = fs.readFileSync(
  path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath),
  'utf-8'
);

const method = 'GET';
const urlPath = '/v3/certificates';
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonceStr = crypto.randomBytes(16).toString('hex');
const message = method + '\\n' + urlPath + '\\n' + timestamp + '\\n' + nonceStr + '\\n' + '' + '\\n';
const signer = crypto.createSign('RSA-SHA256');
signer.update(message);
const signature = signer.sign(privateKey, 'base64');
const authorization =
  'WECHATPAY2-SHA256-RSA2048 mchid="' + mchid + '",serial_no="' + serialNo +
  '",timestamp="' + timestamp + '",nonce_str="' + nonceStr + '",signature="' + signature + '"';

const result = await new Promise((resolve, reject) => {
  const req = https.request(
    {
      host: 'api.mch.weixin.qq.com',
      path: urlPath,
      method,
      headers: { Authorization: authorization, Accept: 'application/json', 'User-Agent': 'awd-wxpay-probe/1.0' },
    },
    (res) => {
      let raw = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw }));
    }
  );
  req.on('error', reject);
  req.end();
});

// 只输出验签需要的素材 + 微信的错误报文；不含任何密钥
process.stdout.write(JSON.stringify({
  status: result.status,
  timestamp: result.headers['wechatpay-timestamp'] || '',
  nonce: result.headers['wechatpay-nonce'] || '',
  serial: result.headers['wechatpay-serial'] || '',
  signature: result.headers['wechatpay-signature'] || '',
  body: result.raw,
}, null, 2));
`;

if (process.argv.includes('--capture-source')) {
  process.stdout.write(CAPTURE_SOURCE);
  process.exit(0);
}

const [envelopePath, pubKeyPath] = process.argv.slice(2);
if (!envelopePath || !pubKeyPath) {
  console.error('用法: probe-wxpay-signature.mts <envelope.json> <pub_key.pem>  |  --capture-source');
  process.exit(2);
}

const envelope = JSON.parse(fs.readFileSync(envelopePath, 'utf-8'));
console.log('微信响应 HTTP 状态:', envelope.status);
console.log('微信响应报文:', envelope.body);
console.log('Wechatpay-Serial:', envelope.serial);

assert.ok(envelope.signature, '响应头里没有 Wechatpay-Signature，无法验签');
assert.ok(
  envelope.serial.startsWith('PUB_KEY_ID_'),
  `预期是公钥模式（PUB_KEY_ID_ 开头），实际拿到 ${envelope.serial}`
);

// 按报文里的真实公钥 ID 配置，走本仓库新代码的公钥分支
process.env.WXPAY_PUBLIC_KEY_ID = envelope.serial;
process.env.WXPAY_PUBLIC_KEY_PATH = pubKeyPath;

const { verifyWechatpayMessage, isTimestampFresh } = await import('@/lib/wxpay');

assert.ok(
  isTimestampFresh(envelope.timestamp),
  '报文时间戳已超出 5 分钟窗口，请重新采集后立刻验签'
);

const passedReal = await verifyWechatpayMessage({
  timestamp: envelope.timestamp,
  nonce: envelope.nonce,
  serial: envelope.serial,
  signature: envelope.signature,
  body: envelope.body,
});
assert.strictEqual(passedReal, true, '真实微信签名验签失败');
console.log('  PASS 用生产公钥验证微信真实响应签名 → 通过');

// 反向对照：同一份公钥下，篡改 body 必须验不过（排除「无脑返回 true」）
const tamperedOk = await verifyWechatpayMessage({
  timestamp: envelope.timestamp,
  nonce: envelope.nonce,
  serial: envelope.serial,
  signature: envelope.signature,
  body: envelope.body + ' ',
});
assert.strictEqual(tamperedOk, false, '篡改后的报文竟然验签通过，验签形同虚设');
console.log('  PASS 同一签名下篡改报文 → 验签失败（反向对照成立）');

console.log('\n真实性验证通过：公钥、待签名串构造、RSA-SHA256 验签算法三者一致。');
