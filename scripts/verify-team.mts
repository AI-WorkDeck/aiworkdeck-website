/**
 * 团队 / 律所 API 验证脚本（dev-board#496，设计稿 §4/§5/§6/§10）。
 *
 * 与 contract-check.mts 同一套路：直接调 route handler，不起 next 服务。
 * 覆盖建队、邀请-接受（含被邀请人当时还没注册）、角色规则、一人一团队、
 * usage 幂等 upsert 与限流、summary 聚合与 savedMinutes、MEMBER 只看自己，
 * 以及 §10 的层级：邀请码加入、律所创建/并入/退出、firm scope 三种视角、
 * 邀请码只对管理者可见、Cookie 会话与 Bearer 同样能进。
 *
 * **按站点跑两遍**（CI 的 contracts 矩阵就是这么跑的）：账号本体大陆站是手机号、
 * 国际站是邮箱（dev-board#778），所以门槛、邀请入参、邀请对象的字段、错误码
 * 全部随 `NEXT_PUBLIC_AWD_SITE` 分叉。断言里凡是涉及这条分叉的都走 `ident` /
 * `IDENT_FIELD` / `identBody()` / `errRequired` 这几个出口，别在断言里写死一边。
 *
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   npm run test:team
 * 或手工：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-team.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

// ---------- 0. 隔离数据 ----------
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const createdAt = new Date().toISOString();
const ids = {
    owner: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    member: crypto.randomUUID(),
    outsider: crypto.randomUUID(),
    nophone: crypto.randomUUID(),
    unbound: crypto.randomUUID(),
};
// 账号本体：大陆站手机号、国际站邮箱（lib/phone-policy.ts / lib/mail-policy.ts）。
const MAIL_SITE = process.env.NEXT_PUBLIC_AWD_SITE === 'intl';
const phones = {
    owner: '13800000001',
    admin: '13800000002',
    member: '13800000003',
    outsider: '13800000004',
    nophone: '13800000005', // 大陆站下 nophone 建队前才补绑，见 [2]
    late: '13800000009', // 邀请发出时这个号还没有账号
    tmp: '13800000077', // 只用来测「发出再撤销」
    stranger: '13800000088', // MEMBER 越权邀请时用，不需要真存在
};
const emails = {
    owner: 'tm-owner@test.local',
    admin: 'tm-admin@test.local',
    member: 'tm-member@test.local',
    outsider: 'tm-outsider@test.local',
    nophone: 'tm-nophone@test.local',
    late: 'tm-late@test.local',
    tmp: 'tm-tmp@test.local',
    stranger: 'tm-stranger@test.local',
};
/** 本站的账号本体取值。断言一律用它，不要直接引 phones / emails。 */
const ident = MAIL_SITE ? emails : phones;
/** 邀请对象里承载标识的字段名，另一个字段必须是 null。 */
const IDENT_FIELD = MAIL_SITE ? 'email' : 'phone';
const OTHER_FIELD = MAIL_SITE ? 'phone' : 'email';
/** 邀请 POST 的 body 片段：大陆站 { phone }，国际站 { email }。 */
const identBody = (v: string) => (MAIL_SITE ? { email: v } : { phone: v });
/** 账号本体缺失的错误码；格式非法的错误码。 */
const errRequired = MAIL_SITE ? 'email_required' : 'phone_required';
const errBadIdent = MAIL_SITE ? 'bad_email' : 'bad_phone';
/** 一个一定过不了格式校验的输入。 */
const badIdent = MAIL_SITE ? 'not-an-email' : '123';

/**
 * 种一个「本体已就位」的账号。国际站的邮箱必须带 `emailVerifiedAt`：
 * `findUserByEmail` 只认已验证的邮箱（lib/users.ts），不盖戳的话
 * 「邀请一个已经在别队的人 → 409」那条预检永远查不到人。
 */
function seed(id: string, username: string, key: keyof typeof phones, displayName: string) {
    return MAIL_SITE
        ? { id, username, email: emails[key as keyof typeof emails], emailVerifiedAt: createdAt, passwordHash: '', displayName, createdAt }
        : { id, username, email: '', passwordHash: '', phone: phones[key], displayName, createdAt };
}
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify([
        seed(ids.owner, 'tm-owner', 'owner', '所长'),
        seed(ids.admin, 'tm-admin', 'admin', '主任'),
        seed(ids.member, 'tm-member', 'member', '律师甲'),
        seed(ids.outsider, 'tm-outsider', 'outsider', '外人'),
        // nophone：大陆站下先不绑号，[2] 里补绑以验证「绑完就能建队」；
        // 国际站没有「补绑邮箱」这条路——邮箱就是登录本体，登进来就已经有了，
        // 所以直接按已就位来种。
        MAIL_SITE
            ? seed(ids.nophone, 'tm-nophone', 'nophone', '无号者')
            : { id: ids.nophone, username: 'tm-nophone', email: 'np@test.local', passwordHash: 'x:y', displayName: '无号者', createdAt },
        // unbound：两站都**没有**本站的账号本体，专门用来打门槛那几条断言。
        // 大陆站下它有邮箱没手机号，国际站下反过来。
        MAIL_SITE
            ? { id: ids.unbound, username: 'tm-unbound', email: '', passwordHash: 'x:y', phone: '13800000006', displayName: '未绑号者', createdAt }
            : { id: ids.unbound, username: 'tm-unbound', email: 'unbound@test.local', passwordHash: 'x:y', displayName: '未绑号者', createdAt },
    ])
);

const { getDb } = await import('@/lib/db');
const { generateApiKey } = await import('@/lib/api-keys');
const { findOrCreateByEmail, findOrCreateByPhone, bindPhone } = await import('@/lib/users');
const { NextRequest } = await import('next/server');

const teamRoute = await import('@/app/api/account/team/route');
const invitesRoute = await import('@/app/api/account/team/invites/route');
const inviteIdRoute = await import('@/app/api/account/team/invites/[id]/route');
const acceptRoute = await import('@/app/api/account/team/invites/[id]/accept/route');
const memberRoute = await import('@/app/api/account/team/members/[accountId]/route');
const usageRoute = await import('@/app/api/account/team/usage/route');
const summaryRoute = await import('@/app/api/account/team/summary/route');
const aliasRoute = await import('@/app/api/account/team/projects/[projectKey]/alias/route');
const joinRoute = await import('@/app/api/account/team/join/route');
const joinCodeRoute = await import('@/app/api/account/team/join-code/regenerate/route');
const firmRoute = await import('@/app/api/account/team/firm/route');
const firmJoinRoute = await import('@/app/api/account/team/firm/join/route');
const firmCodeRoute = await import('@/app/api/account/team/firm/join-code/regenerate/route');
const firmTeamRoute = await import('@/app/api/account/team/firm/teams/[teamId]/route');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

const keys = {
    owner: generateApiKey(ids.owner).key!.plaintextKey,
    admin: generateApiKey(ids.admin).key!.plaintextKey,
    member: generateApiKey(ids.member).key!.plaintextKey,
    outsider: generateApiKey(ids.outsider).key!.plaintextKey,
    nophone: generateApiKey(ids.nophone).key!.plaintextKey,
    unbound: generateApiKey(ids.unbound).key!.plaintextKey,
};

