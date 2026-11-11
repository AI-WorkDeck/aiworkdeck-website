import crypto from 'crypto';
import { SITE_ID } from './site-config';

/**
 * 小程序服务端接口（dev-board#305）：stable token、getPhoneNumber 换号、URL Link 生成。
 *
 * 伴生仓（aiworkdeck_mobile）的小程序**没有自己的后端**，getPhoneNumber 的 code
 * 直接传到本站端点，由这里持 AppSecret 调微信接口换真实手机号——手机号明文
 * 只存在于本进程内，不回传给小程序。
 *
 * AppSecret 只放服务器 env（WX_MINI_APP_SECRET），未配置时所有入口一律判「未开通」，
 * 不半途报错。国际站永远未开通（小程序主体在大陆）。
 */

/** 拍照/录音伴侣小程序（微信公众平台，企业认证主体）。appid 是公开标识，非密。 */
export const WX_MINI_APPID = 'wx67b9a7d0449be0b4';

/** 小程序引流落地页（伴生仓 miniprogram/pages/start/start）。 */
export const WX_MINI_START_PAGE = 'pages/start/start';

export class WxError extends Error {
  errcode: number;
  constructor(errcode: number, errmsg: string) {
    super(`[wx ${errcode}] ${errmsg}`);
    this.errcode = errcode;
    this.name = 'WxError';
  }
}

function secret(): string {
  return process.env.WX_MINI_APP_SECRET || '';
}

/** 换号端点可用：大陆站 + AppSecret 已配。 */
export function wxMiniConfigured(): boolean {
  return SITE_ID === 'cn' && !!secret();
}

/**
 * /start 微信内是否展示「微信一键开始」。与 wxMiniConfigured 分开设开关：
 * AppSecret 在小程序过审**之前**就要上服务器（体验版真机测试要打本站换号端点），
 * 但引流按钮必须等小程序正式发布才能亮——URL Link 拉起未发布的小程序对普通
 * 用户是死链。过审发布后在服务器 env 置 WX_START_MINIAPP=1 即可，无需发版。
 */
export function wxStartEnabled(): boolean {
  return wxMiniConfigured() && process.env.WX_START_MINIAPP === '1';
}

const WX_API = 'https://api.weixin.qq.com';

