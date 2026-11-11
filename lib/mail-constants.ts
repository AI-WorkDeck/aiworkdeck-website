/**
 * 邮件验证码策略常量。
 *
 * **单独一个文件的理由与 `lib/sms-constants.ts` 一字不差**：登录表单是 `'use client'`
 * 组件，要显示重发倒计时就得读 `MAIL_RESEND_COOLDOWN_MS`。从 `lib/mail-auth.ts` 导入
 * 会把它整条依赖链（`lib/db` → better-sqlite3 原生模块）拖进客户端包，构建当场失败。
 * 这里只放纯常量，不 import 任何东西。
 *
 * 数值刻意与短信那份**不完全相同**，差异都有理由：
 * - TTL 更长：邮件的投递延迟以分钟计（灰名单、转发、客户端拉取间隔），
 *   照抄短信的 5 分钟会让一部分人永远来不及。
 * - 当日配额更宽：一封邮件的成本远低于一条短信，卡太死只会误伤正常用户。
 * 冷却与单码尝试次数保持一致——那两条防的是爆破，与通道成本无关。
 */

/** 验证码有效期。比短信长，因为邮件投递本身就可能要几分钟。 */
export const MAIL_CODE_TTL_MS = 15 * 60 * 1000;
/** 同一邮箱两次发送之间的冷却。与短信一致。 */
export const MAIL_RESEND_COOLDOWN_MS = 60 * 1000;
/** 单条验证码允许的错误尝试次数，超过即作废（不是锁邮箱，是作废这一条）。与短信一致。 */
export const MAIL_MAX_ATTEMPTS = 5;
/** 同一邮箱 24 小时内最多发几封。 */
export const MAIL_MAX_PER_ADDRESS_PER_DAY = 20;
/** 当日配额的统计窗口。 */
export const MAIL_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
