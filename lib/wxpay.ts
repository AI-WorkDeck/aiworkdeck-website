import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 读取私钥文件
function loadPrivateKey(): string {
  const keyPath = process.env.WXPAY_PRIVATE_KEY_PATH || './wxpay/apiclient_key.pem';
  const fullPath = path.isAbsolute(keyPath) ? keyPath : path.join(/*turbopackIgnore: true*/ process.cwd(), keyPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`私钥文件不存在: ${fullPath}`);
  }
  
  return fs.readFileSync(fullPath, 'utf-8');
}

const wxpayConfig = {
  appid: process.env.WXPAY_APPID || '',
  mchid: process.env.WXPAY_MCHID || '',
  key: process.env.WXPAY_APIV3_KEY || '',
  serial_no: process.env.WXPAY_SERIAL_NO || '',
};

/** 微信支付公钥 ID 的固定前缀，用于区分「公钥模式」与旧的「平台证书模式」。 */
const PUBLIC_KEY_ID_PREFIX = 'PUB_KEY_ID_';

/** 配置项按需读取（而非模块加载时快照），便于脚本切换 env 验证各分支。 */
function getPublicKeyId(): string {
  return process.env.WXPAY_PUBLIC_KEY_ID || '';
}

function getPublicKeyPath(): string {
  const keyPath = process.env.WXPAY_PUBLIC_KEY_PATH || './wxpay/pub_key.pem';
  return path.isAbsolute(keyPath) ? keyPath : path.join(/*turbopackIgnore: true*/ process.cwd(), keyPath);
}

let axiosInstance: AxiosInstance | null = null;

// 生成签名
function sign(message: string, privateKey: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(privateKey, 'base64');
}

// 生成 Authorization 头
function generateAuthorization(method: string, url: string, body: string, timestamp: string, nonceStr: string): string {
  const privateKey = loadPrivateKey();
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = sign(message, privateKey);
  
  return `WECHATPAY2-SHA256-RSA2048 mchid="${wxpayConfig.mchid}",serial_no="${wxpayConfig.serial_no}",timestamp="${timestamp}",nonce_str="${nonceStr}",signature="${signature}"`;
}

