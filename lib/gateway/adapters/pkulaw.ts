import crypto from 'crypto';
import { GatewayError } from '../errors';
import { isMcpErrorBody, mcpRawResult, objectParam, requireVendorFields, type AdapterResult, type ServiceAdapter } from './types';

/**
 * 北大法宝（三个 MCP server）。
 *
 * <h3>为什么它也能走网关</h3>
 * 桌面端那三个「MCP server」的传输就是**一次普通的 HTTPS POST**：
 * JSON-RPC 信封 + `Authorization: Bearer <token>`（见桌面仓
 * `service/ai/mcp/StreamableHttpMcpProvider`）。没有会话、没有握手、没有 SSE 长连，
 * 所以网关侧只要把同一个信封原样转发出去就行，不需要给 MCP 传输层做代理。
 *
 * 响应正文原样回给桌面端，由桌面端既有的 `McpResponseParser` 解析——
 * **解析留在桌面端**：两条档位共用同一个解析器，格式漂移只会漂一次。
 *
 * <h3>上线前置条件</h3>
 * 与企查查同：法宝是机构订阅制且 token 通常绑订阅主体，
 * **合同谈成之前 `service_pricing.enabled` 必须是 0**（设计 §9）。
 */

export const PKULAW_SERVICE = 'pkulaw';

/**
 * op → 端点。op 名保持桌面端口径不变；法宝 2026-11 把工具全部改名，
 * 真实工具名与入参在 {@link buildCall} 里翻译。
 * 端点写死在这里而不是让客户端传：让客户端指定 URL 等于把网关变成一个
 * 拿我们的凭证打任意地址的转发器。
 */
const BASE = 'https://apim-gateway.pkulaw.com';
const OPS: Record<string, { url: string }> = {
    search_article: { url: `${BASE}/mcp-law-search-service` },
    get_article: { url: `${BASE}/mcp-fatiao` },
    get_law_item_content: { url: `${BASE}/mcp-fatiao` },
    get_law_list: { url: `${BASE}/mcp-law` },
    law_recognition: { url: `${BASE}/law_recognition` },
    search_case: { url: `${BASE}/mcp-case-search-service` },
    anhao_recognition: { url: `${BASE}/case_number_recognition` },
    adjust_provisions: { url: `${BASE}/pku_citation_validator` },
};

/** 去掉 undefined / null / 空串，避免把「没传」当成空值发给上游。 */
function compact(o: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
}

const snake = (k: string) => k.replace(/([A-Z])/g, '_$1').toLowerCase();
const asArray = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function requireArg(v: unknown, name: string): unknown {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        throw new GatewayError('bad_request', `缺少参数 ${name}`);
    }
    return v;
}

/** 桌面端 op + 入参 → 法宝当前的（工具名, 入参）。 */
function buildCall(op: string, params: Record<string, unknown>): { tool: string; args: Record<string, unknown> } {
    const a = objectParam(params, 'args');
    switch (op) {
        case 'search_article':
            return {
                tool: 'search_law_articles',
                args: compact({
                    query_text: a.text,
                    library: a.lib,
                    timeliness: a.timeliness,
                    issue_department: a.issue_department,
                    implement_date_start: a.implement_date_start,
                    implement_date_end: a.implement_date_end,
                    size: a.size,
                }),
            };
        case 'get_article':
        case 'get_law_item_content': {
            const title = requireArg(a.lawTitle ?? a.title, 'title');
            const num = requireArg(a.articleNumber ?? a.number, 'number');
            // 条号原样以字符串透传，格式（数字 / 第X条）由上游认
            return { tool: 'get_law_article', args: { law_title: String(title), article_number: String(num) } };
        }
        case 'get_law_list': {
            const snaked = compact(Object.fromEntries(Object.entries(a).map(([k, v]) => [snake(k), v])));
            if (snaked.title || snaked.document_no) return { tool: 'search_laws_by_keyword', args: snaked };
            if (snaked.fulltext) return { tool: 'search_law_articles_by_keyword', args: { fulltext: snaked.fulltext } };
            throw new GatewayError('bad_request', '缺少参数 title / documentNo / fulltext');
        }
        case 'law_recognition':
            return { tool: 'recognize_law_citations', args: { text: requireArg(a.text, 'text') } };
        case 'search_case':
            return { tool: 'search_cases', args: a };
        case 'anhao_recognition':
            return { tool: 'recognize_case_numbers', args: { text: requireArg(a.text, 'text') } };
        case 'adjust_provisions':
            return {
                tool: 'verify_law_citations',
                args: compact({ user_law: asArray(a.userlaw), answer_law: asArray(a.answerlaw), prompt: a.prompt }),
            };
        default:
            throw new GatewayError('bad_request', `未知操作 ${op}`);
    }
}

/** 解析 MCP 响应正文（JSON 或 SSE data 行）为 JSON-RPC 消息；失败返回 null。 */
function parseRpc(text: string): Record<string, any> | null {
    const candidates = [text, ...text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())];
    for (const c of candidates) {
        try {
            const v = JSON.parse(c);
            if (v && typeof v === 'object') return v;
        } catch {
            // 试下一个
        }
    }
    return null;
}

