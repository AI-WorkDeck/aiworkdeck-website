/**
 * 国际站邮箱验证码登录——发信通道与验证码存储。
 *
 * ## 为什么要有这条
 * intl 站此前**只有账号口令一条登录路**，而注册时收的 `email` 从来没被验证过
 * （`createUser` 只做格式校验）。两个后果：登录方式的安全性完全押在用户的口令强度上；
 * 我们握着的联系方式没有任何证据，出事时联系不上人。验证码登录同时解决这两件事。
 *
 * ## 形状照抄 `lib/sms-auth.ts`，刻意不发明新范式
 * 规范化 → 站点/配置闸 → 冷却与当日配额 → 先发再落库 → 核销即删。逐条对应。
 * 差异只有通道本身（Resend HTTP API 而不是阿里云 RPC）与 TTL（见 mail-constants）。
 *
 * ## 刻意不引 SDK、也不走 SMTP
 * Resend 的发信就是一个 POST + Bearer，`fetch` 足够；引 SDK 只是为了这一个调用。
 * 不走 SMTP 是因为 Next.js 的 serverless-ish 运行模型下长连接握手（TLS + AUTH）
 * 比一次 HTTP 慢得多，且失败模式（超时卡住）更难给用户一句可行动的话。
 * 桌面仓 Java 那边走 SMTP 是另一回事——它是常驻进程，连接可以复用。
 *
 * ## 失败文案
 * Resend 返回的原始 message **只进日志不外露**（含发信域名与内部错误码）。
 * 给用户的只区分两类：「这个地址不对」与「我们这边发不出去」。
 */
import crypto from 'crypto';
import { getDb, withTransaction } from './db';
import { assertCodeSendAllowed } from './code-send-guard';
import { isReviewIdentity, reviewCodeAccepts } from './review-account';

// 策略常量在 lib/mail-constants.ts（客户端组件也要读，不能走这条含 better-sqlite3 的链）
export {
  MAIL_CODE_TTL_MS, MAIL_RESEND_COOLDOWN_MS, MAIL_MAX_ATTEMPTS, MAIL_MAX_PER_ADDRESS_PER_DAY,
} from './mail-constants';
import {
  MAIL_CODE_TTL_MS, MAIL_RESEND_COOLDOWN_MS, MAIL_MAX_ATTEMPTS,
  MAIL_MAX_PER_ADDRESS_PER_DAY, MAIL_DAY_WINDOW_MS,
} from './mail-constants';

const ENDPOINT = 'https://api.resend.com/emails';

export const SCENE_SIGNIN = 'signin';
export const SCENE_PASSWORD_RESET = 'password_reset';

export class MailError extends Error {}

/**
 * 规范化邮箱：去空格、转小写。
 *
 * 校验用与 `lib/users.ts` `createUser` **同一条**正则，故意保持宽松：邮箱地址的
 * 真实语法（RFC 5322）比任何人写得出的正则都复杂，收紧只会误伤合法地址
 * （`user+tag@`、带连字符的域名、新 gTLD）。真正的校验是「这封信收得到吗」，
 * 而那正是验证码本身在做的事——所以这里只挡明显不是地址的输入。
 */
export function normalizeEmail(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new MailError('Please enter a valid email address');
  }
  // 上限挡住把超长串当输入塞进来的情况（RFC 5321 的地址上限是 254）
  if (trimmed.length > 254) throw new MailError('Please enter a valid email address');
  return trimmed;
}

/** 打码：本地部分留首字符。用作邮箱注册用户的默认 displayName。 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '';
  const local = email.slice(0, at);
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${email.slice(at + 1)}`;
}

interface MailConfig {
  apiKey: string;
  from: string;
}

function mailConfig(): MailConfig | null {
  const apiKey = process.env.AWD_MAIL_RESEND_KEY || '';
  const from = process.env.AWD_MAIL_FROM || '';
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/**
 * 本站是否具备发信能力。
 *
 * 与 `smsEnabled()` 对称：端点在两站都存在（同一份代码），没配密钥时调用会拿到
 * 明确的「本站未启用邮箱验证码」而不是 404——404 会让人以为路由写错了。
 *
 * **这条同时是上线顺序的安全阀**：CI 合并即部署，而密钥要人上服务器写，
 * 「代码已部署、密钥还没注入」是必然出现的中间态。所有「关掉旧路径」的判断
 * 都必须与它同时成立，否则那个中间态下就是两条路都堵死。
 */
