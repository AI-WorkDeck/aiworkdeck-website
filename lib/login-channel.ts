/**
 * 本站的验证码通道当下是否真的发得出去。
 *
 * **只能在服务端调用**：它读的是不带 `NEXT_PUBLIC_` 前缀的密钥变量，客户端组件
 * 永远读不到（恒 undefined），在那边调会一律得出「没配」。渲染 `AuthForms` 的服务端
 * 页面算好之后用 `codeChannelReady` prop 传下去。
 *
 * 单独成文件是为了**防两处漂**：`/account` 与 `/start` 两个页面都要算这一下，
 * 各写一遍迟早会出现一边判 sms、另一边判 mail 的情况。
 */
import { phoneIsAccount } from './phone-policy';
import { smsEnabled } from './sms-auth';
import { mailEnabled } from './mail-auth';

export function codeChannelReady(): boolean {
  return phoneIsAccount() ? smsEnabled() : mailEnabled();
}
