import 'server-only';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { siteConfig } from '@/lib/site-config';
import { getThresholds } from '@/lib/gateway/config';
import { isWithinGrantWindow } from '@/lib/signup-grant';

/**
 * 注册赠额的**对外文案**唯一出口（官网 Hero 带、定价页、社区版卡片共用）。
 *
 * 为什么不让每个页面自己拼：赠额是限时活动，金额与截止日都在
 * `data/gateway-config.json` / 环境变量里，随时可能改或到期。文案一旦在页面里写死，
 * 活动结束后官网会继续挂着「9 月 30 日前注册赠 ¥99.99」，而后端早就不发了——
 * 这是对外的虚假承诺，不是排版问题。所以：**活动没开或已过窗口一律返回 null，
 * 调用方整行不渲染**，宁可少说一句也不许说错。
 *
 * ## 时区口径（两站统一）
 *
 * `signupGrantEndAt` 是一个 UTC 时刻，且是**开区间右端**（`isWithinGrantWindow` 用
 * `nowIso >= endAt` 判出局）。线上配的 2026-09-30T16:00:00Z 表示「北京时间 9 月 30 日
 * 24:00 截止」，直接按这个时刻格式化会渲染成 10 月 1 日，比活动实际截止晚一天。
 * 所以先减 1 毫秒取窗口内的最后一刻，再按 **Asia/Shanghai** 渲染日期——活动本身是
 * 按北京时间定的，两站同一场活动不该显示成两个日期。
 * 中文写「2026 年 9 月 30 日」（读者默认北京时间），英文显式标注 `(UTC+8)`。
 */
export interface SignupGrantDisplay {
    /** 含币种符号的金额，如 `¥99.99` / `$9.90`。整元时不带小数。 */
    amountLabel: string;
    /** 截止日，如 `2026 年 9 月 30 日` / `30 Sep 2026 (UTC+8)`。未设边界时为 null。 */
    deadlineLabel: string | null;
}

function formatAmount(cents: number): string {
    const yuan = cents / 100;
    const body = cents % 100 === 0 ? String(cents / 100) : yuan.toFixed(2);
    return `${siteConfig.currencySymbol}${body}`;
}

function formatDeadline(endAtIso: string, lang: Locale): string {
    // 开区间右端：窗口内的最后一刻是 endAt 前 1 毫秒
    const last = new Date(Date.parse(endAtIso) - 1);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(last);
    const pick = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const y = pick('year');
    const m = pick('month');
    const d = pick('day');
    if (toBaseLocale(lang) === 'zh') return `${y} 年 ${m} 月 ${d} 日`;
    // en-US 的短月名是 Sep；en-GB 在新版 ICU 下会给出 Sept，四个字母在日期里读着别扭
    const month = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        month: 'short',
    }).format(last);
    return `${d} ${month} ${y} (UTC+8)`;
}

/** 当前是否有可对外宣告的注册赠额；没有则返回 null（调用方不渲染这一行）。 */
export function signupGrantDisplay(lang: Locale): SignupGrantDisplay | null {
    const { signupGrantCents, signupGrantEndAt } = getThresholds();
    if (signupGrantCents <= 0) return null;
    if (!isWithinGrantWindow(new Date().toISOString())) return null;
    return {
        amountLabel: formatAmount(signupGrantCents),
        deadlineLabel: signupGrantEndAt ? formatDeadline(signupGrantEndAt, lang) : null,
    };
}

/**
 * 把赠额渲染成一句话。有截止日与没有截止日是两个模板，
 * 挑模板这件事只做一次——四处调用点各挑一次，迟早有一处忘了 noDeadline 分支。
 */
export function signupGrantLine(
    grant: SignupGrantDisplay,
    t: { withDeadline: string; noDeadline: string }
): string {
    if (!grant.deadlineLabel) return t.noDeadline.replace('{amount}', grant.amountLabel);
    return t.withDeadline
        .replace('{deadline}', grant.deadlineLabel)
        .replace('{amount}', grant.amountLabel);
}