export function mailEnabled(): boolean {
  return mailConfig() !== null;
}

/** 验证码邮件正文。纯文本 + 极简 HTML，不引模板系统。 */
function codeMessage(code: string, ttlMinutes: number, scene: string): { subject: string; text: string; html: string } {
  const purpose = scene === SCENE_PASSWORD_RESET ? 'password reset' : 'account verification';
  const subject = `${code} is your AI WorkDeck ${purpose} code`;
  const text =
    `Your AI WorkDeck ${purpose} code is ${code}.\n\n` +
    `It expires in ${ttlMinutes} minutes and can only be used once.\n` +
    `If you did not request this, you can safely ignore this email.\n`;
  const html =
    // 邮件客户端剥 CSS 变量与深色模式自动反色两条硬约束：颜色内联写死十六进制，
    // 保持白底深字（浅茶金/竹月青这类浅底浅字组合在被反色的客户端里会失去对比度）。
    `<p>Your AI WorkDeck ${purpose} code is:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0;color:#2E5A50">${code}</p>` +
    `<p>It expires in ${ttlMinutes} minutes and can only be used once.</p>` +
    `<p style="color:#6B675C;font-size:13px">If you did not request this, you can safely ignore this email.</p>`;
  return { subject, text, html };
}

/** 发一封验证码邮件。失败抛 {@link MailError}，文案已脱敏。 */
async function sendMail(email: string, code: string, scene: string): Promise<void> {
  const cfg = mailConfig();
  if (!cfg) throw new MailError('Email sign-in is not enabled on this site');

  const { subject, text, html } = codeMessage(code, Math.round(MAIL_CODE_TTL_MS / 60_000), scene);

  let status: number;
  let body: string;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: cfg.from, to: [email], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    body = await res.text();
  } catch (e) {
    console.warn('[mail] 网关不可达:', e instanceof Error ? e.message : e);
    throw new MailError('Could not send the code, please try again shortly');
  }

  if (status >= 200 && status < 300) return;

  console.warn('[mail] 发送被拒: status=%s body=%s', status, body.slice(0, 300));
  // 422 是 Resend 对收件地址本身的拒绝（无效地址/被压制），这一类要让用户知道是地址的问题；
  // 429 是我们这边打太快。其余一律通用文案，原始 message 不外露。
  if (status === 422) throw new MailError('That email address was rejected, please check it and try again');
  if (status === 429) throw new MailError('Too many requests, please try again shortly');
  throw new MailError('Could not send the code, please try again shortly');
}

// ---------- 验证码存储 ----------

/**
 * 与短信那份同一口径：落 SQLite 不落内存（pm2 多实例下内存 Map 会让
 * 「A 实例发码、B 实例验码」直接失败），码存哈希不存明文。
 *
 * 哈希挡的是「有人读到库文件就拿到当下所有在途验证码」，不是密码学强度——
 * 6 位数字当然可暴力还原，所以别把它当成可以放宽 TTL 的理由。
 */
function hashCode(email: string, code: string): string {
  return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
}

