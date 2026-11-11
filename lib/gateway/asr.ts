import crypto from 'crypto';
import OSS from 'ali-oss';
import Tingwu, * as $Tingwu from '@alicloud/tingwu20230930';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { GatewayError } from './errors';
import { getVendorConfig } from './config';

/**
 * 语音转写的上游（阿里云 OSS + 通义听悟）。
 *
 * 三个 asr 端点都只做编排，所有真的碰阿里云的代码收在这一个文件里。
 * 散到三个 route 里去，「凭证缺了怎么办」这段就要抄三遍，抄第三遍时必然有一处
 * 变成半残执行——而语音这条链路上的半残意味着「钱扣了、录音传上去了、任务没建成」。
 *
 * <h3>为什么这里引 SDK，而桌面端刻意不引</h3>
 * 桌面端不引 SDK 是为了保补丁通道的 jar 体积（一个小版本要能压成几十 KB 的 overlay）。
 * 官网没有这个约束，而手写阿里云 v3/v4 签名的问题是**没有真凭证根本验不了**：
 * 签错的表现是上游回 403 SignatureDoesNotMatch，本地任何桩都测不出来，
 * 只会在维护者填进真 AK 的那一刻才第一次暴露。
 *
 * <h3>控制面 / 数据面分离</h3>
 * 几百 MB 的音频**不进 Next.js 进程**：ticket 只签一个限对象键、限有效期的直传 URL，
 * 桌面直传 OSS，submit 只收一个 objectKey。这是网关落在 Next.js 的代价，
 * 也是这条链路要拆成三个端点的唯一原因。
 */

export const ASR_SERVICE = 'asr';
export const ASR_OP = 'transcribe';

/** 直传凭证的有效期。够传一场两小时的会，又短到捡到它也没多少用。 */
export const UPLOAD_URL_TTL_SEC = 30 * 60;

/**
 * 交给听悟的音频 GET URL 有效期。
 * 听悟要求 >= 3 小时（它排队 + 转写要时间），给 4 小时留余量——与桌面端 BYOK 路同一口径。
 */
export const FILE_URL_TTL_SEC = 4 * 60 * 60;

/** 查听悟的节流窗口，与桌面端 MeetingTranscriptionService.POLL_THROTTLE_SECONDS 对齐。 */
export const POLL_THROTTLE_SEC = 10;

/**
 * 允许的音频扩展名。**白名单而不是过滤**：objectKey 的后缀直接来自这里，
 * 放开成「客户端传什么就用什么」就是把一段用户输入拼进对象路径。
 */
const FORMAT_CONTENT_TYPE: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
};

/**
 * 每申报一分钟允许上传的字节数，另加一个固定的富余量。
 *
 * 取值依据：桌面端转码后是 48 kbps 单声道 mp3（约 6 KB/s = 360 KB/分钟），
 * 转码失败回退的浏览器原始 webm/opus 一般在 32-128 kbps。2 MB/分钟 ≈ 266 kbps，
 * 对任何一种真实的语音录音都绰绰有余，同时把「申报 1 分钟传两小时」挡在外面
 * （两小时 48 kbps 约 43 MB，远超 3 MB 的闸）。
 */
export function maxUploadBytesFor(durationSec: number): number {
    const minutes = Math.max(1, Math.ceil(durationSec / 60));
    return minutes * 2 * 1024 * 1024 + 1024 * 1024;
}

/** 申报时长 → 计价单位（分钟）。向上取整由 creditsFor 统一做，这里保留小数。 */
export function minutesOf(durationSec: number): number {
    return durationSec / 60;
}

export function assertValidDuration(durationSec: unknown): number {
    const n = Number(durationSec);
    if (!Number.isFinite(n) || n <= 0) {
        throw new GatewayError('bad_request', '录音时长不合法', { durationSec });
    }
    return n;
}

export function assertValidFormat(format: unknown): string {
    const f = String(format ?? '').trim().toLowerCase();
    if (!FORMAT_CONTENT_TYPE[f]) {
        throw new GatewayError('bad_request', `不支持的音频格式：${f || '(空)'}`, {
            supported: Object.keys(FORMAT_CONTENT_TYPE),
        });
    }
    return f;
}

