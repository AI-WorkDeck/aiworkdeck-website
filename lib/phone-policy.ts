/**
 * 大陆站手机号登录的迁移策略（spec §5）。
 *
 * 口径是维护者定的**硬期限，不搞长期并行**：
 * - 期限前：密码登录仍开，但登录后 `phone` 为空要强制绑定，绑完才能继续用。
 * - 期限后：未绑定的账号一律拒绝登录，文案指向 hi@aiworkdeck.com。
 *
 * 期限是配置项不是硬编码：要延期改环境变量即可，不用发版。
 * 与桌面仓的 `auth.phone-binding-deadline` 同默认值，两边别漂。
 *
 * **为什么用 `NEXT_PUBLIC_` 前缀**：这个日期既要在服务端判闸，又要在登录页文案里显示。
 * 用普通环境变量的话客户端读不到（恒 undefined），文案就得另存一份——两份必然漂，
 * 而漂的后果是「页面上写着还能用到 X 日，实际 X-30 日就登不进去了」。
 * 代价是改它必须重新 build，与 `NEXT_PUBLIC_AWD_SITE` 同一条约定（CI 每次部署都重 build）。
 */
import { SITE_ID } from './site-config';

/** 默认硬期限。改这个值要同步桌面仓 application.yml 的 auth.phone-binding-deadline。 */
export const DEFAULT_BINDING_DEADLINE = '2026-09-30';

/** 人工通道。被锁在门外的用户只能看到这一个出口，改之前先确认有人值守。 */
export const SUPPORT_EMAIL = 'hi@aiworkdeck.com';

/** 本站是否以手机号为账号本体。只有大陆站是。 */
export function phoneIsAccount(): boolean {
  return SITE_ID === 'cn';
}

/**
 * 补绑期截止日（当天 23:59:59 之前都算期限内，按服务器本地时区）。
 * 格式非法时**回落到默认值而不是放行**——把 deadline 配错就无限期延期，
 * 那是最容易被忽略的静默失效。
 */
export function bindingDeadline(): Date {
  const raw = process.env.NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE || DEFAULT_BINDING_DEADLINE;
  const parsed = new Date(`${raw}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) {
    console.warn('[phone-policy] NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE 格式非法，回落默认值: %s', raw);
    return new Date(`${DEFAULT_BINDING_DEADLINE}T23:59:59`);
  }
  return parsed;
}

/** 补绑期是否已过。 */
export function bindingDeadlinePassed(now: Date = new Date()): boolean {
  return now.getTime() > bindingDeadline().getTime();
}

/**
 * 存量账号在本次登录时该怎么处理。
 *
 * - `ok`：放行（intl 站、或已绑号）
 * - `must_bind`：放行但前端要立刻弹强制绑定（期限内、未绑号）
 * - `blocked`：拒绝登录（期限后、未绑号）
 */
export type PhoneGate = 'ok' | 'must_bind' | 'blocked';

export function gateForUser(user: { phone?: string }, now: Date = new Date()): PhoneGate {
  if (!phoneIsAccount()) return 'ok';
  if (user.phone) return 'ok';
  return bindingDeadlinePassed(now) ? 'blocked' : 'must_bind';
}

/** 给用户文案用的期限日期串（YYYY-MM-DD）。与 {@link bindingDeadline} 同一个源。 */
export function bindingDeadlineLabel(): string {
  return process.env.NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE || DEFAULT_BINDING_DEADLINE;
}
