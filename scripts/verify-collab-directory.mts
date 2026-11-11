/**
 * 协作加人名录内部口验证脚本（dev-board#550 #551，设计稿 §4）。
 *
 * 与 verify-team.mts 同一套路：直接调 route handler，不起 next 服务；
 * 团队 / 律所是调真的团队路由建出来的，不手写 SQL——归属判定的口径必须与
 * 用户真实走过的那条路一致。
 *
 * 覆盖：未配置 404、错密钥 404、两个定位键同时给 400、一个都不给 400、
 * 手机号命中、邮箱命中、无效手机号 found:false、注销用户 found:false、
 * requester 无团队 / 查无此人 → requester 归属为空、同团队、同律所不同团队、
 * `candidateAccountId` 路径，以及响应里绝不出现邮箱 / 口令哈希 / 团队名 / 律所名。
 *
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   npm run test:collab-directory
 * 或手工：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-collab-directory.mts
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
    boss: crypto.randomUUID(),
    junior: crypto.randomUUID(),
    branch: crypto.randomUUID(),
    loner: crypto.randomUUID(),
    mailer: crypto.randomUUID(),
    unverified: crypto.randomUUID(),
    ghost: crypto.randomUUID(),
};
const phones = {
    boss: '13900000001',
    junior: '13900000002',
    branch: '13900000003',
    loner: '13900000004',
    ghost: '13900000009',
};
const TEAM_NAME = '名录测试团队';
const SUB_TEAM_NAME = '名录测试分队';
const FIRM_NAME = '名录测试律师事务所';
const emails = {
    // 建队的四个人两样都带：建队门槛是**账号本体**，大陆站看手机号、国际站看邮箱
    // （dev-board#778）。本脚本两站各跑一遍，只种手机号的话国际站会卡在
    // 403 email_required 上——那不是名录的问题，是种子数据没跟上。
    boss: 'collab-boss@test.local',
    junior: 'collab-junior@test.local',
    branch: 'collab-branch@test.local',
    loner: 'collab-loner@test.local',
    mailer: 'collab-mailer@test.local',
    unverified: 'collab-unverified@test.local',
    ghost: 'collab-ghost@test.local',
};
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify([
        { id: ids.boss, username: 'cd-boss', email: emails.boss, emailVerifiedAt: createdAt, passwordHash: '', phone: phones.boss, displayName: '所长', createdAt },
        { id: ids.junior, username: 'cd-junior', email: emails.junior, emailVerifiedAt: createdAt, passwordHash: '', phone: phones.junior, displayName: '律师甲', createdAt },
        { id: ids.branch, username: 'cd-branch', email: emails.branch, emailVerifiedAt: createdAt, passwordHash: '', phone: phones.branch, displayName: '分所主任', createdAt },
        { id: ids.loner, username: 'cd-loner', email: emails.loner, emailVerifiedAt: createdAt, passwordHash: '', phone: phones.loner, displayName: '独行者', createdAt },
        // 邮箱账号：没有手机号，所以 account.phone 必须回 null（案件库靠这个判断能不能认领号码）
        { id: ids.mailer, username: 'cd-mailer', email: emails.mailer, passwordHash: 'x:y', displayName: '邮箱用户', createdAt, emailVerifiedAt: createdAt },
        // 密码注册、从没用邮箱码登录过：地址没人证明过收得到，按邮箱查必须当不存在。
        { id: ids.unverified, username: 'cd-unverified', email: emails.unverified, passwordHash: 'x:y', displayName: '未验证邮箱', createdAt },
        // 墓碑行：**故意保留 phone / email**。真实注销会把两者抹掉，这里留着才能证明
        // 「查不到」是 isDeletedUser 挡的，而不是碰巧字段空了。
        {
            id: ids.ghost,
            username: 'cd-ghost',
            email: emails.ghost,
            passwordHash: 'x:y',
            phone: phones.ghost,
            displayName: '已注销用户',
            createdAt,
            deletedAt: createdAt,
        },
    ])
);

const { generateApiKey } = await import('@/lib/api-keys');
const { NextRequest } = await import('next/server');

const teamRoute = await import('@/app/api/account/team/route');
const joinRoute = await import('@/app/api/account/team/join/route');
const firmRoute = await import('@/app/api/account/team/firm/route');
const firmJoinRoute = await import('@/app/api/account/team/firm/join/route');
const directoryRoute = await import('@/app/api/internal/collab-directory/route');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

const keys = {
    boss: generateApiKey(ids.boss).key!.plaintextKey,
    junior: generateApiKey(ids.junior).key!.plaintextKey,
    branch: generateApiKey(ids.branch).key!.plaintextKey,
};

const SECRET = 'collab-directory-test-secret';

/* eslint-disable @typescript-eslint/no-explicit-any */
const jreq = (url: string, key: string, body: unknown) =>
    new NextRequest(`http://localhost${url}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    });

/** 名录口请求。secret 传 null = 完全不带头。 */
const dreq = (body: unknown, secret: string | null = SECRET) =>
    new NextRequest('http://localhost/api/internal/collab-directory', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'content-type': 'application/json',
            ...(secret === null ? {} : { 'x-internal-secret': secret }),
        },
    });

async function read(res: Response, status: number, label: string): Promise<any> {
    const body = await res.json();
    assert.strictEqual(
        res.status,
        status,
        `${label}：期望 ${status}，实际 ${res.status} ${JSON.stringify(body)}`
    );
    return body;
}

/** 查一次名录，顺带每次都验一遍「不该回的字段一个都没回」。 */
async function lookup(body: unknown, label: string): Promise<any> {
    const res = await directoryRoute.POST(dreq(body));
    const parsed = await read(res, 200, label);
    assertNoLeak(parsed, label);
    return parsed;
}

/**
 * 泄露闸。逐字断言而不是「看起来对就行」：这条口子唯一的边界就是「回什么」，
 * 将来谁顺手把 user 整个对象塞进 account，这里必须红。
 */
function assertNoLeak(body: any, label: string) {
    const text = JSON.stringify(body);
    for (const forbidden of [
        emails.mailer,
        emails.ghost,
        'email',
        'passwordHash',
        'avatarUpdatedAt',
        'role',
        TEAM_NAME,
        SUB_TEAM_NAME,
        FIRM_NAME,
    ]) {
        assert.ok(!text.includes(forbidden), `${label}：响应里不该出现「${forbidden}」——${text}`);
    }
    if (body.found) {
        assert.deepStrictEqual(
            Object.keys(body).sort(),
            ['account', 'candidate', 'found', 'requester'],
            `${label}：found:true 的顶层键必须恰好是这四个`
        );
        assert.deepStrictEqual(
            Object.keys(body.account).sort(),
            ['accountId', 'displayName', 'phone', 'username'],
            `${label}：account 的键必须恰好是这四个`
        );
        assert.deepStrictEqual(Object.keys(body.candidate).sort(), ['firmAdmin', 'firmId', 'teamId']);
    } else {
        assert.deepStrictEqual(
            Object.keys(body).sort(),
            ['found', 'requester'],
            `${label}：found:false 只回 found 与 requester`
        );
    }
    assert.deepStrictEqual(Object.keys(body.requester).sort(), ['firmAdmin', 'firmId', 'teamId']);
}

const NO_ORG = { teamId: null, firmId: null, firmAdmin: false };

// ===========================================================================
console.log('\n[1] 鉴权：未配置 / 缺头 / 错密钥一律裸 404');
// ===========================================================================
{
    delete process.env.AWD_COLLAB_DIRECTORY_SECRET;
    const res = await directoryRoute.POST(dreq({ identifier: phones.junior }, 'anything'));
    assert.strictEqual(res.status, 404, '未配置 env 时必须 404');
    assert.strictEqual(await res.text(), '', '404 必须是空体（与路由不存在不可区分）');
    ok('env 未配置 → 裸 404 空体');

    process.env.AWD_COLLAB_DIRECTORY_SECRET = SECRET;

    const missing = await directoryRoute.POST(dreq({ identifier: phones.junior }, null));
    assert.strictEqual(missing.status, 404, '缺 X-Internal-Secret 头必须 404');
    assert.strictEqual(await missing.text(), '');
    ok('缺 X-Internal-Secret 头 → 裸 404 空体');

    const wrong = await directoryRoute.POST(dreq({ identifier: phones.junior }, SECRET + 'x'));
    assert.strictEqual(wrong.status, 404, '密钥不符必须 404');
    assert.strictEqual(await wrong.text(), '');
    ok('密钥不符 → 裸 404 空体');

    // 长度相同但内容不同：timingSafeEqual 的输入等长分支也要真的走一遍
    const sameLen = SECRET.slice(0, -1) + (SECRET.endsWith('x') ? 'y' : 'x');
    const near = await directoryRoute.POST(dreq({ identifier: phones.junior }, sameLen));
    assert.strictEqual(near.status, 404, '等长错密钥同样 404');
    ok('等长但不同的密钥 → 404');
}

// ===========================================================================
console.log('\n[2] 定位键必须恰好一个');
// ===========================================================================
{
    const both = await read(
        await directoryRoute.POST(
            dreq({ identifier: phones.junior, candidateAccountId: ids.junior })
        ),
        400,
        '两个定位键同时给'
    );
    assert.strictEqual(both.error, 'bad_request');
    ok('identifier + candidateAccountId 同时给 → 400 bad_request');

    const neither = await read(
        await directoryRoute.POST(dreq({ requesterAccountId: ids.boss })),
        400,
        '一个定位键都不给'
    );
    assert.strictEqual(neither.error, 'bad_request');
    ok('两个定位键都不给 → 400 bad_request');

    const blank = await read(
        await directoryRoute.POST(dreq({ identifier: '   ' })),
        400,
        '只给空白 identifier'
    );
    assert.strictEqual(blank.error, 'bad_request');
    ok('identifier 只有空白 → 400 bad_request（空白不算给了）');
}

// ===========================================================================
console.log('\n[3] requester 无归属：不是 404，是一对 null');
// ===========================================================================
{
    const noRequester = await lookup({ identifier: phones.junior }, 'requesterAccountId 缺省');
    assert.strictEqual(noRequester.found, true, '候选人存在就该找得到，与 requester 无关');
    assert.deepStrictEqual(noRequester.requester, NO_ORG, 'requester 缺省 → 归属为空');
    ok('requesterAccountId 缺省 → requester { teamId: null, firmId: null }，不是 404');

    const unknown = await lookup(
        { requesterAccountId: crypto.randomUUID(), identifier: phones.junior },
        'requesterAccountId 查无此人'
    );
    assert.deepStrictEqual(unknown.requester, NO_ORG, '查无此人的 requester 同样归属为空');
    ok('requesterAccountId 查无此人 → 归属为空，不是 404');

    const nullish = await lookup(
        { requesterAccountId: null, identifier: phones.junior },
        'requesterAccountId 传 null'
    );
    assert.deepStrictEqual(nullish.requester, NO_ORG);
    ok('requesterAccountId 传 null → 归属为空');
}

// ===========================================================================
console.log('\n[4] 手机号命中 / 邮箱命中 / 查不到');
// ===========================================================================
{
    const hit = await lookup(
        { requesterAccountId: ids.loner, identifier: ` ${phones.junior} ` },
        '手机号命中'
    );
    assert.strictEqual(hit.found, true);
    assert.strictEqual(hit.account.accountId, ids.junior);
    assert.strictEqual(hit.account.username, 'cd-junior');
    assert.strictEqual(hit.account.displayName, '律师甲');
    assert.strictEqual(hit.account.phone, phones.junior);
    ok('手机号命中（带空格也认，走 normalizePhone）→ account 四字段');

    const plus86 = await lookup({ identifier: `+86${phones.junior}` }, '+86 前缀');
    assert.strictEqual(plus86.account.accountId, ids.junior, '+86 前缀应当规范化成同一个号');
    ok('+86 前缀命中同一账户');

    const byMail = await lookup(
        { identifier: `  ${emails.mailer.toUpperCase()} ` },
        '邮箱命中'
    );
    assert.strictEqual(byMail.found, true);
    assert.strictEqual(byMail.account.accountId, ids.mailer);
    assert.strictEqual(byMail.account.phone, null, '没有手机号的账户必须回 null，不是 undefined/空串');
    assert.deepStrictEqual(byMail.candidate, NO_ORG, '邮箱用户没建队 → 候选归属为空');
    ok('邮箱命中（大写 + 空格走 normalizeEmail）→ phone 回 null');

    const missPhone = await lookup(
        { requesterAccountId: ids.boss, identifier: '13900000099' },
        '没人用过的号'
    );
    assert.strictEqual(missPhone.found, false);
    ok('没人用过的手机号 → found:false');

    const badPhone = await lookup({ identifier: '12345' }, '非法手机号');
    assert.strictEqual(badPhone.found, false, '非法号码是 found:false，不是 400');
    ok('非法手机号 → found:false（SmsError 被吃掉，不外泄成 500）');

    const badMail = await lookup({ identifier: 'not-an-email@' }, '非法邮箱');
    assert.strictEqual(badMail.found, false);
    ok('非法邮箱 → found:false（MailError 被吃掉）');

    const unverified = await lookup({ identifier: emails.unverified }, '未验证邮箱');
    assert.strictEqual(unverified.found, false, '密码注册、从未用邮箱码登录过的地址不能按邮箱命中');
    ok('未验证邮箱 → found:false（只认 emailVerifiedAt 有值的地址）');
}

// ===========================================================================
console.log('\n[5] 注销用户：三条路都查不到');
// ===========================================================================
{
    for (const [label, body] of [
        ['手机号', { identifier: phones.ghost }],
        ['邮箱', { identifier: emails.ghost }],
        ['accountId', { candidateAccountId: ids.ghost }],
    ] as const) {
        const res = await lookup(body, `注销用户按${label}查`);
        assert.strictEqual(res.found, false, `注销用户按${label}查必须 found:false`);
    }
    ok('注销用户按手机号 / 邮箱 / accountId 查 → 一律 found:false');
}

// ===========================================================================
console.log('\n[6] candidateAccountId 路径');
// ===========================================================================
{
    const byId = await lookup({ candidateAccountId: ids.junior }, 'candidateAccountId 命中');
    assert.strictEqual(byId.found, true);
    assert.strictEqual(byId.account.accountId, ids.junior);
    assert.strictEqual(byId.account.phone, phones.junior);
    ok('candidateAccountId 命中 → 与手机号路径同一份 account');

    const unknownId = await lookup(
        { candidateAccountId: crypto.randomUUID() },
        'candidateAccountId 查无'
    );
    assert.strictEqual(unknownId.found, false);
    ok('candidateAccountId 查无 → found:false');
}

// ===========================================================================
console.log('\n[7] 归属：无团队 / 同团队');
// ===========================================================================
let teamId = '';
{
    const before = await lookup(
        { requesterAccountId: ids.boss, candidateAccountId: ids.junior },
        '两边都还没建队'
    );
    assert.deepStrictEqual(before.requester, NO_ORG);
    assert.deepStrictEqual(before.candidate, NO_ORG);
    ok('都没建队 → requester 与 candidate 都是一对 null');

    const created = await read(
        await teamRoute.POST(jreq('/api/account/team', keys.boss, { name: TEAM_NAME })),
        200,
        '建队'
    );
    teamId = created.team.id;
    const view = await read(
        await teamRoute.GET(
            new NextRequest('http://localhost/api/account/team', {
                headers: { authorization: `Bearer ${keys.boss}` },
            })
        ),
        200,
        '取团队邀请码'
    );
    await read(
        await joinRoute.POST(jreq('/api/account/team/join', keys.junior, { code: view.joinCode })),
        200,
        '律师甲凭码入队'
    );

    const same = await lookup(
        { requesterAccountId: ids.boss, identifier: phones.junior },
        '同团队'
    );
    assert.strictEqual(same.requester.teamId, teamId);
    assert.strictEqual(same.candidate.teamId, teamId, '同队 → teamId 相同');
    assert.strictEqual(same.requester.firmId, null, '还没建律所 → firmId 仍为 null');
    assert.strictEqual(same.candidate.firmId, null);
    ok('同一团队 → 双方 teamId 相同、firmId 均为 null');

    const outsider = await lookup(
        { requesterAccountId: ids.boss, identifier: phones.loner },
        '候选人没有团队'
    );
    assert.strictEqual(outsider.requester.teamId, teamId);
    assert.deepStrictEqual(outsider.candidate, NO_ORG, '候选人没建队 → 归属为空');
    ok('requester 有队、候选人没队 → candidate 一对 null');

    const requesterNoTeam = await lookup(
        { requesterAccountId: ids.loner, identifier: phones.junior },
        'requester 没有团队'
    );
    assert.deepStrictEqual(requesterNoTeam.requester, NO_ORG);
    assert.strictEqual(requesterNoTeam.candidate.teamId, teamId);
    ok('requester 没队、候选人有队 → requester 一对 null，candidate 照回');
}

// ===========================================================================
console.log('\n[8] 归属：同律所不同团队');
// ===========================================================================
{
    await read(
        await teamRoute.POST(jreq('/api/account/team', keys.branch, { name: SUB_TEAM_NAME })),
        200,
        '建分队'
    );
    await read(
        await firmRoute.POST(jreq('/api/account/team/firm', keys.boss, { name: FIRM_NAME })),
        200,
        '建律所'
    );
    const headView = await read(
        await teamRoute.GET(
            new NextRequest('http://localhost/api/account/team', {
                headers: { authorization: `Bearer ${keys.boss}` },
            })
        ),
        200,
        '取律所邀请码'
    );
    await read(
        await firmJoinRoute.POST(
            jreq('/api/account/team/firm/join', keys.branch, { code: headView.firm.joinCode })
        ),
        200,
        '分队并入律所'
    );

    const cross = await lookup(
        { requesterAccountId: ids.boss, identifier: phones.branch },
        '同律所不同团队'
    );
    assert.strictEqual(cross.found, true);
    assert.notStrictEqual(
        cross.requester.teamId,
        cross.candidate.teamId,
        '同律所不同团队：teamId 必须不同，否则这条用例什么也没测'
    );
    assert.ok(cross.requester.firmId, '总部团队入所后 firmId 不该为空');
    assert.strictEqual(cross.requester.firmAdmin, true, '总部 OWNER 才是律所管理员');
    assert.strictEqual(cross.candidate.firmAdmin, false, '分队 OWNER 不是律所管理员');
    assert.strictEqual(
        cross.candidate.firmId,
        cross.requester.firmId,
        '并入同一律所 → firmId 相同'
    );
    ok('同律所不同团队 → firmId 相同、teamId 不同');

    const stillSame = await lookup(
        { requesterAccountId: ids.boss, identifier: phones.junior },
        '入所后的同队同事'
    );
    assert.strictEqual(stillSame.candidate.teamId, teamId);
    assert.strictEqual(stillSame.candidate.firmAdmin, false, '总部普通成员不是律所管理员');
    assert.strictEqual(stillSame.candidate.firmId, cross.requester.firmId, '同队同事跟着入所');
    ok('入所后同队同事的 firmId 跟着变（归属取自 team.firmId，不是缓存）');

    const noFirm = await lookup(
        { requesterAccountId: ids.boss, identifier: phones.loner },
        '所外的人'
    );
    assert.deepStrictEqual(noFirm.candidate, NO_ORG);
    ok('所外没有团队的人 → 仍是一对 null');

    const { changeMemberRole, removeMember, removeTeamFromFirm } = await import('@/lib/team');
    changeMemberRole(ids.boss, ids.junior, 'ADMIN');
    const headAdmin = await lookup({ requesterAccountId: ids.junior, candidateAccountId: ids.junior }, '总部 ADMIN');
    assert.strictEqual(headAdmin.requester.firmAdmin, true);
    removeMember(ids.boss, ids.junior);
    const removed = await lookup({ requesterAccountId: ids.junior, candidateAccountId: ids.junior }, '撤销总部成员');
    assert.deepStrictEqual(removed.requester, NO_ORG);
    const branchView = await read(await teamRoute.GET(new NextRequest('http://localhost/api/account/team', {
        headers: { authorization: `Bearer ${keys.branch}` },
    })), 200, '分队邀请码');
    await read(await joinRoute.POST(jreq('/api/account/team/join', keys.junior, { code: branchView.joinCode })), 200, '加入分队');
    changeMemberRole(ids.branch, ids.junior, 'ADMIN');
    const branchAdmin = await lookup({ requesterAccountId: ids.junior, candidateAccountId: ids.junior }, '分队 ADMIN');
    assert.strictEqual(branchAdmin.requester.firmAdmin, false);
    assert.strictEqual(branchAdmin.requester.firmId, cross.requester.firmId);
    removeTeamFromFirm(ids.branch, cross.candidate.teamId);
    const departed = await lookup({ requesterAccountId: ids.junior, candidateAccountId: ids.branch }, '团队退出律所');
    assert.strictEqual(departed.requester.firmId, null);
    assert.strictEqual(departed.requester.firmAdmin, false);
    assert.strictEqual(departed.candidate.firmId, null);
    ok('总部 ADMIN 可管理；撤权、分队 ADMIN 和退所均不可管理律所');
}

console.log(`\n全部通过：${passed} 项`);
