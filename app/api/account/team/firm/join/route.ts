import { NextRequest } from 'next/server';
import { joinFirmByCode } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/** 团队并入律所（团队 OWNER，凭律所邀请码）。已入所回 409 `already_in_firm`。 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { code?: unknown };
        return { firm: joinFirmByCode(user.id, body.code) };
    });
}