interface ReqInit {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
}
const req = (url: string, key?: string, init: ReqInit = {}) =>
    new NextRequest(`http://localhost${url}`, {
        ...init,
        headers: { ...init.headers, ...(key ? { authorization: `Bearer ${key}` } : {}) },
    });
const jreq = (url: string, key: string | undefined, method: string, body: unknown) =>
    req(url, key, {
        method,
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    });
const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });

/* eslint-disable @typescript-eslint/no-explicit-any */
async function read(res: Response, status: number, label: string): Promise<any> {
    const body = await res.json();
    assert.strictEqual(
        res.status,
        status,
        `${label}：期望 ${status}，实际 ${res.status} ${JSON.stringify(body)}`
    );
    return body;
}
async function expectErr(res: Response, status: number, code: string, label: string) {
    const body = await read(res, status, label);
    assert.strictEqual(body.error, code, `${label}：错误码期望 ${code}，实际 ${body.error}`);
}

const today = new Date().toISOString().slice(0, 10);
const dayBefore = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
};
const D0 = today;
const D1 = dayBefore(1);

// ===========================================================================
console.log('\n[1] 鉴权与空态');
// ===========================================================================
{
    await expectErr(
        await teamRoute.GET(req('/api/account/team')),
        401,
        'unauthorized',
        '无 Bearer 的 GET /team'
    );
    ok('无 Bearer → 401 unauthorized');

    const body = await read(await teamRoute.GET(req('/api/account/team', keys.owner)), 200, '空态 GET');
    assert.strictEqual(body.team, null, '还没有团队时 team 必须是 null');
    assert.deepStrictEqual(body.invites, [], '也还没有收到任何邀请');
    ok('无团队 → { team: null, invites: [] }');
}

// ===========================================================================
console.log('\n[2] 创建团队与一人一团队约束');
// ===========================================================================
let teamId = '';
{
    const created = await read(
        await teamRoute.POST(jreq('/api/account/team', keys.owner, 'POST', { name: '测试律所' })),
        200,
        'POST /team'
    );
    teamId = created.team.id;
    assert.strictEqual(created.team.name, '测试律所');
    assert.strictEqual(created.team.ownerAccountId, ids.owner);
    assert.strictEqual(created.team.shareProjectNames, true, '项目名默认共享上云');
    ok('POST /team → 建队，建队者为 OWNER，shareProjectNames 默认 true');

    const view = await read(await teamRoute.GET(req('/api/account/team', keys.owner)), 200, 'GET /team');
    assert.strictEqual(view.myRole, 'OWNER');
    assert.strictEqual(view.myAccountId, ids.owner, 'GET /team 必须回 myAccountId（桌面端「退出团队」靠它定位自己）');
    assert.strictEqual(view.members.length, 1);
    assert.strictEqual(view.members[0].displayName, '所长');
    assert.deepStrictEqual(view.pendingInvites, []);
    ok('GET /team → { team, myRole, members[], pendingInvites[] }');

    await expectErr(
        await teamRoute.POST(jreq('/api/account/team', keys.owner, 'POST', { name: '第二家' })),
        409,
        'already_in_team',
        '已有团队再建队'
    );
    ok('已有团队再建队 → 409 already_in_team（一人一团队）');

    // 账号本体缺失：建队一律 403，且这道闸排在名称校验之前。
    // 大陆站是 phone_required，国际站是 email_required——两个码分开，因为用户
    // 看到的下一步不同（去绑手机号 / 去用邮箱登录）。
    await expectErr(
        await teamRoute.POST(jreq('/api/account/team', keys.unbound, 'POST', { name: '无号建队' })),
        403,
        errRequired,
        '无账号本体建队'
    );
    ok(`无账号本体建队 → 403 ${errRequired}`);

    if (MAIL_SITE) {
        // 国际站没有「补绑邮箱」这条路（邮箱就是登录本体），nophone 建号即带已验证邮箱。
        ok('国际站无补绑邮箱流程，nophone 建号即带已验证邮箱（跳过补绑断言）');
    } else {
        // nophone 补绑手机号：往后的建队/加入断言都要用到一个已绑号的账号
        const bound = bindPhone(ids.nophone, phones.nophone);
        assert.ok(!bound.error, `绑定手机号应当成功，实际 ${bound.error}`);
        ok('nophone 补绑手机号成功');
    }

    await expectErr(
        await teamRoute.POST(jreq('/api/account/team', keys.nophone, 'POST', { name: '' })),
        400,
        'bad_name',
        '空名建队'
    );
    ok(`本体就位后空团队名 → 400 bad_name（${errRequired} 已经过，走到名称校验）`);
}

