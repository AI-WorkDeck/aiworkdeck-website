// SPDX-License-Identifier: AGPL-3.0-or-later
const fresh=()=>({id:crypto.randomUUID(),title:'',updatedAt:new Date().toISOString(),messages:[]});
// One committed setting per project. Failed writes never replace the in-memory record.
export class ConversationStore{
 constructor(store){this.store=store;this.records=new Map();this.queue=Promise.resolve()}
 data(projectId){return this.records.get(projectId)}
 async load(projectId){
  await this.queue;
  let data=await this.store.getSetting('conversations:'+projectId);
  if(!data){
   const first=fresh();first.messages=await this.store.getSetting('chat:'+projectId)||[];
   data={version:1,activeId:first.id,items:[first]};
   // Only retire legacy history after the new record is durably committed.
   await this.store.setSetting('conversations:'+projectId,data);
  }
  if(await this.store.getSetting('chat:'+projectId))await this.store.setSetting('chat:'+projectId,null);
  this.records.set(projectId,data);
  return structuredClone(data.items.find(c=>c.id===data.activeId).messages);
 }
 update(projectId,change){
  const job=this.queue.then(async()=>{
   const next=structuredClone(this.data(projectId));change(next);
   await this.store.setSetting('conversations:'+projectId,next);
   this.records.set(projectId,next);
   return structuredClone(next.items.find(c=>c.id===next.activeId).messages);
  });
  this.queue=job.catch(()=>{});return job;
 }
 save(projectId,messages){
  const snapshot=structuredClone(messages),activeId=this.data(projectId).activeId;
  return this.update(projectId,data=>{const c=data.items.find(c=>c.id===activeId);if(!c)return;c.messages=snapshot;c.updatedAt=new Date().toISOString()});
 }
 updateReceipt(projectId,conversationId,requestId,receipt){
  const snapshot=structuredClone(receipt);
  return this.update(projectId,data=>{
   const c=data.items.find(c=>c.id===conversationId);if(!c)return;
   const owner=c.messages.find(m=>m.requestId===requestId||m.agent?.requests.some(r=>r.requestId===requestId));
   const target=owner?.agent?owner.agent.requests.find(r=>r.requestId===requestId):owner;
   if(target){target.receipt=snapshot.receipt;target.receiptError=snapshot.receiptError}
  });
 }
 change(projectId,kind,id,title){
  return this.update(projectId,data=>{
   if(kind==='new'){
    const current=data.items.find(c=>c.id===data.activeId);
    if(!current.messages.length)return;
    const next=fresh();data.items.push(next);data.activeId=next.id;
   }else if(kind==='switch'){
    if(!data.items.some(c=>c.id===id))throw Error('Conversation not found');data.activeId=id;
   }else if(kind==='rename'){
    const c=data.items.find(c=>c.id===id);if(c)c.title=title.trim().slice(0,150);
   }else if(kind==='delete'){
    data.items=data.items.filter(c=>c.id!==id);
    if(!data.items.length)data.items.push(fresh());
    if(data.activeId===id)data.activeId=data.items.at(-1).id;
   }
  });
 }
}
