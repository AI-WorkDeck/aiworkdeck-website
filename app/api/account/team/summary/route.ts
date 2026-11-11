import { NextRequest } from 'next/server';
import { resolveRequestLocale } from '@/lib/api-locale';
import { asSummaryRange, asSummaryScope, summarizeTeam } from '@/lib/team';
import { withTeamAuth } from '@/lib/team-http';

export const dynamic = 'force-dynamic';

/**
 * 团队 / 律所统计。
 * `range` 取 7/30/90、`scope` 取 team/firm，非法值分别回落到 7 与 team（都是展示选项，不报错）。
 * `scope=firm` 只对入所团队可用（未入所 404 `no_firm`）；明细范围按角色收窄，见 lib/team.ts。
 */
export async function GET(request: NextRequest) {
    const lang = resolveRequestLocale(request);
    const range = asSummaryRange(request.nextUrl.searchParams.get('range'));
    const scope = asSummaryScope(request.nextUrl.searchParams.get('scope'));
    return withTeamAuth(request, user => summarizeTeam(user.id, range, scope, new Date(), lang));
}
