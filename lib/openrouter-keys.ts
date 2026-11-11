import crypto from 'crypto';
import { getDb } from './db';

/**
 * provisioned OpenRouter key 的存储与加密（PR-W2）。
 *
 * - openrouter_keys 表：userId / orKeyHash / limitUsd / createdAt / disabledAt / encKey
 * - encKey：runtime key 明文的 AES-256-GCM 密文，加密密钥派生自环境变量
 *   AWD_KEY_ENCRYPTION_SECRET（SHA-256 → 32 字节）。
 * - 环境变量缺失时整个 AI 额度功能明确报「未配置」，不允许半残运行
 *   （路由层用 isEncryptionConfigured 前置检查）。
 * - 密文格式：v1:<ivB64>:<tagB64>:<cipherB64>，GCM tag 保证篡改即解密失败。
 */

const ENC_VERSION = 'v1';

export function isEncryptionConfigured(): boolean {
  return !!process.env.AWD_KEY_ENCRYPTION_SECRET;
}

function encryptionKey(): Buffer {
  const secret = process.env.AWD_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('AWD_KEY_ENCRYPTION_SECRET 未配置，AI 额度功能不可用');
  }
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

export function encryptKeyMaterial(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_VERSION, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** 解密失败（密文损坏 / secret 换过 / 被篡改）一律抛错，调用方自行降级。 */
export function decryptKeyMaterial(encKey: string): string {
  const parts = encKey.split(':');
  if (parts.length !== 4 || parts[0] !== ENC_VERSION) {
    throw new Error('encKey 格式不支持');
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]).toString('utf-8');
}

export interface OrKeyRow {
  id: number;
  userId: string;
  orKeyHash: string;
  limitUsd: number;
  createdAt: string;
  disabledAt: string | null;
  encKey: string | null;
  /**
   * 已折成 Credits 扣过的远端用量水位（美元）。
   * NULL = 水位尚未建立（迁移前建的 key），首次同步只对齐不扣款——那些用量在旧的
   * 「先分配后消费」模型下已经付过钱了，默认 0 会导致二次扣费。
   */
  settledUsageUsd: number | null;
  fundingJson?: string | null;
  /** 铸造该 key 的 management 账号指纹（见 openrouter-mgmt.accountFingerprint）；NULL = 迁移前未标记 */
  mgmtAccount?: string | null;
}

/** 该用户当前有效（未禁用）的 provisioned key 行，最新一条。 */
export function getActiveKeyRow(userId: string): OrKeyRow | undefined {
  return getDb()
    .prepare(
      'SELECT * FROM openrouter_keys WHERE userId = ? AND disabledAt IS NULL ORDER BY id DESC LIMIT 1'
    )
    .get(userId) as OrKeyRow | undefined;
}
