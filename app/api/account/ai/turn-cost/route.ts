// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveRuntimeUser } from '@/lib/platform-ai/auth';
import { AiGatewayError, gatewayError } from '@/lib/platform-ai/proxy';
import { turnCost } from '@/lib/platform-ai/turn-cost';
export const dynamic = 'force-dynamic';
/** Q24: GET ?tag=<32 hex>, same runtime credential as the AI gateway; scoped to the caller. */
export async function GET(request: Request) {
  try {
    const user = resolveRuntimeUser(request);
    if (!user) throw new AiGatewayError('unauthorized', 401);
    const tag = new URL(request.url).searchParams.get('tag') || '';
    if (!/^[0-9a-f]{32}$/.test(tag)) throw new AiGatewayError('invalid_request', 400);
    return Response.json({ code: 0, data: turnCost(user.id, tag) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return gatewayError(e, request); }
}
