import { platformProvider } from '@/lib/platform-ai/config';
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { getActiveKeyRow, decryptKeyMaterial } from '@/lib/openrouter-keys';
import { syncAiQuota, getAiSpendableBalance, isAiQuotaConfigured } from '@/lib/ai-quota';
import { getBalance } from '@/lib/credits';
import { subscriptionSnapshot } from '@/lib/subscription';
import { OpenRouterMgmtError } from '@/lib/openrouter-mgmt';
import { getAiConfig, getExchangeRateInfo, maskKey } from '@/lib/ai-config';
import { siteConfig } from '@/lib/site-config';
import { trialBlockReason } from '@/lib/trial';
import { getUserCircleFirm, getUserMarginMultiplier } from '@/lib/circle-firms';
import { getBqtQingtianStatus } from '@/lib/bqt-auth';
import { accountBillingFields, refreshBqtSnapshot } from '@/lib/bqt-account';

export const dynamic = 'force-dynamic';

/**
 * 实时 AI 额度（Bearer 或 Cookie）。读取即同步：回抄远端用量为 Credits 扣减，
 * 并把 key 的 limit 重设为「已用 + 还买得起的」。
 *
 * → { configured, creditsCents, hasKey, limitUsd, usageUsd, remainingUsd,
 *     exchangeRate, marginMultiplier, currency, exchangeRateSource, exchangeRateUpdatedAt,
 *     [disabled], [keyMasked], [usageAvailable] }
 *
 * currency / exchangeRateSource / exchangeRateUpdatedAt 是 dev-board#853 追加的：桌面端模型选择器
 * 用 exchangeRate × marginMultiplier 把 OpenRouter 美元单价换成本币实付价，需要知道本币是什么、
 * 汇率从哪来、什么时候的。只加不改，旧版桌面端照旧工作。
 *
 * **消费方注意（契约变更）**：判断「这个账户能不能用平台 AI」请看 `creditsCents > 0`，
 * 不要再看 `hasKey`。Credits 重构之后 key 是按需自动开的，新账户充完值到第一次
 * 用 AI 之间 hasKey 可能仍为 false，但它明明是可用的。旧口径会把这类用户挡在门外。
 *
 * `usageAvailable=false` 表示上游查不到用量（网络/配置问题），此时 limitUsd/usageUsd
 * 不可信。**绝不能把它显示成「额度为 0」**——那是把一次抖动说成用户没钱了。
 */
export async function GET(request: NextRequest) {
    const user = resolveKeyUser(request) ?? (await getSessionUser());
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    // 试用计量 v0.1.1：试用用户（非 paid、Credits 为 0）用尽 / 到期 → 409 业务码
    const trialBlock = trialBlockReason(user.id);
    if (trialBlock) {
        return NextResponse.json({ error: trialBlock }, { status: 409 });
    }
    await refreshBqtSnapshot(user.id);
    const bqtQingtian = getBqtQingtianStatus(user.id);
    const circleFirm = getUserCircleFirm(user.id);
    const marginMultiplier = getUserMarginMultiplier(user.id);
    const fx = getExchangeRateInfo();
    const base = {
        configured: isAiQuotaConfigured(),
        provider: platformProvider(),
        exchangeRate: fx.rate,
        marginMultiplier,
        currency: siteConfig.currency,
        exchangeRateSource: fx.source,
        exchangeRateUpdatedAt: fx.updatedAt,
        ...(circleFirm ? { circleFirm } : {}),
        ...(bqtQingtian ? { bqtQingtian } : {}),
        ...accountBillingFields(user.id),
    };

    let keyMasked = '';
    const existing = getActiveKeyRow(user.id);
    if (platformProvider() === 'openrouter' && existing?.encKey) {
        try {
            keyMasked = maskKey(decryptKeyMaterial(existing.encKey));
        } catch {
            keyMasked = '';
        }
    }

    try {
        const state = await syncAiQuota(user.id);
        return NextResponse.json({
            ...base,
            usageAvailable: true,
            creditsCents: state.creditsCents,
            walletBalanceCents: getBalance(user.id),
            subscription: subscriptionSnapshot(user.id),
            hasKey: state.hasKey,
            limitUsd: state.limitUsd,
            usageUsd: state.usageUsd,
            remainingUsd: state.remainingUsd,
            ...(state.hasKey ? { disabled: state.disabled ?? false, keyMasked } : {}),
        });
    } catch (e) {
        // 上游不可达时仍然 200：Credits 余额是本地事实，照常返回；用量标记为不可用。
        // 用 4xx/5xx 表达这种降级会被桌面端判成凭据失效并清空账户缓存。
        if (e instanceof OpenRouterMgmtError && e.kind === 'not_configured') {
            return NextResponse.json({ error: 'not_configured' }, { status: 503 });
        }
        return NextResponse.json({
            ...base,
            usageAvailable: false,
            creditsCents: subscriptionSnapshot(user.id).active ? 0 : getAiSpendableBalance(user.id),
            walletBalanceCents: getBalance(user.id),
            subscription: subscriptionSnapshot(user.id),
            hasKey: !!existing,
            limitUsd: 0,
            usageUsd: 0,
            remainingUsd: 0,
            ...(existing ? { disabled: false, keyMasked } : {}),
        });
    }
}
