import crypto from 'crypto';
import { getDb } from '@/lib/db';

/**
 * 对话式创建 Skill 的会话存取（dev-board#293）。
 *
 * 暂存是**自动的**：每轮往返落库一次，用户换设备/隔天回来都能从列表续聊。
 * 会话归属按 userId 硬校验，所有读写都必须带 userId——没有跨用户读的口子。
 */

export interface SkillChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  /** 本轮用的模型（用户可中途切换，逐轮记录） */
  model?: string;
  /** 明面记账：本轮折算成本（分）与是否实扣 */
  costCents?: number;
  charged?: boolean;
  /** 助手消息若产出了草稿，草稿对象挂在消息上（已过白名单清洗） */
  draft?: any;
}

export interface SkillChatSession {
  id: string;
  userId: string;
  title: string;
  model: string;
  lang: string;
  status: 'active' | 'published';
  messages: SkillChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillChatSummary {
  id: string;
  title: string;
  model: string;
  status: 'active' | 'published';
  messageCount: number;
  updatedAt: string;
}

/** 单会话轮数上限：防单个会话无限膨胀（一轮=一条用户消息） */
export const MAX_TURNS_PER_SESSION = 30;
/** 每用户每天的对话轮数上限（跨会话合计），与每分钟限流叠加生效 */
export const MAX_TURNS_PER_DAY = 40;
/** 每用户保留的会话数上限，超出时删最旧的已发布/闲置会话 */
const MAX_SESSIONS_PER_USER = 20;

interface Row {
  id: string;
  userId: string;
  title: string;
  model: string;
  lang: string;
  status: 'active' | 'published';
  messagesJson: string;
  createdAt: string;
  updatedAt: string;
}

function rowToSession(row: Row): SkillChatSession {
  let messages: SkillChatMessage[] = [];
  try {
    const parsed = JSON.parse(row.messagesJson);
    if (Array.isArray(parsed)) messages = parsed;
  } catch {
    // 坏 JSON 当空会话处理，别让一条脏数据把列表页整个炸掉
  }
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    model: row.model,
    lang: row.lang,
    status: row.status,
    messages,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createChatSession(input: {
  userId: string;
  model: string;
  lang: string;
  title: string;
}): SkillChatSession {
  const now = new Date().toISOString();
  const session: SkillChatSession = {
    id: crypto.randomUUID(),
    userId: input.userId,
    title: input.title.slice(0, 60) || 'Skill',
    model: input.model,
    lang: input.lang,
    status: 'active',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO skill_chat_sessions (id, userId, title, model, lang, status, messagesJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(session.id, session.userId, session.title, session.model, session.lang, session.status, '[]', now, now);
  pruneSessions(input.userId);
  return session;
}

export function getChatSession(userId: string, id: string): SkillChatSession | null {
  const row = getDb()
    .prepare('SELECT * FROM skill_chat_sessions WHERE id = ? AND userId = ?')
    .get(id, userId) as Row | undefined;
  return row ? rowToSession(row) : null;
}

export function listChatSessions(userId: string): SkillChatSummary[] {
  const rows = getDb()
    .prepare('SELECT * FROM skill_chat_sessions WHERE userId = ? ORDER BY updatedAt DESC')
    .all(userId) as Row[];
  return rows.map(row => {
    const s = rowToSession(row);
    return {
      id: s.id,
      title: s.title,
      model: s.model,
      status: s.status,
      messageCount: s.messages.length,
      updatedAt: s.updatedAt,
    };
  });
}

/** 整存：追加消息、换模型、改标题都走这一个口，updatedAt 一并刷新。 */
export function saveChatSession(session: SkillChatSession): void {
  session.updatedAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE skill_chat_sessions
          SET title = ?, model = ?, status = ?, messagesJson = ?, updatedAt = ?
        WHERE id = ? AND userId = ?`
    )
    .run(
      session.title.slice(0, 60),
      session.model,
      session.status,
      JSON.stringify(session.messages),
      session.updatedAt,
      session.id,
      session.userId
    );
}

export function deleteChatSession(userId: string, id: string): boolean {
  const r = getDb()
    .prepare('DELETE FROM skill_chat_sessions WHERE id = ? AND userId = ?')
    .run(id, userId);
  return r.changes > 0;
}

/** 今天（UTC 日界）用户已消耗的对话轮数：数所有今天动过的会话里今天的用户消息。 */
export function countUserTurnsToday(userId: string): number {
  const dayStart = new Date().toISOString().slice(0, 10);
  const rows = getDb()
    .prepare('SELECT messagesJson FROM skill_chat_sessions WHERE userId = ? AND updatedAt >= ?')
    .all(userId, dayStart) as Array<{ messagesJson: string }>;
  let n = 0;
  for (const row of rows) {
    try {
      const messages = JSON.parse(row.messagesJson) as SkillChatMessage[];
      n += messages.filter(m => m.role === 'user' && m.at >= dayStart).length;
    } catch {
      /* 坏行不计数 */
    }
  }
  return n;
}

/** 超量清理：留最近 MAX_SESSIONS_PER_USER 条，多出来的从最旧开始删。 */
function pruneSessions(userId: string): void {
  getDb()
    .prepare(
      `DELETE FROM skill_chat_sessions
        WHERE userId = ? AND id NOT IN (
          SELECT id FROM skill_chat_sessions WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?
        )`
    )
    .run(userId, userId, MAX_SESSIONS_PER_USER);
}
