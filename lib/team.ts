import crypto from 'crypto';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { getDb, withTransaction } from './db';
import { generateUniqueJoinCode, normalizeJoinCode } from './join-code';
import { MailError, normalizeEmail } from './mail-auth';
import { emailIsAccount } from './mail-policy';
import { siteConfig } from './site-config';
import { normalizePhone, SmsError } from './sms-auth';
import { findUserByEmail, findUserByPhone, mapDisplayNamesByIds, User } from './users';
import { emitFirmAudit, type FirmAuditAction, type FirmAuditDetail } from './firm-audit';

/**
 * 团队 / 律所数据层（dev-board#496，设计稿 §4/§5/§6）。
 *
 * 官网侧只负责三件事：团队实体与成员关系、桌面端上报的日聚合入库、按团队出统计。
 * 层级是「个人 → 团队 → 律所」（设计稿 §10.1）：律所（`firm`）没有独立人员名单，
 * 管理者就是**总部团队**（`firm.headTeamId`）的 OWNER/ADMIN。这样「一人一团队」
 * 这条约束不用破，权限判定也只有一个入口（`getMembership`）。
 * 采集与聚合全在桌面本机（`TeamUsageRollupService`），这里收到的已经是计数与哈希。
 *
 * ## 与匿名 telemetry 的分界（不要合并）
 * `telemetry_rollup` / `telemetry_event` 是**匿名**通道：无 accountId、无鉴权，
 * 三处公开文档承诺「安装标识与账户无关」。团队统计带 accountId、走 Bearer、默认关闭、
 * 由用户在设置页显式打开，所以表、端点、白名单全部另起一套。复用任何一处都是把
 * 那句承诺作废，评审时请直接打回。
 *
 * ## 错误约定
 * 所有校验失败一律抛 `TeamError`，由 `lib/team-http.ts` 的 `teamErrorResponse`
 * 转成 `{ error: code }` + 状态码。路由层因此不必逐条 if/else 拼响应，
 * 状态码语义（401/403/404/409）只有这一处定义。
 */

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';
/** 可被邀请/改成的角色。OWNER 不在其中：转让所有权是另一件事，本期不做。 */
export type InviteRole = 'ADMIN' | 'MEMBER';

export interface Team {
    id: string;
    name: string;
    ownerAccountId: string;
    shareProjectNames: boolean;
    /** 所属律所；未入所为 null。 */
    firmId: string | null;
    createdAt: string;
}

/**
 * 律所（设计稿 §10.1）。**没有 members**：管理者 = 总部团队的 OWNER/ADMIN。
 * `joinCode` 不在这个对象里，跟团队邀请码同一个理由：它是凭据，只在
 * 「我确实是管理者」那一支里单独下发（见 `getMyTeamView`）。
 */
export interface Firm {
    id: string;
    name: string;
    headTeamId: string;
    createdAt: string;
}

export interface TeamMember {
    teamId: string;
    accountId: string;
    role: TeamRole;
    joinedAt: string;
    invitedBy: string | null;
    /** 职务（展示标签，不参与权限），未设为 null。迁移 46。 */
    title: string | null;
}

export interface TeamInvite {
    id: string;
    teamId: string;
    /** 大陆站的邀请标识；国际站为 null。两列恰有一列有值（迁移 32 的 CHECK）。 */
    phone: string | null;
    /** 国际站的邀请标识；大陆站为 null。 */
    email: string | null;
    role: InviteRole;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
}

/**
 * 节约时间的估算系数（设计稿 §5）。**随 summary 响应一起下发**，不让桌面端硬编码一份：
 * 这是个拍脑袋的初值，早晚要调，调的时候不该需要发一版客户端。
 * UI 上必须明写公式（「按每次 AI 编辑 3 分钟、每轮对话 2 分钟估算」），不许当成实测值。
 */
export const SAVED_MINUTES_FORMULA = { perAgentEdit: 3, perAiTurn: 2 } as const;

export const TEAM_NAME_MAX = 60;
export const FIRM_NAME_MAX = 60;
export const PROJECT_ALIAS_MAX = 60;
export const MEMBER_TITLE_MAX = 30;
/** 单次上报 body 上限（设计稿 §6）。一天的日聚合正常在几 KB。 */
export const USAGE_BODY_MAX_BYTES = 64 * 1024;
/**
 * 同一 accountId 每分钟上报上限。桌面端 `TeamUsageUploadService` 首轮补传窗口为 30 天
 * （`BACKFILL_DAYS = 30`），开启数据共享或「立即上报」时会在同一秒内连续补传最多 30 天；
 * 设为 60（2 倍补传窗口）保证一次完整 30 天补传 + 手动重试不会被 429 截断在前半段。
 */
