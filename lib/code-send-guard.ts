/**
 * 验证码发送的 **IP 维度**限流与**全局熔断**。
 *
 * ## 为什么单号限流不够
 * `sms-auth` / `mail-auth` 原有的冷却与日配额都是按「这个号码/这个地址」算的。
 * 那防的是**猜码**与**骚扰某个特定的人**，防不住真正花钱的那种攻击：
 * **换一个目标就是一份全新的配额**。脚本轮换号码就能无限发，而短信按条计费。
 * 这类攻击有个通行名字叫 SMS pumping——攻击者与某些运营商分成，你付的是真钱。
 *
 * 所以这里加两道正交的闸：
 * - **按 IP**：单个来源能发多少。挡住绝大多数脚本（它们不换出口）。
 * - **全局**：所有来源加起来一天最多发多少。这是**熔断器**，不指望它平时生效，
 *   它的作用是给「分布式来源 + 我们睡着了」这个最坏情况**封一个金额上限**。
 *
 * ## 全局熔断会不会把所有人挡在门外
 * 会——这正是熔断器的语义：**宁可停一段时间，也不要醒来面对一张五位数的账单**。
 * 所以默认值给得很宽（远高于真实用量），且可用环境变量调大而不用改代码。
 * 触发时会打 `error` 级日志，不是静默的。
 *
 * ## 为什么不做在 login-throttle 里
 * 那个模块只记**失败**、成功即清零，语义是「防口令爆破」。这里要记的是**成功发送**
 * （发出去了才花钱），两者的计数语义相反，混在一张表里迟早有人改错一边。
 */
import { getDb } from './db';
import type { Locale } from '@/i18n-config';
import { siteConfig } from './site-config';
import { pickLangText } from './api-locale';

/** 单 IP 在短窗口内最多发几条。正常用户改个号重试也就两三条。 */
export const MAX_PER_IP_PER_WINDOW = 5;
/** 短窗口长度。 */
export const IP_WINDOW_MS = 10 * 60 * 1000;
/** 单 IP 一天最多发几条。办公室/校园共用出口会比个人多，所以给得比 5×24 宽松些。 */
export const MAX_PER_IP_PER_DAY = 20;
/** 一天的统计窗口。 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 全局熔断阈值（所有来源、两条通道加起来，24 小时）。
 *
 * 默认 2000：远高于当前真实用量，正常永远碰不到；一旦碰到就说明在被刷。
 * 用 `AWD_CODE_SEND_DAILY_CAP` 覆盖。设成 0 或负数表示**不熔断**
 * （明确关掉比偷偷失效好——想关的人得自己写这个值）。
 */
export function globalDailyCap(): number {
  const raw = Number(process.env.AWD_CODE_SEND_DAILY_CAP);
  return Number.isFinite(raw) ? raw : 2000;
}

export class CodeSendBlocked extends Error {}

/** 两条通道各自的流水表。列名不同，所以按通道取。 */
const TABLES = {
  sms: { table: 'sms_send_log' },
  mail: { table: 'mail_send_log' },
} as const;

export type CodeChannel = keyof typeof TABLES;

function countSince(table: string, since: number, ip?: string): number {
  const db = getDb();
  const row = ip
    ? db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ip = ? AND sentAt > ?`).get(ip, since)
    : db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE sentAt > ?`).get(since);
  return (row as { n: number }).n;
}

/** 两条通道相加——攻击者不会因为我们分了两张表就只刷一条。 */
function countAllChannels(since: number, ip?: string): number {
  return countSince(TABLES.sms.table, since, ip) + countSince(TABLES.mail.table, since, ip);
}

/**
 * 发送之前调用。被挡住时抛 {@link CodeSendBlocked}，文案对用户是可行动的、
 * 但**不透露具体阈值**（说了等于告诉脚本作者贴着线跑）。
 *
 * `ip` 为空串时（拿不到来源）**只走全局熔断**，不做 IP 维度判断——
 * 把所有拿不到 IP 的请求算进同一个桶会让它们互相拖累，第一个正常用户就把桶占满了。
 */
export function assertCodeSendAllowed(
  ip: string,
  now: number = Date.now(),
  lang: Locale = siteConfig.defaultLocale
): void {
  const cap = globalDailyCap();
  if (cap > 0 && countAllChannels(now - DAY_MS) >= cap) {
    console.error(
      '[code-send-guard] 全局熔断触发：24 小时内验证码发送量已达上限 %d。' +
      '这通常意味着正在被刷；确认是正常增长的话调大 AWD_CODE_SEND_DAILY_CAP。', cap
    );
    throw new CodeSendBlocked(
      pickLangText(
        lang,
        '验证码服务繁忙，请稍后再试或邮件联系 hi@aiworkdeck.com',
        'Verification codes are temporarily unavailable, please try again later or email hi@aiworkdeck.com'
      )
    );
  }

  if (!ip) return;

  if (countAllChannels(now - IP_WINDOW_MS, ip) >= MAX_PER_IP_PER_WINDOW) {
    throw new CodeSendBlocked(
      pickLangText(
        lang,
        '请求验证码过于频繁，请几分钟后再试',
        'Too many verification codes requested, please wait a few minutes before trying again'
      )
    );
  }
  if (countAllChannels(now - DAY_MS, ip) >= MAX_PER_IP_PER_DAY) {
    throw new CodeSendBlocked(
      pickLangText(
        lang,
        '当前网络今日获取验证码次数已达上限，请明天再试或邮件联系 hi@aiworkdeck.com',
        'Daily verification code limit reached for this network, please try tomorrow or email hi@aiworkdeck.com'
      )
    );
  }
}
