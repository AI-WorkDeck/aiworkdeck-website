import crypto from 'crypto';
import { GatewayError } from '../errors';
import { mcpRawResult, requireString, requireVendorFields, type ServiceAdapter } from './types';

/**
 * 企查查企业工商详情。
 *
 * **上线前置条件未满足前 `service_pricing.enabled` 必须是 0**（设计 §9）：
 * 企查查是机构订阅制，共用一个 token 服务全部终端用户属于按量分销，
 * 需要单独授权。代码先合、开关默认关，合同谈成后改一个开关即可。
 *
 * op 按接口分：今天只有工商详情一个（`eci_info`），
 * 以后接贵接口时单列一行定价，不必动这里的通配价。
 */

export const QICHACHA_SERVICE = 'qichacha';
export const QICHACHA_OP = 'eci_info';

/**
 * 知识产权类 op → 智能体数据平台 ipr 服务器的 MCP 工具名（dev-board#179）。
 *
 * REST 那把 key 只购买了工商详情接口；商标/专利/软著/备案走的是另一把独立凭证
 * （qichachaMcpToken，MCC 智能体数据平台订阅）。传输与法宝同款：一次普通 HTTPS
 * POST 的 JSON-RPC 信封，无会话无握手，网关原样转发即可。
 *
 * 白名单写死：让客户端指定工具名等于把网关变成拿我们订阅打任意查询的转发器。
 * 响应正文（JSON 或 SSE 文本）原样回桌面端，由既有 McpResponseParser 解析——
 * 与法宝同一策略，格式漂移只会漂一次。
 */
const IPR_MCP_TOOLS = [
    'get_trademark_info',
    'get_patent_info',
    'get_international_patent',
    'get_software_copyright_info',
    'get_copyright_work_info',
    'get_internet_service_info',
    'get_ipr_pledge',
] as const;

const IPR_MCP_URL = 'https://agent.qcc.com/mcp/ipr/stream';

function iprOp(tool: string): ServiceAdapter['ops'][string] {
    return async (params, ctx) => {
        const cfg = requireVendorFields(ctx.vendor, QICHACHA_SERVICE, ['qichachaMcpToken']);
        const searchKey = requireString(params, 'searchKey');
        const res = await fetch(IPR_MCP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.qichachaMcpToken}`,
                Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name: tool, arguments: { searchKey } },
                id: crypto.randomUUID(),
            }),
            signal: ctx.signal,
        });
        const text = await res.text();
        if (!res.ok) {
            throw new GatewayError('upstream_failed', `企业数据服务返回 ${res.status}`, {
                upstreamStatus: res.status,
            });
        }
        // 一次查询 = 一次计费，与 service_pricing.unit='call' 对应；MCP 层错误不计费
        return mcpRawResult(text);
    };
}

const DEFAULT_BASE_URL = 'https://api.qichacha.com';

/** Token = MD5(key + Timespan + SecretKey)，大写。与桌面端 BYOK 路逐字一致。 */
export function qichachaToken(key: string, timespan: string, secret: string): string {
    return crypto.createHash('md5').update(key + timespan + secret).digest('hex').toUpperCase();
}

export const qichachaAdapter: ServiceAdapter = {
    service: QICHACHA_SERVICE,
    timeoutMs: () => 60_000,
    ops: {
        async eci_info(params, ctx) {
            const cfg = requireVendorFields(ctx.vendor, QICHACHA_SERVICE, [
                'qichachaKey',
                'qichachaSecret',
            ]);
            const searchKey = requireString(params, 'searchKey');
            const timespan = String(Math.floor(Date.now() / 1000));
            const url = new URL('/ECIInfoVerify/GetInfo', DEFAULT_BASE_URL);
            url.searchParams.set('key', cfg.qichachaKey);
            url.searchParams.set('searchKey', searchKey);

            const res = await fetch(url, {
                headers: {
                    Token: qichachaToken(cfg.qichachaKey, timespan, cfg.qichachaSecret),
                    Timespan: timespan,
                },
                signal: ctx.signal,
            });
            if (!res.ok) {
                throw new GatewayError('upstream_failed', `企业数据服务返回 ${res.status}`, {
                    upstreamStatus: res.status,
                });
            }
            const body = (await res.json()) as { Status?: string; Message?: string; Result?: unknown };

            // 只有 Status=200 才是一次成功查询。**非 200 一律抛，不扣费**——
            // 「查无此企业」与「余额不足」在企查查那边都不是成功调用，
            // 收了钱却什么都没查到，用户下一次就不敢用了。
            if (body.Status !== '200') {
                throw new GatewayError(
                    'upstream_failed',
                    `企业数据服务返回：${body.Message || '未知错误'}`,
                    { upstreamStatus: body.Status ?? null }
                );
            }
            if (!body.Result) {
                throw new GatewayError('upstream_failed', '企业数据服务未返回结果');
            }
            // 一次查询 = 一次计费，与 service_pricing.unit='call' 对应
            return { units: 1, data: body };
        },
        ...Object.fromEntries(IPR_MCP_TOOLS.map((t) => [t, iprOp(t)])),
    },
};
