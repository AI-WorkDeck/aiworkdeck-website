import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { DirectoryRequestError, lookupDirectory } from '@/lib/collab-directory';
import { TeamError } from '@/lib/team';
import { readJsonBody } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 协作加人的名录查询内部口（设计稿 §4，dev-board#550 #551）。
 *
 * **这不是桌面契约端点**：不出现在 doc/desktop-contract.md，不走 Bearer awdk_。
 * 调用方是官方案件库（backend.jar 的 `case` 实例）——它按手机号/邮箱找同事时
 * 本地库里只有桥接过的人，查不到就把「在官网注册过的同事」说成不存在。这条口子
 * 让它回官网确认账户是否存在、以及双方的团队/律所归属。走 `127.0.0.1:<next端口>`
 * 直连，公网侧由 nginx 对 `location ^~ /api/internal/` 直接 `return 404` 兜底
 * （部署清单见 DEPLOY.md §7.7）。
 *
 * **鉴权**：header `X-Internal-Secret` 恒定时间比较 env `AWD_COLLAB_DIRECTORY_SECRET`。
 * env 未配置（国际站的默认状态）或 header 缺失/不符——**一律 404**，不是 401/403：
 * 功能在没配置的部署上必须表现成「路由不存在」，这样探测不出这条内部口子的存在。
 * 密钥**必须与 AWD_TRANSFER_BILLING_SECRET / AWD_MOBILE_BILLING_SECRET 各不相同**：
 * 那两条会扣钱、会建单建号，这条只读名录，一把密钥泄漏不该同时把三件事都交出去。
 *
 * **与被否决的「凭 accountId 换任意用户 key」是不同风险类**（doc/desktop-contract.md
 * 「per-user 平台 AI key」）：这条口子不发任何凭据、不写任何数据，只回
 * 账户是否存在、展示名、手机号与归属；手机号是案件库认领桥接用户所必需的，
 * 邮箱、头像、完整角色、团队名、律所名不回；只附带总部 OWNER/ADMIN 的 firmAdmin 权限事实。
 */

function timingSafeEqualStr(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** 与「这条路由压根不存在」在观感上不可区分：空响应体、404。 */
function notFound(): NextResponse {
    return new NextResponse(null, { status: 404 });
}

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
    const secret = process.env.AWD_COLLAB_DIRECTORY_SECRET;
    if (!secret) return notFound();

    const provided = request.headers.get('x-internal-secret');
    if (!provided || !timingSafeEqualStr(provided, secret)) return notFound();

    try {
        const raw = await readJsonBody(request, MAX_BODY_BYTES);
        // `null` / 数组 / 裸字符串都是合法 JSON，按「没给任何定位键」处理成 400，
        // 而不是让取字段那一步抛 TypeError 变成 500。
        const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        return NextResponse.json(lookupDirectory(body));
    } catch (e) {
        if (e instanceof DirectoryRequestError) {
            return NextResponse.json({ error: 'bad_request' }, { status: 400 });
        }
        // readJsonBody 的两种拒绝（非法 JSON 400 / 超 64KB 413）沿用同一套错误码。
        if (e instanceof TeamError) {
            return NextResponse.json({ error: e.code }, { status: e.status });
        }
        throw e;
    }
}