function newCode(): string {
  // 6 位，允许前导零；crypto.randomInt 是均匀的，别用 Math.random
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** 冷却与当日配额检查。发之前调用，发不出去就不该占用配额。 */
function checkSendAllowed(scene: string, email: string, now: number): void {
  const db = getDb();
  const last = db
    .prepare('SELECT sentAt FROM mail_send_log WHERE scene = ? AND email = ? ORDER BY sentAt DESC LIMIT 1')
    .get(scene, email) as { sentAt: number } | undefined;
  if (last && now - last.sentAt < MAIL_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((MAIL_RESEND_COOLDOWN_MS - (now - last.sentAt)) / 1000);
    throw new MailError(`Too many requests, you can ask for a new code in ${wait}s`);
  }
  const dayCount = db
    .prepare('SELECT COUNT(*) AS n FROM mail_send_log WHERE scene = ? AND email = ? AND sentAt > ?')
    .get(scene, email, now - MAIL_DAY_WINDOW_MS) as { n: number };
  if (dayCount.n >= MAIL_MAX_PER_ADDRESS_PER_DAY) {
    throw new MailError('Daily code limit reached for this address, please try tomorrow or email hi@aiworkdeck.com');
  }
}

/**
 * 发送验证码。
 *
 * **对未注册的邮箱也发**——注册与登录合一，验证通过后没有账号就建一个，所以不存在
 * 「该邮箱是否注册过」的枚举面。代价是任何地址都能触发一封信，靠上面的冷却与当日
 * 配额兜住。是否新用户只在 `verify` 成功后才透露。
 */
export async function sendCode(scene: string, rawEmail: string, ip: string = ''): Promise<void> {
  const email = normalizeEmail(rawEmail);
  // 审核账号（lib/review-account.ts）：它的码是固定的，没有「发一枚新码」这回事。
  // 早退在限流之前——落一条 mail_send_log 就会让审核员被冷却/日配额挡住，
  // 而「不需要开发者介入」正是这条旁路存在的理由。对外仍是成功，客户端照常进入输码那一步。
  if (scene === SCENE_SIGNIN && isReviewIdentity(email)) return;
  const now = Date.now();
  // 同短信：先按 IP 与全局判，再按地址判。换地址绕不过前者。
  assertCodeSendAllowed(ip, now);
  checkSendAllowed(scene, email, now);

  const code = newCode();
  // 先发再落库：发失败就不该产生一条可用的码，也不该占冷却
  await sendMail(email, code, scene);

  const db = getDb();
  db.prepare(
    `INSERT INTO mail_code (scene, email, codeHash, expiresAt, attempts)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(scene, email) DO UPDATE SET
       codeHash = excluded.codeHash, expiresAt = excluded.expiresAt, attempts = 0`
  ).run(scene, email, hashCode(email, code), now + MAIL_CODE_TTL_MS);
  db.prepare('INSERT INTO mail_send_log (scene, email, sentAt, ip) VALUES (?, ?, ?, ?)')
    .run(scene, email, now, ip || null);
  // 顺手清理过期记录，避免日志表无限增长
  db.prepare('DELETE FROM mail_send_log WHERE sentAt < ?').run(now - MAIL_DAY_WINDOW_MS);
}

/**
 * 核销验证码，成功返回规范化邮箱。
 *
 * **错码与过期一律同一句话**，不区分——区分了就是在告诉攻击者哪一步猜对了。
 */
export function verifyCode(scene: string, rawEmail: string, code: string): string {
  const result = withTransaction(() => {
  const email = normalizeEmail(rawEmail);
  // 审核账号 + 固定码：直接放行。**刻意在读 mail_code 之前**——不核销该地址可能
  // 存在的在途验证码（审核员用旁路登录不该把真人刚收到的码作废），也不计失败次数。
  if (scene === SCENE_SIGNIN && reviewCodeAccepts(email, code)) return email;
  const db = getDb();
  const row = db
    .prepare('SELECT codeHash, expiresAt, attempts FROM mail_code WHERE scene = ? AND email = ?')
    .get(scene, email) as { codeHash: string; expiresAt: number; attempts: number } | undefined;

  const reject = () => new MailError('That code is incorrect or has expired');
  if (!row) return reject();
  if (Date.now() > row.expiresAt || row.attempts >= MAIL_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM mail_code WHERE scene = ? AND email = ?').run(scene, email);
    return reject();
  }
  const supplied = typeof code === 'string' ? code.trim() : '';
  // 定长比较：timingSafeEqual 对不等长入参会抛，先比长度
  const expected = Buffer.from(row.codeHash, 'utf8');
  const actual = Buffer.from(hashCode(email, supplied), 'utf8');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    db.prepare('UPDATE mail_code SET attempts = attempts + 1 WHERE scene = ? AND email = ?').run(scene, email);
    return reject();
  }
  // 一次性：核销即删，防重放
  db.prepare('DELETE FROM mail_code WHERE scene = ? AND email = ?').run(scene, email);
  return email;
  });
  if (result instanceof Error) throw result;
  return result;
}
