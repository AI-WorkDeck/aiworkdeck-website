import crypto from 'crypto';

/**
 * 插件包签名（Ed25519）。契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md §5。
 *
 * 平台私钥仅存在于服务器环境变量 AWD_PLUGIN_SIGNING_KEY（PKCS#8 PEM），
 * 对应公钥硬编码在桌面端配置里。签名覆盖包内每个文件的 SHA-256——manifest 与
 * JAR 同等关键，manifest 决定加载哪些 JAR、声明什么权限。
 *
 * 选 Ed25519 是因为 Node crypto 与 JDK 15+ 都原生支持，无需第三方库和证书链。
 */

export interface SignedPayload {
  id: string;
  version: string;
  publishedAt: string;
  /** 相对包根的路径 -> sha256 十六进制 */
  files: Record<string, string>;
}

/**
 * 生成待签名的规范化 JSON：键按字典序、无多余空白。
 * 两端必须逐字节一致地重建这个字符串，否则验签失败——所以这里不能用
 * JSON.stringify 的默认键序（取决于插入顺序）。
 */
export function canonicalPayload(payload: SignedPayload): string {
  const files: Record<string, string> = {};
  for (const key of Object.keys(payload.files).sort()) {
    files[key] = payload.files[key];
  }
  // 顶层键同样按字典序：files < id < publishedAt < version
  return JSON.stringify({
    files,
    id: payload.id,
    publishedAt: payload.publishedAt,
    version: payload.version,
  });
}

function getPrivateKey(): crypto.KeyObject | undefined {
  const pem = process.env.AWD_PLUGIN_SIGNING_KEY?.trim();
  if (!pem) return undefined;
  try {
    return crypto.createPrivateKey(pem);
  } catch {
    return undefined;
  }
}

/** 签名是否可用（未配置私钥时审核通过按钮应当禁用并提示） */
export function isSigningConfigured(): boolean {
  return !!getPrivateKey();
}

/**
 * 对包清单签名。
 * @returns base64 签名；未配置私钥时返回 undefined（调用方须拒绝上架）
 */
export function signPayload(payload: SignedPayload): string | undefined {
  const key = getPrivateKey();
  if (!key) return undefined;
  const data = Buffer.from(canonicalPayload(payload), 'utf-8');
  // Ed25519 在 Node 里必须走 crypto.sign(null, ...)——算法自带摘要，不接受 digest 名
  return crypto.sign(null, data, key).toString('base64');
}

/**
 * 对任意原始字节签名（原生资源包的 manifest.json 走这条路）。
 *
 * 与 signPayload 的区别不在密钥而在**被签对象**：JAR 插件签的是两端各自重建的
 * canonical JSON，pack 签的是托管出去的那份 manifest.json 的原始字节
 * （旁挂 .sig）。后者没有「两端重建再对拍」这一步，从根上避开跨语言键序坑，
 * 所以 pack 刻意不复用 canonicalPayload。见 NATIVE_PACK_DISTRIBUTION.md §1。
 *
 * @returns base64 签名；未配置私钥时返回 undefined（调用方须拒绝上架）
 */
export function signBytes(bytes: Buffer): string | undefined {
  const key = getPrivateKey();
  if (!key) return undefined;
  return crypto.sign(null, bytes, key).toString('base64');
}

/** 自检用：对原始字节验签（桌面端拿内置公钥做的就是这一步） */
export function verifyBytes(bytes: Buffer, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, bytes, key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/** 自检用：用公钥验签，确保两端实现一致 */
export function verifyPayload(payload: SignedPayload, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const data = Buffer.from(canonicalPayload(payload), 'utf-8');
    return crypto.verify(null, data, key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/** 生成一对新密钥（部署时一次性使用，输出后把私钥写进服务器环境变量） */
export function generateKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