export const USAGE_RATE_LIMIT_PER_MINUTE = 60;
/** 一次上报里最多接受多少个项目行，防止一个坏客户端把库刷爆。 */
export const USAGE_MAX_PROJECTS = 500;
/** 日活跃时长上限（设计稿 §5：16 小时）。超出一律截断，不拒收整份上报。 */
export const ACTIVE_MINUTES_MAX_PER_DAY = 16 * 60;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SUMMARY_RANGES = [7, 30, 90] as const;
export type SummaryRange = (typeof SUMMARY_RANGES)[number];
export const SUMMARY_SCOPES = ['team', 'firm'] as const;
export type SummaryScope = (typeof SUMMARY_SCOPES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class TeamError extends Error {
    constructor(
        readonly status: number,
        readonly code: string
    ) {
        super(code);
        this.name = 'TeamError';
    }
}

/* ------------------------------------------------------------------ *
 * 行 → 领域对象
 * ------------------------------------------------------------------ */

interface TeamRow {
    id: string;
    name: string;
    ownerAccountId: string;
    shareProjectNames: number;
    firmId: string | null;
    joinCode: string;
    createdAt: string;
}
interface FirmRow {
    id: string;
    name: string;
    headTeamId: string;
    joinCode: string;
    createdAt: string;
}
interface MemberRow {
    teamId: string;
    accountId: string;
    role: string;
    joinedAt: string;
    invitedBy: string | null;
    title?: string | null;
}
interface InviteRow {
    id: string;
    teamId: string;
    phone: string | null;
    email: string | null;
    role: string;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
    acceptedAccountId: string | null;
}

function rowToTeam(r: TeamRow): Team {
    return {
        id: r.id,
        name: r.name,
        ownerAccountId: r.ownerAccountId,
        shareProjectNames: r.shareProjectNames === 1,
        firmId: r.firmId,
        createdAt: r.createdAt,
    };
}

function rowToFirm(r: FirmRow): Firm {
    return { id: r.id, name: r.name, headTeamId: r.headTeamId, createdAt: r.createdAt };
}

function rowToMember(r: MemberRow): TeamMember {
    return {
        teamId: r.teamId,
        accountId: r.accountId,
        role: r.role as TeamRole,
        joinedAt: r.joinedAt,
        invitedBy: r.invitedBy,
        title: r.title ?? null,
    };
}

function rowToInvite(r: InviteRow): TeamInvite {
    return {
        id: r.id,
        teamId: r.teamId,
        phone: r.phone,
        email: r.email,
        role: r.role as InviteRole,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
    };
}

/* ------------------------------------------------------------------ *
 * 查询
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 律所审计日志（readiness S20）：入所退所、角色、律所设置只在官网发生，上报给案件库的同一份日志。
 * emitFirmAudit 立即返回、永不抛；没有律所的团队不报。
 * ------------------------------------------------------------------ */

function auditName(accountId: string): string | null {
    return mapDisplayNamesByIds([accountId]).get(accountId) ?? null;
}

function auditFirm(
    firmId: string | null | undefined,
    action: FirmAuditAction,
    actorId: string,
    target: { type: string; id: string; label?: string | null },
    detail?: FirmAuditDetail
): void {
    if (!firmId) return;
    emitFirmAudit({
        firmId,
        action,
        actor: { id: actorId, name: auditName(actorId) },
        target: { ...target, label: target.label ?? (target.type === 'ACCOUNT' ? auditName(target.id) : null) },
        detail,
    });
}

/** 总部团队的 OWNER/ADMIN 才是律所管理员（与 collab-directory 的 firmAdmin 同一口径）。 */
function isFirmAdminRole(team: Team | null, role: string): boolean {
    if (!team?.firmId) return false;
    const firm = getFirm(team.firmId);
    return !!firm && firm.headTeamId === team.id && (role === 'OWNER' || role === 'ADMIN');
}

export function getTeam(teamId: string): Team | null {
    const row = getDb().prepare('SELECT * FROM team WHERE id = ?').get(teamId) as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
}

export function getFirm(firmId: string): Firm | null {
    const row = getDb().prepare('SELECT * FROM firm WHERE id = ?').get(firmId) as FirmRow | undefined;
    return row ? rowToFirm(row) : null;
}

/** 律所里的团队，总部排在最前（面板上总部是「主队」，排序不该看创建时间的脸色）。 */
export function listFirmTeams(firmId: string): Team[] {
    const firm = getFirm(firmId);
    const rows = getDb()
        .prepare('SELECT * FROM team WHERE firmId = ? ORDER BY createdAt')
        .all(firmId) as TeamRow[];
    const teams = rows.map(rowToTeam);
    if (!firm) return teams;
    return teams.sort((a, b) =>
        a.id === firm.headTeamId ? -1 : b.id === firm.headTeamId ? 1 : 0
    );
}

/** 我的成员身份。一人一团队，所以最多一行（库上有 UNIQUE(accountId) 兜底）。 */
export function getMembership(accountId: string): TeamMember | null {
    const row = getDb()
        .prepare('SELECT * FROM team_member WHERE accountId = ?')
        .get(accountId) as MemberRow | undefined;
    return row ? rowToMember(row) : null;
}

export function listMembers(teamId: string): TeamMember[] {
    const rows = getDb()
        .prepare(
            `SELECT * FROM team_member WHERE teamId = ?
              ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, joinedAt`
        )
        .all(teamId) as MemberRow[];
    return rows.map(rowToMember);
}

/** 未接受、未过期的邀请。撤销是删行，所以不必再滤一遍。 */
export function listPendingInvites(teamId: string, now = new Date()): TeamInvite[] {
    const rows = getDb()
        .prepare(
            `SELECT * FROM team_invite
              WHERE teamId = ? AND acceptedAt IS NULL AND expiresAt > ?
              ORDER BY createdAt DESC`
        )
        .all(teamId, now.toISOString()) as InviteRow[];
    return rows.map(rowToInvite);
}

/**
 * 发给某个账号本体的未接受邀请。列名按站点选（`identityColumn`），
 * 不是 `WHERE phone = ? OR email = ?`——那样写会让一个恰好等于别人邮箱的
 * 手机号串（不可能，但库里两列都不受站点约束）跨站命中，而且走不上索引。
 */
function listInvitesForIdentity(identity: string, now = new Date()): TeamInvite[] {
    const rows = getDb()
        .prepare(
            `SELECT * FROM team_invite
              WHERE ${identityColumn()} = ? AND acceptedAt IS NULL AND expiresAt > ?
              ORDER BY createdAt DESC`
        )
        .all(identity, now.toISOString()) as InviteRow[];
    return rows.map(rowToInvite);
}

/* ------------------------------------------------------------------ *
 * 权限
 * ------------------------------------------------------------------ */

/** 取我的成员身份，没有团队直接 404——所有团队内动作的第一道闸。 */
function requireMembership(accountId: string): TeamMember {
    const m = getMembership(accountId);
    if (!m) throw new TeamError(404, 'no_team');
    return m;
}

function requireManager(accountId: string): TeamMember {
    const m = requireMembership(accountId);
    if (m.role === 'MEMBER') throw new TeamError(403, 'forbidden');
    return m;
}

/**
 * 只有 OWNER 能做的事：建律所、把团队并进律所。
 * 这两件事改的是**整个团队的归属**（谁能看到本队的使用数据就此变了），
 * ADMIN 是被 OWNER 提上来管人的，不该能替全队做归属决定。
 */
function requireOwner(accountId: string): TeamMember {
    const m = requireMembership(accountId);
    if (m.role !== 'OWNER') throw new TeamError(403, 'forbidden');
    return m;
}

/* ------------------------------------------------------------------ *
 * 账号本体（cn 手机号 / intl 邮箱）
 * ------------------------------------------------------------------ */

/**
 * 邀请挂在哪一列上。`SITE_ID` 是构建期常量，这里只是给它一个有名字的出口——
 * 拼进 SQL 的永远是这两个字面量之一，不存在外部输入。
 */
function identityColumn(): 'phone' | 'email' {
    return emailIsAccount() ? 'email' : 'phone';
}

/**
 * 本站的账号本体（dev-board#778）：cn 是手机号，intl 是邮箱。
 * 取不到返回 null——国际站用户的 `phone` 恒为空，大陆站用户的 `email` 也可以是空串。
 *
 * 邮箱这一侧做小写 trim，与 `lib/mail-auth.ts` 的 `normalizeEmail` 同一口径
 * （那条还会校验格式并抛错，这里只是取值，不该因为存量数据格式怪就抛）。
 */
function accountIdentity(user: User): string | null {
    if (emailIsAccount()) return (user.email ?? '').trim().toLowerCase() || null;
    return user.phone || null;
}

/**
 * 建队 / 凭码加入 / 接受邀请三条「成为团队一员」的路都要求账号本体已就位
 * （维护者裁决，dev-board#496；国际站口径见 dev-board#778）：律所场景下
 * 「你是谁」最终要落到一个可寻址的标识上——邀请本身就挂在它上面，
 * 管理员移除/找人也是报它，一个没有本体的账号混进团队会让这些动作全部失灵。
 *
 * 错误码按站点分：cn 仍是 `phone_required`（桌面端与存量文案都认这个码），
 * intl 是 `email_required`。不合并成一个通用码，是因为用户看到的下一步不同。
 */
function requireIdentity(user: User): void {
    if (accountIdentity(user)) return;
    throw new TeamError(403, emailIsAccount() ? 'email_required' : 'phone_required');
}

/* ------------------------------------------------------------------ *
 * 团队
 * ------------------------------------------------------------------ */

function cleanName(raw: unknown, field: string, max: number): string {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name || name.length > max) throw new TeamError(400, `bad_${field}`);
    return name;
}

/** 一个码是否已经被某个团队占着。生成邀请码时用来重试。 */
function teamCodeTaken(code: string): boolean {
    return !!getDb().prepare('SELECT 1 FROM team WHERE joinCode = ?').get(code);
}

function firmCodeTaken(code: string): boolean {
    return !!getDb().prepare('SELECT 1 FROM firm WHERE joinCode = ?').get(code);
}

/**
 * 建队：建队者即 OWNER。已有团队一律 409（一人一团队，设计稿 §4）。
 * 账号本体缺失 403 `phone_required` / `email_required`（见 `requireIdentity`）。
 */
export function createTeam(user: User, rawName: unknown): Team {
    requireIdentity(user);
    const name = cleanName(rawName, 'name', TEAM_NAME_MAX);
    if (getMembership(user.id)) throw new TeamError(409, 'already_in_team');
    const now = new Date().toISOString();
    const joinCode = generateUniqueJoinCode(teamCodeTaken);
    const team: Team = {
        id: crypto.randomUUID(),
        name,
        ownerAccountId: user.id,
        // 律所内部共享项目名默认视为正常协作（维护者裁决，dev-board#496）；
        // 需要更严格隐私的团队自己去 PATCH 关掉。
        shareProjectNames: true,
        firmId: null,
        createdAt: now,
    };
    withTransaction(d => {
        d.prepare(
            `INSERT INTO team (id, name, ownerAccountId, shareProjectNames, firmId, joinCode, createdAt)
             VALUES (?, ?, ?, 1, NULL, ?, ?)`
        ).run(team.id, team.name, user.id, joinCode, now);
        d.prepare(
            `INSERT INTO team_member (teamId, accountId, role, joinedAt, invitedBy)
             VALUES (?, ?, 'OWNER', ?, NULL)`
        ).run(team.id, user.id, now);
    });
    return team;
}

