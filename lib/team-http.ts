import { NextRequest, NextResponse } from 'next/server';
import { resolveSessionOrKeyUser } from './account-auth';
import { TeamError } from './team';
import type { User } from './users';

/**
 * `/api/account/team/*` 全部路由共用的外壳（dev-board#496）。
 *
 * 每个路由只写「这次要做什么」，鉴权、错误码映射、JSON 解析都在这里一次定死：
 * 状态码语义（401/403/404/409）散在十几个文件里，早晚会有一个写歪。
 *
 * 鉴权走 `resolveSessionOrKeyUser`：桌面端用 `Bearer awdk_`，官网账户页
 * 「我的团队」分区用 `awd_session` Cookie，同一批端点两种调用方都要能进来。
 */
export async function withTeamAuth(
    request: NextRequest,
    handler: (user: User) => Promise<unknown> | unknown
): Promise<NextResponse> {
    const user = resolveSessionOrKeyUser(request);
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const body = await handler(user);
        return NextResponse.json(body === undefined ? { ok: true } : body);
    } catch (e) {
        // TeamError 之外的异常照常上抛成 500：那是服务端坏了，不是用户请求有问题。
        // 桌面端把 4xx 判为「凭据/请求明确有问题」，把服务端故障说成 4xx 会让它做错处置。
        if (e instanceof TeamError) {
            return NextResponse.json({ error: e.code }, { status: e.status });
        }
        throw e;
    }
}

/**
 * 读 JSON body，带字节上限。
 * 先看文本长度再 parse：64KB 的闸是防「一次上报塞进整份日志」，
 * parse 完再量等于已经把它读进内存了，那道闸就白设了。
 */
export async function readJsonBody(request: NextRequest, maxBytes?: number): Promise<unknown> {
    const text = await request.text();
    if (maxBytes !== undefined && Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new TeamError(413, 'payload_too_large');
    }
    if (!text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new TeamError(400, 'bad_request');
    }
}