// ===========================================================================
console.log('\n[3] 邀请与接受');
// ===========================================================================
let lateInviteId = '';
// 邀请发出时还不存在的那个账号，注册后再补上
let lateId = '';
let lateKey = '';
{
    const invite = async (key: string, who: string, role: string) =>
        read(
            await invitesRoute.POST(
                jreq('/api/account/team/invites', key, 'POST', { ...identBody(who), role })
            ),
            200,
            `邀请 ${who}`
        );

    const a = await invite(keys.owner, ident.admin, 'MEMBER');
    assert.strictEqual(a.invite.teamId, teamId);
    assert.ok(a.invite.expiresAt > a.invite.createdAt, '邀请必须有有效期');
    // 邀请对象按站点带字段：本站那一列有值，另一列必须是 null（迁移 32 的 CHECK）
    assert.strictEqual(
        a.invite[IDENT_FIELD],
        ident.admin,
        `邀请对象必须带 ${IDENT_FIELD}`
    );
    assert.strictEqual(a.invite[OTHER_FIELD], null, `另一站的 ${OTHER_FIELD} 必须是 null`);
    const b = await invite(keys.owner, ident.member, 'MEMBER');
    // 被邀请人此刻还没有账号——邀请挂在账号本体上
    const c = await invite(keys.owner, ident.late, 'MEMBER');
    lateInviteId = c.invite.id;
    ok(`OWNER 可邀请（按 ${IDENT_FIELD}），含尚未注册的标识`);

    await expectErr(
        await invitesRoute.POST(
            jreq('/api/account/team/invites', keys.owner, 'POST', {
                ...identBody(badIdent),
                role: 'MEMBER',
            })
        ),
        400,
        errBadIdent,
        '标识格式非法'
    );
    // 另一站的字段名不被兼容：国际站收 { phone } 等于没给标识
    await expectErr(
        await invitesRoute.POST(
            jreq('/api/account/team/invites', keys.owner, 'POST', {
                [OTHER_FIELD]: ident.member,
                role: 'MEMBER',
            })
        ),
        400,
        errBadIdent,
        '用另一站的字段名邀请'
    );
    await expectErr(
        await invitesRoute.POST(
            jreq('/api/account/team/invites', keys.owner, 'POST', {
                ...identBody(ident.admin),
                role: 'OWNER',
            })
        ),
        400,
        'bad_role',
        '邀请成 OWNER'
    );
    ok(`标识/角色非法 → 400（${errBadIdent} / bad_role）；OWNER 不是可邀请角色`);

    const pending = await read(
        await teamRoute.GET(req('/api/account/team', keys.owner)),
        200,
        'OWNER 看待接受邀请'
    );
    assert.strictEqual(pending.pendingInvites.length, 3);
    ok('pendingInvites 列出 3 条未接受邀请');

    // 无账号本体：连比对都无从比起，单独给 phone_required / email_required，
    // 与「标识对不上」的 forbidden 区分开
    await expectErr(
        await acceptRoute.POST(
            jreq(`/api/account/team/invites/${a.invite.id}/accept`, keys.unbound, 'POST', {}),
            p({ id: a.invite.id })
        ),
        403,
        errRequired,
        '无账号本体接受邀请'
    );
    ok(`无账号本体接受邀请 → 403 ${errRequired}`);

    // 别人的邀请 id 拿到了也进不来：按当前登录人的账号本体匹配
    await expectErr(
        await acceptRoute.POST(
            jreq(`/api/account/team/invites/${a.invite.id}/accept`, keys.outsider, 'POST', {}),
            p({ id: a.invite.id })
        ),
        403,
        'forbidden',
        '拿别人的邀请 id 接受'
    );
    ok('账号本体对不上的人接受邀请 → 403 forbidden');

    for (const [key, inv] of [
        [keys.admin, a],
        [keys.member, b],
    ] as const) {
        const joined = await read(
            await acceptRoute.POST(
                jreq(`/api/account/team/invites/${inv.invite.id}/accept`, key, 'POST', {}),
                p({ id: inv.invite.id })
            ),
            200,
            '接受邀请'
        );
        assert.strictEqual(joined.team.id, teamId);
    }
    ok('本人接受邀请 → 加入团队');

    await expectErr(
        await acceptRoute.POST(
            jreq(`/api/account/team/invites/${a.invite.id}/accept`, keys.admin, 'POST', {}),
            p({ id: a.invite.id })
        ),
        409,
        'invite_accepted',
        '重复接受'
    );
    ok('重复接受同一邀请 → 409 invite_accepted');

    // 被邀请人此时才注册（验证码登录：cn 走 findOrCreateByPhone，intl 走 findOrCreateByEmail）
    const late = MAIL_SITE ? findOrCreateByEmail(emails.late) : findOrCreateByPhone(phones.late);
    assert.strictEqual(late.created, true, '这个标识此前不该存在');
    lateId = late.user.id;
    lateKey = generateApiKey(late.user.id).key!.plaintextKey;
    const lateView = await read(
        await teamRoute.GET(req('/api/account/team', lateKey)),
        200,
        '新注册者看邀请'
    );
    assert.strictEqual(lateView.team, null);
    assert.strictEqual(lateView.invites.length, 1, '注册后应当看到发给这个标识的邀请');
    assert.strictEqual(lateView.invites[0].teamName, '测试律所', '邀请要带团队名，否则用户不知道是谁邀请的');
    await read(
        await acceptRoute.POST(
            jreq(`/api/account/team/invites/${lateInviteId}/accept`, lateKey, 'POST', {}),
            p({ id: lateInviteId })
        ),
        200,
        '注册后接受'
    );
    ok(`邀请时未注册 → 注册后仍可看到并接受（按 ${IDENT_FIELD} 匹配）`);

    // 撤销：先发一条再撤
    const tmp = await invite(keys.owner, ident.tmp, 'MEMBER');
    await read(
        await inviteIdRoute.DELETE(
            req(`/api/account/team/invites/${tmp.invite.id}`, keys.owner, { method: 'DELETE' }),
            p({ id: tmp.invite.id })
        ),
        200,
        '撤销邀请'
    );
    await expectErr(
        await inviteIdRoute.DELETE(
            req(`/api/account/team/invites/${tmp.invite.id}`, keys.owner, { method: 'DELETE' }),
            p({ id: tmp.invite.id })
        ),
        404,
        'invite_not_found',
        '重复撤销'
    );
    ok('撤销邀请 → 删行，再撤 404');

    // 一人一团队：先收到邀请，自己先建了队，再来接受就该被挡
    const forOutsider = await invite(keys.owner, ident.outsider, 'MEMBER');
    await read(
        await teamRoute.POST(jreq('/api/account/team', keys.outsider, 'POST', { name: '外人所' })),
        200,
        '外人自己建队'
    );
    await expectErr(
        await acceptRoute.POST(
            jreq(`/api/account/team/invites/${forOutsider.invite.id}/accept`, keys.outsider, 'POST', {}),
            p({ id: forOutsider.invite.id })
        ),
        409,
        'already_in_team',
        '已有团队者接受邀请'
    );
    await expectErr(
        await invitesRoute.POST(
            jreq('/api/account/team/invites', keys.owner, 'POST', {
                ...identBody(ident.outsider),
                role: 'MEMBER',
            })
        ),
        409,
        'already_in_team',
        '邀请已在别队的人'
    );
    ok('已有团队者接受/被邀请 → 409 already_in_team');
}

// ===========================================================================
console.log('\n[4] usage 幂等 upsert / 上限 / 项目名默认上云');
// ===========================================================================
const db = getDb();
const postUsage = async (key: string, payload: unknown) =>
    usageRoute.POST(jreq('/api/account/team/usage', key, 'POST', payload));
{
    // 第一版：故意超上限、带项目名、两个项目
    const first = await read(
        await postUsage(keys.owner, {
            date: D0,
            appStarts: 9,
            activeMinutes: 5000,
            aiTurns: 99,
            agentEditActions: 99,
            projectsCreated: 9,
            projects: [
                { projectKey: 'aaa', label: 'AAA 项目', minutes: 10, aiTurns: 1, editActions: 1 },
                { projectKey: 'zzz', label: 'ZZZ 项目', minutes: 10, aiTurns: 1, editActions: 1 },
            ],
        }),
        200,
        '首次上报'
    );
    assert.strictEqual(first.date, D0);
    assert.strictEqual(first.projects, 2);

    const stored = JSON.parse(
        (db
            .prepare('SELECT payload FROM team_usage_daily WHERE accountId = ? AND date = ?')
            .get(ids.owner, D0) as { payload: string }).payload
    );
    assert.strictEqual(stored.activeMinutes, 16 * 60, 'activeMinutes 必须截到 16 小时');
    ok('activeMinutes 超 16 小时 → 截断而不是拒收');

    const labels = db
        .prepare('SELECT projectLabel FROM team_project_daily WHERE accountId = ? AND date = ?')
        .all(ids.owner, D0) as Array<{ projectLabel: string | null }>;
    assert.deepStrictEqual(
        labels.map(r => r.projectLabel).sort(),
        ['AAA 项目', 'ZZZ 项目'],
        'shareProjectNames 默认 true 时项目名应当随上报落库'
    );
    ok('shareProjectNames 默认 true → 上报带的项目名直接落库');

    // 第二版：同一天重传，项目从 2 个变 1 个
    await read(
        await postUsage(keys.owner, {
            date: D0,
            appStarts: 2,
            activeMinutes: 120,
            aiTurns: 5,
            agentEditActions: 10,
            projectsCreated: 1,
            projects: [{ projectKey: 'aaa', label: 'AAA 项目', minutes: 60, aiTurns: 3, editActions: 4 }],
        }),
        200,
        '同日重传'
    );
    const dayRows = (
        db
            .prepare('SELECT COUNT(*) AS n FROM team_usage_daily WHERE accountId = ? AND date = ?')
            .get(ids.owner, D0) as { n: number }
    ).n;
    const projRows = db
        .prepare('SELECT projectKey FROM team_project_daily WHERE accountId = ? AND date = ?')
        .all(ids.owner, D0) as Array<{ projectKey: string }>;
    assert.strictEqual(dayRows, 1, '同一 (accountId, date) 只能有一行');
    assert.deepStrictEqual(projRows.map(r => r.projectKey), ['aaa'], '重传少掉的项目行必须消失');
    ok('同日重传 → 幂等覆盖，项目明细整天替换（zzz 行消失）');

    // 关闭项目名共享后再上报，项目名必须被丢弃
    await read(
        await teamRoute.PATCH(
            jreq('/api/account/team', keys.owner, 'PATCH', { shareProjectNames: false })
        ),
        200,
        'PATCH shareProjectNames'
    );
    await read(
        await postUsage(keys.admin, {
            date: D1,
            appStarts: 1,
            activeMinutes: 60,
            aiTurns: 4,
            agentEditActions: 2,
            projectsCreated: 0,
            unassignedTasks: 2,
            projects: [
                { projectKey: 'aaa', label: 'AAA 项目', minutes: 30, aiTurns: 2, editActions: 1 },
                { projectKey: 'bbb', label: 'BBB 项目', minutes: 30, aiTurns: 2, editActions: 1 },
            ],
        }),
        200,
        'admin 上报'
    );
    await read(
        await postUsage(keys.member, {
            date: D0,
            appStarts: 3,
            activeMinutes: 30,
            aiTurns: 1,
            agentEditActions: 1,
            projectsCreated: 2,
            unassignedTasks: 3,
            projects: [{ projectKey: 'ccc', label: 'CCC 项目', minutes: 30, aiTurns: 1, editActions: 1 }],
        }),
        200,
        'member 上报'
    );
    const dropped = (
        db
            .prepare(
                'SELECT projectLabel FROM team_project_daily WHERE accountId = ? AND projectKey = ?'
            )
            .get(ids.admin, 'aaa') as { projectLabel: string | null }
    ).projectLabel;
    assert.strictEqual(dropped, null, 'shareProjectNames=false 后项目名必须被服务端丢弃');
    ok('PATCH shareProjectNames=false → 上报带的项目名不再落库');

    await expectErr(
        await postUsage(keys.owner, { date: '昨天' }),
        400,
        'bad_date',
        '非法日期'
    );
    await expectErr(
        await postUsage(keys.nophone, { date: D0 }),
        404,
        'no_team',
        '无团队者上报'
    );
    ok('日期非法 → 400；无团队者上报 → 404 no_team');
}

