// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { bailianConfig, bailianAuthorizedModels, bailianAvailableModels } from './config';
export const IMAGE_MODEL = 'qwen-image-3.0';
export interface ImagePrices { input1k:number; input2k:number; output1k:number; output2k:number }
export function parseImagePrices(model:any):ImagePrices {
  if(model?.model!==IMAGE_MODEL || model.inference_offline_info || !model.capabilities?.includes('IG') || model.prices?.length!==1 || model.prices[0].range_name!=='Default')throw new Error('catalog_unavailable');
  const read=(type:string)=>{
    const rows=model.prices[0].prices?.filter((p:any)=>p.type===type && (!p.time_band||p.time_band==='standard'));
    if(rows?.length!==1 || rows[0].price_unit!=='每张' || typeof rows[0].price!=='string' && typeof rows[0].price!=='number')throw new Error('catalog_unavailable');
    const n=Number(rows[0].price);if(!Number.isFinite(n)||n<=0)throw new Error('catalog_unavailable');return n;
  };
  return {input1k:read('qima_input_1k'),input2k:read('qima_input_2k'),output1k:read('qima_output_1k'),output2k:read('qima_output_2k')};
}
let cache:{source:string;until:number;prices:ImagePrices}|undefined;
let inflight:{source:string;promise:Promise<ImagePrices>}|undefined;
export function clearImagePriceCache(){cache=undefined;inflight=undefined;}
export async function imagePrices(fetcher:typeof fetch=fetch):Promise<ImagePrices> {
  if(!bailianAuthorizedModels().has(IMAGE_MODEL)||!bailianAvailableModels().has(IMAGE_MODEL))throw new Error('model_unavailable');
  const config=bailianConfig(),source=config.baseUrl;
  if(cache?.source===source&&cache.until>Date.now())return cache.prices;
  if(!config.apiKey||!source)throw new Error('not_configured');
  if(inflight?.source===source)return inflight.promise;
  const promise=(async()=>{
  const response=await fetcher(`${new URL(source).origin}/api/v1/models?model=${IMAGE_MODEL}&page_size=10`,{headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(20_000),redirect:'error',cache:'no-store'});
  if(!response.ok)throw new Error('catalog_unavailable');
  const data=await response.json();
  if(data.success!==true||!Array.isArray(data.output?.models))throw new Error('catalog_unavailable');
  const prices=parseImagePrices(data.output.models.find((m:any)=>m.model===IMAGE_MODEL));
  cache={source,until:Date.now()+300_000,prices};return prices;
  })();
  inflight={source,promise};
  try{return await promise;}finally{if(inflight?.promise===promise)inflight=undefined;}
}
export function maximumImageCost(prices:ImagePrices,inputs:number):number {
  return inputs*Math.max(prices.input1k,prices.input2k)+Math.max(prices.output1k,prices.output2k);
}
/** Trust only the provider receipt, never a client-supplied image count or cost. */
export function imageUsageCost(prices:ImagePrices,usage:any,expectedInputs:number):number {
  if(!usage||usage.input_image_count!==expectedInputs||usage.output_image_count!==1 || !Number.isSafeInteger(usage.output_width)||!Number.isSafeInteger(usage.output_height))throw new Error('usage_pending');
  const area=usage.output_width*usage.output_height;
  if(usage.output_width<1||usage.output_height<1||area<512*512||area>2048*2048)throw new Error('usage_pending');
  const tier=area<=2_250_000?'1k':'2k';
  if(usage.input_image_type!==`qima_input_${tier}`||usage.output_image_type!==`qima_output_${tier}`)throw new Error('usage_pending');
  return expectedInputs*(tier==='1k'?prices.input1k:prices.input2k)+(tier==='1k'?prices.output1k:prices.output2k);
}
