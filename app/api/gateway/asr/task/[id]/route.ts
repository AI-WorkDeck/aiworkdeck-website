import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { GatewayError, gatewayErrorResponse } from '@/lib/gateway/errors';
import { findPricing } from '@/lib/gateway/pricing';
import { findHold, holdMeta, settleHold, releaseHold, touchHoldPoll } from '@/lib/gateway/spend';
import {
    ASR_SERVICE,
    ASR_OP,
    POLL_THROTTLE_SEC,
    actualMinutesFromTranscription,
    asrUpstream,
    deleteObjectQuietly,
    isCompleted,
    isTerminalFailure,
    requireAsrConfig,
} from '@/lib/gateway/asr';

export const dynamic = 'force-dynamic';

/**
 * 语音转写第三步：轮询、结算、删对象。
 *
 * <h3>计价用听悟返回的真实时长，不是客户端申报的 durationSec</h3>
 * 申报值只进过预扣与余额闸。麻烦在于**听悟的 GetTaskInfo 里根本没有时长字段**
 * （只有 taskStatus 和四个结果 URL），所以真实计量得从转写结果里最后一个词的
 * End 时间戳算——见 `actualMinutesFromTranscription`。
 *
 * <h3>先取结果，再结算，最后删对象</h3>
 * 顺序是刻意的：结果没取回来就结算，等于「收了钱、用户什么都没拿到」；
 * 而取结果失败时什么都不动，下一次轮询还能重来，真的一直失败就由 hold 超时回收
 * 把钱退给用户——释放永远是对用户安全的那一侧。
 */

async function fetchQuietly(url: string | null): Promise<string | null> {
    if (!url) return null;
    try {
        return await asrUpstream().fetchResult(url);
    } catch (e) {
        // 章节/摘要/待办是增值结果，缺了不影响转写正文这个主产物
        console.warn('[gateway/asr] 增值结果下载失败（跳过）', String(e));
        return null;
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const user = resolveKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    try {
        const hold = findHold(id);
        // 不属于当前用户的任务与不存在的任务给完全一样的回答：
        // 分开答就等于提供了一个「这个 taskId 存不存在」的探测接口。
        if (!hold || hold.userId !== user.id || hold.service !== ASR_SERVICE) {
            throw new GatewayError('bad_request', '找不到该转写任务');
        }
        const objectKey = (holdMeta(hold).objectKey as string | undefined) ?? null;

        if (hold.status === 'released') {
            return NextResponse.json({
                status: 'failed',
                taskId: id,
                message: '这次转写没有完成，本次没有产生任何扣费',
                billing: { chargedCents: 0 },
            });
        }

        if (hold.status === 'held') {
            // 节流只对还在跑的任务生效：已结算的任务再来一次是「结果没收到，重取一遍」，
            // 那正是我们希望它能拿到东西的时候。
            const last = hold.lastPolledAt ? Date.parse(hold.lastPolledAt) : 0;
            if (last && last > Date.now() - POLL_THROTTLE_SEC * 1000) {
                return NextResponse.json({ status: 'processing', taskId: id, throttled: true });
            }
            if (!hold.upstreamRef) {
                // 预扣落了库但建任务那一步没走完（进程被杀）。回收任务会按 TTL 释放它。
                return NextResponse.json({ status: 'processing', taskId: id });
            }
        }

        requireAsrConfig();
        if (!hold.upstreamRef) {
            throw new GatewayError('bad_request', '该任务没有可查询的上游记录');
        }
        touchHoldPoll(id);

        const info = await asrUpstream().getTask(hold.upstreamRef);

        if (isTerminalFailure(info.status)) {
            releaseHold(id, 'asr_upstream_failed');
            await deleteObjectQuietly(objectKey);
            return NextResponse.json({
                status: 'failed',
                taskId: id,
                message: info.errorMessage || '语音转写服务未能完成这次任务',
                billing: { chargedCents: 0 },
            });
        }

        if (!isCompleted(info.status)) {
            return NextResponse.json({ status: 'processing', taskId: id });
        }

        if (!info.transcriptionUrl) {
            throw new GatewayError('upstream_failed', '语音转写服务没有返回转写结果');
        }
        const transcription = await asrUpstream().fetchResult(info.transcriptionUrl);
        const autoChapters = await fetchQuietly(info.autoChaptersUrl);
        const summarization = await fetchQuietly(info.summarizationUrl);
        const meetingAssistance = await fetchQuietly(info.meetingAssistanceUrl);

        // findPricing 而不是 requireEnabledPricing：任务跑到一半被 admin 下架，
        // 不该让一个已经交付的转写卡在「这项服务未开放」上结不了账。
        const pricing = findPricing(ASR_SERVICE, ASR_OP);
        const actualUnits = actualMinutesFromTranscription(transcription) ?? hold.estimatedUnits;

        let chargedCents = 0;
        if (hold.status === 'held') {
            if (pricing) {
                chargedCents = settleHold(id, actualUnits, pricing).chargedCents;
            } else {
                // 定价行整个不见了（我们的运维问题）。宁可不收也不能瞎收。
                releaseHold(id, 'asr_pricing_missing');
            }
        }

        await deleteObjectQuietly(objectKey);

        return NextResponse.json({
            status: 'completed',
            taskId: id,
            transcription,
            autoChapters,
            summarization,
            meetingAssistance,
            billing: {
                service: ASR_SERVICE,
                op: ASR_OP,
                units: actualUnits,
                unit: pricing?.unit ?? 'minute',
                chargedCents,
            },
        });
    } catch (e) {
        return gatewayErrorResponse(e);
    }
}
