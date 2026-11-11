/**
 * 邮箱是不是本站的账号本体。
 *
 * 与 `lib/phone-policy.ts` 的 `phoneIsAccount()` 是同一条分叉的两半：
 * cn 站账号本体是手机号，intl 站是邮箱。两个都为真的站不存在，两个都为假也不存在。
 *
 * **为什么 intl 需要这条而不是继续用口令**：注册时收的 `email` 从来没有被验证过
 * （`createUser` 只做格式校验），也就是说 intl 站握着的联系方式是**没有证据**的。
 * 口令登录既不证明邮箱属实，也不给我们一条可达的联系通道。走验证码登录之后，
 * 「能登进来」本身就是「这个邮箱是他的」的证据。
 *
 * 这里刻意**不**依赖 `lib/mail-auth.ts`：那条链带 better-sqlite3，
 * 客户端组件读不了（同 `lib/sms-constants.ts` 的理由）。
 */
import { SITE_ID } from './site-config';

/** 本站是否以邮箱为账号本体。只有国际站是。 */
export function emailIsAccount(): boolean {
  return SITE_ID === 'intl';
}

/** 人工通道。与 cn 站共用同一个信箱。 */
export const SUPPORT_EMAIL = 'hi@aiworkdeck.com';
