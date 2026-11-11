/**
 * 审核结果通知——插件 / 原生资源包过审、被驳回、被下架时给提交人发一封信。
 *
 * ## 为什么在这一层而不是 store 里
 * `approvePlugin` / `rejectPack` 这些是同步的纯落库函数，塞一次网络请求进去要么
 * 把它们全改成 async（波及每个调用点），要么在同步函数里放飞一个不会被 await 的
 * Promise（异常无人接管）。审核动作发生在 admin 路由，通知也就留在那一层。
 *
 * ## best-effort 的确切含义
 * 发信**绝不能让审核动作本身失败**：状态已经落库了，这一步只是转述。
 * 收件人没有邮箱（手机号账号 `email` 是空串）就跳过，发不出去就留一行 warn。
 * 全部出口都在 {@link notifySubmissionReviewed} 内部吞掉，调用方不必 try/catch。
 *
 * ## 为什么中英并列而不是按语种发
 * 我们不知道提交人读哪种语言：`User` 里没有语言偏好字段，投稿时的页面语种也没有
 * 留痕。cn 站也有英文用户、intl 站也有中文用户，按站点猜会稳定猜错一部分人。
 * 通知信正文很短，两段并列的代价远小于把一半人挡在看不懂的信外面。
 */
import { siteConfig } from './site-config';
import { sendNotifyMail } from './mail-notify';
import { findUserById } from './users';

export type ReviewKind = 'plugin' | 'pack';
export type ReviewAction = 'approve' | 'reject' | 'revoke';

export interface ReviewNotice {
    kind: ReviewKind;
    /** 插件/资源包 id */
    id: string;
    /** 版本号；通配封禁传 '*' */
    version: string;
    /** 展示名。资源包没有独立名称，传 id 即可。 */
    name?: string;
    action: ReviewAction;
    /** 驳回或封禁原因。过审时没有。 */
    note?: string;
    /** 提交人的用户 id（`PluginEntry.authorId` / `PackEntry.authorId`）。 */
    authorId: string;
}

const KIND_LABEL: Record<ReviewKind, { zh: string; en: string }> = {
    plugin: { zh: '插件', en: 'plugin' },
    pack: { zh: '原生资源包', en: 'native pack' },
};

const RESULT_LABEL: Record<ReviewAction, { zh: string; en: string }> = {
    approve: { zh: '已通过审核，平台已签名', en: 'has passed review and been signed by the platform' },
    reject: { zh: '未通过审核', en: 'was not approved' },
    revoke: { zh: '已被下架', en: 'has been delisted' },
};

const NOTE_LABEL: Record<ReviewAction, { zh: string; en: string }> = {
    approve: { zh: '', en: '' },
    reject: { zh: '驳回原因', en: 'Reason' },
    revoke: { zh: '下架原因', en: 'Reason' },
};

/** 提交页地址。资源包与插件同一页（页签切换），所以两种 kind 落点相同。 */
function submitUrl(lang: 'zh' | 'en'): string {
    return `${siteConfig.origin}/${lang}/plugins/submit`;
}

function subjectOf(n: ReviewNotice): string {
    const label = n.version === '*' ? n.id : `${n.id} ${n.version}`;
    return `[AI WorkDeck] ${label} 审核结果 / review result`;
}

function bodyOf(n: ReviewNotice): string {
    const display = n.name && n.name !== n.id ? `${n.name}（${n.id}）` : n.id;
    const displayEn = n.name && n.name !== n.id ? `${n.name} (${n.id})` : n.id;
    const versionZh = n.version === '*' ? '全部版本' : `版本 ${n.version}`;
    const versionEn = n.version === '*' ? 'all versions' : `version ${n.version}`;

    const zh = [
        `你提交的${KIND_LABEL[n.kind].zh} ${display} ${versionZh}${RESULT_LABEL[n.action].zh}。`,
        n.note ? `${NOTE_LABEL[n.action].zh}：${n.note}` : '',
        `提交与状态页：${submitUrl('zh')}`,
    ].filter(Boolean).join('\n');

    const en = [
        `Your ${KIND_LABEL[n.kind].en} ${displayEn}, ${versionEn}, ${RESULT_LABEL[n.action].en}.`,
        n.note ? `${NOTE_LABEL[n.action].en}: ${n.note}` : '',
        `Submissions and status: ${submitUrl('en')}`,
    ].filter(Boolean).join('\n');

    return `${zh}\n\n---\n\n${en}\n`;
}

/**
 * 给提交人发一封审核结果通知。
 *
 * 返回值只用于测试与日志：`false` 可能是没配发信、提交人没有邮箱、或者发送被拒，
 * 三者都不是调用方需要区分处理的情况。**任何情况下都不抛异常。**
 */
export async function notifySubmissionReviewed(n: ReviewNotice): Promise<boolean> {
    try {
        const author = findUserById(n.authorId);
        // 手机号账号的 email 是空串（见 lib/users.ts findOrCreateByPhone），注销账号不再打扰
        if (!author || author.deletedAt || !author.email) return false;
        return await sendNotifyMail({ to: author.email, subject: subjectOf(n), text: bodyOf(n) });
    } catch (e) {
        console.warn('[review-notify] 通知发送失败:', e instanceof Error ? e.message : e);
        return false;
    }
}