export function updateTeam(
    accountId: string,
    patch: { name?: unknown; shareProjectNames?: unknown }
): Team {
    const me = requireManager(accountId);
    const db = getDb();
    if (patch.name !== undefined) {
        db.prepare('UPDATE team SET name = ? WHERE id = ?').run(
            cleanName(patch.name, 'name', TEAM_NAME_MAX),
            me.teamId
        );
    }
    if (patch.shareProjectNames !== undefined) {
        if (typeof patch.shareProjectNames !== 'boolean') {
            throw new TeamError(400, 'bad_shareProjectNames');
        }
        db.prepare('UPDATE team SET shareProjectNames = ? WHERE id = ?').run(
            patch.shareProjectNames ? 1 : 0,
            me.teamId
        );
    }
    const team = getTeam(me.teamId);
    if (!team) throw new TeamError(404, 'no_team');
    return team;
}

/* ------------------------------------------------------------------ *
 * 团队邀请码
 * ------------------------------------------------------------------ */

/**
 * 按邀请码加入团队（设计稿 §10.2）。
 *
 * 与「按手机号邀请」是两条并行的路，都保留：邀请码适合群发和口头传达，
 * 定向邀请适合管理者点名。两条路都受同一条「一人一团队」约束。
 *
 * 码不存在与码写错走同一个 404 `bad_code`：区分开等于告诉试码的人
 * 「这个码存在，只是你没资格」，那正是不该泄露的一位信息。
 * 加入后角色一律 MEMBER——码是公开传播的，凭一个码就能当管理员的团队没法要。
 * 账号本体缺失 403 `phone_required` / `email_required`（见 `requireIdentity`），
 * 且这道闸排在最前——没有本体连码存不存在都不该告诉。
 */
export function joinByCode(user: User, rawCode: unknown): Team {
    requireIdentity(user);
    const code = normalizeJoinCode(rawCode);
    if (!code) throw new TeamError(404, 'bad_code');
    // 顺序有意：先判「我已经有队了」再判码对不对。反过来的话，已经在队里的人
    // 拿一堆码来试，能靠 404/409 的差别把哪些码有效摸出来。
    if (getMembership(user.id)) throw new TeamError(409, 'already_in_team');
    const row = getDb().prepare('SELECT * FROM team WHERE joinCode = ?').get(code) as
        | TeamRow
        | undefined;
    if (!row) throw new TeamError(404, 'bad_code');
    const now = new Date().toISOString();
    getDb()
        .prepare(
            `INSERT INTO team_member (teamId, accountId, role, joinedAt, invitedBy)
             VALUES (?, ?, 'MEMBER', ?, NULL)`
        )
        .run(row.id, user.id, now);
    auditFirm(row.firmId, 'FIRM_MEMBER_JOINED', user.id, { type: 'ACCOUNT', id: user.id },
        { via: 'team_code', teamId: row.id, teamName: row.name, role: 'MEMBER' });
    return rowToTeam(row);
}

/**
 * 重置团队邀请码（OWNER/ADMIN）。旧码立即失效——这是「码传出去了」时唯一的补救，
 * 所以不做新旧并存的过渡期：过渡期里旧码仍然能进人，等于没重置。
 */
export function regenerateJoinCode(accountId: string): string {
    const me = requireManager(accountId);
    const code = generateUniqueJoinCode(teamCodeTaken);
    getDb().prepare('UPDATE team SET joinCode = ? WHERE id = ?').run(code, me.teamId);
    return code;
}

/** 取本队邀请码。**调用方必须先确认是 OWNER/ADMIN**：MEMBER 看得到码就等于码是公开的。 */
function teamJoinCode(teamId: string): string | undefined {
    const row = getDb().prepare('SELECT joinCode FROM team WHERE id = ?').get(teamId) as
        | { joinCode: string | null }
        | undefined;
    return row?.joinCode ?? undefined;
}

export interface MemberView {
    accountId: string;
    displayName: string;
    role: TeamRole;
    title: string | null;
    joinedAt: string;
}

export interface InviteView {
    id: string;
    teamId: string;
    teamName: string;
    /** 大陆站有值、国际站为 null；`email` 反之。 */
    phone: string | null;
    email: string | null;
    role: InviteRole;
    createdAt: string;
    expiresAt: string;
}

export interface FirmTeamView {
    id: string;
    name: string;
    memberCount: number;
    isHead: boolean;
}

export interface FirmView {
    id: string;
    name: string;
    headTeamId: string;
    /** 我所在的团队是不是总部团队。客户端据此决定显示「管理律所」还是「退出律所」。 */
    isHead: boolean;
    /** 律所邀请码，仅**总部团队**的 OWNER/ADMIN 有；其余人这个字段不存在。 */
    joinCode?: string;
    teams: FirmTeamView[];
}

export type MyTeamView =
    | {
          team: Team;
          myAccountId: string;
          myRole: TeamRole;
          /** 团队邀请码，仅 OWNER/ADMIN 有。 */
          joinCode?: string;
          members: MemberView[];
          pendingInvites: InviteView[];
          firm: FirmView | null;
      }
    | { team: null; invites: InviteView[] };

/**
 * 律所视图。团队列表对**所内所有人**可见（同所的人互相知道有哪些团队是常识，
 * 与「成员名册对全队可见」同一口径）；要挡的是邀请码和使用数据。
 */
/** 各团队在册人数（一次查询）。firm 视图与全所 summary 的 teams[] 共用，两处口径不能各算各的。 */
function memberCountsByTeam(teamIds: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    if (teamIds.length === 0) return counts;
    const rows = getDb()
        .prepare(
            `SELECT teamId, COUNT(*) AS n FROM team_member
              WHERE teamId IN (${teamIds.map(() => '?').join(',')}) GROUP BY teamId`
        )
        .all(...teamIds) as Array<{ teamId: string; n: number }>;
    for (const r of rows) counts.set(r.teamId, r.n);
    return counts;
}

function toFirmView(firmId: string, myTeamId: string, myRole: TeamRole): FirmView | null {
    const firm = getFirm(firmId);
    if (!firm) return null;
    const teams = listFirmTeams(firmId);
    const counts = memberCountsByTeam(teams.map(t => t.id));
    const isHead = firm.headTeamId === myTeamId;
    const view: FirmView = {
        id: firm.id,
        name: firm.name,
        headTeamId: firm.headTeamId,
        isHead,
        teams: teams.map(t => ({
            id: t.id,
            name: t.name,
            memberCount: counts.get(t.id) ?? 0,
            isHead: t.id === firm.headTeamId,
        })),
    };
    if (isHead && myRole !== 'MEMBER') {
        const row = getDb().prepare('SELECT joinCode FROM firm WHERE id = ?').get(firm.id) as
            | { joinCode: string }
            | undefined;
        if (row) view.joinCode = row.joinCode;
    }
    return view;
}

function toMemberViews(members: TeamMember[], lang: Locale = siteConfig.defaultLocale): MemberView[] {
    const names = mapDisplayNamesByIds(members.map(m => m.accountId));
    const fallback = toBaseLocale(lang) === 'en' ? 'Unknown user' : '未知用户';
    return members.map(m => ({
        accountId: m.accountId,
        displayName: names.get(m.accountId) ?? fallback,
        role: m.role,
        title: m.title,
        joinedAt: m.joinedAt,
    }));
}

function toInviteViews(invites: TeamInvite[]): InviteView[] {
    const teams = new Map<string, string>();
    return invites.map(i => {
        let teamName = teams.get(i.teamId);
        if (teamName === undefined) {
            teamName = getTeam(i.teamId)?.name ?? '';
            teams.set(i.teamId, teamName);
        }
        return {
            id: i.id,
            teamId: i.teamId,
            teamName,
            phone: i.phone,
            email: i.email,
            role: i.role,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
        };
    });
}

/**
 * `GET /api/account/team` 的响应体。
 *
 * 无团队时返回我的账号本体（cn 手机号 / intl 邮箱）收到的邀请（没有本体就没有邀请可收）。
 * 有团队时 `pendingInvites` 只给 OWNER/ADMIN：谁被邀请了是管理动作的一部分，
 * 与「MEMBER 只看自己」同口径。成员名册对全队可见——同队的人互相知道是谁是常识，
 * 需要保护的是使用数据不是名字。
 */
