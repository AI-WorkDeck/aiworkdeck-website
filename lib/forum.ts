import crypto from 'crypto';
import type { Locale } from '@/i18n-config';
import { getDb, withTransaction } from './db';
import { findUserById, isDeletedUser } from './users';
import { deletedDisplayName } from './account-deletion';
import { siteConfig } from './site-config';
import { sendNotifyMail } from './mail-notify';

/**
 * 社区论坛数据层（dev-board#310/#316）。
 *
 * 一套 post 模型两种类型：`blog`（长文）与 `thread`（讨论帖），除长度与排版外行为一致；
 * 管理员可对任意帖 pinned（置顶）/featured（精选，博客页头部陈列）/hidden（举报处理）。
 * 信息流排序是 Discourse 式「置顶优先 + 最新活动 bump」——小社区没有投票也显得活，
 * 不会满屏 0 分（维护者 2026-08-31 拍板，弃 Reddit hot）。
 *
 * 评论沿用 lib/profile-comments.ts 的既定语义（平铺 + parentId、软删占位/硬删级联、
 * 10 秒跨帖频控），只是载体换成 SQLite：帖子评论存在并发写，JSON 全量覆盖写会互吞。
 */

export type PostType = 'blog' | 'thread';

/** 讨论帖可选标签（扁平流 + 固定标签，不做版块——冷启动期空版块是大忌） */
export const THREAD_TAGS = ['practice', 'question', 'lounge'] as const;
export type ThreadTag = (typeof THREAD_TAGS)[number];

export interface ForumPost {
    id: string;
    type: PostType;
    title: string;
    content: string;
    tag?: ThreadTag;
    authorUserId: string;
    createdAt: string;
    lastActivityAt: string;
    commentCount: number;
    pinned: boolean;
    featured: boolean;
    hiddenAt?: string;
    deletedAt?: string;
}

export interface ForumComment {
    id: string;
    postId: string;
    authorUserId: string;
    parentId?: string;
    content: string;
    createdAt: string;
    deletedAt?: string;
}

export const POST_TITLE_MAX = 120;
export const POST_CONTENT_MAX = 50000;
export const COMMENT_MAX = 1000;
const POST_RATE_LIMIT_MS = 60 * 1000;
const COMMENT_RATE_LIMIT_MS = 10 * 1000;

interface PostRow {
    id: string; type: string; title: string; content: string; tag: string | null;
    authorUserId: string; createdAt: string; lastActivityAt: string; commentCount: number;
    pinned: number; featured: number; hiddenAt: string | null; deletedAt: string | null;
}

function rowToPost(r: PostRow): ForumPost {
    return {
        id: r.id,
        type: r.type as PostType,
        title: r.title,
        content: r.content,
        ...(r.tag ? { tag: r.tag as ThreadTag } : {}),
        authorUserId: r.authorUserId,
        createdAt: r.createdAt,
        lastActivityAt: r.lastActivityAt,
        commentCount: r.commentCount,
        pinned: r.pinned === 1,
        featured: r.featured === 1,
        ...(r.hiddenAt ? { hiddenAt: r.hiddenAt } : {}),
        ...(r.deletedAt ? { deletedAt: r.deletedAt } : {}),
    };
}

/* ---------- 帖子 ---------- */

export type AddPostError = 'empty' | 'title_too_long' | 'too_long' | 'bad_tag' | 'rate_limited';