// ===========================================================================
console.log('\n[5] summary 聚合与 savedMinutes');
// ===========================================================================
{
    const s = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=7', keys.owner)),
        200,
        'OWNER summary'
    );
    assert.strictEqual(s.range, 7);
    assert.deepStrictEqual(
        s.kpi,
        {
            activeMembers: 3,
            memberCount: 4,
            appStarts: 6,
            projectsCreated: 3,
            activeMinutes: 210,
            aiTurns: 10,
            // (10*3+5*2) + (2*3+4*2) + (1*3+1*2) = 40 + 14 + 5
            savedMinutes: 59,
            agentEditActions: 13,
            // aaa / bbb / ccc
            activeProjects: 3,
            // admin 2 + member 3（各取最近一次上报的快照）
            unassignedTasks: 5,
        },
        'kpi 聚合'
    );
    assert.deepStrictEqual(s.savedMinutesFormula, { perAgentEdit: 3, perAiTurn: 2 });
    ok('kpi 聚合与 savedMinutes = agentEditActions*3 + aiTurns*2');

    assert.deepStrictEqual(
        s.daily,
        [
            { date: D1, activeMembers: 1, aiTurns: 4, activeMinutes: 60 },
            { date: D0, activeMembers: 2, aiTurns: 6, activeMinutes: 150 },
        ],
        'daily 按日期升序'
    );
    ok('daily 按日聚合、按日期升序');

    const byId = new Map<string, any>(s.members.map((m: any) => [m.accountId, m]));
    assert.strictEqual(s.members.length, 4, '成员表含全部在队成员，包括没数据的');
    assert.deepStrictEqual(
        byId.get(ids.owner),
        {
            accountId: ids.owner,
            displayName: '所长',
            role: 'OWNER',
            title: null,
            activeDays: 1,
            activeMinutes: 120,
            aiTurns: 5,
            agentEditActions: 10,
            projectsCreated: 1,
            lastActiveDate: D0,
            daily: [{ date: D0, activeMinutes: 120 }],
            currentProject: { projectKey: 'aaa', label: 'AAA 项目' },
        },
        'OWNER 行'
    );
    // admin 当天两个项目各 30 分钟：取先出现的那个；shareProjectNames 已关、尚无别名 → label null
    assert.deepStrictEqual(
        byId.get(ids.admin).currentProject,
        { projectKey: 'aaa', label: null },
        '项目名未共享时「正在处理」不得带出上报的项目名'
    );
    assert.deepStrictEqual(byId.get(ids.admin).daily, [{ date: D1, activeMinutes: 60 }]);
    const lateRow = byId.get(lateId);
    assert.strictEqual(lateRow.activeDays, 0);
    assert.deepStrictEqual(lateRow.daily, [], '没上报过的成员 daily 为空数组');
    assert.strictEqual(lateRow.currentProject, null);
    assert.strictEqual(lateRow.lastActiveDate, null, '没上报过的成员 lastActiveDate 必须是 null 而不是 0');
    ok('members 逐人聚合，未上报的成员也在表里');

    const proj = new Map<string, any>(s.projects.map((r: any) => [r.projectKey, r]));
    assert.deepStrictEqual(proj.get('aaa'), {
        projectKey: 'aaa',
        label: 'AAA 项目',
        minutes: 90,
        members: 2,
        aiTurns: 5,
    });
    assert.strictEqual(proj.get('bbb').members, 1);
    assert.strictEqual(proj.get('ccc').minutes, 30);
    assert.strictEqual(s.projects[0].projectKey, 'aaa', '项目按投入时长倒序');
    ok('projects 按 projectKey 跨成员聚合（同一案件在两台机器上聚成一行）');

    // 别名优先于上报带来的项目名
    await read(
        await aliasRoute.PUT(
            jreq('/api/account/team/projects/aaa/alias', keys.owner, 'PUT', { label: '张三诉李四' }),
            p({ projectKey: 'aaa' })
        ),
        200,
        '设别名'
    );
    const s2 = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=30', keys.owner)),
        200,
        '设别名后'
    );
    assert.strictEqual(s2.range, 30);
    assert.strictEqual(
        s2.projects.find((r: any) => r.projectKey === 'aaa').label,
        '张三诉李四',
        '管理者起的别名要盖过上报带来的项目名'
    );
    assert.deepStrictEqual(
        s2.members.find((m: any) => m.accountId === ids.admin).currentProject,
        { projectKey: 'aaa', label: '张三诉李四' },
        '「正在处理」同样以别名为准'
    );
    ok('PUT alias → 别名优先于上报的项目名（projects 与 members.currentProject 一致）');

    const s3 = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=abc', keys.owner)),
        200,
        '非法 range'
    );
    assert.strictEqual(s3.range, 7, '非法 range 回落到 7');
    ok('range 非法 → 回落 7（不报错，面板不至于空着）');
}

