import { platformProvider, bailianConfig } from '../platform-ai/config';
import { platformModels } from '../platform-ai/catalog';
import { withBailianCost } from '../platform-ai/usage-stream';
import { getExchangeRateInfo } from '../ai-config';
// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { LIMITS, PRICE_CAP, WEB_MODEL, WebError, messagesFor, validateAgentCall, type AgentToolCall, type WebInput } from './contract';
import { AGENT_LIMITS, AGENT_TOOLS } from '../../web-workbench/src/agent-contract.js';
const API = 'https://openrouter.ai/api/v1';
/** Dependency injection exists only for isolated tests; never selected by request/env URL. */
export interface ProviderHooks { onId(id: string): void; onDelta(text: string): void }
export class ProviderRejected extends Error {
  constructor(readonly status:number) { super('Provider request rejected'); this.name='ProviderRejected'; }
}
export async function streamCompletion(apiKey: string, input: WebInput, hooks: ProviderHooks, fetcher: typeof fetch = fetch, exchangeRate = getExchangeRateInfo().rate) {
  // One fixed-model request; OpenRouter may use another eligible provider under the same caps.
  // No models list/router and no application retry, including after uncertain delivery.
  if (input.mode === 'agent' && Buffer.byteLength(JSON.stringify({ messages: messagesFor(input), tools: AGENT_TOOLS }), 'utf8') > AGENT_LIMITS.contextBytes) throw new WebError('input_too_large', 413);
  const maxTokens = input.mode === 'agent' ? LIMITS.agentOutputTokens : LIMITS.outputTokens;
  const maxOutputChars = input.mode === 'agent' ? LIMITS.agentOutputChars : LIMITS.outputChars;
  const domestic=platformProvider()==='bailian';
  const model=domestic?(await platformModels(fetcher,true)).find(m=>m.id===WEB_MODEL):undefined;
  if(domestic&&(!model||model.priceTiers.some(t=>t.input>PRICE_CAP.prompt*exchangeRate||t.output>PRICE_CAP.completion*exchangeRate)))throw new ProviderRejected(400);
  let response = await fetcher(`${domestic?bailianConfig().baseUrl:API}/chat/completions`, { method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-OpenRouter-Title':'AI WorkDeck Web'},
    signal:AbortSignal.timeout(LIMITS.timeoutMs), body:JSON.stringify({model:WEB_MODEL,messages:messagesFor(input),max_tokens:maxTokens,temperature:0.3,stream:true,stream_options:{include_usage:true},...(domestic?{enable_thinking:false}:{provider:{max_price:PRICE_CAP,allow_fallbacks:true,require_parameters:true,data_collection:'deny'}}),...(input.mode==='rewrite'?{response_format:{type:'json_object'}}:{}),...(input.mode==='agent'?{tools:AGENT_TOOLS,tool_choice:input.agentStep===3?'none':'auto'}:{})}) });
  // Only definitive request rejection is known to be unbilled. 5xx/408/connection loss are uncertain.
  if ([400,401,402,403,404,413,422,429].includes(response.status)) { await response.body?.cancel(); throw new ProviderRejected(response.status); }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new WebError('upstream_failed',502); }
  if(domestic)response=withBailianCost(response,model!,exchangeRate);
  const reader=response.body!.getReader(), decoder=new TextDecoder();
  let buffer='',text='',cost: number|undefined,finished=false,finishReason:string|undefined,bytes=0;
  const toolParts = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();
  let invalidTools = false, toolBytes = 0;
  const consume=(line:string)=>{
    if (!line.startsWith('data:')) return;
    const payload=line.slice(5).trim(); if (payload==='[DONE]') {finished=true;return;} if (!payload) return;
    const value=JSON.parse(payload);
    if (value.error) throw new WebError('upstream_failed',502);
    if (typeof value.id==='string') hooks.onId(value.id);
    const usage=value.usage;
    if (usage && typeof usage.cost==='number' && Number.isFinite(usage.cost) && usage.cost>=0) cost=usage.cost;
    const choice=value.choices?.[0];
    if (choice?.finish_reason) finishReason=choice.finish_reason;
    const deltas = choice?.delta?.tool_calls;
    if (deltas !== undefined) {
      if (input.mode !== 'agent' || !Array.isArray(deltas)) invalidTools = true;
      else for (const delta of deltas) {
        // Count payload rather than repeated SSE framing; valid arguments may arrive one character at a time.
        toolBytes += Buffer.byteLength(String(delta?.function?.name ?? '') + String(delta?.function?.arguments ?? ''), 'utf8');
        if (toolBytes > 64_000) throw new WebError('upstream_failed', 502);
        if (!delta || !Number.isInteger(delta.index) || delta.index !== 0) { invalidTools = true; continue; }
        const part = toolParts.get(delta.index) ?? { id: '', type: '', function: { name: '', arguments: '' } };
        // Bailian Qwen repeats `"id":""` on every continuation chunk; an empty id carries nothing and is no conflict.
        if (delta.id !== undefined && delta.id !== '') { if (typeof delta.id !== 'string' || (part.id && part.id !== delta.id)) invalidTools = true; else part.id = delta.id; }
        if (delta.type !== undefined) { if (typeof delta.type !== 'string' || (part.type && part.type !== delta.type)) invalidTools = true; else part.type = delta.type; }
        if (delta.function !== undefined) {
          if (!delta.function || typeof delta.function !== 'object') invalidTools = true;
          else for (const key of ['name', 'arguments'] as const) {
            if (delta.function[key] !== undefined) { if (typeof delta.function[key] !== 'string') invalidTools = true; else part.function[key] += delta.function[key]; }
          }
        }
        toolParts.set(delta.index, part);
      }
    }
    if (typeof choice?.delta?.content==='string') { text+=choice.delta.content; if(text.length>maxOutputChars) throw new WebError('upstream_failed',502); hooks.onDelta(choice.delta.content); }
  };
  try {
    while(true) { const chunk=await reader.read(); if(chunk.done)break; bytes+=chunk.value.byteLength; if(bytes>1_000_000)throw new WebError('upstream_failed',502); buffer+=decoder.decode(chunk.value,{stream:true}); let at; while((at=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,at).replace(/\r$/,''));buffer=buffer.slice(at+1);} }
    buffer+=decoder.decode(); if(buffer.trim())consume(buffer.trim());
  } finally { await reader.cancel().catch(()=>undefined); reader.releaseLock(); }
  let toolCalls: AgentToolCall[] = [];
  if (toolParts.size) {
    try { toolCalls = [...toolParts.values()].map(validateAgentCall); } catch { invalidTools = true; }
  }
  if (input.mode === 'agent') {
    if (finishReason === 'tool_calls' && (toolCalls.length !== 1 || input.agentStep === 3)) invalidTools = true;
    if (finishReason !== 'tool_calls' && toolParts.size) invalidTools = true;
  }
  // A flash model sometimes writes its tool call out as prose ("[Tool intent] ... targetId = ...") instead of calling the tool.
  // Opaque target ids and tool-protocol words are never a user-facing answer: treat it as an unusable call, never as a completed run.
  if (input.mode === 'agent' && !toolParts.size && (/targetId|doc_apply_edits|doc_find_text|doc_read_tables|\[(Thinking|Tool intent)\]/i.test(text) || (input.agentContext!.targets as { targetId: string }[]).some(t => text.includes(t.targetId)))) invalidTools = true;
  const plainTextComplete = input.mode === 'agent' && !toolParts.size && !!text.trim() && (finishReason === 'stop' || finishReason === 'length');
  return { text, cost: finished ? cost : undefined, complete: finished && (finishReason === 'stop' || plainTextComplete || (input.mode === 'agent' && finishReason === 'tool_calls')), toolCalls, invalidTools, finishReason };
}
export async function generationCost(apiKey:string,id:string,fetcher:typeof fetch=fetch):Promise<number|null> {
  if(platformProvider()==='bailian')return null;
  const response=await fetcher(`${API}/generation?id=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(10_000),cache:'no-store'});
  if(!response.ok){await response.body?.cancel();return null;}
  const v=(await response.json())?.data;
  // Refuse a mismatched or incomplete provider receipt. Zero is valid only when explicitly returned.
  return v?.id===id && typeof v.total_cost==='number' && Number.isFinite(v.total_cost) && v.total_cost>=0 ? v.total_cost:null;
}