export function addPost(input: {
    type: PostType;
    title: string;
    content: string;
    tag?: string;
    authorUserId: string;
}): { post?: ForumPost; error?: AddPostError } {
    const title = (input.title ?? '').trim();
    const content = (input.content ?? '').trim();
    if (!title || !content) return { error: 'empty' };
    if (title.length > POST_TITLE_MAX) return { error: 'title_too_long' };
    if (content.length > POST_CONTENT_MAX) return { error: 'too_long' };

    let tag: ThreadTag | undefined;
    if (input.tag) {
        if (input.type !== 'thread' || !THREAD_TAGS.includes(input.tag as ThreadTag)) {
            return { error: 'bad_tag' };
        }
        tag = input.tag as ThreadTag;
    }

    const db = getDb();
    // 发帖 60 秒频控：判据读库里该作者最新一帖（pm2 多进程下进程内状态不共享，同评论频控）
    const latest = db
        .prepare('SELECT createdAt FROM forum_posts WHERE authorUserId = ? ORDER BY createdAt DESC LIMIT 1')
        .get(input.authorUserId) as { createdAt: string } | undefined;
    if (latest && Date.now() - Date.parse(latest.createdAt) < POST_RATE_LIMIT_MS) {
        return { error: 'rate_limited' };
    }

    const now = new Date().toISOString();
    const post: ForumPost = {
        id: crypto.randomBytes(8).toString('hex'),
        type: input.type,
        title,
        content,
        ...(tag ? { tag } : {}),
        authorUserId: input.authorUserId,
        createdAt: now,
        lastActivityAt: now,
        commentCount: 0,
        pinned: false,
        featured: false,
    };
    db.prepare(
        `INSERT INTO forum_posts (id, type, title, content, tag, authorUserId, createdAt, lastActivityAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(post.id, post.type, post.title, post.content, tag ?? null, post.authorUserId, now, now);
    return { post };
}

export function getPost(id: string): ForumPost | undefined {
    const row = getDb().prepare('SELECT * FROM forum_posts WHERE id = ?').get(id) as PostRow | undefined;
    return row ? rowToPost(row) : undefined;
}

export interface ListPostsOptions {
    type?: PostType;
    tag?: ThreadTag;
    authorUserId?: string;
    /** 后台审阅要连隐藏帖一起看 */
    includeHidden?: boolean;
    limit?: number;
    offset?: number;
}

/** 公开信息流：置顶优先 + 最新活动排序；作者维度（个人主页）按发布时间排。 */
export function listPosts(opts: ListPostsOptions = {}): { posts: ForumPost[]; total: number } {
    const where: string[] = ['deletedAt IS NULL'];
    const params: unknown[] = [];
    if (!opts.includeHidden) where.push('hiddenAt IS NULL');
    if (opts.type) { where.push('type = ?'); params.push(opts.type); }
    if (opts.tag) { where.push('tag = ?'); params.push(opts.tag); }
    if (opts.authorUserId) { where.push('authorUserId = ?'); params.push(opts.authorUserId); }

    const db = getDb();
    const cond = where.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM forum_posts WHERE ${cond}`).get(...params) as { n: number }).n;
    const order = opts.authorUserId ? 'createdAt DESC' : 'pinned DESC, lastActivityAt DESC';
    const rows = db
        .prepare(`SELECT * FROM forum_posts WHERE ${cond} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...params, opts.limit ?? 20, opts.offset ?? 0) as PostRow[];
    return { posts: rows.map(rowToPost), total };
}

/** 精选博客（管理员手动 featured），社区首页头部陈列。 */
export function listFeaturedBlogs(limit = 3): ForumPost[] {
    const rows = getDb()
        .prepare(
            `SELECT * FROM forum_posts
              WHERE type = 'blog' AND featured = 1 AND deletedAt IS NULL AND hiddenAt IS NULL
              ORDER BY createdAt DESC LIMIT ?`
        )
        .all(limit) as PostRow[];
    return rows.map(rowToPost);
}

/** 软删（保留行，信息流与详情都不再可见）。作者本人或管理员可删。 */
export function deletePost(id: string, byUserId: string, isAdmin: boolean): boolean {
    const post = getPost(id);
    if (!post || post.deletedAt) return false;
    if (post.authorUserId !== byUserId && !isAdmin) return false;
    getDb().prepare('UPDATE forum_posts SET deletedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
    return true;
}

/** 管理员开关：置顶/精选/隐藏（举报处理的最小闸，可逆，与删除区分开）。 */
export function setPostFlags(id: string, flags: { pinned?: boolean; featured?: boolean; hidden?: boolean }): boolean {
    const post = getPost(id);
    if (!post) return false;
    const db = getDb();
    if (flags.pinned !== undefined) db.prepare('UPDATE forum_posts SET pinned = ? WHERE id = ?').run(flags.pinned ? 1 : 0, id);
    if (flags.featured !== undefined) db.prepare('UPDATE forum_posts SET featured = ? WHERE id = ?').run(flags.featured ? 1 : 0, id);
    if (flags.hidden !== undefined) {
        db.prepare('UPDATE forum_posts SET hiddenAt = ? WHERE id = ?').run(flags.hidden ? new Date().toISOString() : null, id);
    }
    return true;
}

/* ---------- 评论 ---------- */

export function listPostComments(postId: string): ForumComment[] {
    const rows = getDb()
        .prepare('SELECT * FROM forum_comments WHERE postId = ? ORDER BY createdAt ASC')
        .all(postId) as Array<ForumComment & { parentId: string | null; deletedAt: string | null }>;
    return rows.map(r => ({
        id: r.id,
        postId: r.postId,
        authorUserId: r.authorUserId,
        ...(r.parentId ? { parentId: r.parentId } : {}),
        content: r.content,
        createdAt: r.createdAt,
        ...(r.deletedAt ? { deletedAt: r.deletedAt } : {}),
    }));
}

export type AddCommentError = 'too_long' | 'empty' | 'bad_parent' | 'not_found' | 'rate_limited';

export function addPostComment(input: {
    postId: string;
    authorUserId: string;
    content: string;
    parentId?: string;
}): { comment?: ForumComment; error?: AddCommentError } {
    const content = (input.content ?? '').trim();
    if (!content) return { error: 'empty' };
    if (content.length > COMMENT_MAX) return { error: 'too_long' };

    const post = getPost(input.postId);
    if (!post || post.deletedAt || post.hiddenAt) return { error: 'not_found' };

    const db = getDb();
    let parent: ForumComment | undefined;
    if (input.parentId) {
        parent = db.prepare('SELECT * FROM forum_comments WHERE id = ?').get(input.parentId) as ForumComment | undefined;
        if (!parent || parent.postId !== input.postId || parent.deletedAt) return { error: 'bad_parent' };
    }

    // 10 秒跨帖频控，语义同 lib/profile-comments.ts（30 秒会拦正常讨论节奏）
    const latest = db
        .prepare('SELECT createdAt FROM forum_comments WHERE authorUserId = ? ORDER BY createdAt DESC LIMIT 1')
        .get(input.authorUserId) as { createdAt: string } | undefined;
    if (latest && Date.now() - Date.parse(latest.createdAt) < COMMENT_RATE_LIMIT_MS) {
        return { error: 'rate_limited' };
    }

    const now = new Date().toISOString();
    const comment: ForumComment = {
        id: crypto.randomBytes(8).toString('hex'),
        postId: input.postId,
        authorUserId: input.authorUserId,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        content,
        createdAt: now,
    };
    withTransaction(d => {
        d.prepare(
            'INSERT INTO forum_comments (id, postId, authorUserId, parentId, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(comment.id, comment.postId, comment.authorUserId, comment.parentId ?? null, comment.content, now);
        // 最新活动 bump + 计数（数库里未删的行，天然抗重放）
        d.prepare(
            `UPDATE forum_posts SET lastActivityAt = ?,
               commentCount = (SELECT COUNT(*) FROM forum_comments WHERE postId = ? AND deletedAt IS NULL)
             WHERE id = ?`
        ).run(now, input.postId, input.postId);
    });

    notifyPostComment(post, comment, parent);
    return { comment };
}

/** 删除语义与 profile-comments 一致：有子回复软删占位，无子回复硬删并向上清理纯占位链。 */
export function deletePostComment(id: string, byUserId: string, isAdmin: boolean): boolean {
    const db = getDb();
    const comment = db.prepare('SELECT * FROM forum_comments WHERE id = ?').get(id) as ForumComment | undefined;
    if (!comment) return false;

    const post = getPost(comment.postId);
    const allowed = comment.authorUserId === byUserId || post?.authorUserId === byUserId || isAdmin;
    if (!allowed) return false;

    withTransaction(d => {
        const hasChildren = (cid: string) =>
            !!d.prepare('SELECT 1 FROM forum_comments WHERE parentId = ? LIMIT 1').get(cid);

        if (hasChildren(id)) {
            d.prepare("UPDATE forum_comments SET deletedAt = ?, content = '' WHERE id = ?").run(new Date().toISOString(), id);
        } else {
            let removeId: string | undefined = id;
            while (removeId) {
                const row = d.prepare('SELECT parentId FROM forum_comments WHERE id = ?').get(removeId) as
                    | { parentId: string | null }
                    | undefined;
                if (!row) break;
                d.prepare('DELETE FROM forum_comments WHERE id = ?').run(removeId);
                const parent = row.parentId
                    ? (d.prepare('SELECT id, deletedAt FROM forum_comments WHERE id = ?').get(row.parentId) as
                        | { id: string; deletedAt: string | null }
                        | undefined)
                    : undefined;
                removeId = parent && parent.deletedAt && !hasChildren(parent.id) ? parent.id : undefined;
            }
        }
        d.prepare(
            'UPDATE forum_posts SET commentCount = (SELECT COUNT(*) FROM forum_comments WHERE postId = ? AND deletedAt IS NULL) WHERE id = ?'
        ).run(comment.postId, comment.postId);
    });
    return true;
}

/* ---------- 举报（UGC 治理最小闸） ---------- */

export type ReportError = 'empty_target' | 'duplicate' | 'too_long';

export function addReport(input: {
    targetType: 'post' | 'comment';
    targetId: string;
    reporterUserId: string;
    reason?: string;
}): { ok?: true; error?: ReportError } {
    const reason = (input.reason ?? '').trim();
    if (reason.length > 500) return { error: 'too_long' };
    const db = getDb();
    const exists =
        input.targetType === 'post'
            ? db.prepare('SELECT 1 FROM forum_posts WHERE id = ?').get(input.targetId)
            : db.prepare('SELECT 1 FROM forum_comments WHERE id = ?').get(input.targetId);
    if (!exists) return { error: 'empty_target' };

    const dup = db
        .prepare('SELECT 1 FROM forum_reports WHERE targetType = ? AND targetId = ? AND reporterUserId = ? AND resolvedAt IS NULL')
        .get(input.targetType, input.targetId, input.reporterUserId);
    if (dup) return { error: 'duplicate' };

    db.prepare(
        'INSERT INTO forum_reports (targetType, targetId, reporterUserId, reason, createdAt) VALUES (?, ?, ?, ?, ?)'
    ).run(input.targetType, input.targetId, input.reporterUserId, reason, new Date().toISOString());
    return { ok: true };
}

export interface ForumReport {
    id: number;
    targetType: 'post' | 'comment';
    targetId: string;
    reporterUserId: string;
    reason: string;
    createdAt: string;
    resolvedAt?: string;
}

export function listOpenReports(): ForumReport[] {
    const rows = getDb()
        .prepare('SELECT * FROM forum_reports WHERE resolvedAt IS NULL ORDER BY createdAt DESC LIMIT 100')
        .all() as Array<ForumReport & { resolvedAt: string | null }>;
    return rows.map(r => ({ ...r, resolvedAt: r.resolvedAt ?? undefined }));
}

export function resolveReport(id: number): boolean {
    const res = getDb()
        .prepare('UPDATE forum_reports SET resolvedAt = ? WHERE id = ? AND resolvedAt IS NULL')
        .run(new Date().toISOString(), id);
    return res.changes > 0;
}

/* ---------- 作者展开（API 返回体的统一形状，含注销兜底） ---------- */

export interface PublicAuthor {
    id: string;
    username: string;
    displayName: string;
    avatarUpdatedAt?: string | null;
}

/** 注销用户展示「已注销用户」且不可点击（username 置空），同主页评论区的既定处理。 */
export function publicAuthor(userId: string, lang: Locale = siteConfig.defaultLocale): PublicAuthor {
    const user = findUserById(userId);
    const alive = !!user && !isDeletedUser(user);
    return {
        id: userId,
        username: alive ? user!.username : '',
        displayName: alive ? user!.displayName : deletedDisplayName(lang),
        avatarUpdatedAt: alive ? user!.avatarUpdatedAt : undefined,
    };
}

/* ---------- 邮件通知（尽力而为，失败不影响主流程） ---------- */

const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const lastNotifiedAt = new Map<string, number>();

function shouldNotify(userId: string): boolean {
    const last = lastNotifiedAt.get(userId);
    if (last && Date.now() - last < NOTIFY_COOLDOWN_MS) return false;
    lastNotifiedAt.set(userId, Date.now());
    return true;
}

/** 顶层评论通知帖子作者；回复通知被回复者（两者不同则都通知）。自评/自回复不发。 */
function notifyPostComment(post: ForumPost, comment: ForumComment, parent: ForumComment | undefined) {
    const recipients = new Set<string>([post.authorUserId]);
    if (parent) recipients.add(parent.authorUserId);
    recipients.delete(comment.authorUserId);

    const url = `https://www.aiworkdeck.com/zh/community/post/${post.id}`;
    for (const userId of recipients) {
        if (!shouldNotify(userId)) continue;
        const user = findUserById(userId);
        if (!user || isDeletedUser(user) || !user.email) continue;

        const isAuthorNotice = userId === post.authorUserId;
        const subject = isAuthorNotice
            ? '[AI WorkDeck] 你的帖子有新评论 / New comment on your post'
            : '[AI WorkDeck] 有人回复了你的评论 / Someone replied to your comment';
        const text =
            `${isAuthorNotice ? `你的帖子「${post.title}」收到一条新评论` : '你的评论收到一条新回复'}：\n${comment.content}\n\n` +
            `查看：${url}\n\n---\n\n` +
            `${isAuthorNotice ? `Your post "${post.title}" received a new comment` : 'Someone replied to your comment'}:\n${comment.content}\n\n` +
            `View: ${url}\n`;
        void sendNotifyMail({ to: user.email, subject, text });
    }
}
