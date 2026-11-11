// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Public editor resources only: never record headers, bodies, credentials or query strings.
export async function observeEditorResources(page,origin,records){
 const cdp=await page.createCDPSession(),pending=new Map();let first;
 const relative=timestamp=>{first??=timestamp;return Math.round((timestamp-first)*1000)};
 const request=e=>{
  const u=new URL(e.request.url);if(u.origin!==origin||!u.pathname.startsWith('/web/editor/')||records.length>=500)return;
  const item={path:u.pathname,startMs:relative(e.timestamp),state:'pending',receivedBytes:0};records.push(item);pending.set(e.requestId,{item,start:e.timestamp});
 };
 const response=e=>{const p=pending.get(e.requestId);if(p){p.item.status=e.response.status;p.item.fromDiskCache=!!e.response.fromDiskCache;p.item.responseMs=relative(e.timestamp)}};
 const data=e=>{const p=pending.get(e.requestId);if(p)p.item.receivedBytes+=e.encodedDataLength};
 const finish=e=>{const p=pending.get(e.requestId);if(p){Object.assign(p.item,{state:'completed',durationMs:Math.round((e.timestamp-p.start)*1000),transferBytes:e.encodedDataLength});pending.delete(e.requestId)}};
 const fail=e=>{const p=pending.get(e.requestId);if(p){Object.assign(p.item,{state:'failed',durationMs:Math.round((e.timestamp-p.start)*1000),canceled:!!e.canceled});pending.delete(e.requestId)}};
 const handlers={requestWillBeSent:request,responseReceived:response,dataReceived:data,loadingFinished:finish,loadingFailed:fail};
 for(const [event,handler] of Object.entries(handlers))cdp.on('Network.'+event,handler);
 await cdp.send('Network.enable');
 return async()=>{for(const [event,handler] of Object.entries(handlers))cdp.off('Network.'+event,handler);await cdp.detach()};
}
export async function waitForSavedEditor(page){
 // Product stops at ten minutes; allow its error state to render before our deadline.
 await page.waitForFunction(()=>document.querySelector('#editor-cover')?.dataset.bootStatus==='error'||(document.querySelector('#save-button')?.dataset.status==='saved'&&document.querySelector('#editor-cover')?.hidden),{timeout:610000});
 if(await page.$eval('#editor-cover',e=>e.dataset.bootStatus==='error'))throw Error('EDITOR_STARTUP_FAILED');
}