// ===========================================================================
console.log('\n[6] MEMBER 只看自己');
// ===========================================================================
{
    const s = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=7', keys.member)),
        200,
        'MEMBER summary'
    );
    assert.strictEqual(s.members.length, 1, 'MEMBER 的成员表只含自己');
    assert.strictEqual(s.members[0].accountId, ids.member);
    assert.deepStrictEqual(
        s.projects.map((r: any) => r.projectKey),
        ['ccc'],
        'MEMBER 的项目表只含自己参与的'
    );
    // kpi/daily 是全队合计（设计稿 §6 只把 members/projects 收窄到本人）
    assert.strictEqual(s.kpi.aiTurns, 10, 'kpi 仍是全队合计');
    ok('MEMBER：members/projects 只含自己，kpi/daily 仍是全队合计');

    const view = await read(
        await teamRoute.GET(req('/api/account/team', keys.member)),
        200,
        'MEMBER GET /team'
    );
    assert.strictEqual(view.members.length, 4, '成员名册对全队可见');
    assert.deepStrictEqual(view.pendingInvites, [], 'MEMBER 看不到待接受邀请');
    ok('MEMBER：看得到成员名册，看不到邀请列表');

    await expectErr(
        await aliasRoute.PUT(
            jreq('/api/account/team/projects/aaa/alias', keys.member, 'PUT', { label: '乱改' }),
            p({ projectKey: 'aaa' })
        ),
        403,
        'forbidden',
        'MEMBER 设别名'
    );
    await expectErr(
        await teamRoute.PATCH(jreq('/api/account/team', keys.member, 'PATCH', { name: '改名' })),
        403,
        'forbidden',
        'MEMBER 改团队'
    );
    await expectErr(
        await invitesRoute.POST(
            jreq('/api/account/team/invites', keys.member, 'POST', {
                ...identBody(ident.stranger),
                role: 'MEMBER',
            })
        ),
        403,
        'forbidden',
        'MEMBER 邀请'
    );
    ok('MEMBER：改团队/邀请/设别名一律 403');
}

// ===========================================================================
console.log('\n[7] 角色规则');
// ===========================================================================
const patchRole = async (key: string, target: string, role: string) =>
    memberRoute.PATCH(
        jreq(`/api/account/team/members/${target}`, key, 'PATCH', { role }),
        p({ accountId: target })
    );
{
    const promoted = await read(await patchRole(keys.owner, ids.admin, 'ADMIN'), 200, 'OWNER 提 ADMIN');
    assert.strictEqual(promoted.member.role, 'ADMIN');
    ok('OWNER 可以把 MEMBER 提成 ADMIN');

    await expectErr(
        await patchRole(keys.admin, ids.owner, 'MEMBER'),
        403,
        'forbidden',
        'ADMIN 改 OWNER'
    );
    ok('ADMIN 改 OWNER → 403');

    // ADMIN 只能动当前是 MEMBER 的人：提得动，提完就动不了了
    await read(await patchRole(keys.admin, ids.member, 'ADMIN'), 200, 'ADMIN 提 MEMBER');
    await expectErr(
        await patchRole(keys.admin, ids.member, 'MEMBER'),
        403,
        'forbidden',
        'ADMIN 降 ADMIN'
    );
    ok('ADMIN 只能动 MEMBER：能提，不能再降（收权只有 OWNER 说了算）');

    await read(await patchRole(keys.owner, ids.member, 'MEMBER'), 200, 'OWNER 降回');
    ok('OWNER 可以降 ADMIN 回 MEMBER');

    await expectErr(
        await patchRole(keys.member, ids.admin, 'MEMBER'),
        403,
        'forbidden',
        'MEMBER 改角色'
    );
    await expectErr(await patchRole(keys.owner, ids.owner, 'MEMBER'), 403, 'forbidden', 'OWNER 自降');
    await expectErr(await patchRole(keys.owner, ids.admin, 'OWNER'), 400, 'bad_role', '提成 OWNER');
    await expectErr(
        await patchRole(keys.owner, crypto.randomUUID(), 'MEMBER'),
        404,
        'member_not_found',
        '改不在队里的人'
    );
    await expectErr(
        await patchRole(keys.owner, ids.outsider, 'MEMBER'),
        404,
        'member_not_found',
        '改别队的人'
    );
    ok('MEMBER 改角色 403 / OWNER 不可被降 403 / 提成 OWNER 400 / 队外人 404');
}

// ===========================================================================
console.log('\n[7b] 职务（迁移 46）');
// ===========================================================================
const patchMember = async (key: string, target: string, body: Record<string, unknown>) =>
    memberRoute.PATCH(
        jreq(`/api/account/team/members/${target}`, key, 'PATCH', body),
        p({ accountId: target })
    );
{
    const r1 = await read(await patchMember(keys.owner, ids.owner, { title: '  合伙人 ' }), 200, 'OWNER 给自己设职务');
    assert.strictEqual(r1.member.title, '合伙人', '职务两端空白要去掉');
    assert.strictEqual(r1.member.role, 'OWNER', '只改职务不动角色');
    const r2 = await read(await patchMember(keys.admin, ids.owner, { title: '主任' }), 200, 'ADMIN 改 OWNER 职务');
    assert.strictEqual(r2.member.title, '主任');
    ok('OWNER/ADMIN 可以给任何人（含 OWNER）设职务——职务不是权限');

    // 同时带 title 与 role：角色那步被拒时职务不能已经改掉（同一事务）
    await expectErr(
        await patchMember(keys.admin, ids.owner, { title: '半截修改', role: 'MEMBER' }),
        403,
        'forbidden',
        'ADMIN 同时改 OWNER 的职务与角色'
    );
    const afterReject = await read(await teamRoute.GET(req('/api/account/team', keys.owner)), 200, 'GET /team');
    assert.strictEqual(afterReject.members.find((m: any) => m.accountId === ids.owner).title, '主任', '被拒的请求不得留下半截职务修改');
    ok('title+role 同传、角色被拒 → 整体回滚，职务不变');

    await expectErr(await patchMember(keys.member, ids.member, { title: '合伙人' }), 403, 'forbidden', 'MEMBER 自封职务');
    await expectErr(await patchMember(keys.owner, ids.member, { title: '律'.repeat(31) }), 400, 'bad_title', '职务超长');
    await expectErr(await patchMember(keys.owner, ids.member, { title: 42 }), 400, 'bad_title', '职务非字符串');
    await expectErr(await patchMember(keys.owner, ids.member, {}), 400, 'bad_request', '空 PATCH');
    ok('MEMBER 设职务 403 / 超长或非字符串 400 bad_title / 空 PATCH 400');

    const both = await read(
        await patchMember(keys.owner, ids.member, { title: '律师助理', role: 'MEMBER' }),
        200,
        '同时改职务与角色'
    );
    assert.strictEqual(both.member.title, '律师助理', '同传时返回的成员行带新职务');
    const view = await read(await teamRoute.GET(req('/api/account/team', keys.member)), 200, 'GET /team');
    assert.strictEqual(view.members.find((m: any) => m.accountId === ids.member).title, '律师助理');
    const s = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=7', keys.owner)),
        200,
        'summary 带职务'
    );
    assert.strictEqual(s.members.find((m: any) => m.accountId === ids.owner).title, '主任');
    ok('职务出现在 GET /team 名册与 summary.members');

    const cleared = await read(await patchMember(keys.owner, ids.owner, { title: '' }), 200, '清除职务');
    assert.strictEqual(cleared.member.title, null, '空串 = 清除');
    ok('title 传空串 → 清除为 null');
}

