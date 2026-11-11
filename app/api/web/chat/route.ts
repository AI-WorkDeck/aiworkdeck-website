// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { getAiConfig, getExchangeRateInfo } from '@/lib/ai-config';
import { validateInput, WebError } from '@/lib/web-ai/contract';
import { authorize, failure, languageOf, readBody } from '@/lib/web-ai/http';
import { reserveRequest, webReserveCents } from '@/lib/web-ai/store';
import { bqtChargeTarget, bqtMarginMultiplier } from '@/lib/bqt-member';
import { bqtAuthorize } from '@/lib/bqt-ai';
import { AGENT_LIMITS } from '@/web-workbench/src/agent-contract.js';
import { responseStream } from '@/lib/web-ai/service';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  let lang=languageOf(request);
  try {
    const user=authorize(request,true);
    const input=validateInput(await readBody(request, AGENT_LIMITS.bodyBytes));lang=input.language;
    const config=getAiConfig();
    if(process.env.WEB_AI_ENABLED!=='1'||!config.apiKey)throw new WebError('ai_unavailable',503);
    const rate=getExchangeRateInfo().rate,margin=bqtChargeTarget(user.id)?bqtMarginMultiplier():config.marginMultiplier;
    await bqtAuthorize(user.id,`web_ai:${input.requestId}`,webReserveCents(input,rate,margin));
    reserveRequest(user.id,input,rate,margin);
    return new Response(responseStream(user.id,input,config.apiKey),{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','Vary':'Cookie'}});
  }catch(e){return failure(e,lang);}
}
