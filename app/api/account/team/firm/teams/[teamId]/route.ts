import { NextRequest } from 'next/server';
import { removeTeamFromFirm } from '@/lib/team';
import { withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 把一个团队移出律所：总部 OWNER/ADMIN 移除任一子团队，或该团队自己的 OWNER 主动退出。
 * **总部团队不可退出**（403 `head_cannot_leave`），否则律所没人能管。
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    const { teamId } = await params;
    return withTeamAuth(request, user => {
        removeTeamFromFirm(user.id, teamId);
        return { ok: true };
    });
}
