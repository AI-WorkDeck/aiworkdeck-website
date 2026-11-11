import { withTransaction, getDb } from './db';
import { grantCredits } from './credits';
import { getThresholds } from './gateway/config';

/**
 * 注册赠额：新用户建号即得一笔 Credits（限时活动）。
 *
 * 没有它，「解锁即可用」不成立——`createUser` 不发任何 Credits，新账户余额恒 0，
 * 用户第一次点转写就撞上余额不足，而他此刻还没有任何理由相信这东西值得充值。
 *
 * 三条不许动的约束：
 *
 * 1. **必须落 `reward` 批次**（24 个月有效期、不可退现）。落 `topup` 等于把我们送出去的
 *    钱洗成用户可以要求退现的真金白银——注销退款只退 topup（`getRefundableCents`），
 *    赠额进了 topup 就是「注册即领现金」。这是合规红线，见 lib/credits.ts 顶部那张表。
 * 2. **同一用户只发一次**。幂等靠 `credit_lots.refOrderId` 上的固定串做存在性检查，
 *    不靠调用方记得只调一次：注册路由重放、以后补发脚本、客服手工触发都会经过这里。
 *    查的是**批次行而不是余额**——赠额花光或到期之后余额同样是 0，按余额判会重复发。
 * 3. **发放失败不许让注册失败**。账号已经建出来了，此时把响应变成 400 只会让用户
 *    以为没注册成功、换个用户名再来一遍。调用方负责吞掉异常，见 auth/register 路由。
 */

/** 幂等键：一个用户一条，落在 credit_lots.refOrderId 上 */
export function signupGrantRef(userId: string): string {
    return `signup_grant:${userId}`;
}

export type SignupGrantOutcome =
    /** 发了 */
    | 'granted'
    /** 这个用户已经领过（重复注册/重放/补发脚本） */
    | 'already_granted'
    /** 活动金额配成 0 = 活动没开 */
    | 'disabled'
    /** 在活动窗口之外 */
    | 'outside_window';

export interface SignupGrantResult {
    outcome: SignupGrantOutcome;
    /** 实际发放金额（分）。未发放为 0 */
    amountCents: number;
}

/** 当前时刻是否落在活动窗口内。两侧都可以不设边界。 */
export function isWithinGrantWindow(nowIso: string): boolean {
    const { signupGrantStartAt, signupGrantEndAt } = getThresholds();
    if (signupGrantStartAt && nowIso < signupGrantStartAt) return false;
    if (signupGrantEndAt && nowIso >= signupGrantEndAt) return false;
    return true;
}

/**
 * 给新用户发注册赠额。可重复调用，同一用户只会真发一次。
 *
 * 刻意**不调 `syncAiQuota`**（其余每条改余额的路径都调）：那个函数在「有余额但还没有
 * key」时会顺手去 OpenRouter 建一把子 key，于是每个注册的人——包括从没装过桌面端的——
 * 都会占掉共享池里一份 limit。AI 那把 key 在用户第一次真正用 AI 时自然会建出来，
 * 不需要在注册这一刻替他预支。
 */
export function grantSignupBonus(userId: string, nowIso = new Date().toISOString()): SignupGrantResult {
    const { signupGrantCents } = getThresholds();
    if (signupGrantCents <= 0) return { outcome: 'disabled', amountCents: 0 };
    if (!isWithinGrantWindow(nowIso)) return { outcome: 'outside_window', amountCents: 0 };

    const ref = signupGrantRef(userId);
    return withTransaction((d) => {
        // 检查与写入同一个 BEGIN IMMEDIATE 事务：写锁把并发的两次注册序列化，
        // 「查到没发过 → 发」之间不会插进第二个同样查到没发过的调用。
        const existing = d
            .prepare('SELECT 1 AS x FROM credit_lots WHERE userId = ? AND refOrderId = ? LIMIT 1')
            .get(userId, ref);
        if (existing) return { outcome: 'already_granted' as const, amountCents: 0 };

        grantCredits(d, {
            userId,
            pool: 'reward',
            amountCents: signupGrantCents,
            ledgerKind: 'gift',
            refOrderId: ref,
            meta: { reason: 'signup_grant' },
            // 必须把 nowIso 透下去。不传的话 grantCredits 会自己再取一次 new Date()，
            // 于是**入账时间与到期日算的是两个不同的时刻**——本函数的 nowIso 参数
            // 等于被静默忽略，补发/重放/对账这些显式传时间的调用方落库的都不是它要的那个时间。
            // 24 个月的到期日尤其不该由「事务跑到这一行时恰好几点」决定。
            nowIso,
        });
        return { outcome: 'granted' as const, amountCents: signupGrantCents };
    });
}

export interface SignupGrantStats {
    /** 已发放笔数 */
    count: number;
    /** 已发放总额（分） */
    totalCents: number;
}

/**
 * 本次活动已发出去多少。
 *
 * 按 `grantedAt` 卡在活动窗口内统计：窗口是活动的定义，不卡窗口的话上一轮活动的
 * 发放会混进这一轮的数字里，后台看到的「已花掉多少预算」就是错的。
 * 统计的是批次的**原始面额**而不是剩余额——花掉的钱同样是发出去的钱。
 */
export function signupGrantStats(): SignupGrantStats {
    const { signupGrantStartAt, signupGrantEndAt } = getThresholds();
    const clauses = ["refOrderId LIKE 'signup_grant:%'"];
    const args: string[] = [];
    if (signupGrantStartAt) {
        clauses.push('grantedAt >= ?');
        args.push(signupGrantStartAt);
    }
    if (signupGrantEndAt) {
        clauses.push('grantedAt < ?');
        args.push(signupGrantEndAt);
    }
    const row = getDb()
        .prepare(
            `SELECT COUNT(*) AS count, COALESCE(SUM(originalCents), 0) AS totalCents
               FROM credit_lots WHERE ${clauses.join(' AND ')}`
        )
        .get(...args) as { count: number; totalCents: number };
    return { count: row.count, totalCents: row.totalCents };
}