// ===========================================================================
console.log('\n[8] 移除与退出');
// ===========================================================================
const del = async (key: string, target: string) =>
    memberRoute.DELETE(
        req(`/api/account/team/members/${target}`, key, { method: 'DELETE' }),
        p({ accountId: target })
    );
{
    await expectErr(await del(keys.owner, ids.owner), 403, 'owner_cannot_leave', 'OWNER 退出');
    ok('OWNER 退出 → 403 owner_cannot_leave');

    await expectErr(await del(keys.member, ids.admin), 403, 'forbidden', 'MEMBER 移除别人');
    ok('MEMBER 移除他人 → 403');

    await read(await del(keys.member, ids.member), 200, 'MEMBER 自己退出');
    const after = await read(
        await teamRoute.GET(req('/api/account/team', keys.owner)),
        200,
        '退出后名册'
    );
    assert.strictEqual(after.members.length, 3);
    ok('MEMBER 本人退出 → 成功');

    // 退队的人的历史数据不删：那几天的产出仍然是团队当期的
    const s = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=7', keys.owner)),
        200,
        '退队后 summary'
    );
    assert.strictEqual(s.kpi.aiTurns, 10, '退队不该让历史 KPI 缩水');
    assert.strictEqual(s.kpi.memberCount, 3);
    assert.strictEqual(s.members.length, 3, '成员表只列在队的人');
    ok('退队后历史数据保留，成员表只列在队的人');

    await read(await del(keys.owner, lateId), 200, 'OWNER 移除 MEMBER');
    await expectErr(await del(keys.admin, ids.owner), 403, 'forbidden', 'ADMIN 移除 OWNER');
    ok('OWNER 可移除成员；ADMIN 移不动 OWNER');
}

// ===========================================================================
console.log('\n[9] 上报 body 上限与限流');
// ===========================================================================
{
    const { USAGE_RATE_LIMIT_PER_MINUTE } = await import('@/lib/team');
    const big = { date: D0, junk: 'x'.repeat(70 * 1024) };
    await expectErr(await postUsage(keys.outsider, big), 413, 'payload_too_large', '超 64KB');
    ok('body > 64KB → 413 payload_too_large');

    // 同一 accountId 每分钟 USAGE_RATE_LIMIT_PER_MINUTE 次（上面那次 413 已经占掉 1 个）
    let limited = 0;
    for (let i = 0; i < USAGE_RATE_LIMIT_PER_MINUTE + 2; i++) {
        const res = await postUsage(keys.outsider, { date: D0, aiTurns: 1 });
        if (res.status === 429) limited++;
    }
    assert.ok(
        limited >= 2,
        `每分钟第 ${USAGE_RATE_LIMIT_PER_MINUTE + 1} 次起必须被限流，实际被限 ${limited} 次`
    );
    ok(`同 accountId 每分钟 ≤ ${USAGE_RATE_LIMIT_PER_MINUTE} 次 → 超出被 429（本轮被限 ${limited} 次）`);
}

// ===========================================================================
console.log('\n[10] 团队邀请码');
// ===========================================================================
let teamCode = '';
{
    const view = await read(
        await teamRoute.GET(req('/api/account/team', keys.owner)),
        200,
        'OWNER 看邀请码'
    );
    teamCode = view.joinCode;
    assert.match(teamCode, /^[23456789A-HJ-NP-Z]{8}$/, `邀请码必须是 8 位去混淆大写码，实际 ${teamCode}`);
    ok(`OWNER 拿得到 8 位团队邀请码（${teamCode}）`);

    const adminView = await read(
        await teamRoute.GET(req('/api/account/team', keys.admin)),
        200,
        'ADMIN 看邀请码'
    );
    assert.strictEqual(adminView.joinCode, teamCode, 'ADMIN 也是管理者，看得到同一个码');
    ok('ADMIN 也能看到邀请码');

    // 无账号本体：哪怕码是对的也进不来，这道闸排在「码对不对」之前
    await expectErr(
        await joinRoute.POST(jreq('/api/account/team/join', keys.unbound, 'POST', { code: teamCode })),
        403,
        errRequired,
        '无账号本体用码加入'
    );
    ok(`无账号本体凭码加入 → 403 ${errRequired}（排在码校验之前）`);

    // 用「此刻没有团队」的账号试错码：joinByCode 有意先判「我已经有队了」再判码，
    // 已有团队的人试码只会拿到 409，测不出 bad_code 这条。
    await expectErr(
        await joinRoute.POST(jreq('/api/account/team/join', keys.member, 'POST', { code: 'AAAAAAAA' })),
        404,
        'bad_code',
        '错码加入'
    );
    await expectErr(
        await joinRoute.POST(jreq('/api/account/team/join', keys.member, 'POST', { code: 'abc' })),
        404,
        'bad_code',
        '长度不对的码'
    );
    ok('错码 / 长度不对 → 404 bad_code');

    await expectErr(
        await joinRoute.POST(jreq('/api/account/team/join', keys.outsider, 'POST', { code: 'AAAAAAAA' })),
        409,
        'already_in_team',
        '已有团队者试错码'
    );
    ok('已有团队者试码 → 一律 409，不泄露码存不存在');

    await expectErr(
        await joinRoute.POST(jreq('/api/account/team/join', keys.owner, 'POST', { code: teamCode })),
        409,
        'already_in_team',
        '已有团队者用码加入'
    );
    ok('已有团队者用码加入 → 409 already_in_team');

    // 大小写与空格都规范化掉：这个码是要被人抄在纸上、念在电话里的
    const joined = await read(
        await joinRoute.POST(
            jreq('/api/account/team/join', keys.member, 'POST', { code: ` ${teamCode.toLowerCase()} ` })
        ),
        200,
        '按码加入'
    );
    assert.strictEqual(joined.team.id, teamId);
    const memberView = await read(
        await teamRoute.GET(req('/api/account/team', keys.member)),
        200,
        'MEMBER 视角'
    );
    assert.strictEqual(memberView.myRole, 'MEMBER', '凭码加入一律是 MEMBER');
    assert.strictEqual(memberView.joinCode, undefined, 'MEMBER 不该看得到邀请码');
    ok('按码加入（大小写/空格规范化）→ 角色 MEMBER，且看不到邀请码');

    await expectErr(
        await joinCodeRoute.POST(req('/api/account/team/join-code/regenerate', keys.member, { method: 'POST' })),
        403,
        'forbidden',
        'MEMBER 重置邀请码'
    );
    ok('MEMBER 重置邀请码 → 403');

    const regen = await read(
        await joinCodeRoute.POST(req('/api/account/team/join-code/regenerate', keys.owner, { method: 'POST' })),
        200,
        '重置邀请码'
    );
    assert.notStrictEqual(regen.joinCode, teamCode, '重置后必须换一个码');
    await expectErr(
        await joinRoute.POST(jreq('/api/account/team/join', lateKey, 'POST', { code: teamCode })),
        404,
        'bad_code',
        '旧码'
    );
    teamCode = regen.joinCode;
    ok('重置后旧码立即失效');
}

