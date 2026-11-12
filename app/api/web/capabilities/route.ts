// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { getAiConfig,getExchangeRateInfo } from '@/lib/ai-config';
import { getSpendableBalance } from '@/lib/credits';
import { getTrialBalance } from '@/lib/trial';
import { getDb } from '@/lib/db';
import { siteConfig } from '@/lib/site-config';
import { authorize,failure,json,languageOf } from '@/lib/web-ai/http';
import { AGENT_LIMITS } from '@/web-workbench/src/agent-contract.js';
import { LIMITS,RESERVE_USD,AGENT_RESERVE_USD,WEB_MODEL,WebError } from '@/lib/web-ai/contract';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  const lang=languageOf(request), loginUrl=`/${lang}/account?next=${encodeURIComponent(`/web/?lang=${lang}`)}`;
  try {
    const config=getAiConfig(),enabled=process.env.WEB_AI_ENABLED==='1'&&!!config.apiKey;
    const quote=(margin:number)=>{
      const maxChargeCents=Math.ceil(RESERVE_USD*getExchangeRateInfo().rate*margin*100);
      const agentMaxChargeCents=Math.ceil(AGENT_RESERVE_USD*getExchangeRateInfo().rate*margin*100);
      const agent={limits:AGENT_LIMITS,maxGenerations:AGENT_LIMITS.maxGenerations,maxChargeCents:agentMaxChargeCents,maxRunChargeCents:agentMaxChargeCents*AGENT_LIMITS.maxGenerations};
      return {maxChargeCents,agentMaxChargeCents,common:{agent,model:WEB_MODEL,limits:LIMITS,currency:siteConfig.currency,maxChargeCents,webTrialSupported:false,loginUrl}};
    };
    const {maxChargeCents,agentMaxChargeCents,common}=quote(config.marginMultiplier);
    let user;
    try {user=authorize(request);}catch(e){if(e instanceof WebError && e.code==='unauthorized')return json({...common,authenticated:false,aiEnabled:false,agentEnabled:false,reason:'unauthorized',agentReason:'unauthorized'});throw e;}
    const paused=!!getDb().prepare("SELECT 1 FROM web_ai_request WHERE state='refunded_pending' OR errorCode='cost_cap_exceeded' LIMIT 1").get();
    const spendableCents=getSpendableBalance(user.id);
    const active=getDb().prepare("SELECT requestId,state FROM web_ai_request WHERE userId=? AND state IN ('reserved','submitted','usage_pending')").get(user.id);
    return json({...common,authenticated:true,agentEnabled:enabled&&!paused&&spendableCents>=agentMaxChargeCents&&!active,agentReason:paused?'reconciliation_paused':!enabled?'ai_unavailable':active?'busy':spendableCents<agentMaxChargeCents?'no_credits':null,aiEnabled:enabled&&!paused&&spendableCents>=maxChargeCents&&!active,reason:paused?'reconciliation_paused':!enabled?'ai_unavailable':active?'busy':spendableCents<maxChargeCents?'no_credits':null,spendableCents,trial:getTrialBalance(user.id),activeRequest:active??null});
  }catch(e){return failure(e,lang);}
}
