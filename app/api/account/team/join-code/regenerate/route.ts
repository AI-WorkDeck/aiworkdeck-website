import { NextRequest } from 'next/server';
import { regenerateJoinCode } from '@/lib/team';
import { withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/** 重置团队邀请码（OWNER/ADMIN）。旧码立即失效。 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, user => ({ joinCode: regenerateJoinCode(user.id) }));
}
