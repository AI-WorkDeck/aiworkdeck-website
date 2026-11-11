import { platformProvider, bailianConfigured, platformBaseUrl, bailianConfig } from '@/lib/platform-ai/config';
import { issueRuntimeToken } from '@/lib/platform-ai/auth';
import { retireOpenRouter, domesticQuota } from '@/lib/platform-ai/billing';
import { platformModels } from '@/lib/platform-ai/catalog';
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import {
    getActiveKeyRow,
    decryptKeyMaterial,
    isEncryptionConfigured,
} from '@/lib/openrouter-keys';
import { syncAiQuota } from '@/lib/ai-quota';
import { getSpendableBalance } from '@/lib/credits';
import { trialBlockReason } from '@/lib/trial';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';
import { canCircleUserCallOverseasModel, getUserCircleFirm } from '@/lib/circle-firms';
import { bqtChargeTarget, bqtPreflight } from '@/lib/bqt-member';
import { BQT_ERROR_STATUS, bqtErrorCode, bqtErrorMessage } from '@/lib/bqt-ai';

export const dynamic = 'force-dynamic';

/**
 * 取 provisioned OpenRouter key 明文（契约 §9）。
 * - 桌面端：Bearer awdk_ 鉴权（主路径）
 * - 账户页：Cookie 鉴权（掩码展示 + 复制，供手动配置）
 *
 * 幂等：已有未禁用 key → 解密返回同一把。这条幂等性是 server 模式下 per-user 计费
 * 隔离的前提，反复调用必须拿到同一把 key，否则用量统计会被打散。
 *
 * **契约变更（Credits 重构 P3）**：不再有 409 no_allocation。
 * 「先去官网分配额度」这一步已经取消——有 Credits 就自动开 key。没有 Credits 时
 * 返回 409 `no_credits`，桌面端应引导去充值而不是去「分配」。
 */
