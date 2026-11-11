/**
 * 验证码策略常量。
 *
 * **单独一个文件是有原因的**：登录表单与补绑弹窗都是 `'use client'` 组件，要显示
 * 重发倒计时就得读 `RESEND_COOLDOWN_MS`。从 `lib/sms-auth.ts` 里导入会把它整条依赖
 * 链（`lib/db` → better-sqlite3 原生模块）拖进客户端包，构建当场失败。
 * 这里只放纯常量，不 import 任何东西。
 *
 * 数值与桌面仓 `VerificationCodeStore` 逐条对齐，改之前先看那边。
 */

/** 验证码有效期。 */
export const CODE_TTL_MS = 5 * 60 * 1000;
/** 同一号码两次发送之间的冷却。 */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** 单条验证码允许的错误尝试次数，超过即作废（不是锁号，是作废这一条）。 */
export const MAX_ATTEMPTS = 5;
/** 同一号码 24 小时内最多发几条。 */
export const MAX_PER_PHONE_PER_DAY = 10;
/** 当日配额的统计窗口。 */
export const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
