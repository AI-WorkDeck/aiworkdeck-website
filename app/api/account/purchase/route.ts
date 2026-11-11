import { NextRequest, NextResponse } from 'next/server';
import { toBaseLocale } from '@/i18n-config';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { purchaseWithCredits, purchaseWithBqt, type CreditsPurchaseError, type BqtPurchaseError } from '@/lib/purchases';
import { bqtChargeTarget } from '@/lib/bqt-member';
import { bqtDisplayBalanceCents } from '@/lib/bqt-account';
import { syncAiQuota } from '@/lib/ai-quota';
import { resolveRequestLocale } from '@/lib/api-locale';

export const dynamic = 'force-dynamic';

/**
 * 用 Credits 直接购买（Bearer 或 Cookie）。请求 `{ skuId }`，价格服务端自查。
 *
 * 状态码刻意避开 401/402/403：桌面端把 4xx 中的这几个判为凭据失效，
 * 401/403 会立刻清空已购权益缓存、verify-key 的 4xx 会抹掉 license.json。
 * 「Credits 不够」「已拥有」都用 409 + 语义 error 码表达。
 */
const STATUS: Record<CreditsPurchaseError, number> = {
    invalid_sku: 400,
    not_purchasable: 400,
    already_owned: 409,
    insufficient_credits: 409,
};

// 文案红线：不得含「登录」「未授权」「请先」——桌面 api.js 用这三个子串判掉线并清会话
const MESSAGE: Record<CreditsPurchaseError, string> = {
    invalid_sku: '商品不存在或已下架',
    not_purchasable: '该条目是免费的，无需购买',
    already_owned: '你已经拥有该条目了',
    insufficient_credits: 'Credits 余额不足，充值后再来',
};

const MESSAGE_EN: Record<CreditsPurchaseError, string> = {
    invalid_sku: 'Item not found or no longer available',
    not_purchasable: 'This item is free and does not require purchase',
    already_owned: 'You already own this item',
    insufficient_credits: 'Insufficient Credits balance. Please top up first.',
};

// 包晴天律师（积分通道开着）用积分购买的额外错误码。文案同样避开掉线判定子串。
const BQT_STATUS: Record<Exclude<BqtPurchaseError, CreditsPurchaseError>, number> = {
    bqt_member_invalid: 409,
    bqt_ai_closed: 409,
    bqt_insufficient_points: 409,
    bqt_outstanding_debt: 409,
    bqt_unavailable: 503,
    bqt_consume_failed: 409,
    bqt_consume_pending: 202,
};
const BQT_MESSAGE: Record<keyof typeof BQT_STATUS, [string, string]> = {
    bqt_member_invalid: ['包晴天会员已失效，请在包晴天 App 内续费', 'Your Baoqingtian membership is not active. Renew it in the Baoqingtian app.'],
    bqt_ai_closed: ['包晴天会员未开通 AI 工作台权益', 'Your Baoqingtian membership does not include the AI workbench.'],
    bqt_insufficient_points: ['包晴天积分不足，请在包晴天 App 内充值', 'Not enough Baoqingtian points. Top up in the Baoqingtian app.'],
    bqt_outstanding_debt: ['有未扣成的包晴天积分，处理完成前暂不能购买', 'There are Baoqingtian point deductions that have not gone through; purchases are paused until they are resolved.'],
    bqt_unavailable: ['包晴天暂时无法连接，稍后再试', 'Baoqingtian is temporarily unreachable. Try again later.'],
    bqt_consume_failed: ['包晴天积分扣减未成功，未发放该条目', 'The Baoqingtian point deduction did not go through; the item was not delivered.'],
    bqt_consume_pending: ['包晴天积分扣减确认中，稍后再点一次购买即可（不会重复扣）', 'The Baoqingtian deduction is being confirmed. Try the purchase again shortly; you will not be charged twice.'],
};

export async function POST(request: NextRequest) {
    const user = resolveKeyUser(request) ?? (await getSessionUser());
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let body: { skuId?: unknown; lang?: unknown };
    let lang = resolveRequestLocale(request, undefined, 'zh');
    try {
        body = await request.json();
        lang = resolveRequestLocale(request, body?.lang, 'zh');
    } catch {
        const messages = toBaseLocale(lang) === 'en' ? MESSAGE_EN : MESSAGE;
        return NextResponse.json({ error: 'invalid_sku', message: messages.invalid_sku }, { status: 400 });
    }

    const bqt = bqtChargeTarget(user.id);
    if (bqt) {
        const r = await purchaseWithBqt(user.id, bqt.lawyerId, body?.skuId);
        if ('error' in r) {
            const zhEn = toBaseLocale(lang) === 'en';
            if (r.error in BQT_STATUS) {
                const k = r.error as keyof typeof BQT_STATUS;
                return NextResponse.json({ error: k, message: BQT_MESSAGE[k][zhEn ? 1 : 0] }, { status: BQT_STATUS[k] });
            }
            const k = r.error as CreditsPurchaseError;
            return NextResponse.json({ error: k, message: (zhEn ? MESSAGE_EN : MESSAGE)[k] }, { status: STATUS[k] });
        }
        return NextResponse.json({ ...r, balanceCents: bqtDisplayBalanceCents(user.id) ?? 0 });
    }

    const result = purchaseWithCredits(user.id, body?.skuId);
    if ('error' in result) {
        const messages = toBaseLocale(lang) === 'en' ? MESSAGE_EN : MESSAGE;
        return NextResponse.json(
            { error: result.error, message: messages[result.error] },
            { status: STATUS[result.error] }
        );
    }

    // 花掉 Credits 后立刻把 AI 上限降下来，收窄「上限高于余额」的超支窗口。
    // 失败无妨：下一次同步会补上，钱只按真实用量扣。
    void syncAiQuota(user.id).catch(() => undefined);

    return NextResponse.json(result);
}
