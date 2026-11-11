/**
 * 人机验证的**服务端校验**。两站两家，见 `lib/captcha-config.ts` 的分叉理由。
 *
 * ## 它挡的是什么、不挡什么
 * 挡的是「脚本批量请求验证码」。**它不是限流的替代品**——`lib/code-send-guard.ts`
 * 那两道闸（按 IP + 全局熔断）是always-on 的兜底，这一层只是把成本抬高。
 * 真正拦住批量的是背后的行为风控与设备指纹，不是「拖动滑块」这个动作本身。
 *
 * ## 三条刻意的决定
 *
 * **① 没配齐就完全不生效。** 与 `smsEnabled()` / `mailEnabled()` 同一个形状：
 * 公开参数与密钥**都**配上才启用。CI 合并即部署而密钥要人上服务器写，
 * 「代码已部署、密钥还没注入」是必然出现的中间态；那个窗口里要是强制校验，
 * 所有人都发不出验证码。
 *
 * **② token 无效 → 拒；校验服务本身连不上 → 放行并告警。**
 * 前者是「你没通过」，后者是「我们问不到人」。后者若也拒，等于把
 * Cloudflare/阿里云的可用性变成我们登录的可用性——它们抖一下我们就全站登不进来。
 * 放行不等于没有防线：Layer 1 的 IP 限流与全局熔断照常生效。
 *
 * **③ 缺 token 一律拒（在启用的前提下）。** 不能因为「老客户端不会带」就放行——
 * 那样任何人只要不带 token 就绕过去了，这条闸就是摆设。老客户端要能过，
 * 必须真的把 token 透传过来（桌面端那条链见 AccountService.sendLoginCode）。
 */
import { consumeChallenge, type ChallengeContext } from './captcha-challenge';
import { signedForm } from './sms-auth';
import { captchaProvider, turnstileSiteKey, aliyunSceneId, aliyunPrefix, publicConfigReady } from './captcha-config';

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ALIYUN_ENDPOINT = 'https://captcha.cn-shanghai.aliyuncs.com/';
const ALIYUN_VERSION = '2023-03-05';

export class CaptchaRejected extends Error {}

function turnstileSecret(): string {
  return process.env.AWD_TURNSTILE_SECRET || '';
}

function aliyunCreds(): { id: string; secret: string } | null {
  const id = process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID || '';
  const secret = process.env.AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET || '';
  return id && secret ? { id, secret } : null;
}

/**
 * 本站此刻是否真的启用人机验证：公开参数与服务端密钥**都**齐了才算。
 * 客户端不能自己判（密钥不带 `NEXT_PUBLIC_`，那边永远读不到），
 * 由服务端页面算好、用 prop 传给表单——同 `codeChannelReady` 的做法。
 */
export function captchaEnabled(): boolean {
  if (!publicConfigReady()) return false;
  return captchaProvider() === 'turnstile' ? !!turnstileSecret() : !!aliyunCreds();
}

/**
 * 启用时给客户端的公开参数；未启用返回 null，客户端据此**不渲染**控件。
 * 只有这一个出口，避免出现「控件渲染了但服务端没校验」的安全剧场。
 */
export function captchaClientConfig():
  | { provider: 'turnstile'; siteKey: string }
  | { provider: 'aliyun'; sceneId: string; prefix: string }
  | null {
  if (!captchaEnabled()) return null;
  if (captchaProvider() === 'turnstile') return { provider: 'turnstile', siteKey: turnstileSiteKey() };
  return { provider: 'aliyun', sceneId: aliyunSceneId(), prefix: aliyunPrefix() };
}

/** Turnstile：token 一次性、5 分钟过期。 */
async function verifyTurnstile(token: string, ip: string): Promise<void> {
  const body = new URLSearchParams({ secret: turnstileSecret(), response: token });
  if (ip) body.set('remoteip', ip);

  let json: any;
  try {
    const res = await fetch(TURNSTILE_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    json = await res.json();
  } catch (e) {
    // 决定②：问不到人就放行，但要吵
    console.error('[captcha] Turnstile 校验服务不可达，本次放行:', e instanceof Error ? e.message : e);
    return;
  }
  if (json?.success === true) return;
  console.warn('[captcha] Turnstile 拒绝: %s', JSON.stringify(json?.['error-codes'] ?? json).slice(0, 200));
  throw new CaptchaRejected('Verification failed, please try again');
}

/**
 * 阿里云验证码 2.0。
 *
 * **签名用的是老的 V1 HMAC-SHA1 RPC 版**（不是 ACS3-HMAC-SHA256），与 dysmsapi 同一套，
 * 所以直接复用 `sms-auth` 的 `signedForm`——2026-08-18 对真接口实测确认过。
 */
async function verifyAliyun(token: string, ip: string): Promise<void> {
  const creds = aliyunCreds()!;
  const params: Record<string, string> = {
    Action: 'VerifyIntelligentCaptcha',
    Version: ALIYUN_VERSION,
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    AccessKeyId: creds.id,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    CaptchaVerifyParam: token,
    SceneId: aliyunSceneId(),
  };

  let json: any;
  try {
    const res = await fetch(ALIYUN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: signedForm(params, creds.secret),
      signal: AbortSignal.timeout(10_000),
    });
    json = await res.json();
  } catch (e) {
    console.error('[captcha] 阿里云校验服务不可达，本次放行:', e instanceof Error ? e.message : e);
    return;
  }
  // 注意两层：外层 Success 是「这次调用成功」，Result.VerifyResult 才是「人过了没」。
  // 只看外层会把所有失败的校验都当成通过——这是这个接口最容易写错的地方。
  if (json?.Success === true && json?.Result?.VerifyResult === true) return;
  console.warn('[captcha] 阿里云拒绝: code=%s verifyCode=%s',
    json?.Code, json?.Result?.VerifyCode);
  throw new CaptchaRejected('Verification failed, please try again');
}

/**
 * 校验一枚 token。未启用时直接返回（不做任何网络调用）。
 * 失败抛 {@link CaptchaRejected}，调用方回 403。
 */
export async function verifyCaptcha(token: string | undefined | null, ip: string, context?: ChallengeContext): Promise<void> {
  const value = typeof token === 'string' ? token.trim() : '';
  if (value.startsWith('local:')) {
    if (!consumeChallenge(value, context, ip)) throw new CaptchaRejected('Incorrect or expired security check');
    return;
  }
  if (!captchaEnabled()) return;
  // 决定③：缺 token 就是没通过，不能因为「老客户端不带」而放行
  if (!value) throw new CaptchaRejected('Please complete the verification first');
  return captchaProvider() === 'turnstile' ? verifyTurnstile(value, ip) : verifyAliyun(value, ip);
}