function errorText(text: string): string {
    const msg = parseRpc(text);
    const parts: string[] = [];
    for (const c of msg?.result?.content ?? []) if (typeof c?.text === 'string') parts.push(c.text);
    if (msg?.error?.message) parts.push(String(msg.error.message));
    return parts.join('\n');
}

interface ListedTool {
    name: string;
    description?: unknown;
    inputSchema?: { properties?: Record<string, { type?: unknown }>; required?: unknown };
}

/** name(prop1*: type, prop2: type) — 描述前 100 字；* = 必填 */
function describeTool(t: ListedTool): string {
    const required = new Set(Array.isArray(t.inputSchema?.required) ? (t.inputSchema!.required as string[]) : []);
    const props = Object.entries(t.inputSchema?.properties ?? {}).map(
        ([k, v]) => `${k}${required.has(k) ? '*' : ''}: ${typeof v?.type === 'string' ? v.type : 'any'}`
    );
    const desc = typeof t.description === 'string' ? t.description.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
    return `${t.name}(${props.join(', ')})${desc ? ` — ${desc}` : ''}`;
}

const AVAILABLE_MAX_CHARS = 3000;

/** 把可用工具名追加到 Unknown tool 错误文本末尾（只改文本，信封形状不变）。 */
function appendAvailable(text: string, tools: ListedTool[]): string {
    const msg = parseRpc(text);
    let listing = tools.map(describeTool).join(', ');
    if (listing.length > AVAILABLE_MAX_CHARS) listing = listing.slice(0, AVAILABLE_MAX_CHARS) + '…';
    const suffix = `. Available on this endpoint: ${listing}`;
    if (msg?.result?.content?.[0] && typeof msg.result.content[0].text === 'string') {
        msg.result.content[0].text += suffix;
        return JSON.stringify(msg);
    }
    if (msg?.error) {
        msg.error.message = `${msg.error.message ?? ''}${suffix}`;
        return JSON.stringify(msg);
    }
    return text;
}

/** 端点+工具名 → 已解析出的真实工具名，进程内缓存 1 小时。 */
const RESOLVED_TTL_MS = 60 * 60 * 1000;
const resolvedTools = new Map<string, { name: string; at: number }>();
export function clearPkulawToolCache(): void {
    resolvedTools.clear();
}

async function rpc(
    url: string,
    token: string,
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal
): Promise<string> {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            // 法宝网关按 Accept 决定回 JSON 还是 SSE；与桌面端 BYOK 路逐字一致
            Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: crypto.randomUUID() }),
        signal,
    });
    const text = await res.text();
    if (!res.ok) {
        throw new GatewayError('upstream_failed', `法规检索服务返回 ${res.status}`, {
            upstreamStatus: res.status,
        });
    }
    return text;
}

function callOp(op: string): ServiceAdapter['ops'][string] {
    return async (params, ctx): Promise<AdapterResult> => {
        const cfg = requireVendorFields(ctx.vendor, PKULAW_SERVICE, ['pkulawToken']);
        const target = OPS[op];
        const { tool, args } = buildCall(op, params);
        const key = `${target.url}#${tool}`;
        const hit = resolvedTools.get(key);
        const cached = hit && Date.now() - hit.at < RESOLVED_TTL_MS ? hit.name : undefined;
        const call = (name: string) => rpc(target.url, cfg.pkulawToken, 'tools/call', { name, arguments: args }, ctx.signal);

        const text = await call(cached ?? tool);
        if (!isMcpErrorBody(text) || !/Unknown tool/i.test(errorText(text))) {
            return mcpRawResult(text);
        }

        // 法宝各服务的工具名会带前缀/后缀（server.tool 等）。tools/list 不计费，唯一匹配则改名重试一次。
        resolvedTools.delete(key);
        const listMsg = parseRpc(await rpc(target.url, cfg.pkulawToken, 'tools/list', {}, ctx.signal));
        const tools: ListedTool[] = (listMsg?.result?.tools ?? []).filter(
            (t: { name?: unknown }) => typeof t?.name === 'string'
        );
        const names = tools.map((t) => t.name);
        const matches = names.filter(
            (n) => n === tool || n.endsWith('.' + tool) || n.endsWith('_' + tool)
        );
        if (matches.length === 1 && matches[0] !== (cached ?? tool)) {
            const retry = await call(matches[0]);
            if (!isMcpErrorBody(retry)) resolvedTools.set(key, { name: matches[0], at: Date.now() });
            return mcpRawResult(retry);
        }
        return { units: 0, data: { raw: appendAvailable(text, tools) } };
    };
}

export const pkulawAdapter: ServiceAdapter = {
    service: PKULAW_SERVICE,
    timeoutMs: () => 60_000,
    ops: Object.fromEntries(Object.keys(OPS).map((op) => [op, callOp(op)])),
};
