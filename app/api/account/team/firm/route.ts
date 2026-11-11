import { NextRequest } from 'next/server';
import { createFirm, updateFirm } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 律所根端点。律所信息本身在 `GET /api/account/team` 的 `firm` 字段里回，
 * 这里不再单开一个 GET：客户端要么两个都要、要么一个都不要，分两次拉只会更容易不一致。
 *
 * POST  创建律所（团队 OWNER 且本队未入所），本团队成为总部团队
 * PATCH 改所名（总部 OWNER/ADMIN）
 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { name?: unknown };
        return { firm: createFirm(user.id, body.name) };
    });
}

export async function PATCH(request: NextRequest) {
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { name?: unknown };
        return { firm: updateFirm(user.id, body) };
    });
}
