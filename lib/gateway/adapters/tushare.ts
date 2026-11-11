import { GatewayError } from '../errors';
import { objectParam, optionalString, requireString, requireVendorFields, type ServiceAdapter } from './types';

/**
 * Tushare 金融数据。
 *
 * 上游只有一个统一入口（POST 一个 JSON，`api_name` 指哪个接口），
 * 所以网关这边也只有一个 op `query`，具体接口名在参数里。
 *
 * 桌面端 BYOK 路的 `callTushare(apiName, params, fields)` 与这里是同一形状，
 * 两条路返回同一个 `{code, msg, data:{fields, items}}`，
 * 上层那几个解析函数（股东、管理层、工商信息）因此一行都不用改。
 */

export const TUSHARE_SERVICE = 'tushare';
export const TUSHARE_OP = 'query';

const DEFAULT_BASE_URL = 'https://api.tushare.pro';

/** 接口名走白名单式的字符校验：它会被原样发给上游，留个明确的拒绝点。 */
const API_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

export const tushareAdapter: ServiceAdapter = {
    service: TUSHARE_SERVICE,
    timeoutMs: () => 30_000,
    ops: {
        async query(params, ctx) {
            const cfg = requireVendorFields(ctx.vendor, TUSHARE_SERVICE, ['tushareToken']);
            const apiName = requireString(params, 'apiName');
            if (!API_NAME_PATTERN.test(apiName)) {
                throw new GatewayError('bad_request', `接口名不合法：${apiName}`);
            }

            const res = await fetch(DEFAULT_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_name: apiName,
                    token: cfg.tushareToken,
                    params: objectParam(params, 'params'),
                    fields: optionalString(params, 'fields') ?? '',
                }),
                signal: ctx.signal,
            });
            if (!res.ok) {
                throw new GatewayError('upstream_failed', `金融数据服务返回 ${res.status}`, {
                    upstreamStatus: res.status,
                });
            }
            const body = (await res.json()) as { code?: number; msg?: string };

            // Tushare 用 body.code 而不是 HTTP 状态表达失败（积分不足、接口无权限都是 200）。
            // **只按 HTTP 状态判成功就会给一次什么都没查到的调用收钱。**
            if (body.code !== 0) {
                throw new GatewayError(
                    'upstream_failed',
                    `金融数据服务返回：${body.msg || '未知错误'}`,
                    { upstreamStatus: body.code ?? null }
                );
            }
            // 一次查询 = 一次计费，与 service_pricing.unit='call' 对应
            return { units: 1, data: body };
        },
    },
};
