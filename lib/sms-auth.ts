/**
 * 大陆站手机号验证码登录——短信通道与验证码存储。
 *
 * ## 为什么官网自己实现，而不是转调 Java 后端
 * 官网账号是 Credits、支付、公开主页、API key 的宿主；Java 后端的账号是桌面端/移动端
 * 的登录身份。两者本就是两套东西（靠 API key 连接，见 `lib/api-keys.ts`）。让官网登录
 * 去依赖北京 Java 云，等于把「能不能登录官网」押在另一个服务活着——而官网登录背后就是
 * 付款。2026-08-18 维护者拍板走「官网自建」。
 *
 * ## 刻意不引入阿里云 SDK
 * RPC 签名（HMAC-SHA1）几十行可覆盖。桌面仓 `SmsService.java` 是同一套算法的 Java 版，
 * 两边的 `signedForm` 用同一组入参必须产出同一个签名串（`scripts/verify-sms.mts` 对拍）。
 *
 * ## 失败文案
 * 阿里云返回的原始 Message **只进日志不外露**（含账号信息与内部错误码）。
 * 给用户的文案只区分两类：「这个号码不对」与「我们这边发不出去」。
 */
import crypto from 'crypto';
import type { Locale } from '@/i18n-config';
import { getDb, withTransaction } from './db';
import { assertCodeSendAllowed } from './code-send-guard';
import { isReviewIdentity, reviewCodeAccepts } from './review-account';
import { pickLangText } from './api-locale';

// 策略常量在 lib/sms-constants.ts（客户端组件也要读，不能走这条含 better-sqlite3 的链）
export {
  CODE_TTL_MS, RESEND_COOLDOWN_MS, MAX_ATTEMPTS, MAX_PER_PHONE_PER_DAY,
} from './sms-constants';
import {
  CODE_TTL_MS, RESEND_COOLDOWN_MS, MAX_ATTEMPTS, MAX_PER_PHONE_PER_DAY, DAY_WINDOW_MS,
} from './sms-constants';

const ENDPOINT = 'https://dysmsapi.aliyuncs.com/';
const API_VERSION = '2017-05-25';

export const SCENE_SIGNIN = 'signin';
export const SCENE_PASSWORD_RESET = 'password_reset';
export const SCENE_BIND = 'bind';

/** 大陆号：1 开头 11 位。 */
const MAINLAND_PHONE = /^1\d{10}$/;

export class SmsError extends Error {}

/**
 * 规范化手机号：去掉空格/括号/连字符与 `+86` 前缀，只接受大陆 11 位。
 *
 * **有意与桌面仓 `SmsAuthService.normalizePhone` 不同**：那边还放行 E.164，因为它有
 * `TwilioSmsGateway` 兜着境外号（未开通时判「暂不支持」）。官网这边没有任何国际通道，
 * 放行 E.164 只会让号码一路走到阿里云再被拒——白烧一次 API 调用，还只能回一句通用的
 * 「发送失败」，用户根本不知道是号码写错了。
 *
 * 附带修掉的一个坑：E.164 的 `^\+?[1-9]\d{7,14}$` 会把 10 位的 `1380013800`
 * 当合法号放行（少打一位的最常见笔误），恰好绕开大陆 11 位校验。
 */
export function normalizePhone(raw: string | undefined | null, lang: Locale = 'zh'): string {
  let trimmed = (raw ?? '').replace(/[\s()-]/g, '');
  if (trimmed.startsWith('+86')) trimmed = trimmed.slice(3);
  if (MAINLAND_PHONE.test(trimmed)) return trimmed;
  throw new SmsError(pickLangText(lang, '请输入 11 位中国大陆手机号', 'Please enter an 11-digit mainland China mobile number'));
}

/** 打码：前 3 后 4。用作手机号注册用户的默认 displayName。 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

// ---------- 阿里云 RPC 签名 ----------

/**
 * RFC3986 百分号编码。`encodeURIComponent` 与阿里云签名规范有三处差异，必须修正
 * （与桌面仓 `SmsService.pctEncode` 一致）。
 */
export function pctEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/**
 * 按阿里云 RPC 风格签名并编码为表单体（POST）。纯函数，供对拍脚本调用。
 * @returns `Signature=...&K1=V1&...`（键按字典序，RFC3986 百分号编码）
 */
