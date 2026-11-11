import { NextRequest } from 'next/server';
import { createInvite } from '@/lib/team';
import { readJsonBody, withTeamAuth } from '@/lib/team-http';
import { emailIsAccount } from '@/lib/mail-policy';

export const dynamic = 'force-dynamic';

/**
 * 生成邀请（OWNER/ADMIN，7 天有效）。被邀请人无需已注册——邀请挂在账号本体上。
 *
 * 入参按站点分：大陆站 `{ phone, role }`，国际站 `{ email, role }`
 * （dev-board#778）。**不去兼容另一站的字段名**：国际站收到 `{ phone }` 等于
 * 没给标识，会走到 400 `bad_email`，那正是该给的答复——国际站的账号本体是邮箱，
 * 拿手机号发出来的邀请没有任何人接受得了。
 */
export async function POST(request: NextRequest) {
    return withTeamAuth(request, async user => {
        const body = (await readJsonBody(request)) as {
            phone?: unknown;
            email?: unknown;
            role?: unknown;
        };
        const identity = emailIsAccount() ? body.email : body.phone;
        return { invite: createInvite(user.id, identity, body.role) };
    });
}
