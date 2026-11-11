import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { getDb, withTransaction } from './db';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

export interface User {
  id: string;
  username: string; // unique, lowercase kebab
  email: string; // unique, lowercase
  passwordVersion?: number;
  passwordHash: string; // scrypt: <saltHex>:<hashHex>
  /**
   * 手机号（大陆站的账号本体）。规范化后的 11 位，见 lib/sms-auth.ts。
   *
   * 可选是因为：intl 站不用它，cn 站的存量邮箱账号在补绑期结束前也还没有。
   * 唯一性由 `findUserByPhone` 在写入前检查——users.json 是 JSON 文件没有约束，
   * 这里的「唯一」靠调用方守，别绕过 `bindPhone` / `findOrCreateByPhone` 直接写。
   */
  phone?: string;
  /**
   * 邮箱**被证明属实**的时点（收到并核销过一次验证码）。
   *
   * 与 `email` 是两回事：注册时 `createUser` 只做格式校验，任何人都能填别人的地址，
   * 所以光有 `email` 不代表我们真联系得上这个人。有值才代表「这个地址确实是他的」。
   * 存量 intl 账号一律没有这个值，第一次走验证码登录时补上。
   *
   * 存时点而不是布尔：出问题时要能回答「什么时候证实的」，一个 true 回答不了。
   */
  emailVerifiedAt?: string;
  displayName: string;
  bio?: string;
  createdAt: string;
  lastLoginAt?: string;
  /**
   * 头像上传时点。有值即「这个用户有头像」，文件恒为 `data/avatars/<id>.webp`
   * （见 lib/avatars.ts）。
   *
   * 刻意不存路径或文件名：路径由 id 拼出来，用户提供的文件名一概不采信，
   * 路径穿越从源头就没有入口。这个值同时当缓存戳用（URL 上的 ?v=），
   * 所以头像响应能挂 immutable 长缓存而不牺牲「换完立刻可见」。
   */
  avatarUpdatedAt?: string;
  /**
   * 注销时点。有值即「墓碑行」：账户已注销，只留最小占位。
   *
   * 为什么不删行（见 lib/account-deletion.ts）：
   * - `app/[lang]/u/[username]/page.tsx` 是唯一没做降级的调用点，删行直接 404，
   *   广场上该作者的每张卡片都变成坏链接；
   * - username 会被释放，新用户注册同名就白捡旧作者的历史投稿归属。
   */
  deletedAt?: string;
}

export type PublicUser = Pick<
  User,
  'id' | 'username' | 'displayName' | 'bio' | 'createdAt' | 'avatarUpdatedAt'
>;

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readUsers(): User[] {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(USERS_FILE, 'utf-8');
  const users = JSON.parse(data) as User[];
  const credentials = new Map((getDb().prepare('SELECT userId, passwordHash, version FROM password_credential').all() as {userId: string; passwordHash: string; version: number}[]).map(c => [c.userId, c]));
  return users.map(u => {
    const c = credentials.get(u.id);
    return c && !u.deletedAt ? { ...u, passwordHash: c.passwordHash, passwordVersion: c.version } : u;
  });
}

