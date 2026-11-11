import { NextRequest } from 'next/server';
import { changeMemberRole, changeMemberTitle, removeMember, TeamError } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';
import { withTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 改角色 / 职务，只传要改的字段。
 * - role：OWNER 可改任何非 OWNER；ADMIN 只能动当前是 MEMBER 的人。
 * - title：OWNER/ADMIN 可改任何人（职务只是展示标签）；传 null 或空串清除。
 * 两者都传时在同一事务里先改职务再改角色：任一步被拒整体回滚；changeMemberRole 回读的成员行带新职务。
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ accountId: string }> }
) {
    const { accountId } = await params;
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { role?: unknown; title?: unknown };
        const hasRole = body.role !== undefined;
        const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
        if (!hasRole && !hasTitle) throw new TeamError(400, 'bad_request');
        // 同一事务：角色那步被拒（403）时职务也回滚，不留半截修改
        const member = withTransaction(() => {
            let m = hasTitle ? changeMemberTitle(user.id, accountId, body.title) : undefined;
            if (hasRole) m = changeMemberRole(user.id, accountId, body.role);
            return m;
        });
        return { member };
    });
}

/** 移除成员（OWNER/ADMIN）或本人退出。OWNER 不可退出（队里没 OWNER 就永久卡死）。 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ accountId: string }> }
) {
    const { accountId } = await params;
    return withTeamAuth(request, user => {
        removeMember(user.id, accountId);
        return { ok: true };
    });
}