export function getMyTeamView(user: User, lang: Locale = siteConfig.defaultLocale): MyTeamView {
    const me = getMembership(user.id);
    if (!me) {
        const identity = accountIdentity(user);
        const invites = identity ? listInvitesForIdentity(identity) : [];
        return { team: null, invites: toInviteViews(invites) };
    }
    const team = getTeam(me.teamId);
    if (!team) throw new TeamError(404, 'no_team');
    const view: MyTeamView = {
        team,
        myAccountId: user.id,
        myRole: me.role,
        members: toMemberViews(listMembers(me.teamId), lang),
        pendingInvites:
            me.role === 'MEMBER' ? [] : toInviteViews(listPendingInvites(me.teamId)),
        firm: team.firmId ? toFirmView(team.firmId, me.teamId, me.role) : null,
    };
    // 邀请码只给管理者，而且是**缺字段**而不是 null：客户端拿 `joinCode` 的有无
    // 判「我能不能邀人」，给个 null 会让它渲染出一个空的复制按钮。
    if (me.role !== 'MEMBER') {
        const code = teamJoinCode(me.teamId);
        if (code) view.joinCode = code;
    }
    return view;
}

/* ------------------------------------------------------------------ *
 * 邀请
 * ------------------------------------------------------------------ */

function asInviteRole(raw: unknown): InviteRole {
    if (raw === 'ADMIN' || raw === 'MEMBER') return raw;
    throw new TeamError(400, 'bad_role');
}

/**
 * 生成邀请（7 天有效）。**被邀请人可以还没注册**——邀请挂在账号本体上
 * （cn 手机号 / intl 邮箱），等他注册后用同一个标识登录，
 * `GET /api/account/team` 就能看到这条邀请。
 *
 * `rawIdentity` 在大陆站是手机号、国际站是邮箱，格式非法分别 400 `bad_phone` /
 * `bad_email`——两站的输入是两种东西，共用一个码会让前端没法给出可行动的提示。
 *
 * 同一团队对同一标识重复邀请时先删掉旧的未接受邀请：管理者改个角色重发是常见动作，
 * 留着旧行只会让被邀请人看到两条一样的邀请、接受到哪条全凭运气。
 */
