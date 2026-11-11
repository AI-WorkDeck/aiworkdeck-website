import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { findUserById, isDeletedUser, recordUserLogin, User } from './users';

const SESSIONS_FILE = path.join(process.cwd(), 'data', 'sessions.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export const SESSION_COOKIE = 'awd_session';

interface Session {
  token: string;
  userId: string;
  passwordVersion?: number;
  createdAt: string;
  expiresAt: string;
}

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readSessions(): Session[] {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
}

function writeSessions(sessions: Session[]) {
  ensureDataDir();
  // tmp + rename：readSessions 的 JSON.parse 没有 try/catch，整份覆盖写被读到半截
  // 就是全站鉴权 500。注销要一次删掉一个用户的全部会话，写量比登出大得多。
  const tmp = `${SESSIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
  fs.renameSync(tmp, SESSIONS_FILE);
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const now = Date.now();
  const token = crypto.randomBytes(32).toString('hex');
  const session: Session = {
    token,
    userId,
    passwordVersion: findUserById(userId)?.passwordVersion ?? 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  // 顺手清理过期会话，避免文件无限增长
  const sessions = readSessions().filter(s => Date.parse(s.expiresAt) > now);
  sessions.push(session);
  writeSessions(sessions);
  recordUserLogin(userId, session.createdAt);
  return { token, expiresAt: session.expiresAt };
}

export function deleteSession(token: string) {
  writeSessions(readSessions().filter(s => s.token !== token));
}

/** 注销账户：一次踢掉该用户的全部会话（不止当前这台设备）。返回删掉的条数。 */
export function deleteSessionsByUser(userId: string): number {
  const sessions = readSessions();
  const kept = sessions.filter(s => s.userId !== userId);
  const removed = sessions.length - kept.length;
  if (removed > 0) writeSessions(kept);
  return removed;
}

export function getUserByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const session = readSessions().find(s => s.token === token);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return undefined;
  const user = findUserById(session.userId);
  // 墓碑行不是可用账户。注销时会删光会话，这里是第二道闸：
  // 两处存储不在同一个事务里，删会话那一步失败也不能让账户复活。
  return user && !isDeletedUser(user) && (session.passwordVersion ?? 0) === (user.passwordVersion ?? 0) ? user : undefined;
}

/** 服务端组件 / Route Handler 中获取当前登录用户 */
export async function getSessionUser(): Promise<User | undefined> {
  const cookieStore = await cookies();
  return getUserByToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(expiresAt: string, persistent = true) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 不勾「记住我」→ 不带 expires 的会话 cookie，关浏览器即失效。
    // 服务端会话记录仍按 SESSION_TTL_MS 过期，凭据本身不因此变长命。
    ...(persistent ? { expires: new Date(expiresAt) } : {}),
  };
}
