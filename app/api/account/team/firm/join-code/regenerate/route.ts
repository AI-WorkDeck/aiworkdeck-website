import { NextRequest } from 'next/server';
import { regenerateFirmJoinCode } from '@/lib/team';
import { withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/** 重置律所邀请码（总部团队的 OWNER/ADMIN）。旧码立即失效。 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, user => ({ joinCode: regenerateFirmJoinCode(user.id) }));
}
