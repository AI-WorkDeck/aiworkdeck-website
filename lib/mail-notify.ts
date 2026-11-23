/**
 * 通用通知邮件——「我们主动告诉你一件事」的那一类信。
 *
 * ## 为什么不复用 lib/mail-auth.ts 的发信
 * 那份是**验证码专用**：它的每一条约束（冷却、当日配额、先发再落库、失败抛
 * {@link MailError} 让上层把话转述给正在等码的人）都是为「用户此刻正盯着屏幕等」
 * 服务的，而且它 import 了 `./db`，把 better-sqlite3 拖进任何 import 它的模块。
 * 通知信的处境相反：没人在等，发不出去也不该影响触发它的那个动作。
 * 共用通道、不共用策略——所以这里只抄 Resend 的那次 fetch。
 *
 * ## 契约：**永不抛异常**
 * 调用点都是「审核动作已经完成，顺手告诉作者一声」。发信失败让审核接口返回 500，
 * 等于让管理员以为审核没生效而重复操作。所以这里把一切都吞掉，只回 true/false
 * 并留一行 warn。**调用方不需要 try/catch，但也别拿返回值当发送成功的凭据**——
 * Resend 收下了不等于对方收件箱收到了。
 *
 * env：与验证码邮件同一套（同一个发信域、同一个通道，见 `lib/mail-transport.ts`）。
 * 没配就静默跳过并返回 false，与 `mailEnabled()` 的降级口径一致：
 * CI 合并即部署而密钥要人上服务器写，「代码已到、密钥未到」是必然的中间态。
 */

import { mailTransportConfigured, sendTransactionalMail } from './mail-transport';

/** 本站是否具备发通知信的能力。与 `mailEnabled()` 同判据，只是不牵扯验证码那条链。 */
export function notifyMailEnabled(): boolean {
    return mailTransportConfigured();
}

export interface NotifyMail {
    /** 收件地址。空串/undefined 直接跳过——手机号账号本来就没有邮箱。 */
    to?: string;
    subject: string;
    /** 纯文本正文。刻意不做 HTML 模板：通知信的信息量撑不起一套模板系统。 */
    text: string;
}

/**
 * 发一封通知邮件。成功返回 true；未配置、没有收件地址、被拒或网络故障都返回 false。
 */
export async function sendNotifyMail({ to, subject, text }: NotifyMail): Promise<boolean> {
    const address = (to || '').trim();
    if (!address) return false;

    if (!mailTransportConfigured()) return false;
    const result = await sendTransactionalMail({ to: address, subject, text });
    return result.ok;
}
