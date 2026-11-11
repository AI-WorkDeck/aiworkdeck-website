import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { refreshBqtSnapshot } from '@/lib/bqt-account';
import { GatewayError, gatewayErrorResponse } from '@/lib/gateway/errors';
import { requireEnabledPricing, assertUnitsWithinCap } from '@/lib/gateway/pricing';
import { openHold, releaseHold, attachUpstreamRef } from '@/lib/gateway/spend';
import * as idem from '@/lib/gateway/idempotency';
import {
    ASR_SERVICE,
    ASR_OP,
    FILE_URL_TTL_SEC,
    POLL_THROTTLE_SEC,
    assertObjectKeyOwnedBy,
    assertValidDuration,
    asrUpstream,
    deleteObjectQuietly,
    maxUploadBytesFor,
    minutesOf,
    requireAsrConfig,
} from '@/lib/gateway/asr';

export const dynamic = 'force-dynamic';

/**
 * 语音转写第二步：预扣 + 建听悟任务。**会扣费，所以必须带 Idempotency-Key。**
 *
 * <h3>三道校验，每一道防的是不同的人</h3>
 * 1. `assertObjectKeyOwnedBy` —— 防的是「拿别人的 objectKey 提交」：
 *    不校验的话，用自己的余额就能把别人的会议录音转出来读走。
 * 2. `assertUnitsWithinCap` —— 防的是单次调用把余额一次性打穿。
 * 3. **实际体积复核** —— 防的是「申报 1 分钟、传两小时」。
 *    这一道必须在服务端做：OSS 的预签名 PUT 签的是方法/对象键/Content-Type/有效期，
 *    **签名里没有一个字段能绑定请求体大小**（v1 与 v4 都一样），
 *    所以 ticket 下发的 maxUploadBytes 只是给客户端自检用的，真正的闸在这里。
 *    体积不符时把对象删掉再拒——留着它就是替一个已经被拒的请求存了几十 MB。
 *
 * <h3>失败必须把钱退干净</h3>
 * 预扣之后到建任务成功之间的任何一步失败，都要 `releaseHold`：
 * 听悟没收到任务 = 我们没有向上游付过任何费用 = 用户不该花一分钱。
 */
export async function POST(request: NextRequest) {
    const user = resolveKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    // 包晴天律师：放行前按 5 秒内的实时权益判断（等同 bqtPreflight 的口径，见 lib/gateway/spend.ts）
    await refreshBqtSnapshot(user.id, 5_000);

    let idempotencyKey: string;
    let objectKey: string;
    let durationSec: number;
    let pricing: ReturnType<typeof requireEnabledPricing>;

    // 占幂等键**之前**的全部拒绝路径：任何一条都不该留下一行 in_flight，
    // 否则一次参数写错就把这个键锁死在 409 直到回收任务扫到它。
    try {
        idempotencyKey = idem.assertValidKey(request.headers.get('idempotency-key'));
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        durationSec = assertValidDuration(body.durationSec);
        objectKey = assertObjectKeyOwnedBy(user.id, body.objectKey);

        requireAsrConfig();
        pricing = requireEnabledPricing(ASR_SERVICE, ASR_OP);
        assertUnitsWithinCap(pricing, minutesOf(durationSec));
    } catch (e) {
        return gatewayErrorResponse(e);
    }

    let claimed: idem.ClaimResult;
    try {
        claimed = idem.claim(user.id, idempotencyKey, ASR_SERVICE, 'submit');
    } catch (e) {
        return gatewayErrorResponse(e);
    }
    if (claimed.kind === 'replay') {
        return NextResponse.json(claimed.response, { headers: { 'x-gateway-replay': '1' } });
    }

    const taskId = `asr_${crypto.randomUUID().replace(/-/g, '')}`;
    let holdOpened = false;

    try {
        const size = await asrUpstream().objectSize(objectKey);
        if (size === null) {
            throw new GatewayError('bad_request', '没有找到已上传的音频，重新上传后再提交');
        }
        const cap = maxUploadBytesFor(durationSec);
        if (size > cap) {
            await deleteObjectQuietly(objectKey);
            throw new GatewayError('bad_request', '上传的音频体积与申报时长不符', {
                sizeBytes: size,
                maxUploadBytes: cap,
            });
        }

        const held = openHold({
            userId: user.id,
            taskId,
            pricing,
            estimatedUnits: minutesOf(durationSec),
            nowMs: Date.now(),
            // objectKey 必须与 hold 同生：删对象是我们的清理义务，
            // 靠客户端回传等于「客户端不回来我们就永远不删」，而躺在里面的是客户的会议录音
            meta: { objectKey },
        });
        holdOpened = true;

        const fileUrl = await asrUpstream().presignGet(objectKey, FILE_URL_TTL_SEC);
        const upstreamTaskId = await asrUpstream().createTask(fileUrl);
        attachUpstreamRef(taskId, upstreamTaskId);

        const response = {
            taskId,
            heldCents: held.heldCents,
            estimatedUnits: minutesOf(durationSec),
            unit: pricing.unit,
            pollAfterSec: POLL_THROTTLE_SEC,
        };
        idem.complete(user.id, idempotencyKey, response, held.holdLedgerId);
        return NextResponse.json(response);
    } catch (e) {
        if (holdOpened) releaseHold(taskId, 'asr_submit_failed');
        idem.fail(user.id, idempotencyKey);
        return gatewayErrorResponse(e);
    }
}
