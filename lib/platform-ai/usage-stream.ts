// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { usageCostCny, type PlatformModel } from './catalog';
/** Adds trusted server-calculated cost to native provider receipts; never trusts a client cost. */
export function withBailianCost(response:Response,model:PlatformModel,exchangeRate:number) {
  const requestedAt=new Date().toISOString();
  let buffer='';const decoder=new TextDecoder(),encoder=new TextEncoder();
  const line=(value:string)=>{
    if(!value.startsWith('data:'))return value;
    const payload=value.slice(5).trim();if(!payload||payload==='[DONE]')return value;
    const data=JSON.parse(payload);
    if(data.usage) {
      const cost=usageCostCny(model,data.usage,false,requestedAt);
      data.usage={...data.usage,cost:cost/exchangeRate,cost_cny:cost,cost_currency:'CNY'};
    }
    return `data: ${JSON.stringify(data)}`;
  };
  const transform=new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller){buffer+=decoder.decode(chunk,{stream:true});let at;while((at=buffer.indexOf('\n'))>=0){controller.enqueue(encoder.encode(line(buffer.slice(0,at).replace(/\r$/,''))+'\n'));buffer=buffer.slice(at+1);}if(buffer.length>2_000_000)throw new Error('upstream_failed');},
    flush(controller){buffer+=decoder.decode();if(buffer)controller.enqueue(encoder.encode(line(buffer)));},
  });
  return new Response(response.body!.pipeThrough(transform),{status:response.status,headers:response.headers});
}
