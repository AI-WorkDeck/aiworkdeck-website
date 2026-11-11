import { NextRequest } from 'next/server';
import { resolveRequestLocale } from '@/lib/api-locale';
import { createTeam, getMyTeamView, updateTeam } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 团队根端点（Bearer awdk_）。契约见 doc/desktop-contract.md「团队」一节。
 *
 * GET   我的团队；无团队时返回 { team: null, invites: [] }（我手机号收到的邀请）
 * POST  创建团队（创建者为 OWNER，已有团队 409）
 * PATCH 改团队名 / 是否共享项目名（OWNER/ADMIN）
 */
export async function GET(request: NextRequest) {
    const lang = resolveRequestLocale(request);
    return withTeamAuth(request, user => getMyTeamView(user, lang));
}

export async function POST(request: NextRequest) {
    // body 在 withTeamAuth 里面读：解析失败要走同一套错误映射，
    // 而且没通过鉴权的请求根本不该被读 body。
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { name?: unknown };
        return { team: createTeam(user, body.name) };
    });
}

export async function PATCH(request: NextRequest) {
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as {
            name?: unknown;
            shareProjectNames?: unknown;
        };
        return { team: updateTeam(user.id, body) };
    });
}
