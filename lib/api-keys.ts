import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDb, withTransaction } from './db';
import { findUserById, isDeletedUser, recordUserLogin, User } from './users';

/**
 * AWD Key（PR-W1）：桌面端连接账户用的 Bearer 凭据。
 *
 * - 格式：`awdk_` + 32 字节 base64url（总长 48 字符）
 * - 官网只存 SHA-256 哈希 + 前 12 字符前缀（用于列表展示），明文仅生成时返回一次
 * - 每用户同时有效（未吊销）的 key 上限 10 个（MAX_ACTIVE_KEYS）
 */

export const API_KEY_PREFIX = 'awdk_';
export const MAX_ACTIVE_KEYS = 10;
const DISPLAY_PREFIX_LEN = 12;

export interface ApiKeyInfo {
  id: number;
  prefix: string;
  createdAt: string;
  /** 设备名，登录换 Key 时由桌面端上报（如「Zeweis-MacBook-Pro (Mac)」）。存量与手工生成的 key 为 null。 */
  label: string | null;
}

interface ApiKeyRow {
  id: number;
  userId: string;
  keyHash: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf-8').digest('hex');
}

export function countActiveKeys(userId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM api_keys WHERE userId = ? AND revokedAt IS NULL')
    .get(userId) as { c: number };
  return row.c;
}

/**
 * 生成新 key。达到上限返回 error，不生成。
 * 返回的 plaintextKey 是唯一一次拿到明文的机会。
 * 上限检查与插入包在同一事务里，多进程并发生成也不会超上限。
 */
export function generateApiKey(
  userId: string
): { key?: { plaintextKey: string; info: ApiKeyInfo }; error?: 'key_limit_reached' } {
  const plaintextKey = API_KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return withTransaction((db) => {
    if (countActiveKeys(userId) >= MAX_ACTIVE_KEYS) {
      return { error: 'key_limit_reached' as const };
    }
    const createdAt = new Date().toISOString();
    const result = db
      .prepare(
        'INSERT INTO api_keys (userId, keyHash, prefix, createdAt) VALUES (?, ?, ?, ?)'
      )
      .run(userId, hashApiKey(plaintextKey), plaintextKey.slice(0, DISPLAY_PREFIX_LEN), createdAt);
    return {
      key: {
        plaintextKey,
        info: {
          id: Number(result.lastInsertRowid),
          prefix: plaintextKey.slice(0, DISPLAY_PREFIX_LEN),
          createdAt,
          label: null,
        },
      },
    };
  });
}

/**
 * 登录换 key：与 {@link generateApiKey} 的唯一差别是**达到上限不失败，而是吊销最旧的一枚**。
 *
 * `MAX_ACTIVE_KEYS` 这条上限是给「人工在账户页生成 Key」设计的，那时每枚 key 都是
 * 用户有意识的一次操作，撞上限让他去清理是合理的。桌面端改成账户登录之后语义变了：
 * **每次登录都要消耗一个 key 槽**，再沿用「达到上限就失败」等于第 4 次登录直接登不进去——
 * 那是把上限做成了锁门闩，是这份 spec 从头到尾在防的那类事故。
 *
 * 因此这里改成最旧淘汰（登录满 MAX_ACTIVE_KEYS 台设备后，下一台把最早登录的一台挤下线；上限取 10，覆盖桌面、手机、Word 插件、网页工作台等多端并存）。
 * 这是可解释的策略，也是「最多 N 台设备」类产品的通行做法；**登录永远不因 key 数量失败**。
 */