async function wxPost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${WX_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new WxError(-1, `HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data?.errcode === 'number' && data.errcode !== 0) {
    throw new WxError(data.errcode, String(data.errmsg || ''));
  }
  return data;
}

// ---------- access token（stable 版，进程内缓存） ----------

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * 用 stable_token 而非 cgi-bin/token：普通模式下不使旧 token 失效，
 * 将来若有别的进程（如插件云后端）也拿这个 appid 的 token 不会互相顶掉。
 */
async function accessToken(force = false): Promise<string> {
  if (!force && tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const data = await wxPost('/cgi-bin/stable_token', {
    grant_type: 'client_credential',
    appid: WX_MINI_APPID,
    secret: secret(),
  });
  // 提前 5 分钟过期，避开边界上的 40001
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
  return tokenCache.token;
}

/** token 相关错误码：40001 无效、42001 过期、40014 不合法——重取一次再试。 */
const TOKEN_ERRCODES = new Set([40001, 42001, 40014]);

/**
 * 供 `lib/payments/wxvp-adapter.ts` 用：虚拟支付的服务器 API（/xpay/*）认的
 * 也是这把 stable token。导出的是**包装**而不是把 `accessToken` 本身改成
 * 导出——本文件里三处调用点一行都不动。
 */
export function wxAccessToken(force = false): Promise<string> {
  return accessToken(force);
}

/** 同上：/xpay/* 的重取逻辑要跟这里认同一组错误码，不另抄一份。 */
export const WX_TOKEN_ERRCODES: ReadonlySet<number> = TOKEN_ERRCODES;

async function wxApiCall(path: string, body: Record<string, unknown>): Promise<any> {
  const token = await accessToken();
  try {
    return await wxPost(`${path}?access_token=${token}`, body);
  } catch (e) {
    if (e instanceof WxError && TOKEN_ERRCODES.has(e.errcode)) {
      return wxPost(`${path}?access_token=${await accessToken(true)}`, body);
    }
    throw e;
  }
}

// ---------- jscode2session ----------

export interface WxSession {
  openid: string;
  /**
   * 会话密钥。虚拟支付的**用户态签名**要拿它当 HMAC key。
   *
   * **只在本进程内存里活到签完那一刻：不落库、不进响应、不打日志。**
   * 它等价于「这个用户此刻的登录态」，泄漏一把就等于能替这个用户签任意
   * 虚拟支付请求。日志尤其危险——日志会被采集、会被转发、会被翻。
   */
  sessionKey: string;
}

/**
 * 拿小程序 `wx.login()` 的 code 换 openid + session_key。code 单次有效。
 *
 * 走 GET `/sns/jscode2session`（这条接口不吃 access_token，直接用 AppSecret）。
 */
export async function wxCode2Session(code: string): Promise<WxSession> {
  const query = new URLSearchParams({
    appid: WX_MINI_APPID,
    secret: secret(),
    js_code: code,
    grant_type: 'authorization_code',
  });
  const res = await fetch(`${WX_API}/sns/jscode2session?${query.toString()}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new WxError(-1, `HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data?.errcode === 'number' && data.errcode !== 0) {
    throw new WxError(data.errcode, String(data.errmsg || ''));
  }
  if (!data?.openid || !data?.session_key) {
    // 刻意不把 data 打出来：里面就是 session_key
    throw new WxError(-1, 'jscode2session 响应缺 openid 或 session_key');
  }
  return { openid: String(data.openid), sessionKey: String(data.session_key) };
}

// ---------- getPhoneNumber 换号 ----------

export interface WxPhoneInfo {
  purePhoneNumber: string;
  countryCode: string;
}

/** 拿小程序 button open-type="getPhoneNumber" 的 code 换真实手机号。code 单次有效。 */
export async function wxGetPhoneNumber(code: string): Promise<WxPhoneInfo> {
  const data = await wxApiCall('/wxa/business/getuserphonenumber', { code });
  const info = data?.phone_info;
  if (!info?.purePhoneNumber) throw new WxError(-1, 'phone_info 缺失');
  return { purePhoneNumber: String(info.purePhoneNumber), countryCode: String(info.countryCode ?? '') };
}

// ---------- URL Link 生成 ----------

/** 同一 query 的链接缓存 6 小时：URL Link 生成有单日配额，别按点击白烧。 */
const LINK_CACHE_MS = 6 * 60 * 60_000;
const linkCache = new Map<string, { url: string; at: number }>();

/**
 * 生成拉起引流页的 URL Link（微信内外均可打开）。链接 30 天有效——按需生成
 * 加缓存，永远给得出没过期的链接，不用管「永久链接」已下线的历史包袱。
 *
 * WX_MINI_ENV=trial/develop 时拉起体验版/开发版（仅体验者可打开），
 * 供过审前真机走通全链路；不配置即正式版。
 */
export async function wxStartUrlLink(query: string): Promise<string> {
  const cached = linkCache.get(query);
  if (cached && Date.now() - cached.at < LINK_CACHE_MS) return cached.url;

  const envVersion = process.env.WX_MINI_ENV;
  const data = await wxApiCall('/wxa/generate_urllink', {
    path: WX_MINI_START_PAGE,
    query,
    expire_type: 1,
    expire_interval: 30,
    ...(envVersion === 'trial' || envVersion === 'develop' ? { env_version: envVersion } : {}),
  });
  const url = String(data.url_link);
  linkCache.set(query, { url, at: Date.now() });
  return url;
}

// ---------- 一次性登录票据 ----------

/**
 * 换号成功后端点回给小程序的不是手机号明文，而是一张 10 分钟有效、一次性的
 * 票据；持票据到 /api/auth/wx-ticket 可换本站会话。进程内存储即可——
 * 票据本来就是短命的，重启丢掉的最多是「刚好卡在这 10 分钟里」的极少数。
 */
const TICKET_TTL_MS = 10 * 60_000;
const tickets = new Map<string, { userId: string; expiresAt: number }>();

export function issueWxTicket(userId: string): string {
  // 顺手清过期票，避免 Map 无限增长
  const now = Date.now();
  for (const [k, v] of tickets) {
    if (v.expiresAt <= now) tickets.delete(k);
  }
  const token = crypto.randomBytes(32).toString('hex');
  tickets.set(token, { userId, expiresAt: now + TICKET_TTL_MS });
  return token;
}

/** 核销票据（一次性：核销即删）。无效/过期返回 null。 */
export function redeemWxTicket(token: string): string | null {
  const entry = tickets.get(token);
  if (!entry) return null;
  tickets.delete(token);
  return entry.expiresAt > Date.now() ? entry.userId : null;
}