export function contentTypeOf(format: string): string {
    return FORMAT_CONTENT_TYPE[format] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// 对象键：每个用户一个前缀，A 传不进 B 的路径
// ---------------------------------------------------------------------------

/**
 * userId 的对象存储前缀。取哈希而不是直接用 userId：
 * 对象键会出现在 OSS 访问日志、账单明细、以及任何一条签名 URL 里，
 * 哈希让这些地方不再是一份用户 ID 名单，而校验能力一点没少（前缀比对是等值判断）。
 */
export function objectKeyPrefix(userId: string): string {
    const scope = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16);
    return `asr/${scope}/`;
}

export function newObjectKey(userId: string, format: string): string {
    return `${objectKeyPrefix(userId)}${crypto.randomUUID().replace(/-/g, '')}.${format}`;
}

/**
 * objectKey 必须落在该用户自己的前缀下。
 *
 * submit 收的是客户端回传的 objectKey，不校验就等于「我说传哪就是哪」：
 * 拿别人的 objectKey 提交，就能用自己的余额把别人的录音转出来读走。
 * 顺带挡掉 `..` 与绝对路径——前缀比对已经覆盖，但显式拒绝让意图留在代码里。
 */
export function assertObjectKeyOwnedBy(userId: string, objectKey: unknown): string {
    const key = String(objectKey ?? '');
    if (!key || key.includes('..') || key.startsWith('/') || !key.startsWith(objectKeyPrefix(userId))) {
        throw new GatewayError('bad_request', '音频对象不属于当前账户');
    }
    return key;
}

// ---------------------------------------------------------------------------
// 真实计量
// ---------------------------------------------------------------------------

/**
 * 从听悟的转写结果里取**真实时长**（分钟）。
 *
 * **听悟的 GetTaskInfo 不返回时长**（只有 taskStatus 与四个结果 URL），
 * 所以唯一的上游计量来源是转写结果里最后一个词的 End 时间戳。
 * 这也正是「计价以上游真实计量为准」这条红线在语音上的落点：
 * 客户端申报的 durationSec 只进过预扣与余额闸，一分钱都不由它定。
 *
 * 取不到时返回 null，调用方据此决定回落到预扣估算（宁可少收，不可乱收）。
 */
export function actualMinutesFromTranscription(transcriptionJson: string | null): number | null {
    if (!transcriptionJson) return null;
    let root: unknown;
    try {
        root = JSON.parse(transcriptionJson);
    } catch {
        return null;
    }
    const paragraphs = (root as { Transcription?: { Paragraphs?: unknown } })?.Transcription?.Paragraphs;
    if (!Array.isArray(paragraphs)) return null;
    let endMs = 0;
    for (const p of paragraphs) {
        const words = (p as { Words?: unknown }).Words;
        if (!Array.isArray(words)) continue;
        for (const w of words) {
            const end = Number((w as { End?: unknown }).End);
            if (Number.isFinite(end) && end > endMs) endMs = end;
        }
    }
    return endMs > 0 ? endMs / 60_000 : null;
}

// ---------------------------------------------------------------------------
// 上游接缝
// ---------------------------------------------------------------------------

export interface AsrTaskInfo {
    /** 听悟原文：ONGOING / COMPLETED / FAILED / INVALID */
    status: string;
    errorMessage: string | null;
    transcriptionUrl: string | null;
    autoChaptersUrl: string | null;
    summarizationUrl: string | null;
    meetingAssistanceUrl: string | null;
}

/**
 * 上游调用的接缝。单测/验证脚本注入桩，不必有真凭证也不必联网。
 *
 * 做成接口而不是靠 fetch 桩：ali-oss 走 urllib、听悟 SDK 走 darabonba 的 httpx，
 * 两个都不经过 globalThis.fetch，桩不上。
 */
export interface AsrUpstream {
    /** 签一个只能 PUT 到这个对象键的直传 URL。 */
    presignPut(objectKey: string, contentType: string, expiresSec: number): Promise<string>;
    /** 对象大小（字节）；对象不存在返回 null。 */
    objectSize(objectKey: string): Promise<number | null>;
    /** 签一个 GET URL 交给听悟去拉音频。 */
    presignGet(objectKey: string, expiresSec: number): Promise<string>;
    /** 删中转对象。失败只记日志——清理失败不该把结算搞崩。 */
    deleteObject(objectKey: string): Promise<void>;
    /** 建离线转写任务，返回听悟 TaskId。 */
    createTask(fileUrl: string): Promise<string>;
    getTask(upstreamTaskId: string): Promise<AsrTaskInfo>;
    /** 下载一个结果 URL 的正文。 */
    fetchResult(url: string): Promise<string>;
}

let injected: AsrUpstream | null = null;