// Every read-modify-write caller holds the shared SQLite immediate transaction lock.
// JSON rename is atomic for readers; the lock prevents another process from overwriting
// a newly verified identity with an older profile/avatar/creation snapshot.
function writeUsers(users: User[]) {
  ensureDataDir();
  // 先写临时文件再 rename（同 lib/plugins-store.ts）：整份覆盖写期间被读到的
  // 半截 JSON 会让 readUsers 的 JSON.parse 抛错，而它没有任何 try/catch——
  // 每一次鉴权都要过这里，撕裂一次等于全站 500。
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

/** 墓碑行：账户已注销，不参与登录，也不再是可用账户。 */
export function isDeletedUser(user: User): boolean {
  return !!user.deletedAt;
}

// scrypt 的异步回调版：耗时挪到 libuv 线程池，避免 scryptSync 那样整段占满事件循环
// （高并发登录时会拖慢全站，包括纯静态页面渲染）。哈希格式不变：<saltHex>:<hashHex>。
const scryptAsync = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

export async function createUser(input: {
  username: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<{ user?: User; error?: string }> {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return { error: 'invalid_username' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'invalid_email' };
  if (input.password.length < 8 || input.password.length > 72) return { error: 'invalid_password' };
  const displayName = input.displayName.trim().slice(0, 40) || username;

  const passwordHash = await hashPassword(input.password);
  return withTransaction(() => {
  const users = readUsers();
  if (users.some(u => u.username === username)) return { error: 'username_taken' };
  if (users.some(u => u.email === email)) return { error: 'email_taken' };

  const user: User = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash,
    displayName,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return { user };
  });
}

/** 资料字段上限。displayName 与 createUser 的 40 不同：那里是兜底截断，这里是用户可见的输入约束。 */
export const DISPLAY_NAME_MAX = 24;
export const BIO_MAX = 160;

export type ProfileError = 'invalid_display_name' | 'bio_too_long' | 'not_found';

/**
 * 改昵称与简介。
 *
 * `bio` 字段自 skill 广场上线起就在 User 与 PublicUser 里挂着，但在此之前
 * **全站没有任何写入路径**——注册表单只收四个字段，也没有资料编辑入口，
 * 于是公开主页上那段简介永远是空的。这个函数就是补上那条路径。
 *
 * 传 undefined = 不改该字段；bio 传空串 = 清空。
 */
function getCircleSuffixForUser(userId: string): string | null {
  try {
    const row = getDb()
      .prepare(
        `SELECT f.suffix FROM user_circle_binding b JOIN circle_firms f ON f.code = b.code WHERE b.userId = ?`
      )
      .get(userId) as { suffix: string } | undefined;
    return row?.suffix ?? null;
  } catch {
    return null;
  }
}

export function updateProfile(
  userId: string,
  input: { displayName?: string; bio?: string }
): { user?: User; error?: ProfileError } {
  return withTransaction(() => {
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user || isDeletedUser(user)) return { error: 'not_found' };

  if (input.displayName !== undefined) {
    const raw = input.displayName.trim();
    const suffix = getCircleSuffixForUser(userId);
    const tail = suffix ? ` (${suffix})` : '';
    const baseName = tail && raw.endsWith(tail) ? raw.slice(0, raw.length - tail.length).trim() : raw;
    if (!baseName || baseName.length > DISPLAY_NAME_MAX) return { error: 'invalid_display_name' };
    user.displayName = suffix ? `${baseName} (${suffix})` : baseName;
  }

  if (input.bio !== undefined) {
    const bio = input.bio.trim();
    if (bio.length > BIO_MAX) return { error: 'bio_too_long' };
    // 空串落成「删字段」而不是空字符串：渲染侧统一用 `bio && ...` 判断有无
    if (bio) user.bio = bio;
    else delete user.bio;
  }

  writeUsers(users);
  return { user };
  });
}

/**
 * 记 / 清头像时间戳。文件本身由 lib/avatars.ts 负责，这里只动 users.json。
 *
 * 顺序上先落文件再记戳、先清戳再删文件：任何一步失败，宁可留一个读不到的孤儿文件
 * （下次上传直接覆盖），也不要留一个指向空文件的戳（那会让头像变成裂图）。
 */
export function setAvatarStamp(userId: string, stamp: string | null): boolean {
  return withTransaction(() => {
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return false;
  if (stamp) user.avatarUpdatedAt = stamp;
  else delete user.avatarUpdatedAt;
  writeUsers(users);
  return true;
  });
}

/**
 * 按用户名或邮箱查（登录入口用）。**墓碑行一律查不到**——注销后邮箱与口令哈希
 * 都已抹掉，但 username 仍占着位，不排除就会让注销账户重新成为可登录目标。
 */
export function normalizeLoginAccount(account: string): string {
  const key = account.trim().toLowerCase();
  const phone = key.replace(/[\s()-]/g, '').replace(/^\+86/, '');
  return /^1\d{10}$/.test(phone) ? phone : key;
}

export function findUserByAccount(account: string): User | undefined {
  const key = normalizeLoginAccount(account);
  const users = readUsers();
  // A historical numeric username can equal someone else's verified phone.
  // Contact identity wins deterministically; never select a user by JSON row order.
  const user = users.find(u => !isDeletedUser(u) && u.phone === key)
    ?? users.find(u => !isDeletedUser(u) && u.email === key)
    ?? users.find(u => !isDeletedUser(u) && u.username === key);
  return user && !isDeletedUser(user) ? user : undefined;
}

/**
 * 按手机号查（登录入口用）。与 `findUserByAccount` 同口径：**墓碑行一律查不到**，
 * 注销时 phone 已被抹掉，这里再挡一道。
 */
export function findUserByPhone(phone: string): User | undefined {
  const key = phone.trim();
  if (!key) return undefined;
  const user = readUsers().find(u => u.phone === key);
  return user && !isDeletedUser(user) ? user : undefined;
}

/**
 * 按邮箱查（只读），**只认已验证的邮箱**（`emailVerifiedAt` 有值）。密码注册时填的邮箱
 * 没有人证明过收得到信，谁都能把别人的地址填进去；按它命中就会把冒名者当成那位同事
 * 预建进案卷。与桌面仓 `UserRepository.findByVerifiedEmail` 同一口径。
 * 与 `findUserByPhone` 同样：**墓碑行一律查不到**
 * （注销时 email 已被抹成空串，这里再挡一道，顺带挡住空串查到一堆墓碑）。
 *
 * 与 `findOrCreateByEmail` 的关键区别：**这条路一个字节都不写**——不建号、
 * 不补 `emailVerifiedAt`。它给的是「这个地址有没有账户」这一个答案，
 * 调用方（内部名录口 lib/collab-directory.ts）手里并没有「这封信收得到」的证据，
 * 让它顺手建号或盖验证戳就等于把建号能力交给了一个只该查询的口子。
 */
export function findUserByEmail(email: string): User | undefined {
  const key = email.trim().toLowerCase();
  if (!key) return undefined;
  const user = readUsers().find(u => u.email === key && !!u.emailVerifiedAt);
  return user && !isDeletedUser(user) ? user : undefined;
}

/**
 * 随机短用户名，撞了重试。与桌面仓 `UserService.allocatePhoneUsername` 同策略。
 *
 * 验证码注册（cn 手机号 / intl 邮箱）都没有用户名可用，但 username 在官网是承重墙——
 * 公开主页路由 `/u/[username]`、Skill 投稿归属都挂在它上面，不能留空。
 * **10 次都撞说明随机源坏了，宁可报错也不静默降级**成可预测的用户名。
 */
function allocateRandomUsername(existing: User[]): string {
  for (let i = 0; i < 10; i++) {
    const candidate = 'u' + crypto.randomBytes(6).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (USERNAME_RE.test(candidate) && !existing.some(u => u.username === candidate)) {
      return candidate;
    }
  }
  throw new Error('无法分配用户名');
}

/**
 * 手机号登录：号码见过就返回该账号，没见过就建号（注册与登录合一）。
 *
 * `created` 让前端引导补昵称。手机号账号没有邮箱与口令——`email` 与 `passwordHash`
 * 留空串，验证码核验后还须创建密码才可登录。displayName 默认用打码号。
 */
export function findOrCreateByPhone(phone: string): { user: User; created: boolean } {
  return withTransaction(() => {
  const users = readUsers();
  const existing = users.find(u => u.phone === phone && !isDeletedUser(u));
  if (existing) return { user: existing, created: false };

  const user: User = {
    id: crypto.randomUUID(),
    username: allocateRandomUsername(users),
    email: '',
    passwordHash: '',
    phone,
    displayName: maskPhoneForName(phone),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return { user, created: true };
  });
}

/** A verified external identity without a phone must never claim a synthetic phone. */
export function createExternalIdentityUser(displayName: string): User {
  return withTransaction(() => {
    const users = readUsers();
    const username = allocateRandomUsername(users);
    const user: User = { id: crypto.randomUUID(), username, email: '', passwordHash: '',
      displayName: displayName.trim().slice(0, 24) || username, createdAt: new Date().toISOString() };
    users.push(user); writeUsers(users); return user;
  });
}

/**
 * 邮箱登录（国际站）：地址见过就返回该账号，没见过就建号（注册与登录合一）。
 *
 * 与 `findOrCreateByPhone` 的**一处关键不同**：邮箱账号在这条路之前就可能存在——
 * intl 站的存量账号全是「口令注册、邮箱没验证过」的。所以这里不只是查与建，
 * 还要给命中的存量账号盖上 `emailVerifiedAt`：他刚刚收到并用掉了一枚发往该地址的码，
 * 这就是我们要的证据。**这条是「掌握用户联系方式」的落点，别把它优化掉。**
 *
 * 新建账号暂时没有口令（`passwordHash` 留空串），首次验证后须完成设密。
 * `created` 让前端引导补昵称。
 */
export function findOrCreateByEmail(email: string): { user: User; created: boolean } {
  return withTransaction(() => {
  const users = readUsers();
  const now = new Date().toISOString();
  const existing = users.find(u => u.email === email && !isDeletedUser(u));
  if (existing) {
    // 已经证实过就不覆盖时点——首次证实的时间比最近一次登录更有信息量
    if (!existing.emailVerifiedAt) {
      existing.emailVerifiedAt = now;
      writeUsers(users);
    }
    return { user: existing, created: false };
  }

  const user: User = {
    id: crypto.randomUUID(),
    username: allocateRandomUsername(users),
    email,
    passwordHash: '',
    emailVerifiedAt: now,
    displayName: maskEmailForName(email),
    createdAt: now,
  };
  users.push(user);
  writeUsers(users);
  return { user, created: true };
  });
}

/** 打码：本地部分留首字符。与 lib/mail-auth.ts 的 maskEmail 同规则，这里内联以免 users.ts 依赖发信模块。 */
export function maskEmailForName(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return 'user';
  const local = email.slice(0, at);
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 1))}@${email.slice(at + 1)}`;
}

/** 打码：前 3 后 4。与 lib/sms-auth.ts 的 maskPhone 同规则，这里内联以免 users.ts 依赖短信模块。 */
export function maskPhoneForName(phone: string): string {
  if (!phone || phone.length < 7) return '用户';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/**
 * 展示名还是系统给的默认值吗（dev-board#564）。
 *
 * 验证码注册的账号没有名字可用，建号时只能拿打码手机号（`138****8000`）或打码邮箱当展示名；
 * 口令注册时 displayName 留空则回落成 username（见 createUser）。这几种形态都不是「人名」——
 * 同事在案卷的参与人列表、版本时间线、批注作者里看到的就是这串东西。
 *
 * 判定集中在这一个函数里：官网账户页的「填写你的姓名」横幅、`GET /api/account/me` 的
 * `displayNameIsDefault`、桌面端个人设置的引导，三处必须同一口径，各写一遍必然漂。
 *
 * 纯函数，不读盘：调用方手里已经有 User 行。
 */
export function isDefaultDisplayName(user: User): boolean {
  const raw = (user.displayName ?? '').trim();
  if (!raw) return true;
  const suffix = user.id && raw.endsWith(')') ? getCircleSuffixForUser(user.id) : null;
  const tail = suffix ? ` (${suffix})` : '';
  const name = tail && raw.endsWith(tail) ? raw.slice(0, raw.length - tail.length).trim() : raw;
  if (!name) return true;
  if (user.phone && name === maskPhoneForName(user.phone)) return true;
  if (user.email && name === maskEmailForName(user.email)) return true;
  return name === user.username;
}

export type BindPhoneError = 'phone_taken' | 'not_found';

/**
 * 给已有账号绑定/更换手机号（补绑期用）。
 * 号码已被**别的**账号占用则拒绝——「一号一账号」是维护者定的口径。
 */
export function bindPhone(userId: string, phone: string): { error?: BindPhoneError } {
  return withTransaction(() => {
  const users = readUsers();
  const holder = users.find(u => u.phone === phone && !isDeletedUser(u));
  if (holder && holder.id !== userId) return { error: 'phone_taken' };
  const user = users.find(u => u.id === userId);
  if (!user || isDeletedUser(user)) return { error: 'not_found' };
  user.phone = phone;
  writeUsers(users);
  return {};
  });
}

export function findUserById(id: string): User | undefined {
  return readUsers().find(u => u.id === id);
}

/**
 * 批量取 id → username。
 * 列表渲染必须用这个而不是循环 findUserById：后者每次都整份读盘 + JSON.parse
 * users.json，200 行列表在几千用户规模下能同步阻塞事件循环几百毫秒。
 */
export function mapUsernamesByIds(ids: Iterable<string>): Map<string, string> {
  const wanted = new Set(ids);
  const result = new Map<string, string>();
  if (wanted.size === 0) return result;
  for (const u of readUsers()) {
    if (wanted.has(u.id)) result.set(u.id, u.username);
  }
  return result;
}

/**
 * 批量取 id → displayName（团队成员表用，dev-board#496）。
 * 与 `mapUsernamesByIds` 同理由：成员表一次要渲染整支队伍，循环 findUserById
 * 会把 users.json 整份读盘 + JSON.parse 重复 N 遍。
 */
export function mapDisplayNamesByIds(ids: Iterable<string>): Map<string, string> {
  const wanted = new Set(ids);
  const result = new Map<string, string>();
  if (wanted.size === 0) return result;
  for (const u of readUsers()) {
    if (wanted.has(u.id)) result.set(u.id, u.displayName);
  }
  return result;
}

export function findUserByUsername(username: string): User | undefined {
  const key = username.trim().toLowerCase();
  return readUsers().find(u => u.username === key);
}

/**
 * 注销：把账户改写成墓碑行（不删行，理由见 User.deletedAt）。
 *
 * 保留：id（SQLite 侧的墓碑值由它派生，见 lib/account-deletion.ts）、username
 * （占住不被复用）、createdAt。抹掉：email、passwordHash、bio、头像。
 * displayName 由调用方按站点语言传入中性名称。
 *
 * `findUserById` / `findUserByUsername` 仍会返回墓碑行——广场卡片与作者主页要靠它
 * 渲染成「已注销用户」而不是坏链接。拒绝墓碑行的是登录（findUserByAccount）与
 * 会话/Key 解析（lib/sessions.ts、lib/api-keys.ts）。
 *
 * 已是墓碑行返回 false（重复注销不再改写时间戳）。
 */
export function markUserDeleted(userId: string, displayName: string): boolean {
  return withTransaction(() => {
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user || isDeletedUser(user)) return false;
  user.email = '';
  user.passwordHash = '';
  delete user.passwordVersion;
  // 地址已抹掉，「这个地址被证实过」的时点跟着失效；留着会让墓碑行看起来仍有可达联系方式
  delete user.emailVerifiedAt;
  // 手机号必须一并释放：不释放的话墓碑行永远占着这个号，本人再也无法用同一个号
  // 重新注册（findOrCreateByPhone 会撞上唯一性检查）。与 email 同一口径。
  // username 仍占着位不释放，那是另一条有意为之的规则，见函数注释。
  delete user.phone;
  user.displayName = displayName;
  delete user.bio;
  delete user.avatarUpdatedAt;
  delete user.lastLoginAt;
  user.deletedAt = new Date().toISOString();
  withTransaction(db => {
    writeUsers(users);
    db.prepare('DELETE FROM password_credential WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM password_setup_ticket WHERE userId = ?').run(userId);
    // Developer contact, review snapshots and submission credentials are private account data.
    db.prepare('DELETE FROM developer_profile WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM developer_review WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM plugin_submission_token WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM user_circle_binding WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM bqt_user_binding WHERE userId = ?').run(userId);
  });
  return true;
  });
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt,
    avatarUpdatedAt: user.avatarUpdatedAt,
  };
}

export type VerifiedEmailBindError = 'not_found' | 'phone_password_required' | 'email_conflict' | 'verified_email_conflict';

/** Only a verified phone/password account may claim an email, and never another user's identity. */
export function verifiedEmailBindError(userId: string, email: string): VerifiedEmailBindError | null {
  const users = readUsers();
  const user = users.find(u => u.id === userId && !isDeletedUser(u));
  if (!user) return 'not_found';
  if (!user.phone || !user.passwordHash) return 'phone_password_required';
  if (user.emailVerifiedAt && user.email !== email) return 'verified_email_conflict';
  if (users.some(u => u.id !== userId && !isDeletedUser(u) && u.email.toLowerCase() === email)) return 'email_conflict';
  return null;
}

export function bindVerifiedEmail(userId: string, email: string): VerifiedEmailBindError | null {
  return withTransaction(() => {
    const error = verifiedEmailBindError(userId, email);
    if (error) return error;
    const users = readUsers();
    const user = users.find(u => u.id === userId)!;
    user.email = email;
    user.emailVerifiedAt ||= new Date().toISOString();
    writeUsers(users);
    return null;
  });
}

/** Successful authentication only; ordinary authenticated requests do not update this. */
export function recordUserLogin(userId: string, at: string) {
  withTransaction(() => {
    const users = readUsers();
    const user = users.find(u => u.id === userId && !u.deletedAt);
    if (!user || (user.lastLoginAt && user.lastLoginAt >= at)) return;
    user.lastLoginAt = at;
    writeUsers(users);
  });
}
