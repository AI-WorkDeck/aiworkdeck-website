import { getDb } from './db';

/**
 * 全站聊天室数据层（dev-board#310/#317）。
 *
 * v1 刻意原始：全站一个房间、登录可发言、游客可看；只保留最近 KEEP_MESSAGES 条，
 * 老消息随新消息写入被物理清掉（聊天室是「此刻在场」的场域，不是档案馆）。
 * 自增 id 同时充当增量游标：SSE / 轮询都用「id > since」拉新，天然有序、无需时间戳去重。
 */

export const CHAT_CONTENT_MAX = 500;
const CHAT_RATE_LIMIT_MS = 3 * 1000;
const KEEP_MESSAGES = 500;

export interface ChatMessage {
    id: number;
    userId: string;
    content: string;
    createdAt: string;
}

export type AddChatError = 'empty' | 'too_long' | 'rate_limited';

export function addChatMessage(userId: string, rawContent: string): { message?: ChatMessage; error?: AddChatError } {
    const content = (rawContent ?? '').trim();
    if (!content) return { error: 'empty' };
    if (content.length > CHAT_CONTENT_MAX) return { error: 'too_long' };

    const db = getDb();
    // 3 秒频控：判据读库（pm2 多进程下进程内状态不共享，同评论频控的既定取舍）
    const latest = db
        .prepare('SELECT createdAt FROM chat_messages WHERE userId = ? ORDER BY id DESC LIMIT 1')
        .get(userId) as { createdAt: string } | undefined;
    if (latest && Date.now() - Date.parse(latest.createdAt) < CHAT_RATE_LIMIT_MS) {
        return { error: 'rate_limited' };
    }

    const createdAt = new Date().toISOString();
    const res = db.prepare('INSERT INTO chat_messages (userId, content, createdAt) VALUES (?, ?, ?)').run(userId, content, createdAt);
    // 顺手修剪：只留最近 KEEP_MESSAGES 条
    db.prepare('DELETE FROM chat_messages WHERE id <= (SELECT MAX(id) FROM chat_messages) - ?').run(KEEP_MESSAGES);
    return { message: { id: Number(res.lastInsertRowid), userId, content, createdAt } };
}

/** 增量拉取：sinceId 之后的消息（升序）。首次加载传 0 拿最近一段。 */
export function listChatSince(sinceId: number, limit = 200): ChatMessage[] {
    const db = getDb();
    if (sinceId > 0) {
        return db
            .prepare('SELECT * FROM chat_messages WHERE id > ? ORDER BY id ASC LIMIT ?')
            .all(sinceId, limit) as ChatMessage[];
    }
    // 首次加载：取最近 limit 条再翻回升序
    const rows = db.prepare('SELECT * FROM chat_messages ORDER BY id DESC LIMIT ?').all(limit) as ChatMessage[];
    return rows.reverse();
}

export function getLatestChatId(): number {
    const row = getDb().prepare('SELECT MAX(id) AS m FROM chat_messages').get() as { m: number | null };
    return row.m ?? 0;
}

/** 管理员删除（硬删；已推到在线客户端的副本不追回，v1 接受） */
export function deleteChatMessage(id: number): boolean {
    return getDb().prepare('DELETE FROM chat_messages WHERE id = ?').run(id).changes > 0;
}
