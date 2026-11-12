import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getBalance } from '@/lib/credits';
import { gatewayErrorResponse } from '@/lib/gateway/errors';
import { requireEnabledPricing, assertUnitsWithinCap, creditsFor } from '@/lib/gateway/pricing';
import { assertBalanceFor, needsUserConfirm } from '@/lib/gateway/spend';
import {
    ASR_SERVICE,
    ASR_OP,
    UPLOAD_URL_TTL_SEC,
    assertValidDuration,
    assertValidFormat,
    contentTypeOf,
    maxUploadBytesFor,
    minutesOf,
    newObjectKey,
    requireAsrConfig,
    asrUpstream,
} from '@/lib/gateway/asr';

export const dynamic = 'force-dynamic';

/**
 * 语音转写第一步：查余额、签直传凭证。**不扣费，所以不要幂等键。**
 *
 * <h3>为什么余额闸放在这一步</h3>
 * 放到 submit 就是「让用户先传完两小时录音，再告诉他余额不够」。
 * 这一步之前用户还没上传任何字节，被拒的代价只是一个提示。
 *
 * <h3>顺序不能换</h3>
 * 定价 → 上限 → 余额 → **才**签发凭证。余额不足时一张上传凭证都不许签出去：
 * 凭证一旦签出，它在有效期内就是一个可以往我们 bucket 里写几百 MB 的口子，
 * 而拿着它的人已经被判定为付不起这次转写的钱。
 */
export async function POST(request: NextRequest) {
    const user = resolveKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const durationSec = assertValidDuration(body.durationSec);
        const format = assertValidFormat(body.format);

        requireAsrConfig();
        const pricing = requireEnabledPricing(ASR_SERVICE, ASR_OP);
        const units = minutesOf(durationSec);
        assertUnitsWithinCap(pricing, units);

        const estimatedCredits = creditsFor(pricing, units);
        assertBalanceFor(user.id, estimatedCredits);

        const objectKey = newObjectKey(user.id, format);
        const contentType = contentTypeOf(format);
        const uploadUrl = await asrUpstream().presignPut(objectKey, contentType, UPLOAD_URL_TTL_SEC);

        return NextResponse.json({
            objectKey,
            uploadUrl,
            uploadMethod: 'PUT',
            // 签名里含 Content-Type，客户端必须逐字用这个值 PUT，否则 OSS 判签名不匹配
            contentType,
            expiresInSec: UPLOAD_URL_TTL_SEC,
            // 服务端在 submit 里按这个值复核实际体积；下发是为了让客户端能提前自检
            maxUploadBytes: maxUploadBytesFor(durationSec),
            estimatedCredits,
            unit: pricing.unit,
            balanceCents: getBalance(user.id),
            // 超过用户确认阈值时，桌面端在提交前显示「本次约需 N Credits」
            needsConfirm: needsUserConfirm(estimatedCredits),
        });
    } catch (e) {
        return gatewayErrorResponse(e);
    }
}