export function signedForm(params: Record<string, string>, secret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map(k => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join('&');
  const toSign = `POST&%2F&${pctEncode(canonical)}`;
  const signature = crypto
    .createHmac('sha1', `${secret}&`)
    .update(toSign, 'utf8')
    .digest('base64');
  return `Signature=${pctEncode(signature)}&${canonical}`;
}

interface SmsConfig {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
}

function smsConfig(): SmsConfig | null {
  const accessKeyId = process.env.AWD_SMS_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.AWD_SMS_ACCESS_KEY_SECRET || '';
  const signName = process.env.AWD_SMS_SIGN_NAME || '';
  const templateCode = process.env.AWD_SMS_TEMPLATE_CODE || '';
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) return null;
  return { accessKeyId, accessKeySecret, signName, templateCode };
}

/**
 * 本站是否具备短信能力。
 *
 * 国际站（intl）恒 false——`.ai` 那台没有短信通道，Twilio 未开通。端点在两站都存在
 * （同一份代码），intl 上调用会拿到明确的「本站未启用短信」而不是 404：
 * 404 会让人以为是路由写错了，排查方向整个偏掉。
 */
export function smsEnabled(): boolean {
  return smsConfig() !== null;
}

/** 发一条验证码短信。失败抛 {@link SmsError}，文案已脱敏。 */
async function sendSms(phone: string, code: string, lang: Locale = 'zh'): Promise<void> {
  const cfg = smsConfig();
  if (!cfg) {
    throw new SmsError(
      pickLangText(lang, '本站未启用短信验证，请改用邮箱方式', 'SMS verification is not enabled on this site; please use email instead')
    );
  }

  const params: Record<string, string> = {
    Action: 'SendSms',
    Version: API_VERSION,
    Format: 'JSON',
    RegionId: 'cn-hangzhou',
    AccessKeyId: cfg.accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    PhoneNumbers: phone,
    SignName: cfg.signName,
    TemplateCode: cfg.templateCode,
    TemplateParam: JSON.stringify({ code }),
  };

  const genericFail = pickLangText(lang, '短信发送失败，请稍后重试', 'Failed to send SMS. Please try again later.');
  let status: number;
  let text: string;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: signedForm(params, cfg.accessKeySecret),
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    text = await res.text();
  } catch (e) {
    console.warn('[sms] 网关不可达:', e instanceof Error ? e.message : e);
    throw new SmsError(genericFail);
  }

  if (status !== 200) {
    console.warn('[sms] 网关异常: status=%s body=%s', status, text.slice(0, 300));
    throw new SmsError(genericFail);
  }

  let resultCode = '';
  let message = '';
  try {
    const parsed = JSON.parse(text);
    resultCode = String(parsed.Code ?? '');
    message = String(parsed.Message ?? '');
  } catch {
    console.warn('[sms] 响应解析失败: %s', text.slice(0, 300));
    throw new SmsError(genericFail);
  }

  if (resultCode === 'OK') return;

  console.warn('[sms] 发送被拒: code=%s message=%s', resultCode, message);
  // 限流类给出可行动文案，其余一律通用文案（阿里云原始 Message 不外露）
  if (resultCode === 'isv.BUSINESS_LIMIT_CONTROL') {
    throw new SmsError(pickLangText(lang, '短信发送过于频繁，请稍后再试', 'SMS requests are too frequent. Please try again later.'));
  }
  throw new SmsError(genericFail);
}

// ---------- 验证码存储 ----------

/**
 * 验证码落 SQLite 而不是内存：官网在 pm2 下可能多实例，内存 Map 会让「A 实例发码、
 * B 实例验码」直接失败，且重启即失效。
 *
 * 码存哈希不存明文。6 位数字的哈希当然可暴力还原，这一步挡的是「有人读到库文件就
 * 拿到了当下所有在途验证码」，不是密码学强度——所以别把它当成可以放宽 TTL 的理由。
 */
function hashCode(phone: string, code: string): string {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

function newCode(): string {
  // 6 位，允许前导零；crypto.randomInt 是均匀的，别用 Math.random
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** 冷却与当日配额检查。发之前调用，发不出去就不该占用配额。 */
function checkSendAllowed(scene: string, phone: string, now: number, lang: Locale = 'zh'): void {
  const db = getDb();
  const last = db
    .prepare('SELECT sentAt FROM sms_send_log WHERE scene = ? AND phone = ? ORDER BY sentAt DESC LIMIT 1')
    .get(scene, phone) as { sentAt: number } | undefined;
  if (last && now - last.sentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last.sentAt)) / 1000);
    throw new SmsError(
      pickLangText(lang, `请求过于频繁，${wait} 秒后可重新获取验证码`, `Too many requests. Please wait ${wait}s before requesting another code.`)
    );
  }
  const dayCount = db
    .prepare('SELECT COUNT(*) AS n FROM sms_send_log WHERE scene = ? AND phone = ? AND sentAt > ?')
    .get(scene, phone, now - DAY_WINDOW_MS) as { n: number };
  if (dayCount.n >= MAX_PER_PHONE_PER_DAY) {
    throw new SmsError(
      pickLangText(
        lang,
        '该号码今日获取验证码次数已达上限，请明天再试或邮件联系 hi@aiworkdeck.com',
        'Daily verification code limit reached for this number. Please try again tomorrow or email hi@aiworkdeck.com'
      )
    );
  }
}

