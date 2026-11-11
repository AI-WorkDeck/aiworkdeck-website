import { NextRequest } from 'next/server';
import { setProjectAlias } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 给项目短码起别名（OWNER/ADMIN）。项目名默认随上报落库，团队关闭 shareProjectNames
 * 后才会不上云——不管哪种情况，管理者起的别名始终优先于上报带来的项目名。
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ projectKey: string }> }
) {
    const { projectKey } = await params;
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as { label?: unknown };
        setProjectAlias(user.id, projectKey, body.label);
        return { ok: true };
    });
}
