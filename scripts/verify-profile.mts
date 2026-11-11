/**
 * 个人资料与头像验证脚本：资料字段边界 / 头像重编码 / 路径穿越 / 注销清理 /
 * 默认展示名判定 / profile 与 avatar 端点的 Bearer 通路（dev-board#564 #565）。
 * 必须在一个空目录里执行（data/users.json 与 data/avatars 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-profile.mts
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import sharp from 'sharp';
// 只取类型：lib/users 的实际加载必须等到 users.json 写好之后（下面的 await import），
// `import type` 编译期就被擦掉，不会提前把模块拉起来。
import type { User } from '@/lib/users';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
const userId = crypto.randomUUID();
const otherId = crypto.randomUUID();
// Bearer 通路专用账户：手机号注册的形态（无邮箱、展示名是打码号），
// 与上面两个账户分开，免得第 6 节的注销把它一起变成墓碑行
const bearerId = crypto.randomUUID();
fs.writeFileSync(
  path.join(cwd, 'data', 'users.json'),
  JSON.stringify([
    {
      id: userId,
      username: 'profile-tester',
      email: 'profile@test.local',
      passwordHash: 'salt:hash',
      displayName: 'Profile Tester',
      createdAt: new Date().toISOString(),
    },
    {
      id: otherId,
      username: 'other-tester',
      email: 'other@test.local',
      passwordHash: 'salt:hash',
      displayName: 'Other Tester',
      createdAt: new Date().toISOString(),
    },
    {
      id: bearerId,
      username: 'ubearertester',
      email: '',
      passwordHash: '',
      phone: '13800138000',
      displayName: '185****5325',
      createdAt: new Date().toISOString(),
    },
  ])
);

const {
  updateProfile, setAvatarStamp, toPublicUser, findUserById, markUserDeleted,
  isDefaultDisplayName, BIO_MAX, DISPLAY_NAME_MAX,
} = await import('@/lib/users');
const { saveAvatar, readAvatar, deleteAvatar, AVATAR_SIZE, AVATAR_MAX_BYTES } = await import('@/lib/avatars');
const { GET: avatarGET } = await import('@/app/api/avatar/[userId]/route');
const { generateApiKey } = await import('@/lib/api-keys');
const { PATCH: profilePATCH } = await import('@/app/api/account/profile/route');
const { POST: avatarPOST, DELETE: avatarDELETE } = await import('@/app/api/account/avatar/route');
const { GET: meGET } = await import('@/app/api/account/me/route');
const { NextRequest } = await import('next/server');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log('  PASS', name);
}

const avatarPath = (id: string) => path.join(cwd, 'data', 'avatars', `${id}.webp`);

function assertIsoString(value: unknown, label: string) {
  assert.strictEqual(typeof value, 'string', `${label} 应为字符串`);
  assert.ok(!Number.isNaN(Date.parse(value as string)), `${label} 应为可解析的 ISO 8601`);
}

// ---------- 1. 资料字段边界 ----------
console.log('\n[1] 昵称与简介的边界');

assert.strictEqual(updateProfile(userId, { displayName: '  韩律师  ' }).user?.displayName, '韩律师');
ok('两端空白被去掉');

assert.strictEqual(updateProfile(userId, { displayName: '   ' }).error, 'invalid_display_name');
assert.strictEqual(updateProfile(userId, { displayName: '' }).error, 'invalid_display_name');
assert.strictEqual(updateProfile(userId, { displayName: 'x'.repeat(DISPLAY_NAME_MAX + 1) }).error, 'invalid_display_name');
assert.ok(updateProfile(userId, { displayName: 'x'.repeat(DISPLAY_NAME_MAX) }).user);
ok(`昵称：空/纯空白/超 ${DISPLAY_NAME_MAX} 字被拒，正好 ${DISPLAY_NAME_MAX} 字放行`);

// 失败的那几次不许留下痕迹
assert.strictEqual(findUserById(userId)!.displayName, 'x'.repeat(DISPLAY_NAME_MAX));
ok('被拒的修改没有写进 users.json');

assert.strictEqual(updateProfile(userId, { bio: 'y'.repeat(BIO_MAX + 1) }).error, 'bio_too_long');
assert.ok(updateProfile(userId, { bio: 'y'.repeat(BIO_MAX) }).user);
ok(`简介：超 ${BIO_MAX} 字被拒，正好 ${BIO_MAX} 字放行`);

updateProfile(userId, { bio: '   ' });
assert.strictEqual('bio' in findUserById(userId)!, false);
ok('简介清空落成「删字段」而不是空字符串');

updateProfile(userId, { displayName: '韩律师', bio: '公司法与争议解决' });
const only = updateProfile(userId, { bio: '只改简介' }).user!;
assert.strictEqual(only.displayName, '韩律师');
ok('传 undefined 的字段不被改动');

assert.strictEqual(updateProfile('no-such-user', { bio: 'x' }).error, 'not_found');
ok('用户不存在 → not_found');

// ---------- 2. 头像重编码 ----------
console.log('\n[2] 头像一律重编码');

// 非方形输入：cover 裁剪后必须是正方形
const wide = await sharp({
  create: { width: 800, height: 300, channels: 3, background: { r: 18, g: 58, b: 38 } },
}).png().toBuffer();

const saved = await saveAvatar(userId, wide);
assert.ok(saved.stamp, `保存失败：${saved.error}`);
assert.ok(fs.existsSync(avatarPath(userId)));
const meta = await sharp(fs.readFileSync(avatarPath(userId))).metadata();
assert.strictEqual(meta.format, 'webp');
assert.strictEqual(meta.width, AVATAR_SIZE);
assert.strictEqual(meta.height, AVATAR_SIZE);
ok(`800x300 的 PNG → ${AVATAR_SIZE}x${AVATAR_SIZE} 的 webp`);

assert.strictEqual(meta.exif, undefined);
ok('输出不带 EXIF（拍摄定位不会跟着头像上线）');

// 临时文件不许留在目录里
assert.strictEqual(fs.existsSync(`${avatarPath(userId)}.tmp`), false);
ok('原子写的临时文件已 rename 掉');

// 非图片
const notImage = Buffer.from('这不是图片，只是一段中文文本。'.repeat(20));
assert.strictEqual((await saveAvatar(otherId, notImage)).error, 'invalid_image');
ok('纯文本字节被拒（判定靠真实解码，不靠扩展名或 Content-Type）');

// SVG：能被 sharp 解析，但我们明确不收
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>');
assert.strictEqual((await saveAvatar(otherId, svg)).error, 'unsupported_format');
ok('SVG 被拒（librsvg 会解析外部引用，且矢量可构造成渲染炸弹）');

// 体积
assert.strictEqual((await saveAvatar(otherId, Buffer.alloc(AVATAR_MAX_BYTES + 1)).catch(() => ({ error: 'threw' }))).error, 'too_large');
ok(`超过 ${AVATAR_MAX_BYTES / 1024 / 1024} MB 被拒`);

// 被拒的几次一个文件都不该落地
assert.strictEqual(fs.existsSync(avatarPath(otherId)), false);
ok('被拒的上传没有落盘');

// ---------- 3. 路径穿越 ----------
console.log('\n[3] userId 白名单');

const usersFile = path.join(cwd, 'data', 'users.json');
const before = fs.readFileSync(usersFile);
for (const evil of ['../users', '../../etc/passwd', 'a/b', '..']) {
  assert.strictEqual(readAvatar(evil), null, `readAvatar 不该受理 ${evil}`);
  deleteAvatar(evil);
  assert.strictEqual((await saveAvatar(evil, wide)).error, 'invalid_image');
}
assert.deepStrictEqual(fs.readFileSync(usersFile), before);
ok('带 ../ 的 userId 在读/写/删三条路径上都被挡住，且没碰到目录外的文件');

// ---------- 4. 读取端点 ----------
console.log('\n[4] GET /api/avatar/[userId]');

const call = (id: string, query = '') =>
  avatarGET(new NextRequest(`http://localhost/api/avatar/${id}${query}`), {
    params: Promise.resolve({ userId: id }),
  });

const hit = await call(userId, '?v=' + encodeURIComponent(saved.stamp!));
assert.strictEqual(hit.status, 200);
assert.strictEqual(hit.headers.get('Content-Type'), 'image/webp');
assert.match(hit.headers.get('Cache-Control') ?? '', /immutable/);
ok('带 ?v= 的请求：200 + image/webp + immutable');

const bare = await call(userId);
assert.strictEqual(bare.status, 200);
assert.doesNotMatch(bare.headers.get('Cache-Control') ?? '', /immutable/);
ok('不带戳的裸地址不挂 immutable（谁都能拼出这个地址）');

assert.strictEqual((await call(otherId)).status, 404);
assert.strictEqual((await call('../users')).status, 404);
ok('没有头像 / 非法 id → 404（前端据此降级回首字母）');

// ---------- 5. 对外可见字段 ----------
console.log('\n[5] PublicUser');

setAvatarStamp(userId, saved.stamp!);
const pub = toPublicUser(findUserById(userId)!) as Record<string, unknown>;
assert.strictEqual(pub.avatarUpdatedAt, saved.stamp);
assert.strictEqual('email' in pub, false);
assert.strictEqual('passwordHash' in pub, false);
ok('带出头像戳，不带出 email 与口令哈希');

// ---------- 6. 注销 ----------
console.log('\n[6] 注销清理');

// lib/account-deletion.ts 里的文件侧顺序：先 markUserDeleted 再 deleteAvatar
markUserDeleted(userId, '已注销用户');
deleteAvatar(userId);

const tomb = findUserById(userId)!;
assert.strictEqual(tomb.avatarUpdatedAt, undefined);
assert.strictEqual(tomb.bio, undefined);
assert.strictEqual(fs.existsSync(avatarPath(userId)), false);
assert.strictEqual((await call(userId)).status, 404);
ok('墓碑行：头像戳与人像文件都没了，读取端点回 404');

assert.strictEqual(updateProfile(userId, { bio: 'x' }).error, 'not_found');
ok('墓碑行不能再改资料');

// ---------- 7. 默认展示名判定 ----------
console.log('\n[7] isDefaultDisplayName');

const shape = (over: Partial<User>): User => ({
  id: 'x', username: 'uabcdefg', email: '', passwordHash: '', displayName: '', createdAt: '', ...over,
});

assert.strictEqual(isDefaultDisplayName(shape({ phone: '13800138000', displayName: '185****5325' })), true);
ok('打码手机号 → 默认名');

assert.strictEqual(isDefaultDisplayName(shape({ email: 'zewei@test.local', displayName: 'z****@test.local' })), true);
ok('打码邮箱 → 默认名');

assert.strictEqual(isDefaultDisplayName(shape({ displayName: 'uabcdefg' })), true);
ok('等于 username → 默认名（口令注册时 displayName 留空的回落形态）');

assert.strictEqual(isDefaultDisplayName(shape({ displayName: '' })), true);
assert.strictEqual(isDefaultDisplayName(shape({ displayName: '   ' })), true);
ok('空 / 纯空白 → 默认名');

assert.strictEqual(isDefaultDisplayName(shape({ phone: '13800138000', displayName: '测试用户' })), false);
assert.strictEqual(isDefaultDisplayName(shape({ email: 'zewei@test.local', displayName: '测试用户' })), false);
ok('改过名之后 → 不是默认名');

// 打码规则跟着 findOrCreateByPhone / findOrCreateByEmail 走：两处各写一遍必然漂，
// 所以这里断言的是「建号那一刻的展示名一定被判成默认名」这条性质本身。
assert.strictEqual(isDefaultDisplayName(findUserById(bearerId)!), true);
ok('手机号建号后的账户行本身就是默认名形态');

// ---------- 8. profile / avatar 的 Bearer 通路 ----------
console.log('\n[8] PATCH /api/account/profile 与 POST/DELETE /api/account/avatar（Bearer awdk_）');

const awdk = generateApiKey(bearerId).key!.plaintextKey;
const bearer = (key?: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});

{
  // 无凭据 / 假 Key 一律 401——这三个端点从前是纯 Cookie，改成
  // resolveSessionOrKeyUser 之后未鉴权路径必须仍然是 401，而不是落到空 userId 上
  const anonPatch = await profilePATCH(
    new NextRequest('http://localhost/api/account/profile', {
      method: 'PATCH', body: JSON.stringify({ displayName: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
  );
  assert.strictEqual(anonPatch.status, 401);
  const badPatch = await profilePATCH(
    new NextRequest('http://localhost/api/account/profile', {
      method: 'PATCH', body: JSON.stringify({ displayName: 'x' }),
      headers: { 'content-type': 'application/json', ...bearer('awdk_nope') },
    })
  );
  assert.strictEqual(badPatch.status, 401);
  assert.deepStrictEqual(await badPatch.json(), { error: 'unauthorized' });
  ok('无 Bearer / 无效 Bearer → 401 { error: unauthorized }');

  const badDelete = await avatarDELETE(
    new NextRequest('http://localhost/api/account/avatar', { method: 'DELETE', headers: bearer('awdk_nope') })
  );
  assert.strictEqual(badDelete.status, 401);
  ok('DELETE 头像：无效 Bearer → 401');
}

{
  // 改名之前：/me 说这是默认名、没有头像
  const before = await meGET(new NextRequest('http://localhost/api/account/me', { headers: bearer(awdk) }));
  assert.strictEqual(before.status, 200);
  const b = await before.json();
  assert.strictEqual(b.displayNameIsDefault, true, '打码号展示名应判为默认名');
  assert.strictEqual(b.avatarUpdatedAt, null, '没上传过头像应为 null');
  ok('/me（Bearer）：displayNameIsDefault=true、avatarUpdatedAt=null');
}

{
  const res = await profilePATCH(
    new NextRequest('http://localhost/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: '  韩泽伟  ', bio: '公司法与争议解决' }),
      headers: { 'content-type': 'application/json', ...bearer(awdk) },
    })
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body).sort(), ['bio', 'displayName']);
  assert.strictEqual(body.displayName, '韩泽伟');
  assert.strictEqual(body.bio, '公司法与争议解决');
  // 真落盘了才算数：桌面端改名的权威源就是这一行
  assert.strictEqual(findUserById(bearerId)!.displayName, '韩泽伟');
  ok('Bearer PATCH：改名落盘，回 { displayName, bio }');

  const tooLong = await profilePATCH(
    new NextRequest('http://localhost/api/account/profile', {
      method: 'PATCH', body: JSON.stringify({ displayName: 'x'.repeat(DISPLAY_NAME_MAX + 1) }),
      headers: { 'content-type': 'application/json', ...bearer(awdk) },
    })
  );
  assert.strictEqual(tooLong.status, 400);
  assert.strictEqual((await tooLong.json()).error, 'invalid_display_name');
  ok('Bearer PATCH：错误码与 Cookie 通路一致（invalid_display_name）');
}

{
  // 最小 PNG：8x8 纯色，走一遍真实的 sharp 重编码路径
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 120, b: 80 } } })
    .png().toBuffer();
  const form = new FormData();
  form.append('file', new File([new Uint8Array(png)], 'avatar.png', { type: 'image/png' }));
  const res = await avatarPOST(
    new NextRequest('http://localhost/api/account/avatar', { method: 'POST', body: form, headers: bearer(awdk) })
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body), ['avatarUpdatedAt']);
  assertIsoString(body.avatarUpdatedAt, 'POST avatar.avatarUpdatedAt');
  assert.ok(fs.existsSync(avatarPath(bearerId)), '头像文件应落在 data/avatars/<id>.webp');
  ok('Bearer POST 头像：200 { avatarUpdatedAt }，文件落盘');

  const me = await meGET(new NextRequest('http://localhost/api/account/me', { headers: bearer(awdk) }));
  const m = await me.json();
  assert.strictEqual(m.avatarUpdatedAt, body.avatarUpdatedAt, '/me 的头像戳应与上传回包一致');
  assert.strictEqual(m.displayNameIsDefault, false, '改过名之后不该再判为默认名');
  ok('/me：改名 + 传头像之后 displayNameIsDefault=false、avatarUpdatedAt 非空');
}

{
  const res = await avatarDELETE(
    new NextRequest('http://localhost/api/account/avatar', { method: 'DELETE', headers: bearer(awdk) })
  );
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { avatarUpdatedAt: null });
  assert.strictEqual(fs.existsSync(avatarPath(bearerId)), false, '人像文件应被删掉');
  const me = await meGET(new NextRequest('http://localhost/api/account/me', { headers: bearer(awdk) }));
  assert.strictEqual((await me.json()).avatarUpdatedAt, null);
  ok('Bearer DELETE 头像：200 { avatarUpdatedAt: null }，/me 跟着回 null');
}

console.log(`\n全部通过：${passed} 项`);