/** 测试接缝。生产代码从不调用它。 */
export function setAsrUpstream(upstream: AsrUpstream | null): void {
    injected = upstream;
}

interface ResolvedAsrConfig {
    accessKeyId: string;
    accessKeySecret: string;
    appKey: string;
    bucket: string;
    endpoint: string;
    region: string;
}

/**
 * 取齐凭证，**缺任何一项都直接 not_configured**。
 *
 * 绝不半残执行：少了 bucket 还去建听悟任务，结果是任务建成了、音频拉不到，
 * 用户的钱被预扣着等一个必然失败的任务走完 TTL。
 */
export function requireAsrConfig(): ResolvedAsrConfig {
    const v = getVendorConfig();
    const missing: string[] = [];
    if (!v.aliyunAccessKeyId) missing.push('aliyunAccessKeyId');
    if (!v.aliyunAccessKeySecret) missing.push('aliyunAccessKeySecret');
    if (!v.tingwuAppKey) missing.push('tingwuAppKey');
    if (!v.ossBucket) missing.push('ossBucket');
    if (!v.ossEndpoint) missing.push('ossEndpoint');
    if (missing.length > 0) {
        throw new GatewayError('not_configured', '平台尚未配置语音转写服务的凭证', { missing });
    }
    return {
        accessKeyId: v.aliyunAccessKeyId!,
        accessKeySecret: v.aliyunAccessKeySecret!,
        appKey: v.tingwuAppKey!,
        bucket: v.ossBucket!,
        endpoint: v.ossEndpoint!,
        region: v.tingwuRegion || 'cn-beijing',
    };
}

function ossClient(cfg: ResolvedAsrConfig): OSS {
    return new OSS({
        accessKeyId: cfg.accessKeyId,
        accessKeySecret: cfg.accessKeySecret,
        bucket: cfg.bucket,
        endpoint: cfg.endpoint,
        secure: true,
    });
}

function tingwuClient(cfg: ResolvedAsrConfig): Tingwu {
    return new Tingwu(
        new $OpenApiUtil.Config({
            accessKeyId: cfg.accessKeyId,
            accessKeySecret: cfg.accessKeySecret,
            endpoint: `tingwu.${cfg.region}.aliyuncs.com`,
        })
    );
}

/**
 * 建任务的参数与桌面端 BYOK 路 {@code TingwuClientImpl.submitTask} <b>逐项一致</b>。
 *
 * 少配任何一项，两条路就会产出不同质量的结果：没有 Diarization 就没有说话人分离，
 * 会见笔录里「谁说了什么」全丢；没有 AutoChapters / Summarization / MeetingAssistance，
 * 会议纪要功能拿不到素材，界面上表现为「纪要是空的」而不是「这一项没开」。
 */
function buildCreateTaskRequest(cfg: ResolvedAsrConfig, fileUrl: string): $Tingwu.CreateTaskRequest {
    return new $Tingwu.CreateTaskRequest({
        type: 'offline',
        appKey: cfg.appKey,
        input: new $Tingwu.CreateTaskRequestInput({
            fileUrl,
            sourceLanguage: 'cn',
        }),
        parameters: new $Tingwu.CreateTaskRequestParameters({
            transcription: new $Tingwu.CreateTaskRequestParametersTranscription({
                diarizationEnabled: true,
                // SpeakerCount=0：说话人数不定，由听悟自行聚类——开会前没人知道会来几个人
                diarization: new $Tingwu.CreateTaskRequestParametersTranscriptionDiarization({
                    speakerCount: 0,
                }),
            }),
            autoChaptersEnabled: true,
            summarizationEnabled: true,
            summarization: new $Tingwu.CreateTaskRequestParametersSummarization({
                types: ['Paragraph', 'Conversational', 'QuestionsAnswering'],
            }),
            meetingAssistanceEnabled: true,
            meetingAssistance: new $Tingwu.CreateTaskRequestParametersMeetingAssistance({
                types: ['Actions', 'KeyInformation'],
            }),
        }),
    });
}

