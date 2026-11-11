import { MailError, normalizeEmail } from './mail-auth';
import { normalizePhone, SmsError } from './sms-auth';
import { getMembership, getTeam, getFirm } from './team';
import { findUserByEmail, findUserById, findUserByPhone, isDeletedUser, User } from './users';

/**
 * 协作加人名录查询的纯逻辑（dev-board#550 #551，设计稿 §4）。
 *
 * 路由层（`app/api/internal/collab-directory/route.ts`）只负责鉴权与 JSON 信封，
 * 判定全在这里，verify 脚本可以直调。
 *
 * **只回名录信息，不发任何凭据**：账户是否存在、展示名、手机号、团队/律所归属。
 * 邮箱、头像、完整角色、团队名、律所名不回；归属仅增加 firmAdmin 权限事实供利冲委员指派，
 * 其余都是泄露。`lookupDirectory` 里 account 的四个字段就是全部，加字段前先回来读这一段。
 */

/** 团队/律所归属。两个字段都可能为空：没建队、没入所都是常态。 */
export interface OrgMembership {
    teamId: string | null;
    firmId: string | null;
    firmAdmin: boolean;
}

/** 无归属。requester 查无此人时也回这个（**不是** 404，理由见 lookupDirectory）。 */
export const NO_ORG: OrgMembership = { teamId: null, firmId: null, firmAdmin: false };

export interface DirectoryAccount {
    accountId: string;
    username: string;
    displayName: string;
    /** 规范化后的 11 位；邮箱注册的账号没有号码，回 null。 */
    phone: string | null;
}

export type DirectoryReply =
    | { found: false; requester: OrgMembership }
    | { found: true; account: DirectoryAccount; requester: OrgMembership; candidate: OrgMembership };

/** 请求体不合法（定位键不是恰好一个）。路由层译成 400 `{error:'bad_request'}`。 */
export class DirectoryRequestError extends Error {}

export interface DirectoryQuery {
    requesterAccountId?: unknown;
    identifier?: unknown;
    candidateAccountId?: unknown;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** `accountId` → 归属。空 id / 查无成员关系 / 团队行不见了，一律回 NO_ORG。 */
export function orgOf(accountId: string | null | undefined): OrgMembership {
    const id = (accountId ?? '').trim();
    if (!id) return NO_ORG;
    const membership = getMembership(id);
    if (!membership) return NO_ORG;
    const team = getTeam(membership.teamId);
    const user = findUserById(id);
    if (!team || !user || isDeletedUser(user)) return NO_ORG;
    const firm = team.firmId ? getFirm(team.firmId) : null;
    return { teamId: membership.teamId, firmId: firm?.id ?? null,
        firmAdmin: !!firm && firm.headTeamId === membership.teamId
            && (membership.role === 'OWNER' || membership.role === 'ADMIN') };
}

/**
 * 按定位键找候选人。找不到、格式非法、已注销一律 undefined——
 * 三者对调用方的下一步没有区别（都是「加不了这个人」），也不该把
 * 「这个号码格式不对」与「这个号码没人用」区分开来喂给枚举者。
 */
function resolveCandidate(identifier: string, candidateAccountId: string): User | undefined {
    if (candidateAccountId) {
        const user = findUserById(candidateAccountId);
        return user && !isDeletedUser(user) ? user : undefined;
    }
    if (identifier.includes('@')) {
        try {
            return findUserByEmail(normalizeEmail(identifier));
        } catch (e) {
            if (e instanceof MailError) return undefined;
            throw e;
        }
    }
    try {
        return findUserByPhone(normalizePhone(identifier));
    } catch (e) {
        if (e instanceof SmsError) return undefined;
        throw e;
    }
}

/**
 * 名录查询。
 *
 * `identifier` 与 `candidateAccountId` **恰好给一个**，否则 DirectoryRequestError：
 * 两个都给的时候没有一种「顺理成章」的取舍，静默挑一个只会让调用方以为另一个也生效了。
 *
 * `requesterAccountId` 为空或查无 → requester 归属回 NO_ORG，**不是 404**：
 * 案件库上还没桥接过的操作账号也要拿到一个可解释的拒绝理由（「你还没加入团队」），
 * 而不是一个说不清是密钥错了还是人不存在的 404。
 */
export function lookupDirectory(query: DirectoryQuery): DirectoryReply {
    const identifier = str(query.identifier);
    const candidateAccountId = str(query.candidateAccountId);
    if ((identifier ? 1 : 0) + (candidateAccountId ? 1 : 0) !== 1) {
        throw new DirectoryRequestError('identifier 与 candidateAccountId 恰好给一个');
    }

    const requester = orgOf(str(query.requesterAccountId));
    const candidate = resolveCandidate(identifier, candidateAccountId);
    if (!candidate) return { found: false, requester };

    return {
        found: true,
        // 这四个字段就是全部：加字段前先回上面那段「只回名录信息」。
        account: {
            accountId: candidate.id,
            username: candidate.username,
            displayName: candidate.displayName,
            phone: candidate.phone || null,
        },
        requester,
        candidate: orgOf(candidate.id),
    };
}
