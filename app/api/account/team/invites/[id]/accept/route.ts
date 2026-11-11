import { NextRequest } from 'next/server';
import { acceptInvite } from '@/lib/team';
import { withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 接受邀请。**按当前登录人的手机号匹配**，不是按邀请 id 的持有者——
 * 邀请创建时被邀请人可能还没有账号，那时候根本没有 accountId 可存。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return withTeamAuth(request, user => ({ team: acceptInvite(user, id) }));
}
