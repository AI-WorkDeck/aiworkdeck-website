import { NextRequest } from 'next/server';
import { revokeInvite } from '@/lib/team';
import { withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/** 撤销邀请（OWNER/ADMIN）。已被接受的邀请撤不了，回 409。 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return withTeamAuth(request, user => {
        revokeInvite(user.id, id);
        return { ok: true };
    });
}
