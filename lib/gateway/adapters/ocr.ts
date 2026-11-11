import { Readable } from 'stream';
import OcrClient, * as $Ocr from '@alicloud/ocr-api20210707';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import * as $dara from '@darabonba/typescript';
import { GatewayError } from '../errors';
import { type GatewayVendorConfig } from '../config';
import { requireString, requireVendorFields, type ServiceAdapter } from './types';

/**
 * 阿里云 OCR（ocr-api 2021-07-07 / RecognizeAllText）。
 *
 * 与桌面端 BYOK 路 {@code AliyunOcrClient} 调的是同一个动作、同一组参数
 * （{@code Type=Advanced} 通用文字识别高精版），换的只是「谁的 AccessKey」。
 * 两条路必须产出同形状的结果（{@code content} + {@code raw}），
 * 否则截图摘录、文件文本抽取这些消费方要按档位分两套解析。
 *
 * <h3>为什么这里引 SDK</h3>
 * 与语音那条同理：手写阿里云 v3 签名**没有真凭证根本验不了**，
 * 签错的表现是上游 403 SignatureDoesNotMatch，本地任何桩都测不出来。
 * 桌面端不引 SDK 是为了保补丁通道的 jar 体积，官网没有这个约束。
 */

export const OCR_SERVICE = 'ocr';
export const OCR_OP = 'recognize';

/** 与桌面端 BYOK 路同一个默认 endpoint，改这里要同时改那边。 */
const DEFAULT_ENDPOINT = 'ocr-api.cn-hangzhou.aliyuncs.com';

export interface OcrRecognition {
    /** 全文文本 */
    content: string;
    /** 上游 Data 对象的原始 JSON（坐标、表格、KV 等细节），桌面端原样透传 */
    raw: string;
    /**
     * 上游报告的可计费页数。识别单张图片时上游不报页数，此时为 null，
     * 由调用方按「一次调用 = 一页」计。
     */
    pages: number | null;
}

/**
 * 上游接缝。做成接口而不是靠 fetch 桩：阿里云 SDK 走 darabonba 的 httpx，
 * 不经过 globalThis.fetch，桩不上。
 */
export interface OcrUpstreamOptions {
    /**
     * 要坐标、印章、表格、段落（桌面端「保留版式的 Word」「可搜索 PDF」用）。
     * 同一个动作、同一个 Type，单价与计费单位不变；旧版桌面端不传，行为不变。
     */
    layout: boolean;
}

export interface OcrUpstream {
    recognize(imageBytes: Buffer, signal: AbortSignal, options: OcrUpstreamOptions): Promise<OcrRecognition>;
}

let injected: OcrUpstream | null = null;

/** 测试接缝。生产代码从不调用它。 */
export function setOcrUpstream(upstream: OcrUpstream | null): void {
    injected = upstream;
}

/**
 * 取齐凭证。**必须在 op 里显式调一次，而不是只藏在 realUpstream 里**：
 * 藏进去的话，注入桩会连同这道闸一起替掉，「缺凭证要回 not_configured」
 * 就再也没有护栏——而这正是最容易在生产上第一次暴露的一条路径。
 */
export function requireOcrConfig(vendor: GatewayVendorConfig) {
    return requireVendorFields(vendor, OCR_SERVICE, ['ocrAccessKeyId', 'ocrAccessKeySecret']);
}

/**
 * 构造上游请求。layout 只打开下面四项（白名单），不透传任意参数：
 * 坐标（四点）、印章位置、表格单元格（带行列跨度）、段落。
 */
export function buildOcrRequest(imageBytes: Buffer, layout: boolean): $Ocr.RecognizeAllTextRequest {
    const req = new $Ocr.RecognizeAllTextRequest({
        body: Readable.from(imageBytes),
        type: 'Advanced',
    });
    if (layout) {
        req.outputCoordinate = 'points';
        req.outputStamp = true;
        req.advancedConfig = new $Ocr.RecognizeAllTextRequestAdvancedConfig({
            outputTable: true,
            outputParagraph: true,
        });
    }
    return req;
}

function realUpstream(vendor: GatewayVendorConfig): OcrUpstream {
    const cfg = requireOcrConfig(vendor);
    const endpoint = vendor.ocrEndpoint || DEFAULT_ENDPOINT;

    return {
        async recognize(imageBytes, _signal, options) {
            const client = new OcrClient(
                new $OpenApiUtil.Config({
                    accessKeyId: cfg.ocrAccessKeyId,
                    accessKeySecret: cfg.ocrAccessKeySecret,
                    endpoint,
                })
            );
            const req = buildOcrRequest(imageBytes, options.layout);
            const runtime = new $dara.RuntimeOptions({
                connectTimeout: 10_000,
                readTimeout: 30_000,
            });
            const res = await client.recognizeAllTextWithOptions(req, runtime);
            const data = res?.body?.data;
            if (!data) {
                throw new GatewayError('upstream_failed', '文字识别服务未返回结果');
            }
            return {
                content: data.content ?? '',
                raw: JSON.stringify(data),
                // RecognizeAllText 是**按图片**的接口，返回里没有可计费页数字段。
                // subImageCount 是同一张图里切出来的区域数，拿它当页数会成倍多收。
                pages: null,
            };
        },
    };
}

function ocrUpstream(vendor: GatewayVendorConfig): OcrUpstream {
    return injected ?? realUpstream(vendor);
}

/** 去掉 dataURL 前缀并解码。解不出来说明客户端传坏了，属 bad_request 不是上游故障。 */
export function decodeImage(imageBase64: string): Buffer {
    const comma = imageBase64.indexOf(',');
    const payload = imageBase64.startsWith('data:') && comma > 0
        ? imageBase64.slice(comma + 1)
        : imageBase64;
    const buf = Buffer.from(payload.trim(), 'base64');
    if (buf.length === 0) {
        throw new GatewayError('bad_request', '图片内容不是合法的 base64');
    }
    return buf;
}

export const ocrAdapter: ServiceAdapter = {
    service: OCR_SERVICE,
    // 阿里云 OCR 的高精版对整页扫描件经常要十几秒，账户通道的 5 秒在这里必然超时
    timeoutMs: () => 60_000,
    ops: {
        async recognize(params, ctx) {
            requireOcrConfig(ctx.vendor);
            const bytes = decodeImage(requireString(params, 'imageBase64'));
            const layout = params.layout ?? false;
            if (typeof layout !== 'boolean') {
                throw new GatewayError('bad_request', 'layout 必须是布尔值');
            }
            const result = await ocrUpstream(ctx.vendor).recognize(bytes, ctx.signal, { layout });
            // 一次调用识别一张图 = 一页。上游报了页数就按它，没报就是 1，
            // **不拿 subImageCount 顶替**（那是区域数，会成倍多收）。
            const pages = result.pages && result.pages > 0 ? result.pages : 1;
            return { units: pages, data: { content: result.content, raw: result.raw } };
        },
    },
};
