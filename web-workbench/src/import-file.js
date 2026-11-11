// SPDX-License-Identifier: AGPL-3.0-or-later
// FileReader reports real local bytes and can abort stalled cloud-placeholder reads.
export function readLocalFile(file,{signal,onProgress=()=>{},timeoutMs=60000,Reader=globalThis.FileReader}={}){
 return new Promise((resolve,reject)=>{
  const reader=new Reader();let settled=false,timer;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);reader.onload=reader.onerror=reader.onabort=reader.onprogress=null;error?reject(error):resolve(value)};
  const abort=()=>{finish(new DOMException('Cancelled','AbortError'));reader.abort()};
  if(signal?.aborted){abort();return}
  signal?.addEventListener('abort',abort,{once:true});
  reader.onprogress=e=>{if(e.lengthComputable&&e.total>0)onProgress(Math.min(100,Math.floor(e.loaded/e.total*100)))};
  reader.onload=()=>{onProgress(100);finish(null,new Uint8Array(reader.result))};
  reader.onerror=()=>finish(Error('FILE_READ_FAILED'));
  reader.onabort=()=>finish(new DOMException('Cancelled','AbortError'));
  timer=setTimeout(()=>{finish(Error('FILE_READ_TIMEOUT'));reader.abort()},timeoutMs);
  try{reader.readAsArrayBuffer(file)}catch{finish(Error('FILE_READ_FAILED'))}
 });
}