/**
 * 发送验证码。
 *
 * **对未注册的号码也发**——注册与登录合一，验证通过后没有账号就建一个，所以不存在
 * 「该号是否注册过」的枚举面。代价是任何号码都能触发一条短信，靠上面的冷却与当日
 * 配额兜住。是否新用户只在 `verify` 成功后才透露。
 */
export async function sendCode(scene: string, rawPhone: string, ip: string = '', lang: Locale = 'zh'): Promise<void> {
  const phone = normalizePhone(rawPhone, lang);
  // 审核账号（lib/review-account.ts）：固定码没有「发一枚新码」这回事。早退在限流之前，
  // 否则审核员会被冷却/日配额挡住，而那正是这条旁路要消除的「需要开发者介入」。
  // **只在 signin 上**：绑定手机号（SCENE_BIND）是把号写进真账号，不给旁路。
  if (scene === SCENE_SIGNIN && isReviewIdentity(phone)) return;
  const now = Date.now();
  // 先按 IP 与全局判，再按号码判：换号绕不过前者，而后者才是「这个号别再发了」
  assertCodeSendAllowed(ip, now, lang);
  checkSendAllowed(scene, phone, now, lang);

  const code = newCode();
  // 先发再落库：发失败就不该产生一条可用的码，也不该占冷却
  await sendSms(phone, code, lang);

  const db = getDb();
  db.prepare(
    `INSERT INTO sms_code (scene, phone, codeHash, expiresAt, attempts)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(scene, phone) DO UPDATE SET
       codeHash = excluded.codeHash, expiresAt = excluded.expiresAt, attempts = 0`
  ).run(scene, phone, hashCode(phone, code), now + CODE_TTL_MS);
  db.prepare('INSERT INTO sms_send_log (scene, phone, sentAt, ip) VALUES (?, ?, ?, ?)')
    .run(scene, phone, now, ip || null);
  // 顺手清理过期记录，避免日志表无限增长
  db.prepare('DELETE FROM sms_send_log WHERE sentAt < ?').run(now - DAY_WINDOW_MS);
}

/**
 * 核销验证码，成功返回规范化号码。
 *
 * **错码与过期一律同一句话**，不区分——区分了就是在告诉攻击者哪一步猜对了。
 */
export function verifyCode(scene: string, rawPhone: string, code: string, lang: Locale = 'zh'): string {
  const result = withTransaction(() => {
  const phone = normalizePhone(rawPhone, lang);
  // 审核账号 + 固定码：直接放行。**刻意在读 sms_code 之前**——不核销该号可能存在的
  // 在途验证码，也不计失败次数。同样只在 signin 上，SCENE_BIND 不走这里。
  if (scene === SCENE_SIGNIN && reviewCodeAccepts(phone, code)) return phone;
  const db = getDb();
  const row = db
    .prepare('SELECT codeHash, expiresAt, attempts FROM sms_code WHERE scene = ? AND phone = ?')
    .get(scene, phone) as { codeHash: string; expiresAt: number; attempts: number } | undefined;

  const reject = () => new SmsError(pickLangText(lang, '验证码错误或已过期', 'Invalid or expired verification code'));
  if (!row) return reject();
  if (Date.now() > row.expiresAt || row.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM sms_code WHERE scene = ? AND phone = ?').run(scene, phone);
    return reject();
  }
  const supplied = typeof code === 'string' ? code.trim() : '';
  // 定长比较：timingSafeEqual 对不等长入参会抛，先比长度
  const expected = Buffer.from(row.codeHash, 'utf8');
  const actual = Buffer.from(hashCode(phone, supplied), 'utf8');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    db.prepare('UPDATE sms_code SET attempts = attempts + 1 WHERE scene = ? AND phone = ?').run(scene, phone);
    return reject();
  }
  // 一次性：核销即删，防重放
  db.prepare('DELETE FROM sms_code WHERE scene = ? AND phone = ?').run(scene, phone);
  return phone;
  });
  if (result instanceof Error) throw result;
  return result;
}
