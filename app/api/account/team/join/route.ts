import { NextRequest } from 'next/server';
import { joinByCode } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 按团队邀请码加入（无团队者）。加入后角色一律 MEMBER。
 * 码不存在与码写错都回 404 `bad_code`，不区分——区分就是在给试码的人递信息。
 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { code?: unknown };
        return { team: joinByCode(user, body.code) };
    });
}
