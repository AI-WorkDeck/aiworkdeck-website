/**
 * 审核专用账号的固定验证码（认证旁路）。
 *
 * ## 为什么需要这条
 * Office 插件要上 Microsoft Marketplace，微软要求提供**永久有效、无需开发者介入**的
 * 测试账号——审核员不会联系我们。而插件的登录链路只有验证码一条路
 * （插件云后端转发官网 `POST /api/auth/exchange-key` 的 `{email, code}`），
 * 审核员既收不到我们邮箱里的信，也没有中国手机号。没有这条口子，审核员卡在首屏必拒。
 * 行业常规做法就是给审核账号配一个固定码，写进审核备注里。
 *
 * 形状照抄桌面仓 `backend/.../config/ReviewAccountGate.java`（iOS/小程序审核用的同一条），
 * 两边只要漂了，排查的人一眼能看出漂在哪。
 *
 * ## 这是一个认证旁路，按认证旁路对待
 * - 默认关。两个配置项任意一个为空即全关，不存在「配了一半」的中间态。
 * - 只对**配置里列出的**标识生效，别的邮箱/手机号一律走原路。
 * - 只开在免密登录（`signin`）那条路上，绑定手机号那条（`bind`）不走这里。
 * - 码写错格式就**拒绝启动**（模块加载即抛）。一个配歪了的旁路比没有旁路更糟：
 *   它会以「审核员登不进去」的形式在几天后才暴露，而那时排查方向已经跑到客户端去了。
 *
 * ## 运维要求
 * 审核账号里**不要放真实数据**：谁拿到那 6 位码就能登进这些账号，而这个码是写在
 * 审核备注里给外部人看的。审核结束后把 `AUTH_REVIEW_ACCOUNT_IDENTITY` 清空即可关掉。
 *
 * ## 为什么标识是一个列表
 * 各家审核同时在跑，且要的形状不一样：微软/Apple 要邮箱（国际站），微信小程序审核要
 * 大陆手机号。一次只能配一个的话，两家撞档期就得二选一，而「临时改成另一家」意味着
 * 前一家的审核员会在毫无预兆的情况下登不进去。多个标识共用同一个码即可。
 *
 * ## 为什么规范化是惰性的
 * 规范化要复用 `mail-auth` / `sms-auth` 里那两个函数（配置里写的形式与用户输入的形式
 * 必须落到同一个字符串，否则旁路静默失效），而那两个模块反过来又要 import 本模块。
 * 环形依赖下**在模块顶层调用**对方的函数是不可靠的，所以解析推迟到第一次使用。
 * 结果按 env 原文缓存：env 没动就不重算，动了（测试里会动）自然失效。
 */
import crypto from 'crypto';
import { normalizeEmail } from './mail-auth';
import { normalizePhone } from './sms-auth';

/** 逗号分隔的标识列表，写规范化后的形式（邮箱小写、手机号 11 位纯数字）。 */
const IDENTITY_ENV = 'AUTH_REVIEW_ACCOUNT_IDENTITY';
/** 6 位数字，所有标识共用。 */
const CODE_ENV = 'AUTH_REVIEW_ACCOUNT_CODE';

const CODE_RE = /^\d{6}$/;

/** 配置本身写错了。这类错误不该被当成「这次登录失败」吞掉。 */
export class ReviewAccountConfigError extends Error {}

function rawIdentity(): string {
  return (process.env[IDENTITY_ENV] ?? '').trim();
}

function rawCode(): string {
  return (process.env[CODE_ENV] ?? '').trim();
}

function assertCodeFormat(identity: string, code: string): void {
  if (!identity || !code) return; // 没开就不管格式
  if (!CODE_RE.test(code)) {
    throw new ReviewAccountConfigError(
      `${CODE_ENV} 必须是 6 位数字（当前长度 ${code.length}）：客户端的验证码输入框只收 ` +
        '6 位数字，配成别的形式等于这条旁路永远走不通，而症状要等审核员登不进去才看得见。'
    );
  }
}

// 模块加载即校验格式：配歪了要在部署当时就炸，而不是等审核员来试。
// 同时打一行 warn——生产上开着这条口子是有意为之还是配漏了，只能靠它区分。
// 这里列的是 env 里的**原文**（打码后）而不是规范化结果：规范化要调 mail-auth /
// sms-auth，而那两个模块反过来又 import 本模块，模块顶层跨环调用不可靠（见文件头）。
{
  const identity = rawIdentity();
  const code = rawCode();
  assertCodeFormat(identity, code);
  if (identity && code) {
    console.warn(
      '审核账号旁路已启用：%s 可用固定验证码登录。审核结束后清空 %s 关闭。',
      identity.split(',').map(s => s.trim()).filter(Boolean).map(mask).join(', '),
      IDENTITY_ENV
    );
  }
}

interface Resolved {
  /** env 原文，用作缓存键 */
  key: string;
  identities: Set<string>;
  code: string;
}

let cache: Resolved | null = null;

/** 打码：邮箱留首字符，手机号前 3 后 2。日志会被搬运，不落完整标识。 */
function mask(id: string): string {
  const at = id.indexOf('@');
  if (at > 1) return `${id[0]}***${id.slice(at)}`;
  return id.length <= 4 ? '***' : `${id.slice(0, 3)}****${id.slice(-2)}`;
}

/**
 * 配置里的一条标识 → 规范化形式。用的是各通道**自己那个**规范化函数，
 * 与用户输入走的是同一条，两边不一致的表现是旁路静默失效。
 */
function normalizeIdentity(raw: string): string | null {
  try {
    return raw.includes('@') ? normalizeEmail(raw) : normalizePhone(raw);
  } catch {
    return null;
  }
}

function resolve(): Resolved {
  const identity = rawIdentity();
  const code = rawCode();
  const key = `${identity}|${code}`;
  if (cache && cache.key === key) return cache;

  assertCodeFormat(identity, code);

  const identities = new Set<string>();
  if (identity && code) {
    for (const entry of identity.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const normalized = normalizeIdentity(trimmed);
      if (!normalized) {
        // 不抛：一条写歪的标识不该让整站登录挂掉。但必须响，否则就是静默失效。
        console.warn(
          '[review-account] 忽略无法规范化的标识 %s：既不是合法邮箱，也不是 11 位大陆手机号',
          mask(trimmed)
        );
        continue;
      }
      identities.add(normalized);
    }
  }

  cache = { key, identities, code };
  return cache;
}

/** 这条旁路是否开着。 */
export function reviewAccountEnabled(): boolean {
  return resolve().identities.size > 0;
}

/**
 * 这个标识是不是审核账号。
 *
 * 传进来的必须是**规范化之后**的标识（邮箱过 `normalizeEmail`、手机号过 `normalizePhone`）。
 */
export function isReviewIdentity(normalizedIdentity: string | null | undefined): boolean {
  if (!normalizedIdentity) return false;
  return resolve().identities.has(normalizedIdentity);
}

/**
 * 审核账号 + 正确的固定码。
 *
 * 定长比较：这 6 位码不像一次性码那样验一次就作废，它长期有效，
 * 逐位早退的比较在这里是有意义的侧信道。
 */
export function reviewCodeAccepts(
  normalizedIdentity: string | null | undefined,
  candidate: string | null | undefined
): boolean {
  if (!isReviewIdentity(normalizedIdentity)) return false;
  const supplied = typeof candidate === 'string' ? candidate.trim() : '';
  const expected = Buffer.from(resolve().code, 'utf8');
  const actual = Buffer.from(supplied, 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
