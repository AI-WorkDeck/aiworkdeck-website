/**
 * 人机验证的供应商分叉与公开参数。
 *
 * ## 为什么两站用不同的供应商
 * - **intl → Cloudflare Turnstile**：免费无限量、隐形（可疑时才出挑战），不打扰用户。
 * - **cn → 阿里云验证码 2.0**：Turnstile 的 `challenges.cloudflare.com` 在大陆访问不稳，
 *   用它等于把大陆用户挡在登录门外。阿里云是拼图滑块，境内链路稳。
 *
 * 这条分叉与「账号本体是手机号还是邮箱」是**两件事**：那个分的是账号体系，
 * 这个分的是**网络可达性**。所以这里直接读 `SITE_ID`，不复用 `phoneIsAccount()`。
 *
 * ## 全部是函数、不是模块顶层 const
 * 与 `smsConfig()` / `mailConfig()` 同一个写法。顶层 const 在**第一次 import 时**
 * 就把 `process.env` 读死了，之后任何环境变化都不生效——测试里改 env 不生效只是表症，
 * 真正的问题是这种模块的行为取决于「谁先 import 了它」，不可预期。
 *
 * `NEXT_PUBLIC_` 变量仍是构建期 inline 的（Next 按字面量替换 `process.env.NEXT_PUBLIC_X`，
 * 包在函数里不影响），所以**改这些值必须重新 build**，与 `NEXT_PUBLIC_AWD_SITE` 同一条约定。
 */
import { SITE_ID } from './site-config';

export type CaptchaProvider = 'turnstile' | 'aliyun';

/** 本站该用哪家。恒有值——是否**启用**由 `lib/captcha.ts` 的 `captchaEnabled()` 决定。 */
export function captchaProvider(): CaptchaProvider {
  return SITE_ID === 'intl' ? 'turnstile' : 'aliyun';
}

/** Turnstile 的公开 site key（intl）。 */
export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY || '';
}

/** 阿里云验证码场景 ID（cn）。控制台「场景管理」里那一串。 */
export function aliyunSceneId(): string {
  return process.env.NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID || '';
}

/**
 * 阿里云前端 SDK 的 `prefix`。控制台上与 SceneId 显示在一起，**没有 API 能取**
 * （2026-08-18 实测 `DescribeCaptcha` / `ListCaptchaScene` 等一系列都是 404），
 * 只能人工从控制台抄下来。
 */
export function aliyunPrefix(): string {
  return process.env.NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX || '';
}

/** 本站的公开参数是否齐了。齐不齐不代表启用——服务端密钥也配上才算。 */
export function publicConfigReady(): boolean {
  return captchaProvider() === 'turnstile'
    ? !!turnstileSiteKey()
    : !!(aliyunSceneId() && aliyunPrefix());
}
