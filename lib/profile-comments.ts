import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { findUserById, isDeletedUser } from './users';
import { sendNotifyMail } from './mail-notify';

/**
 * 作者主页评论系统（dev-board#306）。Reddit 式多层级：一条评论可回复另一条评论
 * （`parentId`），不限层数。存储是一张平铺表，层级关系全靠 `parentId` 串联，
 * 树形展开交给前端。
 *
 * ## 删除语义：软删 vs 硬删
 * 有子回复的评论删了会留下断链（子回复的 `parentId` 指向空气），所以：
 * - **有子回复**：软删——留占位行（`deletedAt` 打戳、`content` 清空），子回复照常挂着；
 * - **无子回复**：硬删——直接从数组移除，并向上游走：如果它的父恰好是「软删且现在
 *   已无其他子回复」的占位行，父也一并硬删（可能连续向上清理多层纯占位链）。
 *
 * ## 频控为什么读存储而不是进程内 Map
 * 站点用 pm2 多进程/后续可能扩容，进程内状态在实例间不共享，会让频控形同虚设。
 * 存储本来就要整份读出来做校验，顺手拿„该作者最新一条"的时间戳判断，
 * 不增加额外 I/O。
 */

export interface ProfileComment {
    id: string;
    profileUserId: string;
    authorUserId: string;
    parentId?: string;
    content: string;
    createdAt: string;
    deletedAt?: string;
}

const FILE = path.join(process.cwd(), 'data', 'profile-comments.json');
const CONTENT_MAX = 1000;
const RATE_LIMIT_MS = 10 * 1000;

function readAll(): ProfileComment[] {
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function writeAll(comments: ProfileComment[]) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(comments, null, 1));
    fs.renameSync(tmp, FILE);
}

/** 某个主页下的全部评论（未硬删的平铺数组，含软删占位条目），按发布时间升序。 */
export function listComments(profileUserId: string): ProfileComment[] {
    return readAll()
        .filter(c => c.profileUserId === profileUserId)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export type AddCommentError = 'too_long' | 'empty' | 'bad_parent' | 'rate_limited';

export function addComment(input: {
    profileUserId: string;
    authorUserId: string;
    content: string;
    parentId?: string;
}): { comment?: ProfileComment; error?: AddCommentError } {
    const content = (input.content ?? '').trim();
    if (!content) return { error: 'empty' };
    if (content.length > CONTENT_MAX) return { error: 'too_long' };

    const all = readAll();

    let parent: ProfileComment | undefined;
    if (input.parentId) {
        parent = all.find(c => c.id === input.parentId);
        if (!parent || parent.profileUserId !== input.profileUserId || parent.deletedAt) {
            return { error: 'bad_parent' };
        }
    }

    // 频控：同一作者 10 秒内只能发一条（30 秒会拦住「发完评论马上回复别人」的正常讨论节奏，
    // 2026-08-31 UI 走查实测踩到），判据是存储里他最新一条评论（跨所有主页）的 createdAt
    const mineLatest = all
        .filter(c => c.authorUserId === input.authorUserId)
        .reduce<ProfileComment | undefined>(
            (latest, c) => (!latest || Date.parse(c.createdAt) > Date.parse(latest.createdAt) ? c : latest),
            undefined
        );
    if (mineLatest && Date.now() - Date.parse(mineLatest.createdAt) < RATE_LIMIT_MS) {
        return { error: 'rate_limited' };
    }

    const comment: ProfileComment = {
        id: crypto.randomBytes(8).toString('hex'),
        profileUserId: input.profileUserId,
        authorUserId: input.authorUserId,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        content,
        createdAt: new Date().toISOString(),
    };
    all.push(comment);
    writeAll(all);

    notifyComment(comment, parent);
    return { comment };
}

export function deleteComment(id: string, byUserId: string, isAdmin: boolean): boolean {
    const all = readAll();
    const comment = all.find(c => c.id === id);
    if (!comment) return false;

    const allowed = comment.authorUserId === byUserId || comment.profileUserId === byUserId || isAdmin;
    if (!allowed) return false;

    const hasChildren = (cid: string) => all.some(c => c.parentId === cid);

    if (hasChildren(id)) {
        comment.deletedAt = new Date().toISOString();
        comment.content = '';
        writeAll(all);
        return true;
    }

    // 无子回复：硬删，并向上级联清理「软删且现在也没有其他子回复了」的占位父链
    let removeId: string | undefined = id;
    while (removeId) {
        const idx = all.findIndex(c => c.id === removeId);
        if (idx === -1) break;
        const parentId = all[idx].parentId;
        all.splice(idx, 1);
        const parent = parentId ? all.find(c => c.id === parentId) : undefined;
        removeId = parent && parent.deletedAt && !hasChildren(parentId as string) ? parentId : undefined;
    }
    writeAll(all);
    return true;
}

/* ---------- 邮件通知（尽力而为，失败不影响主流程） ---------- */

/** 同一收件人 10 分钟内不重复发；模块级 Map 即可，容忍进程重启后重新计时。 */
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const lastNotifiedAt = new Map<string, number>();

function shouldNotify(userId: string): boolean {
    const last = lastNotifiedAt.get(userId);
    if (last && Date.now() - last < NOTIFY_COOLDOWN_MS) return false;
    lastNotifiedAt.set(userId, Date.now());
    return true;
}

function profileUrl(username: string): string {
    return `https://www.aiworkdeck.com/zh/u/${username}`;
}

/**
 * 新顶层评论通知主页主人；回复通知被回复评论的作者（若与主页主人不同，两者都通知）。
 * 自己评自己/回复自己不发。收件人无邮箱（手机号账号）静默跳过。
 */
function notifyComment(comment: ProfileComment, parent: ProfileComment | undefined) {
    const recipients = new Set<string>([comment.profileUserId]);
    if (parent) recipients.add(parent.authorUserId);
    recipients.delete(comment.authorUserId);

    const profileOwner = findUserById(comment.profileUserId);
    const username = profileOwner?.username || '';

    for (const userId of recipients) {
        if (!shouldNotify(userId)) continue;
        const user = findUserById(userId);
        if (!user || isDeletedUser(user) || !user.email) continue;

        const isOwnerNotice = userId === comment.profileUserId;
        const subject = isOwnerNotice
            ? '[AI WorkDeck] 你的主页有新评论 / New comment on your profile'
            : '[AI WorkDeck] 有人回复了你的评论 / Someone replied to your comment';
        const text =
            `${isOwnerNotice ? '你的主页收到一条新评论' : '你的评论收到一条新回复'}：\n${comment.content}\n\n` +
            `查看：${profileUrl(username)}\n\n---\n\n` +
            `${isOwnerNotice ? 'Your profile received a new comment' : 'Someone replied to your comment'}:\n${comment.content}\n\n` +
            `View: ${profileUrl(username)}\n`;
        void sendNotifyMail({ to: user.email, subject, text });
    }
}