// 生成随机字符串
function generateNonceStr(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getWxPayAxios(): AxiosInstance {
  if (!axiosInstance) {
    axiosInstance = axios.create({
      baseURL: 'https://api.mch.weixin.qq.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // 请求拦截器，添加签名
    axiosInstance.interceptors.request.use((config) => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonceStr = generateNonceStr();
      const body = config.data ? JSON.stringify(config.data) : '';
      // 签名串里的 URL **必须含 query string**：微信 v3 的待签名串是
      // `METHOD\n绝对URL\n时间戳\n随机串\n报文主体\n`，绝对 URL 包含查询参数。
      // axios 是在**请求拦截器跑完之后**才把 config.params 拼进 URL 的，
      // 所以这里只读 config.url 会漏掉 ?mchid=…，微信一律回 401。
      // 表现极不对称：POST（无 query）的下单一直正常，只有带参数的 GET 回查在挂——
      // 于是「主动回查」这条兜底路径长期是死的，全靠 notify 回调扛着。
      let url = config.url?.replace('https://api.mch.weixin.qq.com', '') || '';
      if (config.params && Object.keys(config.params).length > 0) {
        const qs = new URLSearchParams(
          Object.entries(config.params as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        ).toString();
        if (qs) url += (url.includes('?') ? '&' : '?') + qs;
      }
      
      const authorization = generateAuthorization(
        config.method?.toUpperCase() || 'GET',
        url,
        body,
        timestamp,
        nonceStr
      );
      
      config.headers['Authorization'] = authorization;
      // 该头告诉微信「本次请求里的敏感字段用哪把微信支付密钥加密」：
      // 公钥模式下是公钥 ID，证书模式下才是平台证书序列号。
      config.headers['Wechatpay-Serial'] = getPublicKeyId() || wxpayConfig.serial_no;
      
      return config;
    });
  }
  return axiosInstance;
}

export interface CreateOrderParams {
  description: string;
  outTradeNo: string;
  amount: number;
  notifyUrl: string;
  attach?: string;
}

export async function createNativeOrder(params: CreateOrderParams) {
  const axios = getWxPayAxios();
  
  const payload = {
    appid: wxpayConfig.appid,
    mchid: wxpayConfig.mchid,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: params.notifyUrl,
    amount: {
      total: params.amount,
      currency: 'CNY',
    },
    attach: params.attach || '',
  };
  
  const response = await axios.post('/v3/pay/transactions/native', payload);
  return response.data;
}

// ---------------------------------------------------------------------------
// APP 支付（安卓 OpenSDK 调起）
//
// appid 用开放平台「移动应用」的 AppID（WXPAY_APP_APPID），与 Native 的 WXPAY_APPID
// 不是同一个；商户号、商户私钥、APIv3 key、回调验签全部与 Native 共用。
// ---------------------------------------------------------------------------

/** APP 下单（POST /v3/pay/transactions/app），返回 prepay_id（有效期 2 小时）。 */
export async function createAppOrder(params: CreateOrderParams): Promise<string> {
  const axios = getWxPayAxios();

  const payload = {
    appid: process.env.WXPAY_APP_APPID || '',
    mchid: wxpayConfig.mchid,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: params.notifyUrl,
    amount: {
      total: params.amount,
      currency: 'CNY',
    },
  };

  const response = await axios.post('/v3/pay/transactions/app', payload);
  const prepayId = response.data?.prepay_id;
  if (typeof prepayId !== 'string' || !prepayId) {
    throw new Error('微信支付 APP 下单未返回 prepay_id');
  }
  return prepayId;
}

/**
 * 安卓 OpenSDK `PayReq` 的字段，名字与 PayReq 成员一一对应，端上原样赋值即可。
 * partnerId 是商户号；packageValue 固定 `Sign=WXPay`。
 */
export interface AppPayParams {
  appId: string;
  partnerId: string;
  prepayId: string;
  packageValue: 'Sign=WXPay';
  nonceStr: string;
  timeStamp: string;
  sign: string;
}

/**
 * APP 调起支付的签名（APIv3）：对 `appid\ntimestamp\nnoncestr\nprepay_id\n`
 * 用商户私钥做 SHA256withRSA，base64。nonceStr / timeStamp / privateKey 可注入，仅供测试。
 */
export function buildAppPayParams(
  prepayId: string,
  opts: { nonceStr?: string; timeStamp?: string; privateKey?: string } = {}
): AppPayParams {
  const appId = process.env.WXPAY_APP_APPID || '';
  const nonceStr = opts.nonceStr ?? crypto.randomBytes(16).toString('hex');
  const timeStamp = opts.timeStamp ?? Math.floor(Date.now() / 1000).toString();
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${prepayId}\n`;
  return {
    appId,
    partnerId: wxpayConfig.mchid,
    prepayId,
    packageValue: 'Sign=WXPay',
    nonceStr,
    timeStamp,
    sign: sign(message, opts.privateKey ?? loadPrivateKey()),
  };
}

/**
 * 回查订单。响应签名必须通过验签（公钥模式或平台证书模式），否则抛错（fail closed）——
 * 这条路径也会把订单置 paid，同样不能信任未验签的数据。
 */
export async function queryOrder(outTradeNo: string) {
  const axios = getWxPayAxios();

  const response = await axios.get(`/v3/pay/transactions/out-trade-no/${outTradeNo}`, {
    params: {
      mchid: wxpayConfig.mchid,
    },
    // 保留原始报文用于验签（重新 JSON.stringify 不保证与原文逐字节一致）
    transformResponse: [(data: string) => data],
  });

  const rawBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const h = response.headers;
  const ok = await verifyWechatpayMessage({
    timestamp: String(h['wechatpay-timestamp'] ?? ''),
    nonce: String(h['wechatpay-nonce'] ?? ''),
    serial: String(h['wechatpay-serial'] ?? ''),
    signature: String(h['wechatpay-signature'] ?? ''),
    body: rawBody,
  });
  if (!ok) {
    throw new Error('微信支付回查响应验签失败');
  }

  return JSON.parse(rawBody);
}

// AES-256-GCM 解密（APIv3 key），返回明文字符串
function decryptAesGcm(nonce: string, associatedData: string, ciphertext: string): string {
  const key = Buffer.from(wxpayConfig.key, 'utf-8');
  const nonceBuffer = Buffer.from(nonce, 'utf-8');
  const associatedDataBuffer = Buffer.from(associatedData, 'utf-8');
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64');

  const authTag = ciphertextBuffer.slice(-16);
  const encryptedData = ciphertextBuffer.slice(0, -16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonceBuffer, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  decipher.setAAD(associatedDataBuffer);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

// 解密回调数据
export function decryptNotify(nonce: string, associatedData: string, ciphertext: string): any {
  return JSON.parse(decryptAesGcm(nonce, associatedData, ciphertext));
}

// ---------------------------------------------------------------------------
// 平台证书验签（APIv3 旧模式，仍在用平台证书的商户号走这条）
//
// 回调与回查响应都必须用微信支付平台证书验 RSA-SHA256 签名。
// 平台证书从 GET /v3/certificates 拉取（响应体 AES-256-GCM 加密，用 APIv3 key 解密），
// 按 Wechatpay-Serial 头选证书，内存缓存 12 小时；遇到未知序列号强制刷新一次
// （限频 60 秒，防止伪造序列号打爆证书接口）。
// ---------------------------------------------------------------------------

const CERT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CERT_FORCED_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const TIMESTAMP_MAX_SKEW_SECONDS = 5 * 60;

let certCache = new Map<string, string>(); // serial_no -> SPKI 公钥 PEM
let certCacheFetchedAt = 0;
let lastForcedRefreshAt = 0;
let certRefreshPromise: Promise<void> | null = null;

/** 时间戳与当前时间偏差不得超过 5 分钟（防重放）。 */
export function isTimestampFresh(timestamp: string, nowMs: number = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Math.abs(nowMs / 1000 - ts) <= TIMESTAMP_MAX_SKEW_SECONDS;
}

/** 纯验签：对 timestamp\nnonce\nbody\n 构造串做 RSA-SHA256 验证。 */
export function verifySignatureWithKey(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  publicKeyPem: string
): boolean {
  if (!timestamp || !nonce || !signature || !publicKeyPem) return false;
  try {
    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message);
    return verify.verify(publicKeyPem, signature, 'base64');
  } catch (error) {
    console.error('签名验证异常:', error);
    return false;
  }
}

async function doRefreshCertificates(): Promise<void> {
  const axios = getWxPayAxios();
  const response = await axios.get('/v3/certificates', {
    transformResponse: [(data: string) => data],
  });

  const rawBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const parsed = JSON.parse(rawBody);
  const entries: Array<{
    serial_no: string;
    encrypt_certificate: { nonce: string; associated_data: string; ciphertext: string };
  }> = parsed?.data ?? [];

  const next = new Map<string, string>();
  for (const entry of entries) {
    const ec = entry?.encrypt_certificate;
    if (!entry?.serial_no || !ec) continue;
    const certPem = decryptAesGcm(ec.nonce, ec.associated_data, ec.ciphertext);
    const x509 = new crypto.X509Certificate(certPem);
    next.set(entry.serial_no, x509.publicKey.export({ type: 'spki', format: 'pem' }).toString());
  }
  if (next.size === 0) {
    throw new Error('微信支付平台证书列表为空');
  }

  // 证书下载响应用其自身包含的证书自校验（官方 SDK 同款自举方式；传输层信任来自 TLS）
  const h = response.headers;
  const respTimestamp = String(h['wechatpay-timestamp'] ?? '');
  const respNonce = String(h['wechatpay-nonce'] ?? '');
  const respSerial = String(h['wechatpay-serial'] ?? '');
  const respSignature = String(h['wechatpay-signature'] ?? '');
  const selfKey = next.get(respSerial);
  if (
    !selfKey ||
    !isTimestampFresh(respTimestamp) ||
    !verifySignatureWithKey(respTimestamp, respNonce, rawBody, respSignature, selfKey)
  ) {
    throw new Error('微信支付平台证书下载响应验签失败');
  }

  certCache = next;
  certCacheFetchedAt = Date.now();
}

function refreshCertificates(): Promise<void> {
  if (!certRefreshPromise) {
    certRefreshPromise = doRefreshCertificates().finally(() => {
      certRefreshPromise = null;
    });
  }
  return certRefreshPromise;
}

async function getPlatformPublicKey(serial: string): Promise<string | null> {
  const now = Date.now();
  const cacheFresh = now - certCacheFetchedAt < CERT_CACHE_TTL_MS;

  if (cacheFresh && certCache.has(serial)) {
    return certCache.get(serial)!;
  }

  // 缓存过期一律刷新；缓存未过期但序列号未知，限频强制刷新一次
  if (!cacheFresh) {
    await refreshCertificates();
  } else if (now - lastForcedRefreshAt >= CERT_FORCED_REFRESH_MIN_INTERVAL_MS) {
    lastForcedRefreshAt = now;
    await refreshCertificates();
  }

  return certCache.get(serial) ?? null;
}

// ---------------------------------------------------------------------------
// 微信支付公钥验签（APIv3 新模式）
//
// 2024 年起新申请的商户号不再下发平台证书，GET /v3/certificates 直接返回
// RESOURCE_NOT_EXISTS，改为在商户平台下载一份「微信支付公钥」PEM，并配一个
// 形如 PUB_KEY_ID_xxx 的公钥 ID。回调/应答的 Wechatpay-Serial 头里带的就是该 ID。
// 公钥内容读一次后缓存（按解析后的绝对路径缓存，路径变了会重新读）。
// ---------------------------------------------------------------------------

let publicKeyCache: { fullPath: string; pem: string } | null = null;

/** 读取本地微信支付公钥 PEM。读不到返回 null（由调用方 fail closed），不抛异常。 */
function loadPlatformPublicKeyPem(): string | null {
  const fullPath = getPublicKeyPath();
  if (publicKeyCache && publicKeyCache.fullPath === fullPath) {
    return publicKeyCache.pem;
  }

  let pem: string;
  try {
    pem = fs.readFileSync(fullPath, 'utf-8');
  } catch (error) {
    console.error(
      `[微信支付验签] 公钥文件读取失败: ${fullPath}。` +
        `请从商户平台下载「微信支付公钥」放到该路径，或用 WXPAY_PUBLIC_KEY_PATH 指向正确位置。`,
      error
    );
    return null;
  }

  if (!pem.includes('BEGIN PUBLIC KEY')) {
    console.error(
      `[微信支付验签] 公钥文件格式不对: ${fullPath}。` +
        `应为 -----BEGIN PUBLIC KEY----- 开头的 PEM 公钥，不是证书（BEGIN CERTIFICATE）也不是私钥。`
    );
    return null;
  }

  publicKeyCache = { fullPath, pem };
  return pem;
}

/** 报文的 Wechatpay-Serial 是否指向「公钥模式」。 */
function isPublicKeyMode(serial: string): boolean {
  const configuredId = getPublicKeyId();
  return serial.startsWith(PUBLIC_KEY_ID_PREFIX) || (!!configuredId && serial === configuredId);
}

/**
 * 公钥模式验签。返回 null 表示配置缺失/不匹配，调用方一律拒绝（fail closed）。
 */
function verifyWithPlatformPublicKey(msg: WechatpayMessage): boolean {
  const { timestamp, nonce, serial, signature, body } = msg;
  const configuredId = getPublicKeyId();

  if (!configuredId) {
    console.error(
      `[微信支付验签] 报文 Wechatpay-Serial=${serial} 是微信支付公钥 ID，` +
        `但服务端未配置 WXPAY_PUBLIC_KEY_ID，无法确认该用哪把公钥，拒绝该报文。` +
        `请在 .env.local 配置 WXPAY_PUBLIC_KEY_ID（商户平台-API安全-微信支付公钥 处可见）。`
    );
    return false;
  }
  if (serial !== configuredId) {
    console.error(
      `[微信支付验签] 报文 Wechatpay-Serial=${serial} 与配置的 WXPAY_PUBLIC_KEY_ID=${configuredId} 不一致，拒绝该报文。` +
        `若商户平台确实轮换过公钥，请同步更新 WXPAY_PUBLIC_KEY_ID 与公钥文件。`
    );
    return false;
  }

  const publicKeyPem = loadPlatformPublicKeyPem();
  if (!publicKeyPem) {
    // 具体原因已在 loadPlatformPublicKeyPem 内打印
    console.error('[微信支付验签] 无可用的微信支付公钥，拒绝该报文（fail closed）。');
    return false;
  }

  return verifySignatureWithKey(timestamp, nonce, body, signature, publicKeyPem);
}

export interface WechatpayMessage {
  timestamp: string;
  nonce: string;
  serial: string;
  signature: string;
  body: string;
}

/**
 * 验证微信支付回调 / 应答报文。任何一环不满足都返回 false（fail closed）：
 * 头缺失、时间戳偏差超 5 分钟、密钥找不到、签名不匹配。
 *
 * 按报文的 Wechatpay-Serial 分流两种模式：
 * - PUB_KEY_ID_ 开头（或等于 WXPAY_PUBLIC_KEY_ID）→ 微信支付公钥模式，用本地公钥 PEM 验签；
 * - 其余 → 旧的平台证书模式，按序列号查 GET /v3/certificates 拉到的平台证书。
 */
export async function verifyWechatpayMessage(msg: WechatpayMessage): Promise<boolean> {
  const { timestamp, nonce, serial, signature, body } = msg;
  if (!timestamp || !nonce || !serial || !signature) return false;
  if (!isTimestampFresh(timestamp)) return false;

  if (isPublicKeyMode(serial)) {
    return verifyWithPlatformPublicKey(msg);
  }

  let publicKey: string | null = null;
  try {
    publicKey = await getPlatformPublicKey(serial);
  } catch (error) {
    console.error(
      '[微信支付验签] 拉取平台证书失败:',
      error,
      '\n若微信返回 RESOURCE_NOT_EXISTS（无可用的平台证书），说明该商户号已改用「微信支付公钥」模式，' +
        '请配置 WXPAY_PUBLIC_KEY_ID 与 WXPAY_PUBLIC_KEY_PATH。'
    );
    return false;
  }
  if (!publicKey) return false;

  return verifySignatureWithKey(timestamp, nonce, body, signature, publicKey);
}

/** 仅供测试：注入平台证书公钥，绕过网络拉取。 */
export function __setPlatformCertsForTest(certs: Record<string, string>) {
  certCache = new Map(Object.entries(certs));
  certCacheFetchedAt = Date.now();
}
