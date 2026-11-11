import { GatewayError } from '../errors';
import { requireString, type ServiceAdapter } from './types';

/** 博查搜索。P1 用它把「预扣、扣费、失败退款、幂等、余额闸」这整套账验完。 */

const BOCHA_URL = 'https://api.bochaai.com/v1/web-search';

export const searchAdapter: ServiceAdapter = {
    service: 'search',
    timeoutMs: () => 30_000,
    ops: {
        async web(params, ctx) {
            const apiKey = ctx.vendor.bochaApiKey;
            if (!apiKey) {
                throw new GatewayError('not_configured', '平台尚未配置搜索服务的凭证');
            }
            const query = requireString(params, 'query');
            const count = Math.min(Math.max(Number(params.count) || 10, 1), 20);

            const res = await fetch(BOCHA_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query, summary: true, count, freshness: 'noLimit' }),
                signal: ctx.signal,
            });
            if (!res.ok) {
                throw new GatewayError('upstream_failed', `搜索服务返回 ${res.status}`, {
                    upstreamStatus: res.status,
                });
            }
            const body = (await res.json()) as Record<string, unknown>;
            if (body.error) {
                throw new GatewayError('upstream_failed', '搜索服务返回错误');
            }
            // 一次搜索 = 一次计费，与 service_pricing.unit='call' 对应
            return { units: 1, data: body };
        },
    },
};
