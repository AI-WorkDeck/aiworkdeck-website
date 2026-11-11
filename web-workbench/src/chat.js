// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
export async function streamChat(payload,{signal,onEvent,fetcher=fetch}={}){
 const response=await fetcher('/api/web/chat',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload),signal});
 if(!response.ok){let data;try{data=await response.json()}catch{}const err=Error(data?.error?.message||`HTTP ${response.status}`);err.code=data?.error?.code||`HTTP_${response.status}`;err.status=response.status;throw err}
 if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('INVALID_AI_RESPONSE');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',done=false;
 try{while(true){const chunk=await reader.read();buffer=(buffer+decoder.decode(chunk.value,{stream:!chunk.done})).replace(/\r\n/g,'\n');let at;
   while((at=buffer.indexOf('\n\n'))!==-1){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);let name='message';const data=[];
    for(const line of block.split('\n')){if(line.startsWith('event:'))name=line.slice(6).trim();else if(line.startsWith('data:'))data.push(line.slice(5).trimStart())}
    if(!data.length)continue;let value;try{value=JSON.parse(data.join('\n'))}catch{throw Error('INVALID_AI_RESPONSE')}
    if(name==='error'){const err=Error(value.message||'AI_ERROR');err.code=value.code;throw err}
    if(name==='done')done=true;onEvent?.(name,value);
   }
   if(buffer.length>200000)throw Error('INVALID_AI_RESPONSE');if(chunk.done)break;
  }
  if(!done)throw Error('AI_STREAM_INTERRUPTED');
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
