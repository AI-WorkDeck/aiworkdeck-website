// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveRuntimeUser } from '@/lib/platform-ai/auth';
import { resolveKeyUser } from '@/lib/account-auth';
import { platformModels } from '@/lib/platform-ai/catalog';
import { platformProvider, bailianConfig, deepseekConfig, deepseekConfigured } from '@/lib/platform-ai/config';
import { bqtLinkedLawyer } from '@/lib/bqt-member';
import { AiGatewayError, gatewayError } from '@/lib/platform-ai/proxy';
import { getAiConfig } from '@/lib/ai-config';
import { getUserCircleFirm, getUserMarginMultiplier } from '@/lib/circle-firms';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const user=resolveRuntimeUser(request)||resolveKeyUser(request);
    if(!user)throw new AiGatewayError('unauthorized',401);
    // 全部模型照常；绑定了包晴天的律师默认落在 DeepSeek（这类用量优先扣包晴天积分）。
    const bqt=!!bqtLinkedLawyer(user.id);
    const models=await platformModels();
    const circleFirm=getUserCircleFirm(user.id);
    const preferred=bqt?deepseekConfig().defaultModel:platformProvider()==='bailian'?bailianConfig().defaultModel:(circleFirm||deepseekConfigured()?deepseekConfig().defaultModel:getAiConfig().model);
    const defaultModel=models.find(m=>m.id===preferred&&m.supportsTools)?.id??models.find(m=>m.supportsTools)?.id;
    return Response.json({defaultModel,provider:platformProvider(),currency:platformProvider()==='bailian'?'CNY':'USD',marginMultiplier:getUserMarginMultiplier(user.id),
      models},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return gatewayError(e,request);}
}