// ===========================================================================
console.log('\n[11] 律所：创建 / 并入 / 改名 / 退出');
// ===========================================================================
let firmCode = '';
let subTeamId = '';
{
    // 子团队：另一个账号自己的队。用 nophone 而不是 outsider——outsider 的上报
    // 限流桶在 [9] 里已经打满，拿它做 usage 会被 429。
    // nophone 的账号本体在 [2] 之后是就位的（cn 补绑手机号 / intl 建号即带邮箱），
    // 这次建队成功也顺带证明了「无本体 403，本体就位后可以正常建队」。
    const subTeam = await read(
        await teamRoute.POST(jreq('/api/account/team', keys.nophone, 'POST', { name: '分所团队' })),
        200,
        '建子团队'
    );
    subTeamId = subTeam.team.id;
    assert.strictEqual(subTeam.team.firmId, null, '新建团队默认不属于任何律所');
    ok('新建团队 firmId 默认 null');

    await expectErr(
        await firmRoute.POST(jreq('/api/account/team/firm', keys.admin, 'POST', { name: '某某律所' })),
        403,
        'forbidden',
        'ADMIN 建律所'
    );
    ok('ADMIN 建律所 → 403（改团队归属只有 OWNER 能做）');

    const firm = await read(
        await firmRoute.POST(jreq('/api/account/team/firm', keys.owner, 'POST', { name: '某某律师事务所' })),
        200,
        '建律所'
    );
    assert.strictEqual(firm.firm.headTeamId, teamId, '建所的团队就是总部团队');
    ok('团队 OWNER 建律所 → 本队成为总部团队');

    await expectErr(
        await firmRoute.POST(jreq('/api/account/team/firm', keys.owner, 'POST', { name: '第二家所' })),
        409,
        'already_in_firm',
        '已入所再建所'
    );
    ok('已入所再建所 → 409 already_in_firm');

    const headView = await read(
        await teamRoute.GET(req('/api/account/team', keys.owner)),
        200,
        '总部 OWNER 视角'
    );
    assert.strictEqual(headView.firm.isHead, true);
    assert.strictEqual(headView.firm.name, '某某律师事务所');
    assert.strictEqual(headView.firm.teams.length, 1);
    assert.strictEqual(headView.firm.teams[0].id, teamId);
    assert.strictEqual(headView.firm.teams[0].isHead, true);
    assert.strictEqual(headView.firm.teams[0].memberCount, 3, '总部团队此刻 3 个人');
    firmCode = headView.firm.joinCode;
    assert.match(firmCode, /^[23456789A-HJ-NP-Z]{8}$/, '律所邀请码同样是 8 位去混淆大写码');
    ok('GET /team 的 firm：isHead / teams[] / 律所邀请码（总部 OWNER 可见）');

    const memberFirmView = await read(
        await teamRoute.GET(req('/api/account/team', keys.member)),
        200,
        '总部 MEMBER 视角'
    );
    assert.strictEqual(memberFirmView.firm.joinCode, undefined, 'MEMBER 看不到律所邀请码');
    assert.strictEqual(memberFirmView.firm.teams.length, 1, '所内团队列表对全所可见');
    ok('MEMBER 看得到律所与团队列表，看不到律所邀请码');

    await expectErr(
        await firmJoinRoute.POST(
            jreq('/api/account/team/firm/join', keys.nophone, 'POST', { code: 'ZZZZZZZZ' })
        ),
        404,
        'bad_code',
        '错的律所码'
    );
    ok('错的律所邀请码 → 404 bad_code');

    const joinedFirm = await read(
        await firmJoinRoute.POST(
            jreq('/api/account/team/firm/join', keys.nophone, 'POST', { code: firmCode })
        ),
        200,
        '并入律所'
    );
    assert.strictEqual(joinedFirm.firm.headTeamId, teamId);
    const subView = await read(
        await teamRoute.GET(req('/api/account/team', keys.nophone)),
        200,
        '子团队视角'
    );
    assert.strictEqual(subView.firm.isHead, false);
    assert.strictEqual(subView.firm.joinCode, undefined, '子团队的 OWNER 也不该拿到律所邀请码');
    assert.strictEqual(subView.firm.teams.length, 2);
    assert.strictEqual(subView.firm.teams[0].isHead, true, '总部排在最前');
    ok('团队 OWNER 凭码并入律所 → teams[] 两个队，子团队拿不到律所码');

    await expectErr(
        await firmRoute.PATCH(jreq('/api/account/team/firm', keys.nophone, 'PATCH', { name: '改名试试' })),
        403,
        'forbidden',
        '子团队 OWNER 改所名'
    );
    ok('子团队 OWNER 改所名 → 403（律所的事只有总部说了算）');

    const renamed = await read(
        await firmRoute.PATCH(jreq('/api/account/team/firm', keys.admin, 'PATCH', { name: '某某（上海）律师事务所' })),
        200,
        '总部 ADMIN 改所名'
    );
    assert.strictEqual(renamed.firm.name, '某某（上海）律师事务所');
    ok('总部 ADMIN 可改所名');

    await expectErr(
        await firmCodeRoute.POST(
            req('/api/account/team/firm/join-code/regenerate', keys.nophone, { method: 'POST' })
        ),
        403,
        'forbidden',
        '子团队重置律所码'
    );
    const firmRegen = await read(
        await firmCodeRoute.POST(
            req('/api/account/team/firm/join-code/regenerate', keys.owner, { method: 'POST' })
        ),
        200,
        '总部重置律所码'
    );
    assert.notStrictEqual(firmRegen.joinCode, firmCode);
    firmCode = firmRegen.joinCode;
    ok('律所邀请码：子团队重置不了，总部重置后换码');
}

// ===========================================================================
console.log('\n[12] 退出律所与「总部不可退」');
// ===========================================================================
const leaveFirm = async (key: string, target: string) =>
    firmTeamRoute.DELETE(
        req(`/api/account/team/firm/teams/${target}`, key, { method: 'DELETE' }),
        p({ teamId: target })
    );
{
    await expectErr(await leaveFirm(keys.owner, teamId), 403, 'head_cannot_leave', '总部退出');
    await expectErr(await leaveFirm(keys.nophone, teamId), 403, 'head_cannot_leave', '子团队踢总部');
    ok('总部团队不可退出、也踢不掉 → 403 head_cannot_leave');

    await expectErr(await leaveFirm(keys.member, subTeamId), 403, 'forbidden', 'MEMBER 移团队');
    ok('总部的 MEMBER 移不动团队 → 403');

    await read(await leaveFirm(keys.nophone, subTeamId), 200, '子团队 OWNER 自退');
    const afterLeave = await read(
        await teamRoute.GET(req('/api/account/team', keys.nophone)),
        200,
        '退所后'
    );
    assert.strictEqual(afterLeave.firm, null, '退所后 firm 必须回 null');
    assert.strictEqual(afterLeave.team.firmId, null);
    ok('子团队 OWNER 可自行退出律所');

    // 再并回来，后面的 firm scope 统计要两个队
    await read(
        await firmJoinRoute.POST(
            jreq('/api/account/team/firm/join', keys.nophone, 'POST', { code: firmCode })
        ),
        200,
        '重新并入'
    );
    ok('重置后的律所码可用（重新并入）');
}

