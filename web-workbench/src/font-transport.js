// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {trackResourceResponse} from './load-progress.js';
// The release symlink can switch before the previous Next process restarts.
// During that window the new URL may be served without its Brotli header.
// Preserve full fonts via retained original URLs instead of passing encoded bytes to LO.
export async function fetchFontBytes(url,log=()=>{}){
 const compressed=/^\.\/compressed\/(cjk\.ttc|cjk-serif\.otf|cjk-kai\.ttf|cjk-fangsong\.ttf)$/.test(url);
 const read=async(target,requireBrotli)=>{
  const response=await fetch(target);
  if(!response.ok||(requireBrotli&&response.headers.get('content-encoding')?.trim().toLowerCase()!=='br')){
   await response.body?.cancel().catch(()=>{});throw Error('FONT_RESPONSE_UNAVAILABLE');
  }
  return new Uint8Array(await (compressed?trackResourceResponse(response,url.split('/').at(-1)):response).arrayBuffer());
 };
 if(!compressed)return read(url,false);
 try{return await read(url,true)}catch{
  log('Font delivery fallback: using original font');
  try{return await read(url.replace('./compressed/','./'),false)}
  catch{throw Object.assign(Error('Required font could not load'),{code:'REQUIRED_FONT_UNAVAILABLE'})}
 }
}
