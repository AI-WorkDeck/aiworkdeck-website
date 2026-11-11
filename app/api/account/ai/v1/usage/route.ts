// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveRuntimeUser } from '@/lib/platform-ai/auth';
import { domesticQuota, retireOpenRouter } from '@/lib/platform-ai/billing';
import { AiGatewayError, gatewayError } from '@/lib/platform-ai/proxy';
import { refreshBqtSnapshot } from '@/lib/bqt-ai';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {const user=resolveRuntimeUser(request);if(!user)throw new AiGatewayError('unauthorized',401);await retireOpenRouter(user.id);await refreshBqtSnapshot(user.id);
    const state=domesticQuota(user.id);return Response.json({...state,data:{usage:state.usageUsd,limit:state.limitUsd,limit_remaining:state.remainingUsd}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return gatewayError(e,request);}
}