// ===========================================================================
console.log('\n[13] summary 的 scope=firm 三种视角');
// ===========================================================================
{
    const sum = async (key: string, query: string) =>
        read(
            await summaryRoute.GET(req(`/api/account/team/summary?${query}`, key)),
            200,
            `summary ${query}`
        );

    // 子团队出一天数据
    await read(
        await usageRoute.POST(
            jreq('/api/account/team/usage', keys.nophone, 'POST', {
                date: D0,
                aiTurns: 7,
                activeMinutes: 60,
                appStarts: 1,
                projectsCreated: 1,
                projects: [{ projectKey: 'subkey', minutes: 60, aiTurns: 7 }],
            })
        ),
        200,
        '子团队上报'
    );

    const teamScope = await sum(keys.owner, 'range=7&scope=team');
    assert.strictEqual(teamScope.scope, 'team');
    assert.strictEqual(teamScope.teams, undefined, 'scope=team 不该带 teams[]');
    assert.strictEqual(teamScope.kpi.memberCount, 3, '本团队 3 个人');

    const firmScope = await sum(keys.owner, 'range=7&scope=firm');
    assert.strictEqual(firmScope.scope, 'firm');
    assert.strictEqual(
        firmScope.kpi.aiTurns,
        teamScope.kpi.aiTurns + 7,
        '全所 KPI = 本团队 + 子团队'
    );
    assert.strictEqual(firmScope.kpi.memberCount, 4, '全所人数 = 3 + 1');
    assert.strictEqual(firmScope.members.length, 4, '总部管理者看得到全所成员明细');
    assert.ok(
        firmScope.projects.some((x: any) => x.projectKey === 'subkey'),
        '总部管理者看得到子团队的项目'
    );
    assert.strictEqual(firmScope.teams.length, 2, '总部管理者拿得到 teams[]');
    const sub = firmScope.teams.find((x: any) => x.teamId === subTeamId);
    assert.strictEqual(sub.id, subTeamId, 'teams[] 带 id（桌面端按 id 键行）');
    assert.strictEqual(sub.isHead, false);
    assert.strictEqual(sub.aiTurns, 7);
    assert.strictEqual(sub.memberCount, 1, 'teams[] 带在册人数（桌面端「各团队」表读 memberCount）');
    const headRow = firmScope.teams.find((x: any) => x.teamId !== subTeamId);
    assert.strictEqual(headRow.memberCount, 3, '总部团队在册 3 人');
    assert.strictEqual(sub.activeMinutes, 60);
    assert.strictEqual(sub.activeMembers, 1);
    assert.strictEqual(sub.projectsCreated, 1);
    ok('总部 OWNER + scope=firm → 全所 KPI/成员/项目 + 按团队合计 teams[]');

    const subManager = await sum(keys.nophone, 'range=7&scope=firm');
    assert.strictEqual(subManager.kpi.aiTurns, firmScope.kpi.aiTurns, '子团队管理者也拿全所 KPI 合计');
    assert.strictEqual(subManager.members.length, 1, '但成员明细只有本团队');
    assert.strictEqual(subManager.projects.length, 1, '项目明细也只有本团队');
    assert.strictEqual(subManager.projects[0].projectKey, 'subkey');
    assert.strictEqual(subManager.teams, undefined, '子团队管理者没有 teams[]');
    ok('子团队 OWNER + scope=firm → 全所 KPI 合计 + 只有本团队明细');

    const memberScope = await sum(keys.member, 'range=7&scope=firm');
    assert.strictEqual(memberScope.kpi.aiTurns, firmScope.kpi.aiTurns, 'MEMBER 也拿全所 KPI 合计');
    assert.strictEqual(memberScope.members.length, 1, 'MEMBER 只看得到自己');
    assert.strictEqual(memberScope.members[0].accountId, ids.member);
    assert.strictEqual(memberScope.teams, undefined, 'MEMBER 没有 teams[]');
    ok('MEMBER + scope=firm → 全所 KPI 合计 + 只有自己');

    // 没入所的团队要不到全所口径
    await read(
        await teamRoute.POST(jreq('/api/account/team', lateKey, 'POST', { name: '孤零零团队' })),
        200,
        '建无所团队'
    );
    await expectErr(
        await summaryRoute.GET(req('/api/account/team/summary?range=7&scope=firm', lateKey)),
        404,
        'no_firm',
        '未入所要全所口径'
    );
    ok('未入所的团队请求 scope=firm → 404 no_firm');

    const bogus = await sum(keys.owner, 'range=7&scope=whatever');
    assert.strictEqual(bogus.scope, 'team', '非法 scope 回落到 team');
    ok('非法 scope → 回落 team（展示选项不报错）');
}

// ===========================================================================
console.log('\n[14] Cookie 会话与 Bearer 同样能进');
// ===========================================================================
{
    const { createSession } = await import('@/lib/sessions');
    const { token } = createSession(ids.owner);
    const cookieReq = (url: string) => req(url, undefined, { headers: { cookie: `awd_session=${token}` } });

    const view = await read(await teamRoute.GET(cookieReq('/api/account/team')), 200, 'Cookie GET /team');
    assert.strictEqual(view.myAccountId, ids.owner, 'Cookie 会话必须解析成会话本人');
    assert.strictEqual(view.joinCode, teamCode, '账户页也要拿得到邀请码');
    ok('awd_session Cookie → GET /api/account/team 通过');

    const s = await read(
        await summaryRoute.GET(cookieReq('/api/account/team/summary?range=7&scope=firm')),
        200,
        'Cookie summary'
    );
    assert.strictEqual(s.scope, 'firm');
    ok('awd_session Cookie → GET /summary?scope=firm 通过');

    // Bearer 优先：同一个请求里两种凭据都在时，以 Bearer 为准
    const both = await read(
        await teamRoute.GET(
            req('/api/account/team', keys.nophone, { headers: { cookie: `awd_session=${token}` } })
        ),
        200,
        'Bearer + Cookie'
    );
    assert.strictEqual(both.myAccountId, ids.nophone, 'Bearer 必须压过 Cookie');
    ok('Bearer 与 Cookie 同时在场 → 以 Bearer 为准');

    await expectErr(
        await teamRoute.GET(req('/api/account/team', undefined, { headers: { cookie: 'awd_session=deadbeef' } })),
        401,
        'unauthorized',
        '假 Cookie'
    );
    ok('无效 Cookie → 401 unauthorized');
}

// ===========================================================================
console.log('\n[15] 总部移除子团队');
// ===========================================================================
{
    // 放在最后：把子团队摘出去之后，上面那些 firm scope 的口径就不成立了
    await read(await leaveFirm(keys.owner, subTeamId), 200, '总部移除子团队');
    const after = await read(
        await teamRoute.GET(req('/api/account/team', keys.nophone)),
        200,
        '被移除后'
    );
    assert.strictEqual(after.firm, null, '被移出后 firm 回 null');
    const head = await read(
        await teamRoute.GET(req('/api/account/team', keys.owner)),
        200,
        '总部视角'
    );
    assert.strictEqual(head.firm.teams.length, 1, '所里只剩总部团队');
    // 移出不删使用数据：那几天的产出仍然发生过（与退队同一口径）
    const s2 = await read(
        await summaryRoute.GET(req('/api/account/team/summary?range=7&scope=firm', keys.owner)),
        200,
        '移除后全所 summary'
    );
    assert.strictEqual(s2.kpi.memberCount, 3, '全所只剩总部团队的 3 个人');
    ok('总部 OWNER/ADMIN 可把子团队移出律所');
}

console.log(`\n全部通过：${passed} 项`);