function realUpstream(): AsrUpstream {
    const cfg = requireAsrConfig();
    return {
        async presignPut(objectKey, contentType, expiresSec) {
            // Content-Type 进签名：两侧对死一个值，客户端多发/少发都会被 OSS 拒，
            // 好过让「某个 HTTP 栈自作主张加了 Content-Type」变成一个偶发的签名不匹配。
            return ossClient(cfg).signatureUrl(objectKey, {
                method: 'PUT',
                expires: expiresSec,
                'Content-Type': contentType,
            });
        },
        async objectSize(objectKey) {
            try {
                const head = await ossClient(cfg).head(objectKey);
                const len = (head.res.headers as Record<string, string>)['content-length'];
                const n = Number(len);
                return Number.isFinite(n) ? n : null;
            } catch {
                return null;
            }
        },
        async presignGet(objectKey, expiresSec) {
            return ossClient(cfg).signatureUrl(objectKey, { method: 'GET', expires: expiresSec });
        },
        async deleteObject(objectKey) {
            await ossClient(cfg).delete(objectKey);
        },
        async createTask(fileUrl) {
            const res = await tingwuClient(cfg).createTask(buildCreateTaskRequest(cfg, fileUrl));
            const taskId = res?.body?.data?.taskId;
            if (!taskId) {
                throw new GatewayError('upstream_failed', '语音转写服务未能创建任务', {
                    upstreamMessage: res?.body?.message ?? null,
                });
            }
            return taskId;
        },
        async getTask(upstreamTaskId) {
            const res = await tingwuClient(cfg).getTaskInfo(upstreamTaskId);
            const data = res?.body?.data;
            if (!data) {
                throw new GatewayError('upstream_failed', '语音转写服务未返回任务状态');
            }
            return {
                status: data.taskStatus ?? '',
                errorMessage: data.errorMessage ?? null,
                transcriptionUrl: data.result?.transcription ?? null,
                autoChaptersUrl: data.result?.autoChapters ?? null,
                summarizationUrl: data.result?.summarization ?? null,
                meetingAssistanceUrl: data.result?.meetingAssistance ?? null,
            };
        },
        async fetchResult(url) {
            const res = await fetch(url);
            if (!res.ok) {
                throw new GatewayError('upstream_failed', `转写结果下载失败（${res.status}）`);
            }
            return res.text();
        },
    };
}

export function asrUpstream(): AsrUpstream {
    return injected ?? realUpstream();
}

/** 删中转对象，失败只记日志。转写结果已经交付，清理失败不该反过来变成用户可见的错误。 */
export async function deleteObjectQuietly(objectKey: string | null | undefined): Promise<void> {
    if (!objectKey) return;
    try {
        await asrUpstream().deleteObject(objectKey);
    } catch (e) {
        console.warn('[gateway/asr] 删除中转音频失败（生命周期规则会兜底）', objectKey, String(e));
    }
}

/**
 * 回收过期预扣**之前**先把它们的中转音频删掉。
 *
 * 挂在 /api/admin/ai/reconcile 那条 cron 上。没有这一步，「代码删」就只覆盖
 * 桌面端跑完整个轮询链路的那条正路：用户合盖笔记本、换台机器办公、产品被卸载，
 * 三种都会让一段会议录音留在我们的 bucket 里等生命周期规则到期。
 * 生命周期规则是第二道兜底，不是第一道。
 */
export async function sweepExpiredAsrObjects(
    nowIso = new Date().toISOString()
): Promise<{ deleted: number }> {
    const { getDb } = await import('@/lib/db');
    const rows = getDb()
        .prepare(
            "SELECT taskId, meta FROM gateway_hold WHERE status = 'held' AND service = ? AND holdExpiresAt < ?"
        )
        .all(ASR_SERVICE, nowIso) as { taskId: string; meta: string | null }[];
    if (rows.length === 0) return { deleted: 0 };

    try {
        // 凭证还没配好时安静跳过：这条 cron 上还挂着 AI 额度对账，不能被它拖挂
        requireAsrConfig();
    } catch {
        return { deleted: 0 };
    }

    let deleted = 0;
    for (const row of rows) {
        let objectKey: string | null = null;
        try {
            objectKey = (JSON.parse(row.meta ?? '{}') as { objectKey?: string }).objectKey ?? null;
        } catch {
            objectKey = null;
        }
        if (!objectKey) continue;
        await deleteObjectQuietly(objectKey);
        deleted++;
    }
    return { deleted };
}

/**
 * 终态判定：听悟的 taskStatus 有**四**个值，不是三个。
 * INVALID（任务本身不合法）在文档里排在最后，只按 COMPLETED/FAILED 分支写的话，
 * 它会一路落到「还在跑」，桌面端永远轮询下去，钱一直被预扣占着直到 TTL。
 */
export function isTerminalFailure(status: string): boolean {
    const s = status.toUpperCase();
    return s === 'FAILED' || s === 'INVALID';
}

export function isCompleted(status: string): boolean {
    return status.toUpperCase() === 'COMPLETED';
}
