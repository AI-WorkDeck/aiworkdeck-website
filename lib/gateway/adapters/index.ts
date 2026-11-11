import { GatewayError } from '../errors';
import { getVendorConfig } from '../config';
import type { AdapterContext, AdapterOp, ServiceAdapter } from './types';
import { searchAdapter } from './search';
import { ocrAdapter } from './ocr';
import { qichachaAdapter } from './qichacha';
import { tushareAdapter } from './tushare';
import { pkulawAdapter } from './pkulaw';

/**
 * 适配器注册表。
 *
 * 一家一个文件（见 ./types 顶部对 adapter 职责的约定），这里只做汇总——
 * 全塞进一个文件的话，接到第五、第六家时它已经四百多行，
 * 而每一家的「凭证从哪来、失败怎么分类、真实计量怎么取」都要在里面翻着找。
 *
 * **语音转写（asr）不在这里**：它是唯一的异步长任务，走自己的三个端点，见 ../asr.ts。
 *
 * **语音合成（tts）已整体下线**：桌面端把云端 ElevenLabs 那一档删了，只留本机 Kokoro
 * （桌面仓 #386），平台侧再留一个适配器就是一条永远调不到的死路径——它还会在
 * 后台定价页里显示成一项「已开放」的服务，而产品里根本没有这个东西。
 */

export * from './types';
export { setOcrUpstream, buildOcrRequest, type OcrUpstream, type OcrUpstreamOptions, type OcrRecognition } from './ocr';

const ADAPTERS: Record<string, ServiceAdapter> = Object.fromEntries(
    [
        searchAdapter,
        ocrAdapter,
        qichachaAdapter,
        tushareAdapter,
        pkulawAdapter,
    ].map((a) => [a.service, a])
);

export function findAdapter(service: string): ServiceAdapter | null {
    return ADAPTERS[service] ?? null;
}

export function resolveOp(service: string, op: string): { adapter: ServiceAdapter; run: AdapterOp } {
    const adapter = findAdapter(service);
    if (!adapter) {
        throw new GatewayError('not_configured', `未知的服务：${service}`, { service });
    }
    const run = adapter.ops[op];
    if (!run) {
        throw new GatewayError('bad_request', `服务「${service}」不支持操作「${op}」`, { service, op });
    }
    return { adapter, run };
}

export function adapterContext(userId: string, signal: AbortSignal): AdapterContext {
    return { userId, vendor: getVendorConfig(), signal };
}

/** 已注册的服务名，供 pricing 校验与 /api/gateway/pricing 过滤用。 */
export function registeredServices(): string[] {
    return Object.keys(ADAPTERS).sort();
}