export async function POST(request: NextRequest) {
    const lang = resolveRequestLocale(request, undefined, 'zh');
    const t = (zh: string, en: string) => pickLangText(lang, zh, en);

    const user = resolveKeyUser(request) ?? (await getSessionUser());
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    // 包晴天律师（通道开）：只走积分，不受本站试用约束；签发前先查会员与积分，拒绝用约定错误码。
    const bqt = bqtChargeTarget(user.id);
    if (platformProvider() === 'bailian') {
        const responseHeaders = { 'Cache-Control': 'no-store' };
        if (!bqt && trialBlockReason(user.id)) return NextResponse.json({ error: trialBlockReason(user.id) }, { status: 409, headers: responseHeaders });
        if (request.headers.get('x-awd-ai-protocol') !== '2') return NextResponse.json({ error: 'client_upgrade_required',
            message: t('国内平台 AI 已迁移至百炼，请更新客户端后使用', 'China platform AI has moved to Bailian. Update your client to continue.') }, { status: 409, headers: responseHeaders });
        if (!bailianConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503, headers: responseHeaders });
        try {
            if (bqt) {
                const pre = await bqtPreflight(user.id, bqt.lawyerId, 1);
                if (!pre.ok) {
                    const code = bqtErrorCode(pre.reason);
                    return NextResponse.json({ error: code, message: bqtErrorMessage(code, lang) }, { status: BQT_ERROR_STATUS[code], headers: responseHeaders });
                }
            }
            const apiKey = issueRuntimeToken(user.id, request);
            await retireOpenRouter(user.id);
            const quota = domesticQuota(user.id);
            if (quota.creditsCents <= 0) return NextResponse.json({ error: 'no_credits' }, { status: 409, headers: responseHeaders });
            const models = await platformModels();
            const defaultModel = models.find(m => m.id === bailianConfig().defaultModel && m.supportsTools)?.id
                ?? models.find(m => m.supportsTools)?.id;
            if (!defaultModel) throw new Error('catalog_unavailable');
            return NextResponse.json({ provider: 'bailian', apiKey, baseUrl: platformBaseUrl(), defaultModel,
                modelCatalogUrl: `${platformBaseUrl()}/models`, limitUsd: quota.limitUsd }, { headers: responseHeaders });
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error && e.message === 'account_key_required' ? 'account_key_required' : 'upstream_failed',
                message: t('平台 AI 配置暂时不可用，请稍后重试', 'Platform AI configuration is temporarily unavailable. Try again later.') }, { status: 503, headers: responseHeaders });
        }
    }
    const keyUser = resolveKeyUser(request);
    const circleFirm = getUserCircleFirm(user.id);
    const clientSupportsIntlGateway = (request.headers.get('x-awd-ai-capabilities') || '').includes('intl-gateway');
    if (
        platformProvider() !== 'bailian' &&
        keyUser &&
        circleFirm &&
        request.headers.get('x-awd-ai-protocol') === '2' &&
        (clientSupportsIntlGateway || !canCircleUserCallOverseasModel(user.id))
    ) {
        const responseHeaders = { 'Cache-Control': 'no-store' };
        if (trialBlockReason(user.id)) return NextResponse.json({ error: trialBlockReason(user.id) }, { status: 409, headers: responseHeaders });
        try {
            const apiKey = issueRuntimeToken(user.id, request);
            const quota = domesticQuota(user.id);
            if (quota.creditsCents <= 0) return NextResponse.json({ error: 'no_credits' }, { status: 409, headers: responseHeaders });
            const models = await platformModels();
            const defaultModel = models.find(m => m.id.startsWith('deepseek/') && m.supportsTools)?.id
                ?? models.find(m => m.supportsTools)?.id
                ?? models[0]?.id;
            return NextResponse.json({
                provider: 'bailian',
                apiKey,
                baseUrl: platformBaseUrl(),
                defaultModel,
                modelCatalogUrl: `${platformBaseUrl()}/models`,
                limitUsd: quota.limitUsd,
            }, { headers: responseHeaders });
        } catch (e) {
            return NextResponse.json({
                error: e instanceof Error && e.message === 'account_key_required' ? 'account_key_required' : 'upstream_failed',
                message: t('平台 AI 配置暂时不可用，请稍后重试', 'Platform AI configuration is temporarily unavailable. Try again later.'),
            }, { status: 503, headers: responseHeaders });
        }
    }

    // 海外 OpenRouter 直连 key 只能由本站钱包供额，包晴天律师一律拒绝（不从钱包收他们的钱）。
    if (bqt) {
        return NextResponse.json({ error: 'bqt_overseas_unsupported', message: bqtErrorMessage('bqt_overseas_unsupported', lang) }, { status: 403 });
    }

    if (!isEncryptionConfigured()) {
        return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }

    // 试用计量 v0.1.1：试用用户（非 paid、Credits 为 0）用尽 / 到期 → 409 业务码。
    // 桌面端 AccountService#rejectedMessage 已备好人话（条款只写「以协议为准」）。
    const trialBlock = trialBlockReason(user.id);
    if (trialBlock) {
        return NextResponse.json({ error: trialBlock }, { status: 409 });
    }

    const existing = getActiveKeyRow(user.id);
    if (existing?.encKey) {
        let openrouterKey: string;
        try {
            openrouterKey = decryptKeyMaterial(existing.encKey);
        } catch {
            return NextResponse.json(
                { error: 'key_missing', message: t('密钥记录无法解密，请联系维护者重发', 'Key material cannot be decrypted. Please contact support to reissue it.') },
                { status: 409 }
            );
        }
        try {
            // Do not hand out an older wallet-funded limit before subscription consent has been applied.
            const state = await syncAiQuota(user.id);
            if (!state.configured) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
            if (state.creditsCents <= 0) {
                return NextResponse.json(
                    { error: 'no_credits', message: t('平台 AI 额度不可用，可到账户页查看周期额度及钱包续用设置', 'Platform AI allowance is unavailable. Check your period allowance and wallet fallback settings on the account page.') },
                    { status: 409 }
                );
            }
            return NextResponse.json({ openrouterKey, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', limitUsd: state.limitUsd });
        } catch {
            return NextResponse.json(
                { error: 'upstream_failed', message: t('上游暂时不可用，请稍后重试', 'Upstream service is temporarily unavailable. Please try again later.') },
                { status: 502 }
            );
        }
    }

    if (getSpendableBalance(user.id) <= 0) {
        // 文案红线：不能出现「登录」「未授权」「请先」——桌面端对这三个子串做掉线判定，
        // 命中会清掉本地会话（见 frontend/src/services/api.js 的 code:1 分支）。
        return NextResponse.json(
            { error: 'no_credits', message: t('Credits 余额为空，充值后即可使用平台 AI', 'Credits balance is empty. Top up to use platform AI.') },
            { status: 409 }
        );
    }

    try {
        const state = await syncAiQuota(user.id);
        const row = getActiveKeyRow(user.id);
        if (!state.hasKey || !row?.encKey) {
            return NextResponse.json(
                { error: 'key_missing', message: t('密钥签发未完成，请稍后重试', 'Key provisioning is incomplete. Please try again later.') },
                { status: 409 }
            );
        }
        return NextResponse.json({
            provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',
            openrouterKey: decryptKeyMaterial(row.encKey),
            limitUsd: row.limitUsd,
        });
    } catch {
        return NextResponse.json(
            { error: 'upstream_failed', message: t('上游暂时不可用，请稍后重试', 'Upstream service is temporarily unavailable. Please try again later.') },
            { status: 502 }
        );
    }
}