export function createInvite(
    accountId: string,
    rawIdentity: unknown,
    rawRole: unknown
): TeamInvite {
    const me = requireManager(accountId);
    const role = asInviteRole(rawRole);
    const raw = typeof rawIdentity === 'string' ? rawIdentity : '';

    let phone: string | null = null;
    let email: string | null = null;
    let holder: User | undefined;
    if (emailIsAccount()) {
        try {
            email = normalizeEmail(raw);
        } catch (e) {
            if (e instanceof MailError) throw new TeamError(400, 'bad_email');
            throw e;
        }
        // findUserByEmail 只认**已验证**的邮箱（见 lib/users.ts）。查不到不代表
        // 没人用这个地址，只代表没有一个证实过的账号——那种情况下这条预检本来
        // 也判不出什么，邀请照发，真撞上已有团队会在 accept 时被 409 挡住。
        holder = findUserByEmail(email);
    } else {
        try {
            phone = normalizePhone(raw);
        } catch (e) {
            if (e instanceof SmsError) throw new TeamError(400, 'bad_phone');
            throw e;
        }
        holder = findUserByPhone(phone);
    }
    // 这个标识已经是某个队的人（含本队）：先退队再邀请，别造出一个永远接受不了的邀请
    if (holder && getMembership(holder.id)) throw new TeamError(409, 'already_in_team');

    const now = new Date();
    const invite: TeamInvite = {
        id: crypto.randomUUID(),
        teamId: me.teamId,
        phone,
        email,
        role,
        createdBy: accountId,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    };
    const col = identityColumn();
    const identity = (email ?? phone) as string;
    withTransaction(d => {
        d.prepare(
            `DELETE FROM team_invite WHERE teamId = ? AND ${col} = ? AND acceptedAt IS NULL`
        ).run(me.teamId, identity);
        d.prepare(
            `INSERT INTO team_invite (id, teamId, phone, email, role, createdBy, createdAt, expiresAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            invite.id,
            invite.teamId,
            invite.phone,
            invite.email,
            invite.role,
            invite.createdBy,
            invite.createdAt,
            invite.expiresAt
        );
    });
    return invite;
}

/** 撤销邀请 = 删行（设计稿 §4 的 team_invite 没有撤销时点字段，不自作主张加）。 */
export function revokeInvite(accountId: string, inviteId: string): void {
    const me = requireManager(accountId);
    const row = getDb().prepare('SELECT * FROM team_invite WHERE id = ?').get(inviteId) as
        | InviteRow
        | undefined;
    if (!row || row.teamId !== me.teamId) throw new TeamError(404, 'invite_not_found');
    if (row.acceptedAt) throw new TeamError(409, 'invite_accepted');
    getDb().prepare('DELETE FROM team_invite WHERE id = ?').run(inviteId);
}

/**
 * 接受邀请：**按当前登录人的账号本体匹配**（cn 手机号 / intl 邮箱），
 * 不按邀请里存的 accountId（存的时候根本还没有）。标识不是本人的一律 403——
 * 邀请 id 是 UUID 但仍然是可传播的字符串，拿到别人的 id 就能混进团队的话，
 * 「按手机号/邮箱邀请」这件事本身就不成立了。
 * 没有账号本体的账号连比对都无从比起，单独给 403 `phone_required` / `email_required`
 * （见 `requireIdentity`），与「对不上」的 403 `forbidden` 区分开——
 * 前者是「先去把本体补上」，后者是「这不是你」。
 */
export function acceptInvite(user: User, inviteId: string): Team {
    const row = getDb().prepare('SELECT * FROM team_invite WHERE id = ?').get(inviteId) as
        | InviteRow
        | undefined;
    if (!row) throw new TeamError(404, 'invite_not_found');
    if (row.acceptedAt) throw new TeamError(409, 'invite_accepted');
    requireIdentity(user);
    // accountIdentity 已经保证非 null（requireIdentity 刚放行），比对的两边
    // 都是规范化后的值：intl 侧写入走 normalizeEmail，读取侧 trim + 小写。
    if (accountIdentity(user) !== (emailIsAccount() ? row.email : row.phone)) {
        throw new TeamError(403, 'forbidden');
    }
    if (row.expiresAt <= new Date().toISOString()) throw new TeamError(409, 'invite_expired');
    if (getMembership(user.id)) throw new TeamError(409, 'already_in_team');
    const team = getTeam(row.teamId);
    if (!team) throw new TeamError(404, 'team_not_found');

    const now = new Date().toISOString();
    withTransaction(d => {
        d.prepare(
            `INSERT INTO team_member (teamId, accountId, role, joinedAt, invitedBy)
             VALUES (?, ?, ?, ?, ?)`
        ).run(row.teamId, user.id, row.role, now, row.createdBy);
        d.prepare(
            'UPDATE team_invite SET acceptedAt = ?, acceptedAccountId = ? WHERE id = ?'
        ).run(now, user.id, inviteId);
    });
    auditFirm(team.firmId, 'FIRM_MEMBER_JOINED', user.id, { type: 'ACCOUNT', id: user.id },
        { via: 'invite', teamId: team.id, teamName: team.name, role: row.role, firmAdmin: isFirmAdminRole(team, row.role) });
    return team;
}

/* ------------------------------------------------------------------ *
 * 成员
 * ------------------------------------------------------------------ */

function requireTeammate(teamId: string, accountId: string): TeamMember {
    const row = getDb()
        .prepare('SELECT * FROM team_member WHERE teamId = ? AND accountId = ?')
        .get(teamId, accountId) as MemberRow | undefined;
    if (!row) throw new TeamError(404, 'member_not_found');
    return rowToMember(row);
}

/**
 * 改角色（设计稿 §6）：
 * - OWNER 可以改任何**非 OWNER** 成员（OWNER 自己不能被降级，转让所有权本期不做）；
 * - ADMIN 只能动当前是 MEMBER 的人，动不了 ADMIN 与 OWNER；
 * - MEMBER 不能改任何人。
 *
 * 于是 ADMIN 能把 MEMBER 提成 ADMIN，却不能再把他降回来——这是有意的：
 * 招人可以放权，收权只有 OWNER 说了算。
 */
export function changeMemberRole(
    actorAccountId: string,
    targetAccountId: string,
    rawRole: unknown
): TeamMember {
    const actor = requireManager(actorAccountId);
    const role = asInviteRole(rawRole);
    const target = requireTeammate(actor.teamId, targetAccountId);
    if (target.role === 'OWNER') throw new TeamError(403, 'forbidden');
    if (actor.role === 'ADMIN' && target.role !== 'MEMBER') throw new TeamError(403, 'forbidden');
    getDb()
        .prepare('UPDATE team_member SET role = ? WHERE teamId = ? AND accountId = ?')
        .run(role, actor.teamId, targetAccountId);
    if (role !== target.role) {
        const team = getTeam(actor.teamId);
        auditFirm(team?.firmId, 'FIRM_ROLE_CHANGED', actorAccountId, { type: 'ACCOUNT', id: targetAccountId },
            { fromRole: target.role, toRole: role, teamId: actor.teamId, teamName: team?.name ?? null,
              firmAdmin: isFirmAdminRole(team, role) });
    }
    return { ...target, role };
}

/**
 * 改职务（迁移 46）。职务只是展示标签，所以口径比改角色宽：
 * OWNER/ADMIN 可以给队里任何人（含 OWNER 与自己）设职务；MEMBER 不能改任何人。
 * 空串 / null = 清除。
 */
export function changeMemberTitle(
    actorAccountId: string,
    targetAccountId: string,
    rawTitle: unknown
): TeamMember {
    const actor = requireManager(actorAccountId);
    const target = requireTeammate(actor.teamId, targetAccountId);
    let title: string | null = null;
    if (rawTitle !== null && rawTitle !== undefined) {
        if (typeof rawTitle !== 'string') throw new TeamError(400, 'bad_title');
        const trimmed = rawTitle.trim();
        if ([...trimmed].length > MEMBER_TITLE_MAX) throw new TeamError(400, 'bad_title');
        title = trimmed || null;
    }
    getDb()
        .prepare('UPDATE team_member SET title = ? WHERE teamId = ? AND accountId = ?')
        .run(title, actor.teamId, targetAccountId);
    return { ...target, title };
}

/**
 * 移除成员，或本人退出（同一个端点，设计稿 §6）。
 * **OWNER 不能退出**：队里没有 OWNER 之后没人能改设置、没人能移除成员，
 * 这个队就永久卡死了。要走人先转让所有权（本期没有这条路，所以只能解散——也没有）。
 */
export function removeMember(actorAccountId: string, targetAccountId: string): void {
    const actor = requireMembership(actorAccountId);
    const target = requireTeammate(actor.teamId, targetAccountId);
    if (actorAccountId === targetAccountId) {
        if (actor.role === 'OWNER') throw new TeamError(403, 'owner_cannot_leave');
    } else {
        if (actor.role === 'MEMBER') throw new TeamError(403, 'forbidden');
        if (target.role === 'OWNER') throw new TeamError(403, 'forbidden');
        if (actor.role === 'ADMIN' && target.role !== 'MEMBER') {
            throw new TeamError(403, 'forbidden');
        }
    }
    // 使用数据留在库里：退队的人那几天的工作量仍然是团队当期的产出，
    // 抹掉会让历史 KPI 无声变小。summary 只按 teamId 聚合，不 JOIN team_member。
    const targetName = auditName(targetAccountId);
    getDb()
        .prepare('DELETE FROM team_member WHERE teamId = ? AND accountId = ?')
        .run(actor.teamId, targetAccountId);
    const team = getTeam(actor.teamId);
    const self = actorAccountId === targetAccountId;
    auditFirm(team?.firmId, self ? 'FIRM_MEMBER_LEFT' : 'FIRM_MEMBER_REMOVED', actorAccountId,
        { type: 'ACCOUNT', id: targetAccountId, label: targetName },
        { role: target.role, teamId: actor.teamId, teamName: team?.name ?? null });
}

/* ------------------------------------------------------------------ *
 * 律所
 * ------------------------------------------------------------------ */

/** 总部团队的 OWNER/ADMIN 才是律所管理者。返回我的成员身份与律所。 */
function requireFirmManager(accountId: string): { me: TeamMember; firm: Firm } {
    const me = requireManager(accountId);
    const team = getTeam(me.teamId);
    if (!team?.firmId) throw new TeamError(404, 'no_firm');
    const firm = getFirm(team.firmId);
    if (!firm) throw new TeamError(404, 'no_firm');
    // 子团队的管理者管得了自己的队，管不了律所：律所的事只有总部说了算。
    if (firm.headTeamId !== me.teamId) throw new TeamError(403, 'forbidden');
    return { me, firm };
}

/**
 * 建律所（团队 OWNER，且本队还没入所）。建的人的团队就是总部团队。
 * 已入所再建一个是 409 `already_in_firm`——一个团队同时属于两个所没有意义，
 * 要换所先退出。
 */
export function createFirm(accountId: string, rawName: unknown): Firm {
    const me = requireOwner(accountId);
    const name = cleanName(rawName, 'name', FIRM_NAME_MAX);
    const team = getTeam(me.teamId);
    if (!team) throw new TeamError(404, 'no_team');
    if (team.firmId) throw new TeamError(409, 'already_in_firm');
    const now = new Date().toISOString();
    const firm: Firm = {
        id: crypto.randomUUID(),
        name,
        headTeamId: me.teamId,
        createdAt: now,
    };
    const joinCode = generateUniqueJoinCode(firmCodeTaken);
    withTransaction(d => {
        d.prepare(
            `INSERT INTO firm (id, name, headTeamId, joinCode, createdAt) VALUES (?, ?, ?, ?, ?)`
        ).run(firm.id, firm.name, firm.headTeamId, joinCode, now);
        d.prepare('UPDATE team SET firmId = ? WHERE id = ?').run(firm.id, me.teamId);
    });
    auditFirm(firm.id, 'FIRM_CREATED', accountId, { type: 'FIRM', id: firm.id, label: firm.name },
        { teamId: me.teamId, teamName: team.name });
    return firm;
}

/**
 * 团队并入律所（团队 OWNER，凭律所邀请码）。
 * 与 `joinByCode` 同样的顺序：先判「我已经在所里了」再判码，免得靠错误码差别摸码。
 */
export function joinFirmByCode(accountId: string, rawCode: unknown): Firm {
    const me = requireOwner(accountId);
    const team = getTeam(me.teamId);
    if (!team) throw new TeamError(404, 'no_team');
    if (team.firmId) throw new TeamError(409, 'already_in_firm');
    const code = normalizeJoinCode(rawCode);
    if (!code) throw new TeamError(404, 'bad_code');
    const row = getDb().prepare('SELECT * FROM firm WHERE joinCode = ?').get(code) as
        | FirmRow
        | undefined;
    if (!row) throw new TeamError(404, 'bad_code');
    getDb().prepare('UPDATE team SET firmId = ? WHERE id = ?').run(row.id, me.teamId);
    auditFirm(row.id, 'FIRM_TEAM_JOINED', accountId, { type: 'TEAM', id: team.id, label: team.name },
        { memberCount: listMembers(team.id).length });
    return rowToFirm(row);
}

/** 改所名（总部 OWNER/ADMIN）。 */
export function updateFirm(accountId: string, patch: { name?: unknown }): Firm {
    const { firm } = requireFirmManager(accountId);
    if (patch.name !== undefined) {
        getDb()
            .prepare('UPDATE firm SET name = ? WHERE id = ?')
            .run(cleanName(patch.name, 'name', FIRM_NAME_MAX), firm.id);
    }
    const next = getFirm(firm.id);
    if (!next) throw new TeamError(404, 'no_firm');
    return next;
}

/** 重置律所邀请码（总部 OWNER/ADMIN）。旧码立即失效，理由同团队邀请码。 */
export function regenerateFirmJoinCode(accountId: string): string {
    const { firm } = requireFirmManager(accountId);
    const code = generateUniqueJoinCode(firmCodeTaken);
    getDb().prepare('UPDATE firm SET joinCode = ? WHERE id = ?').run(code, firm.id);
    auditFirm(firm.id, 'FIRM_JOIN_CODE_REGENERATED', accountId, { type: 'FIRM', id: firm.id, label: firm.name });
    return code;
}

/**
 * 把一个团队移出律所（设计稿 §10.2 最后一行）。两种合法调用方：
 * 总部团队的 OWNER/ADMIN 移除任一子团队，或该团队自己的 OWNER 主动退出。
 *
 * **总部团队不可退出**（403 `head_cannot_leave`）：律所的管理权挂在总部团队上，
 * 总部一走这个所就没有任何人能管了——与「OWNER 不可退出团队」同一个道理。
 * 要解散律所是另一件事（本期不做）。
 *
 * 退出只改 `team.firmId`，使用数据一行不动：那些天的产出仍然发生过，
 * 抹掉会让律所的历史 KPI 无声变小（与 `removeMember` 同一口径）。
 */
export function removeTeamFromFirm(accountId: string, teamId: string): void {
    const me = requireMembership(accountId);
    const myTeam = getTeam(me.teamId);
    if (!myTeam?.firmId) throw new TeamError(404, 'no_firm');
    const firm = getFirm(myTeam.firmId);
    if (!firm) throw new TeamError(404, 'no_firm');

    const target = getTeam(teamId);
    if (!target || target.firmId !== firm.id) throw new TeamError(404, 'team_not_found');
    if (target.id === firm.headTeamId) throw new TeamError(403, 'head_cannot_leave');

    const isSelfLeave = target.id === me.teamId && me.role === 'OWNER';
    const isFirmManager = firm.headTeamId === me.teamId && me.role !== 'MEMBER';
    if (!isSelfLeave && !isFirmManager) throw new TeamError(403, 'forbidden');

    getDb().prepare('UPDATE team SET firmId = NULL WHERE id = ?').run(teamId);
    auditFirm(firm.id, isSelfLeave ? 'FIRM_TEAM_LEFT' : 'FIRM_TEAM_REMOVED', accountId,
        { type: 'TEAM', id: target.id, label: target.name }, { memberCount: listMembers(target.id).length });
}

/* ------------------------------------------------------------------ *
 * 日聚合上报
 * ------------------------------------------------------------------ */

/**
 * 上报限流：同一 accountId 每分钟 `USAGE_RATE_LIMIT_PER_MINUTE` 次（60 次，兼容桌面端 30 天补传）。
 * 进程内计数，多实例各算各的——与 `allowTelemetryRequest` 同一取舍：
 * 这道闸防的是坏客户端死循环，不是防刷 KPI（刷 KPI 靠幂等 upsert 就已经无效了）。
 */
const usageBuckets = new Map<string, { windowStart: number; count: number }>();

export function allowUsageUpload(accountId: string, now = Date.now()): boolean {
    const bucket = usageBuckets.get(accountId);
    if (!bucket || now - bucket.windowStart >= 60_000) {
        if (usageBuckets.size > 10_000) {
            for (const [k, v] of usageBuckets) {
                if (now - v.windowStart >= 60_000) usageBuckets.delete(k);
            }
        }
        usageBuckets.set(accountId, { windowStart: now, count: 1 });
        return true;
    }
    bucket.count += 1;
    return bucket.count <= USAGE_RATE_LIMIT_PER_MINUTE;
}

export interface UsageProjectInput {
    projectKey: string;
    label?: string | null;
    minutes?: number;
    aiTurns?: number;
    editActions?: number;
}

/** 上报体形状见设计稿 §5。未列出的字段原样留在 payload 里，聚合时忽略。 */
export interface UsagePayload {
    date: string;
    appStarts?: number;
    activeMinutes?: number;
    aiTurns?: number;
    aiToolCalls?: number;
    agentEditActions?: number;
    manualEditActions?: number;
    projectsCreated?: number;
    /** 当日结束时本人负责项目里「未分派」的待办数（快照，不是增量）。旧客户端不报。 */
    unassignedTasks?: number;
    tokens?: { platform?: number; estimate?: number };
    projects?: UsageProjectInput[];
}

/** 非负整数，超出上限截断。客户端算错一个数不该让整份上报被拒。 */
function count(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
    return Math.min(Math.round(v), max);
}

/**
 * 幂等 upsert 一天的日聚合（设计稿 §5/§6）。
 *
 * 项目明细走「先删同 (accountId, date) 的行再插」而不是逐行 upsert：
 * 重传的那份如果少了一个项目（用户删了项目、或口径变了），逐行 upsert 会把旧行永远留下，
 * 于是那个项目在面板上再也消不掉。整天替换才是「同一天重传 = 覆盖」的语义。
 *
 * `projectLabel` 只在团队 `shareProjectNames` 为真时落库，客户端传了也照样丢弃——
 * 律所内部共享项目名默认视为正常协作（维护者裁决，dev-board#496），新建团队默认就是
 * 打开的；团队可以随时在设置里关掉，关掉后服务端自己挡一道，不指望客户端守规矩。
 */
export function recordUsage(accountId: string, body: unknown): { date: string; projects: number } {
    const me = requireMembership(accountId);
    const team = getTeam(me.teamId);
    if (!team) throw new TeamError(404, 'no_team');

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new TeamError(400, 'bad_request');
    }
    const payload = body as UsagePayload;
    if (typeof payload.date !== 'string' || !DATE_RE.test(payload.date)) {
        throw new TeamError(400, 'bad_date');
    }
    const date = payload.date;

    const rawProjects = Array.isArray(payload.projects) ? payload.projects : [];
    if (rawProjects.length > USAGE_MAX_PROJECTS) throw new TeamError(400, 'too_many_projects');
    const projects = rawProjects
        .filter(
            (p): p is UsageProjectInput =>
                !!p && typeof p === 'object' && typeof p.projectKey === 'string' && !!p.projectKey
        )
        // 同一份上报里重复的 projectKey 会撞主键，客户端出错时整份上报就白丢了；
        // 保留第一条即可，重复本身没有信息量。
        .filter((p, i, arr) => arr.findIndex(q => q.projectKey === p.projectKey) === i)
        .map(p => ({
            projectKey: p.projectKey.slice(0, 64),
            label:
                team.shareProjectNames && typeof p.label === 'string' && p.label
                    ? p.label.slice(0, PROJECT_ALIAS_MAX)
                    : null,
            minutes: count(p.minutes, ACTIVE_MINUTES_MAX_PER_DAY),
            aiTurns: count(p.aiTurns),
            editActions: count(p.editActions),
        }));

    // 整包存原文：字段以后会加，重存一份规整过的等于把新字段挡在门外。
    // 聚合时按需从 payload 里取（与 summarizeTelemetry 同一做法）。
    const stored: UsagePayload = {
        ...payload,
        date,
        activeMinutes: count(payload.activeMinutes, ACTIVE_MINUTES_MAX_PER_DAY),
        appStarts: count(payload.appStarts),
        aiTurns: count(payload.aiTurns),
        aiToolCalls: count(payload.aiToolCalls),
        agentEditActions: count(payload.agentEditActions),
        manualEditActions: count(payload.manualEditActions),
        projectsCreated: count(payload.projectsCreated),
        unassignedTasks: count(payload.unassignedTasks),
        projects: projects.map(p => ({ ...p })),
    };
    const receivedAt = new Date().toISOString();

    withTransaction(d => {
        d.prepare(
            `INSERT INTO team_usage_daily (teamId, accountId, date, payload, receivedAt)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (accountId, date) DO UPDATE SET
               teamId     = excluded.teamId,
               payload    = excluded.payload,
               receivedAt = excluded.receivedAt`
        ).run(me.teamId, accountId, date, JSON.stringify(stored), receivedAt);
        d.prepare('DELETE FROM team_project_daily WHERE accountId = ? AND date = ?').run(
            accountId,
            date
        );
        const insert = d.prepare(
            `INSERT INTO team_project_daily
               (teamId, accountId, date, projectKey, projectLabel, minutes, aiTurns, editActions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const p of projects) {
            insert.run(
                me.teamId,
                accountId,
                date,
                p.projectKey,
                p.label,
                p.minutes,
                p.aiTurns,
                p.editActions
            );
        }
    });

    return { date, projects: projects.length };
}

/* ------------------------------------------------------------------ *
 * 项目别名
 * ------------------------------------------------------------------ */

export function setProjectAlias(accountId: string, projectKey: string, rawLabel: unknown): void {
    const me = requireManager(accountId);
    if (!projectKey) throw new TeamError(404, 'project_not_found');
    const label = cleanName(rawLabel, 'label', PROJECT_ALIAS_MAX);
    getDb()
        .prepare(
            `INSERT INTO team_project_alias (teamId, projectKey, label, updatedAt)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (teamId, projectKey) DO UPDATE SET
               label = excluded.label, updatedAt = excluded.updatedAt`
        )
        .run(me.teamId, projectKey, label, new Date().toISOString());
}

/* ------------------------------------------------------------------ *
 * 统计
 * ------------------------------------------------------------------ */

export interface TeamSummary {
    range: SummaryRange;
    /** 这份数字是本团队的还是全所的。客户端不该靠「有没有 teams[]」去猜。 */
    scope: SummaryScope;
    kpi: {
        activeMembers: number;
        memberCount: number;
        appStarts: number;
        projectsCreated: number;
        activeMinutes: number;
        aiTurns: number;
        savedMinutes: number;
        /** AI 编辑并被保留的动作数合计（「修订文书」口径的近似，客户端须如实标注）。 */
        agentEditActions: number;
        /** 窗口内有工时记录的不同项目数（「进行中项目」）。 */
        activeProjects: number;
        /** 各成员**最近一次上报**的未分派待办数之和；旧客户端不报则为 0。 */
        unassignedTasks: number;
    };
    savedMinutesFormula: { perAgentEdit: number; perAiTurn: number };
    daily: Array<{ date: string; activeMembers: number; aiTurns: number; activeMinutes: number }>;
    members: Array<{
        accountId: string;
        displayName: string;
        role: TeamRole;
        title: string | null;
        activeDays: number;
        activeMinutes: number;
        aiTurns: number;
        agentEditActions: number;
        projectsCreated: number;
        lastActiveDate: string | null;
        /** 窗口内有上报的日子，按日期升序；没上报的日子不出现（客户端补 0）。 */
        daily: Array<{ date: string; activeMinutes: number }>;
        /** 最近一个有项目明细的日子里投入最多的项目；项目名未共享且无别名时 label 为 null。 */
        currentProject: { projectKey: string; label: string | null } | null;
    }>;
    projects: Array<{
        projectKey: string;
        label: string | null;
        minutes: number;
        members: number;
        aiTurns: number;
    }>;
    /** 按团队的合计，只在 `scope=firm` 且我是总部管理者时下发（设计稿 §10.3）。 */
    teams?: Array<{
        /** 团队 id（桌面端按 id 键行；teamId 为兼容保留） */
        id: string;
        teamId: string;
        name: string;
        isHead: boolean;
        /** 在册人数（与 firm.teams[].memberCount 同口径） */
        memberCount: number;
        activeMembers: number;
        activeMinutes: number;
        aiTurns: number;
        projectsCreated: number;
    }>;
}

/** `scope` 非法值一律回落到 `team`，理由同 range：这是展示选项不是权限参数。 */
export function asSummaryScope(raw: unknown): SummaryScope {
    return (SUMMARY_SCOPES as readonly string[]).includes(raw as string)
        ? (raw as SummaryScope)
        : 'team';
}

export function asSummaryRange(raw: unknown): SummaryRange {
    const n = Number(raw);
    // 非法值回落到 7 而不是 400：range 是个展示选项，参数写错让面板空着比报错更糟，
    // 而且设计稿 §6 的错误码里本来就没有 400 的位置。
    return (SUMMARY_RANGES as readonly number[]).includes(n) ? (n as SummaryRange) : 7;
}

function addDaysUtc(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

interface UsageRow {
    teamId: string;
    accountId: string;
    date: string;
    payload: string;
}

interface ProjectRow {
    teamId: string;
    accountId: string;
    date: string;
    projectKey: string;
    projectLabel: string | null;
    minutes: number;
    aiTurns: number;
    editActions: number;
}

/**
 * 团队 / 律所统计（设计稿 §6、§10.3）。
 *
 * **口径（两个维度：scope 决定合计范围，角色决定明细范围）**：
 * - `scope=team`：合计与明细都在本团队内；MEMBER 的 `members` 只含自己、
 *   `projects` 只含自己参与的，`kpi`/`daily` 仍是全队合计。
 * - `scope=firm`（只对入所团队开放，未入所 404 `no_firm`）：`kpi`/`daily` 一律全所合计；
 *   明细看我是谁——总部 OWNER/ADMIN 拿全所 `members`/`projects` 并附 `teams[]`；
 *   子团队 OWNER/ADMIN 只拿本团队的明细；MEMBER 只拿自己。
 *
 * 合计数对所有人开放、明细按角色收窄，是这套设计一以贯之的取舍：
 * 合计没有归属，「谁干了多少」才是要挡的东西。
 *
 * 窗口右端有意放宽一天：date 是客户端按**本地日期**填的，东八区凌晨报上来的
 * 「明天」（相对 UTC）如果被裁掉，用户会看到「刚上报却查不到」。
 */
export function summarizeTeam(
    accountId: string,
    range: SummaryRange,
    scope: SummaryScope = 'team',
    today = new Date(),
    lang: Locale = siteConfig.defaultLocale
): TeamSummary {
    const me = requireMembership(accountId);
    const myTeam = getTeam(me.teamId);
    if (!myTeam) throw new TeamError(404, 'no_team');

    let firm: Firm | null = null;
    let scopeTeams: Team[] = [myTeam];
    if (scope === 'firm') {
        if (!myTeam.firmId) throw new TeamError(404, 'no_firm');
        firm = getFirm(myTeam.firmId);
        if (!firm) throw new TeamError(404, 'no_firm');
        scopeTeams = listFirmTeams(firm.id);
    }
    const isHeadManager = !!firm && firm.headTeamId === me.teamId && me.role !== 'MEMBER';
    const scopeTeamIds = scopeTeams.map(t => t.id);

    const todayStr = today.toISOString().slice(0, 10);
    const from = addDaysUtc(todayStr, -(range - 1));
    const to = addDaysUtc(todayStr, 1);
    const db = getDb();
    const placeholders = scopeTeamIds.map(() => '?').join(',');

    const usageRows = db
        .prepare(
            `SELECT teamId, accountId, date, payload FROM team_usage_daily
              WHERE teamId IN (${placeholders}) AND date >= ? AND date <= ? ORDER BY date ASC`
        )
        .all(...scopeTeamIds, from, to) as UsageRow[];
    const projectRows = db
        .prepare(
            `SELECT teamId, accountId, date, projectKey, projectLabel, minutes, aiTurns, editActions
               FROM team_project_daily
              WHERE teamId IN (${placeholders}) AND date >= ? AND date <= ?`
        )
        .all(...scopeTeamIds, from, to) as ProjectRow[];

    const kpi = {
        activeMembers: 0,
        memberCount: 0,
        appStarts: 0,
        projectsCreated: 0,
        activeMinutes: 0,
        aiTurns: 0,
        savedMinutes: 0,
        agentEditActions: 0,
        activeProjects: 0,
        unassignedTasks: 0,
    };
    const activeAccounts = new Set<string>();
    const dailyMap = new Map<
        string,
        { accounts: Set<string>; aiTurns: number; activeMinutes: number }
    >();
    interface Agg {
        activeDays: number;
        activeMinutes: number;
        aiTurns: number;
        agentEditActions: number;
        projectsCreated: number;
        lastActiveDate: string | null;
        daily: Array<{ date: string; activeMinutes: number }>;
        unassignedTasks: number;
    }
    const perAccount = new Map<string, Agg>();
    interface TeamAgg {
        accounts: Set<string>;
        activeMinutes: number;
        aiTurns: number;
        projectsCreated: number;
    }
    const perTeam = new Map<string, TeamAgg>();

    for (const row of usageRows) {
        let p: UsagePayload;
        try {
            p = JSON.parse(row.payload) as UsagePayload;
        } catch {
            continue;
        }
        const activeMinutes = count(p.activeMinutes, ACTIVE_MINUTES_MAX_PER_DAY);
        const aiTurns = count(p.aiTurns);
        const appStarts = count(p.appStarts);
        const projectsCreated = count(p.projectsCreated);
        const agentEdits = count(p.agentEditActions);

        activeAccounts.add(row.accountId);
        kpi.appStarts += appStarts;
        kpi.projectsCreated += projectsCreated;
        kpi.activeMinutes += activeMinutes;
        kpi.aiTurns += aiTurns;
        kpi.agentEditActions += agentEdits;
        kpi.savedMinutes +=
            agentEdits * SAVED_MINUTES_FORMULA.perAgentEdit +
            aiTurns * SAVED_MINUTES_FORMULA.perAiTurn;

        let day = dailyMap.get(row.date);
        if (!day) dailyMap.set(row.date, (day = { accounts: new Set(), aiTurns: 0, activeMinutes: 0 }));
        day.accounts.add(row.accountId);
        day.aiTurns += aiTurns;
        day.activeMinutes += activeMinutes;

        let agg = perAccount.get(row.accountId);
        if (!agg) {
            perAccount.set(
                row.accountId,
                (agg = {
                    activeDays: 0,
                    activeMinutes: 0,
                    aiTurns: 0,
                    agentEditActions: 0,
                    projectsCreated: 0,
                    lastActiveDate: null,
                    daily: [],
                    unassignedTasks: 0,
                })
            );
        }
        agg.activeDays += 1;
        agg.activeMinutes += activeMinutes;
        agg.aiTurns += aiTurns;
        agg.agentEditActions += agentEdits;
        agg.projectsCreated += projectsCreated;
        agg.daily.push({ date: row.date, activeMinutes });
        // usageRows 按 date 升序：循环结束时留下的就是最近一次上报的快照
        agg.unassignedTasks = count(p.unassignedTasks);
        if (!agg.lastActiveDate || row.date > agg.lastActiveDate) agg.lastActiveDate = row.date;

        let tagg = perTeam.get(row.teamId);
        if (!tagg) {
            perTeam.set(
                row.teamId,
                (tagg = { accounts: new Set(), activeMinutes: 0, aiTurns: 0, projectsCreated: 0 })
            );
        }
        tagg.accounts.add(row.accountId);
        tagg.activeMinutes += activeMinutes;
        tagg.aiTurns += aiTurns;
        tagg.projectsCreated += projectsCreated;
    }
    kpi.activeMembers = activeAccounts.size;
    for (const agg of perAccount.values()) kpi.unassignedTasks += agg.unassignedTasks;
    kpi.activeProjects = new Set(
        projectRows.filter(r => r.minutes > 0).map(r => r.projectKey)
    ).size;

    // 名册按 scope 取：全所口径下 memberCount 必须是全所人数，
    // 否则「活跃 6 人 / 共 3 人」这种自相矛盾的数字会出现在总部面板上。
    const roster = scopeTeams.flatMap(t => listMembers(t.id));
    kpi.memberCount = roster.length;

    // 明细范围：MEMBER 永远只看自己；管理者在 firm scope 下，总部看全所、子团队看本队。
    const detailTeamIds =
        me.role === 'MEMBER' ? [] : isHeadManager ? scopeTeamIds : [me.teamId];
    const detailTeams = new Set(detailTeamIds);
    const visibleRoster =
        me.role === 'MEMBER'
            ? roster.filter(m => m.accountId === accountId)
            : roster.filter(m => detailTeams.has(m.teamId));
    const names = mapDisplayNamesByIds(visibleRoster.map(m => m.accountId));
    const fallbackName = toBaseLocale(lang) === 'en' ? 'Unknown user' : '未知用户';
    // 别名按 scope 内的团队一起取：全所面板上一个项目可能被总部起过名。
    const aliasRows = db
        .prepare(
            `SELECT projectKey, label FROM team_project_alias WHERE teamId IN (${placeholders})`
        )
        .all(...scopeTeamIds) as Array<{ projectKey: string; label: string }>;
    const aliases = new Map(aliasRows.map(r => [r.projectKey, r.label]));

    // 「正在处理」：每人最近一个有项目明细的日子里分钟数最多的项目。
    // 只给本来就能看到其明细的成员算（visibleRoster），口径与 projects[] 一致。
    const visibleIds = new Set(visibleRoster.map(m => m.accountId));
    const latestProject = new Map<string, ProjectRow>();
    for (const r of projectRows) {
        if (!visibleIds.has(r.accountId) || r.minutes <= 0) continue;
        const cur = latestProject.get(r.accountId);
        if (!cur || r.date > cur.date || (r.date === cur.date && r.minutes > cur.minutes)) {
            latestProject.set(r.accountId, r);
        }
    }

    const members = visibleRoster.map(m => {
        const agg = perAccount.get(m.accountId);
        const cp = latestProject.get(m.accountId);
        return {
            accountId: m.accountId,
            displayName: names.get(m.accountId) ?? fallbackName,
            role: m.role,
            title: m.title,
            activeDays: agg?.activeDays ?? 0,
            activeMinutes: agg?.activeMinutes ?? 0,
            aiTurns: agg?.aiTurns ?? 0,
            agentEditActions: agg?.agentEditActions ?? 0,
            projectsCreated: agg?.projectsCreated ?? 0,
            lastActiveDate: agg?.lastActiveDate ?? null,
            daily: agg ? agg.daily.map(d => ({ ...d })) : [],
            currentProject: cp
                ? {
                      projectKey: cp.projectKey,
                      label: aliases.get(cp.projectKey) ?? cp.projectLabel ?? null,
                  }
                : null,
        };
    });

    const visibleProjectRows =
        me.role === 'MEMBER'
            ? projectRows.filter(r => r.accountId === accountId)
            : projectRows.filter(r => detailTeams.has(r.teamId));
    const projectMap = new Map<
        string,
        { minutes: number; aiTurns: number; accounts: Set<string>; reported: string | null }
    >();
    for (const r of visibleProjectRows) {
        let agg = projectMap.get(r.projectKey);
        if (!agg) {
            projectMap.set(
                r.projectKey,
                (agg = { minutes: 0, aiTurns: 0, accounts: new Set(), reported: null })
            );
        }
        agg.minutes += r.minutes;
        agg.aiTurns += r.aiTurns;
        agg.accounts.add(r.accountId);
        if (r.projectLabel) agg.reported = r.projectLabel;
    }

    const summary: TeamSummary = {
        range,
        scope,
        kpi,
        savedMinutesFormula: { ...SAVED_MINUTES_FORMULA },
        daily: [...dailyMap.entries()]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([date, d]) => ({
                date,
                activeMembers: d.accounts.size,
                aiTurns: d.aiTurns,
                activeMinutes: d.activeMinutes,
            })),
        members,
        projects: [...projectMap.entries()]
            .map(([projectKey, agg]) => ({
                projectKey,
                // 管理者起的别名优先于上报带来的项目名：别名是人为了看得懂特意设的，
                // 上报的那个只是客户端当时的项目名，改了名就会跟着变。
                label: aliases.get(projectKey) ?? agg.reported,
                minutes: agg.minutes,
                members: agg.accounts.size,
                aiTurns: agg.aiTurns,
            }))
            .sort((a, b) => b.minutes - a.minutes),
    };

    // 没数据的团队也要出现在 teams[] 里：面板上「这个队这段时间一条都没有」
    // 与「这个队不在所里」是两回事，前者恰恰是总部要看的。
    if (isHeadManager && firm) {
        const memberCounts = memberCountsByTeam(scopeTeams.map(t => t.id));
        summary.teams = scopeTeams.map(t => {
            const agg = perTeam.get(t.id);
            return {
                id: t.id,
                teamId: t.id,
                name: t.name,
                isHead: t.id === firm.headTeamId,
                memberCount: memberCounts.get(t.id) ?? 0,
                activeMembers: agg?.accounts.size ?? 0,
                activeMinutes: agg?.activeMinutes ?? 0,
                aiTurns: agg?.aiTurns ?? 0,
                projectsCreated: agg?.projectsCreated ?? 0,
            };
        });
    }
    return summary;
}
