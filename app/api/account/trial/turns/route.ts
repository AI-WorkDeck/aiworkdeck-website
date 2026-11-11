import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { parseTurnReport, recordTrialTurn } from '@/lib/trial';

export const dynamic = 'force-dynamic';

/**
 * 试用回合上报（Bearer awdk_）。契约见 doc/desktop-contract.md「POST /api/account/trial/turns」。
 *
 * 按 (accountId, turnId) 幂等：重复上报 200 `{ counted:false, duplicate:true }`，不重复扣。
 * 已转付费 / 未发放 / 已用尽 / 已到期 → 200 `counted:false`（不是错误）。
 * 请求体不合法 → 400 `{ error }`（业务码，桌面端不重试，v0.1.1）。
 */
export async function POST(request: NextRequest) {
  const user = resolveKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const report = parseTurnReport(body);
  if ('error' in report) {
    return NextResponse.json({ error: report.error }, { status: 400 });
  }
  return NextResponse.json(recordTrialTurn(user.id, report));
}
