import { NextRequest } from 'next/server';
import { allowUsageUpload, recordUsage, TeamError, USAGE_BODY_MAX_BYTES } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 日聚合上报（团队成员，幂等 upsert）。
 *
 * **与匿名 telemetry 是两条通道**：这条带 accountId、要 Bearer、默认关闭，
 * 绝不可以并进 /api/telemetry/*，理由见 lib/team.ts 头注释。
 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, async user => {
        // 限流先于读 body：被限的请求不该还把 64KB 读进内存
        if (!allowUsageUpload(user.id)) throw new TeamError(429, 'rate_limited');
        const body = await readJsonBody(request, USAGE_BODY_MAX_BYTES);
        return recordUsage(user.id, body);
    });
}