export function issueLoginKey(
  userId: string,
  label?: string | null
): { plaintextKey: string; info: ApiKeyInfo } {
  const plaintextKey = API_KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return withTransaction((db) => {
    // 淘汰与插入必须同一事务：分开做的话并发登录可能挤掉两枚只插进一枚
    const overflow = countActiveKeys(userId) - (MAX_ACTIVE_KEYS - 1);
    if (overflow > 0) {
      db.prepare(
        `UPDATE api_keys SET revokedAt = ?
         WHERE id IN (
           SELECT id FROM api_keys WHERE userId = ? AND revokedAt IS NULL
           ORDER BY createdAt ASC, id ASC LIMIT ?
         )`
      ).run(new Date().toISOString(), userId, overflow);
    }
    const createdAt = new Date().toISOString();
    const labelValue = label ?? null;
    const result = db
      .prepare('INSERT INTO api_keys (userId, keyHash, prefix, createdAt, label) VALUES (?, ?, ?, ?, ?)')
      .run(userId, hashApiKey(plaintextKey), plaintextKey.slice(0, DISPLAY_PREFIX_LEN), createdAt, labelValue);
    recordUserLogin(userId, createdAt);
    return {
      plaintextKey,
      info: {
        id: Number(result.lastInsertRowid),
        prefix: plaintextKey.slice(0, DISPLAY_PREFIX_LEN),
        createdAt,
        label: labelValue,
      },
    };
  });
}

/** 有效（未吊销）key 列表，新的在前。永不返回哈希。 */
export function listApiKeys(userId: string): ApiKeyInfo[] {
  const rows = getDb()
    .prepare(
      'SELECT id, prefix, createdAt, label FROM api_keys WHERE userId = ? AND revokedAt IS NULL ORDER BY id DESC'
    )
    .all(userId) as Array<{ id: number; prefix: string; createdAt: string; label: string | null }>;
  return rows;
}

/**
 * 注销账户：**删除整行**，不是软吊销。
 *
 * 隐私政策第八条逐字承诺「账户 Key 哈希：吊销或账户注销后删除」，留下 revokedAt
 * 的软吊销行不满足这个措辞。哈希本身也没有留存价值——它不进任何账，
 * 财务对账链路上一个字段都不引用 api_keys。
 *
 * 必须在 withTransaction 内调用（与其余注销写入同生共死）。返回删掉的行数。
 */
export function deleteApiKeysByUser(db: Database.Database, userId: string): number {
  if (!db.inTransaction) {
    throw new Error('deleteApiKeysByUser 必须在事务内调用（withTransaction 包裹）');
  }
  return db.prepare('DELETE FROM api_keys WHERE userId = ?').run(userId).changes;
}

/** 吊销。只允许吊销本人的 key；成功返回 true。 */
export function revokeApiKey(userId: string, keyId: number): boolean {
  const result = getDb()
    .prepare(
      'UPDATE api_keys SET revokedAt = ? WHERE id = ? AND userId = ? AND revokedAt IS NULL'
    )
    .run(new Date().toISOString(), keyId, userId);
  return result.changes > 0;
}

/**
 * 按明文 key 找用户（未吊销才算）。
 * 计时口径：无论 key 是否存在/格式是否合法，都完整走「SHA-256 哈希 + 哈希等值索引查库」，
 * 不让早退分支泄露 key 存在性。安全性来自 SHA-256 原像抗性 + 索引查找耗时与 key 内容无关；
 * 下面的 timingSafeEqual 只是防御性冗余（row 本就是按 keyHash 等值查出的，二者必然相等）。
 */
export function findUserByApiKey(key: string): User | undefined {
  const candidate = typeof key === 'string' ? key : '';
  const candidateHash = hashApiKey(candidate);
  const row = getDb()
    .prepare('SELECT * FROM api_keys WHERE keyHash = ? AND revokedAt IS NULL')
    .get(candidateHash) as ApiKeyRow | undefined;
  // 找不到时与一个哑哈希比较，保持比较路径恒定
  const storedHash = row?.keyHash ?? hashApiKey('awdk_dummy-nonexistent');
  const equal = crypto.timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
  if (!row || !equal || !candidate.startsWith(API_KEY_PREFIX)) return undefined;
  const user = findUserById(row.userId);
  // 墓碑行不是可用账户。注销会删光 api_keys 行，这里是第二道闸（同 getUserByToken）。
  return user && !isDeletedUser(user) ? user : undefined;
}
