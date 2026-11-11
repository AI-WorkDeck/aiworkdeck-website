/**
 * 桌面端「发布到 Marketplace」的投稿鉴权验证：POST /api/skills 与 PUT /api/skills/{id}
 * 除官网 Cookie 外也认 `Bearer awdk_`（桌面端经本地后端透传）。
 *
 * 必须在一个空目录里执行（data/ 会建在 cwd，与真实数据隔离）：
 *   npm run test:skill-submit
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const authorId = crypto.randomUUID();
const otherId = crypto.randomUUID();
const createdAt = new Date().toISOString();
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify([
        { id: authorId, username: 'sk-author', email: 'sk-author@test.local', passwordHash: 'x:y', displayName: '作者', createdAt },
        { id: otherId, username: 'sk-other', email: 'sk-other@test.local', passwordHash: 'x:y', displayName: '别人', createdAt },
    ])
);

const { generateApiKey } = await import('@/lib/api-keys');
const { NextRequest } = await import('next/server');
const skillsRoute = await import('@/app/api/skills/route');
const skillIdRoute = await import('@/app/api/skills/[id]/route');

const authorKey = generateApiKey(authorId).key!.plaintextKey;
const otherKey = generateApiKey(otherId).key!.plaintextKey;

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}
function jreq(url: string, method: string, body: unknown, key?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (key) headers.authorization = `Bearer ${key}`;
    return new NextRequest(`http://localhost${url}`, { method, headers, body: JSON.stringify(body) });
}
const p = (id: string) => ({ params: Promise.resolve({ id }) });

const draft = {
    id: 'shareholder-signature-pages',
    name: '股东会签字页',
    description: '按股东类型匹配签署方式，批量生成签字页',
    triggers: ['签字页', '股东会签字页'],
    prompt: '# 股东会签字页\n\n按股东类型匹配签署方式。',
    category: 'corporate',
};

{
    const anon = await skillsRoute.POST(jreq('/api/skills', 'POST', draft));
    assert.strictEqual(anon.status, 401, '无凭据投稿 → 401');
    const bad = await skillsRoute.POST(jreq('/api/skills', 'POST', draft, 'awdk_not-a-real-key'));
    assert.strictEqual(bad.status, 401, '无效 Key → 401');
    ok('无凭据 / 无效 Key 投稿 → 401');

    const res = await skillsRoute.POST(jreq('/api/skills', 'POST', draft, authorKey));
    assert.strictEqual(res.status, 200, 'Bearer 投稿应成功');
    const body = await res.json();
    assert.strictEqual(body.skill.id, draft.id);
    assert.strictEqual(body.skill.authorId, authorId, '作者记到 Key 的主人');
    assert.strictEqual(body.skill.version, '1.0.0');
    ok('Bearer awdk_ 投稿 → 200，作者为 Key 的主人');

    const dup = await skillsRoute.POST(jreq('/api/skills', 'POST', draft, authorKey));
    assert.strictEqual(dup.status, 400);
    assert.strictEqual((await dup.json()).error, 'id_taken', '重复 id 回 id_taken，桌面端据此改走 PUT');
    ok('同 id 再投稿 → 400 id_taken');
}

{
    const upd = await skillIdRoute.PUT(
        jreq(`/api/skills/${draft.id}`, 'PUT', { ...draft, description: '更新后的说明' }, authorKey),
        p(draft.id)
    );
    assert.strictEqual(upd.status, 200, '作者用 Bearer 更新');
    const body = await upd.json();
    assert.strictEqual(body.skill.version, '1.0.1', '更新自动递增补丁位');
    assert.strictEqual(body.skill.description, '更新后的说明');
    ok('作者 Bearer PUT → 200，版本 1.0.1');

    const forbidden = await skillIdRoute.PUT(
        jreq(`/api/skills/${draft.id}`, 'PUT', draft, otherKey),
        p(draft.id)
    );
    assert.strictEqual(forbidden.status, 403, '别人的 Key 不能改');
    const anon = await skillIdRoute.PUT(jreq(`/api/skills/${draft.id}`, 'PUT', draft), p(draft.id));
    assert.strictEqual(anon.status, 401);
    ok('非作者 PUT → 403；无凭据 PUT → 401');
}

{
    // 作者在官网设了价格、分类、图标；桌面端随后「更新到 Marketplace」只发正文字段，不得把它们清掉
    const priced = await skillIdRoute.PUT(
        jreq(`/api/skills/${draft.id}`, 'PUT', { ...draft, priceCents: 990, icon: '§' }, authorKey),
        p(draft.id)
    );
    assert.strictEqual(priced.status, 200);
    const { category, ...desktopBody } = { ...draft, description: '桌面端再次发布' };
    void category;
    const again = await skillIdRoute.PUT(jreq(`/api/skills/${draft.id}`, 'PUT', desktopBody, authorKey), p(draft.id));
    assert.strictEqual(again.status, 200);
    const s = (await again.json()).skill;
    assert.strictEqual(s.description, '桌面端再次发布');
    assert.strictEqual(s.priceCents, 990, '没带 priceCents 时沿用已设价格，付费正文不得因此公开');
    assert.strictEqual(s.icon, '§');
    assert.strictEqual(s.category, 'corporate');
    // 显式带了就照改（官网编辑页清空价格的语义不变）
    const free = await skillIdRoute.PUT(jreq(`/api/skills/${draft.id}`, 'PUT', { ...desktopBody, priceCents: 0 }, authorKey), p(draft.id));
    assert.strictEqual((await free.json()).skill.priceCents, undefined, '显式 priceCents:0 = 免费');
    ok('PUT 未带的定价/分类/图标沿用原值；显式带了才改');
}

console.log(`\n全部通过：${passed} 项`);
