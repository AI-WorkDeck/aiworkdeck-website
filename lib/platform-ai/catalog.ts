// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { BAILIAN_CHAT_MODELS, bailianConfig, bailianAuthorizedModels, bailianAvailableModels, deepseekConfig, deepseekConfigured, platformProvider } from './config';
export interface PriceTier { min: number; max: number; input: number; output: number; cache?: number; thinkingInput?: number; thinkingOutput?: number; thinkingCache?: number }
export interface PlatformModel {
  id: string; name: string; contextLength: number; maxInputTokens: number; maxOutputTokens: number;
  supportsTools: boolean; supportsVision: boolean; supportsAudio?: boolean; supportsReasoning: boolean;
  inputPricePerMillion: number; outputPricePerMillion: number; tiered?:boolean; priceTiers: PriceTier[]; offPeakPriceTiers?: PriceTier[];
}
type Obj = Record<string, any>;
const positive = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
function range(raw: string): [number, number] | null {
  if (raw === 'Default') return [0, Number.MAX_SAFE_INTEGER];
  const m = /^(?:(\d+(?:\.\d+)?[km]?)<)?输入<=(\d+(?:\.\d+)?[km]?)$/i.exec(raw.replace(/\s/g, ''));
  const count = (s: string) => parseFloat(s) * (/k$/i.test(s) ? 1000 : /m$/i.test(s) ? 1000000 : 1);
  return m ? [m[1] ? count(m[1]) : 0, count(m[2])] : null;
}
/** Unknown price units/ranges are unavailable, never treated as free. Batch prices never price live calls. */
export function parseBailianModel(m: Obj): PlatformModel | null {
  if(Array.isArray(m?.prices) && m.prices.some((g:Obj)=>g.prices?.some((p:Obj)=>['peak','offpeak'].includes(p.time_band)))) {
    if(m.prices.some((g:Obj)=>!Array.isArray(g.prices)||g.prices.some((p:Obj)=>!['peak','offpeak'].includes(p.time_band))))return null;
    const band=(name:string)=>parseBailianModel({...m,prices:m.prices.map((g:Obj)=>({...g,prices:g.prices.filter((p:Obj)=>p.time_band===name).map((p:Obj)=>({...p,time_band:'standard'}))}))});
    const peak=band('peak'),off=band('offpeak');
    if(!peak||!off||peak.priceTiers.some((t,i)=>{const o=off.priceTiers[i];return !o||o.input>t.input||o.output>t.output;}))return null;
    return {...peak,offPeakPriceTiers:off.priceTiers};
  }
  // This supplier omits its output limit; use our bounded, live-tested request cap.
  if(m?.model==='MiniMax/MiniMax-M3.1-Flash' && m.model_info?.max_output_tokens==null)
    m={...m,model_info:{...m.model_info,max_output_tokens:8192}};
  if (!m || typeof m.model !== 'string' || !(m.capabilities?.includes('TG') || m.capabilities?.includes('Multimodal-Omni') && m.inference_metadata?.response_modality?.length===1 && m.inference_metadata.response_modality[0]==='Text') || m.inference_offline_info
    || m.inference_metadata?.response_modality?.length!==1 || m.inference_metadata.response_modality[0]!=='Text'
    || !positive(m.model_info?.context_window) || !positive(m.model_info?.max_output_tokens)
    || !Array.isArray(m.prices) || !m.prices.length) return null;
  const tiers: PriceTier[] = [];
  for (const group of m.prices) {
    const r = range(group.range_name || ''); if (!r || !Array.isArray(group.prices)) return null;
    const read = (type: string): number | undefined => {
      const rows = group.prices.filter((p: Obj) => p.type === type && (!p.time_band || p.time_band === 'standard'));
      if (!rows.length) return undefined;
      if (rows.length !== 1 || !/^(每百万tokens|per million tokens)$/i.test(rows[0].price_unit)) return undefined;
      if(typeof rows[0].price!=='number' && (typeof rows[0].price!=='string'||!/^\d+(?:\.\d+)?$/.test(rows[0].price)))return undefined;
      const n = Number(rows[0].price); return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const omni=m.capabilities?.includes('Multimodal-Omni');
    const input = read(omni?'omni_input_token':'input_token'), output = read(omni?'omni_output_token':'output_token');
    if (input === undefined || output === undefined) return null;
    tiers.push({ min: r[0], max: r[1], input, output, cache: read(omni?'omni_input_token_cache':'input_token_cache'),
      thinkingInput: read('thinking_input_token'), thinkingOutput: read('thinking_output_token'), thinkingCache: read('thinking_input_token_cache') });
  }
  tiers.sort((a,b) => a.min-b.min);
  if (tiers[0].min !== 0 || tiers.some((t,i) => t.max<=t.min || (i>0 && t.min!==tiers[i-1].max))) return null;
  const inputLimit = Math.min(m.model_info.max_input_tokens || m.model_info.context_window, tiers.at(-1)!.max);
  return { id:m.model, name:m.name || m.model, contextLength:m.model_info.context_window, maxInputTokens:inputLimit,
    maxOutputTokens:m.model_info.max_output_tokens, supportsTools:!!m.features?.includes('function-calling'),
    supportsVision:!!m.inference_metadata?.request_modality?.includes('Image'), supportsAudio:!!m.capabilities?.includes('Multimodal-Omni') && !!m.inference_metadata?.request_modality?.includes('Audio'), supportsReasoning:!!m.capabilities?.includes('Reasoning'),
    inputPricePerMillion:tiers[0].input, outputPricePerMillion:tiers[0].output, tiered:tiers.length>1, priceTiers:tiers };
}
let cache: { source:string; until:number; models:PlatformModel[] } | undefined;
let pending: Promise<PlatformModel[]> | undefined;
export function clearCatalogCache() { cache=undefined; pending=undefined; }
export async function platformModels(fetcher: typeof fetch = fetch, includeInternal = false): Promise<PlatformModel[]> {
  const config=bailianConfig(), provider=platformProvider();
  const allowed=()=>{ const authorized=bailianAuthorizedModels(),available=bailianAvailableModels(); return new Set([...authorized].filter(id=>available.has(id))); };
  const authorized=provider==='bailian'?allowed():null;
  const source=`${provider}:${config.baseUrl}:${deepseekConfigured()?deepseekConfig().baseUrl:''}:${authorized?[...authorized].sort().join(','):''}`;

  const granted=(models:PlatformModel[])=>{
    if(provider!=='bailian')return models;
    const current=allowed(),result=models.filter(m=>current.has(m.id) && (BAILIAN_CHAT_MODELS.some(id=>id===m.id) || includeInternal && m.id==='qwen3.8-flash'));
    if(!result.length)throw new Error('catalog_unavailable');return result;
  };
  if(cache?.source===source && cache.until>Date.now())return granted(cache.models);
  if(pending)return granted(await pending);
  pending=(async()=>{
    const models:PlatformModel[]=[];
    if(provider==='bailian') {
      if(!config.apiKey||!config.baseUrl)throw new Error('not_configured');
      for(let page=1;page<=20;page++) {
        if(page>1)await new Promise(resolve=>setTimeout(resolve,1200));
        let response:Response|undefined;
        for(let attempt=0;attempt<3;attempt++) {
          response=await fetcher(`${new URL(config.baseUrl).origin}/api/v1/models?page_no=${page}&page_size=100`,{headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(20_000),cache:'no-store',redirect:'error'});
          if(response.status!==429)break;
          await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,(attempt+1)*1500));
        }
        if(!response)throw new Error('catalog_unavailable');
        if(!response.ok)throw new Error('catalog_unavailable');
        const data=await response.json();
        if(data.success!==true||!Array.isArray(data.output?.models)||!Number.isInteger(data.output.total))throw new Error('catalog_unavailable');
        models.push(...data.output.models.map(parseBailianModel).filter((m:PlatformModel|null):m is PlatformModel=>!!m&&authorized!.has(m.id)));
        if(page*100>=data.output.total)break;
        if(page===20)throw new Error('catalog_unavailable');
      }
    } else {
      // A dedicated supplier requires a separately verified price/availability snapshot.
      // Never publish the retired V3/R1 aliases or their historical prices.
      if (deepseekConfigured()) throw new Error('not_configured');
      try {
        const response=await fetcher('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(20_000),cache:'no-store',redirect:'error'});
        if(!response.ok)throw new Error('catalog_unavailable');
        const data=await response.json(); if(!Array.isArray(data.data))throw new Error('catalog_unavailable');
        const seen=new Set(models.map(x=>x.id));
        for(const m of data.data) {
          if(seen.has(m.id))continue;
          const price=(value:unknown)=> typeof value==='number'||typeof value==='string'&&value.trim()!=='' ? Number(value)*1e6 : NaN;
          const input=price(m.pricing?.prompt),output=price(m.pricing?.completion);
          if(!m.architecture?.output_modalities?.includes('text')||!m.architecture?.input_modalities?.includes('text')||!positive(m.context_length)
            ||!Number.isFinite(input)||input<0||!Number.isFinite(output)||output<0)continue;
          models.push({id:m.id,name:m.name||m.id,contextLength:m.context_length,maxInputTokens:m.context_length,
            maxOutputTokens:m.top_provider?.max_completion_tokens||Math.min(m.context_length,8192),supportsTools:!!m.supported_parameters?.includes('tools'),
            supportsVision:!!m.architecture.input_modalities.includes('image'),supportsReasoning:!!m.supported_parameters?.includes('reasoning'),
            inputPricePerMillion:input,outputPricePerMillion:output,priceTiers:[{min:0,max:Number.MAX_SAFE_INTEGER,input,output,cache:input}]});
        }
      } catch (err) {
        if (!models.length) throw err;
      }
    }
    if(!models.length)throw new Error('catalog_unavailable');
    cache={source,until:Date.now()+300_000,models};return models;
  })();
  try{return granted(await pending);}finally{pending=undefined;}
}
export function usageCostCny(model:PlatformModel, usage:Obj, thinking:boolean, requestedAt:string = new Date().toISOString()):number {
  const prompt=usage?.prompt_tokens,completion=usage?.completion_tokens;
  const cached=usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? 0;
  if(!Number.isSafeInteger(prompt)||prompt<0||!Number.isSafeInteger(completion)||completion<0||!Number.isSafeInteger(cached)||cached<0||cached>prompt)throw new Error('usage_pending');
  const timestamp=Date.parse(requestedAt);
  if(!Number.isFinite(timestamp))throw new Error('usage_pending');
  const hour=new Date(timestamp+8*3600_000).getUTCHours();
  const tiers=model.offPeakPriceTiers && (hour<8||hour>=22)?model.offPeakPriceTiers:model.priceTiers;
  const tier=tiers.find(t=>prompt>t.min&&prompt<=t.max) || (prompt===0?tiers[0]:undefined);
  if(!tier)throw new Error('usage_pending');
  const input=thinking?(tier.thinkingInput??tier.input):tier.input, output=thinking?(tier.thinkingOutput??tier.output):tier.output;
  const cachePrice=thinking?(tier.thinkingCache??tier.cache):tier.cache;
  if(cached>0&&cachePrice===undefined)throw new Error('usage_pending');
  // Explicit cache creation has a separate price and is not enabled by this gateway.
  if(usage?.prompt_tokens_details?.cache_creation_tokens>0)throw new Error('usage_pending');
  return ((prompt-cached)*input+cached*(cachePrice??input)+completion*output)/1e6;
}
