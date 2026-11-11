// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {createIframeEditorExecutor,iframeTransport} from '../vendor/core/frontend/src/composables/useZetaOfficeWebview.js';
import {validateProposal} from './proposal.js';
import {AgentEditor} from './agent-editor.js';

export function documentText(result){
 if(Array.isArray(result.paragraphs))return result.paragraphs.map(p=>p.text||'').join('\n');
 return typeof result.text==='string'?result.text:'';
}
export class EditorSession{
 constructor({container,store,onState,onBusy,onBoot=()=>{},language='zh'}){
  this.agent=new AgentEditor(this);
  this.store=store;this.onState=onState;this.onBusy=onBusy;this.file=null;this.dirty=false;this.generation=0;this.loading=false;this.queue=Promise.resolve();this.recoveryBytes=null;this.savedRevision=null;
  this.frame=document.createElement('iframe');this.frame.title=language==='en'?'Document editor':'文档编辑器';this.frame.allow='clipboard-read; clipboard-write';
  this.onBoot=onBoot;this.bootPhase='resources';this.bootSlow=false;this.bootSettled=false;this.disposed=false;
  this.ready=new Promise((resolve,reject)=>{this.resolveBoot=resolve;this.rejectBoot=reject});
  // Disposal may precede the caller's first await; preserve rejection for callers
  // without creating an unhandled promise rejection during teardown.
  void this.ready.catch(()=>{});
  this.slowBootTimer=setTimeout(()=>{if(!this.bootSettled){this.bootSlow=true;this.reportBoot()}},180000);
  this.finalBootTimer=setTimeout(()=>this.finishBoot('EDITOR_BOOT_TIMEOUT'),600000);
  this.executor=createIframeEditorExecutor(this.frame,{onReady:()=>this.finishBoot()});
  this.unsubscribe=iframeTransport(this.frame).subscribe(m=>{
   if(m?.__lo!=='lo-relay'||this.disposed)return;
   if(m.type==='boot-progress'&&!this.bootSettled){
    const previous=this.bootProgress;
    if(m.version!==1||typeof m.reliable!=='boolean'||!Number.isSafeInteger(m.total)||m.total<=0||!Number.isSafeInteger(m.loaded)||m.loaded<0||m.loaded>m.total||!Number.isInteger(m.completed)||m.completed<0||m.completed>6)return;
    if(previous&&(m.total!==previous.total||m.loaded<previous.loaded||m.completed<previous.completed||!previous.reliable&&m.reliable))return;
    this.bootProgress={loaded:m.loaded,total:m.total,reliable:m.reliable,completed:m.completed};
    this.bootPhase=m.completed===6?'starting':'resources';this.reportBoot();
   }
   if(m.type==='boot-log'&&!this.bootSettled){
    // Only known milestones become product copy; raw engine logs/URLs stay out
    // of the UI. These are stages, never a fabricated download percentage.
    const msg=String(m.msg||'');
    const phase=/^CJK font fetched:/.test(msg)?'fonts':/^soffice\.js loaded/.test(msg)?'starting':/^(thread port ready|UI ready|MEMFS injected )/.test(msg)?'opening':null;
    const phases=['resources','fonts','starting','opening'];
    if(!this.bootProgress&&phase&&phases.indexOf(phase)>phases.indexOf(this.bootPhase)){this.bootPhase=phase;this.reportBoot()}
   }
   if(m?.__lo==='lo-relay'&&m.type==='modified')this.scheduleSave();
   if(m.type==='boot-failed'||m.type==='engine-failed'){
    const code=m.type==='engine-failed'?'EDITOR_ENGINE_FAILED':'EDITOR_BOOT_FAILED';
    if(!this.bootSettled)this.finishBoot(code);else this.emit('error',code);
   }
  });
  // The pinned relay drops modified events inside a 500ms leading throttle,
  // including input immediately after load. Capture same-origin user input as
  // an independent autosave signal; revision checks below remain authoritative.
  this.inputChanged=()=>{this.agent.invalidate();this.scheduleSave()};
  this.inputKey=e=>{const plain=!e.metaKey&&!e.ctrlKey&&!e.altKey;const editShortcut=(e.metaKey||e.ctrlKey)&&['x','v','z','y','b','i','u'].includes(e.key.toLowerCase());if(plain&&(e.key.length===1||['Backspace','Delete','Enter','Tab'].includes(e.key))||editShortcut){this.agent.invalidate();this.scheduleSave()}};
  this.attachInput=()=>{
   this.detachInput?.();const doc=this.frame.contentDocument;if(!doc)return;
   for(const type of ['input','compositionend','paste','cut','drop'])doc.addEventListener(type,this.inputChanged,true);
   doc.addEventListener('keydown',this.inputKey,true);
   this.detachInput=()=>{for(const type of ['input','compositionend','paste','cut','drop'])doc.removeEventListener(type,this.inputChanged,true);doc.removeEventListener('keydown',this.inputKey,true)};
  };
  this.frame.addEventListener('load',this.attachInput);
  this.frame.src=`/web/editor/editor.html?lowa=/web/editor/lowa/&uilang=${language==='en'?'en-US':'zh-CN'}`;container.append(this.frame);
  this.reportBoot();
 }
 reportBoot(){this.onBoot({status:this.bootSlow?'slow':'loading',phase:this.bootPhase,...(this.bootProgress?{progress:this.bootProgress}:{})})}
 finishBoot(error){
  if(this.bootSettled)return;
  this.bootSettled=true;clearTimeout(this.slowBootTimer);clearTimeout(this.finalBootTimer);
  if(error){this.rejectBoot(Error(error));this.onBoot({status:error==='EDITOR_DISPOSED'?'disposed':'error',phase:this.bootPhase,error});this.releaseFrame()}
  else{this.onBoot({status:'ready',phase:this.bootPhase});this.resolveBoot()}
 }
 releaseFrame(){if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);this.detachInput?.();this.frame.removeEventListener('load',this.attachInput);this.unsubscribe?.();this.executor.dispose();this.frame.remove()}
 emit(status,error=null){this.status=status;this.error=error;this.onState({status,error,file:this.file,dirty:this.dirty})}
 scheduleSave(){if(this.loading||!this.file)return;this.markDirty();clearTimeout(this.timer);if(this.agent?.current?.unknown)return;this.timer=setTimeout(()=>this.save().catch(()=>{}),900)}
 markDirty(){this.dirty=true;this.generation++;this.emit('dirty')}
 run(fn,{busy=false}={}){
  const job=this.queue.then(async()=>{if(busy){this.onBusy(true);this.frame.inert=true;this.frame.contentWindow?.blur()}try{await this.ready;return await fn()}finally{if(busy){this.frame.inert=false;this.onBusy(false)}}});
  this.queue=job.catch(()=>{});return job;
 }
 async exec(action,params={}){const r=await this.executor.executeCommand(action,params);if(!r?.success){const error=Error(r?.message||r?.error||action+' failed');error.code=r?.code||r?.error;error.outcomeUnknown=!!r?.outcomeUnknown;error.retryable=!!r?.retryable;throw error}return r}
 async readText(){
  const paragraphs=[];let start=0,revision;
  while(true){
   const result=await this.exec('get_document_text',{__agent:true,startParagraph:start,maxParagraphs:500});
   if(revision!==undefined&&revision!==result.revision)throw Error('DOCUMENT_CHANGED');revision=result.revision;
   paragraphs.push(...(result.paragraphs||[]));
   if(new TextEncoder().encode(documentText({paragraphs})).length>48000)throw Error('DOCUMENT_TOO_LARGE');
   if(!result.truncated)return documentText({paragraphs});
   if(!Number.isInteger(result.nextStartParagraph)||result.nextStartParagraph<=start)throw Error('INCOMPLETE_DOCUMENT');
   start=result.nextStartParagraph;
  }
 }
 async readRevision(){
  const {revision}=await this.exec('get_document_text',{__agent:true,maxParagraphs:1});
  if(!Number.isSafeInteger(revision))throw Error('INCOMPLETE_DOCUMENT');return revision;
 }
 async flush(){
  if(!this.file)return this.file;
  if(this.agent?.current?.unknown)throw Error('UNKNOWN_NATIVE_OUTCOME');
  const file=this.file;
  try{
   // A read barrier catches native changes even if the asynchronous modified
   // relay was delayed/dropped. Never trust the old "saved" label alone.
   const revision=await this.readRevision();
   if(revision!==this.savedRevision&&!this.dirty)this.markDirty();
   if(!this.dirty)return this.file;
   const generation=this.generation;this.emit('saving');
   const output=await this.exec('export_document',{name:file.name});
   const bytes=new Uint8Array(output.bytes);if(bytes.length<100)throw Error('EMPTY_EXPORT');
   this.recoveryBytes=bytes;
   const saved=await this.store.saveFile(file.id,bytes,file.version);
   this.file=saved;this.savedRevision=revision;
   this.dirty=this.generation!==generation||(await this.readRevision())!==revision;
   if(!this.dirty)this.recoveryBytes=null;
   this.emit(this.dirty?'dirty':'saved');if(!this.dirty)this.agent?.saved(saved,revision);return saved;
  }catch(e){this.dirty=true;this.emit('error',e.code||e.message);throw e}
 }
 save(){return this.run(()=>this.flush())}
 async show(file){if(this.file?.id!==file?.id)this.agent?.switched();return this.run(async()=>{
  clearTimeout(this.timer);
  await this.flush();
  while(this.dirty)await this.flush();
  if(this.file?.id===file?.id){if(!file){this.frame.hidden=true;this.emit('empty')}return;}
  this.loading=true;
  try{
   if(!file){this.file=null;this.savedRevision=null;this.frame.hidden=true;this.emit('empty');return}
   this.frame.hidden=false;this.emit('loading');
   await this.exec('load_document',{name:file.name,bytes:Array.from(file.bytes),authorName:'Web user'});
   this.file=file;this.dirty=false;this.generation=0;this.recoveryBytes=null;
   await this.exec('set_chrome',{all:false});
   await this.exec('set_zoom',{value:90});
   await this.exec('set_revision_view',{mode:'all'});
   this.savedRevision=await this.readRevision();
   this.emit('saved');
  }catch(e){this.file=null;this.savedRevision=null;this.dirty=false;this.recoveryBytes=null;this.frame.hidden=true;this.emit('error',e.message);throw e}finally{this.loading=false}
 },{busy:true})}
 command(action,params={}){this.agent?.invalidate();return this.run(async()=>{if(!this.file)throw Error('NO_DOCUMENT');const r=await this.exec(action,params);this.markDirty();await this.flush();return r},{busy:true})}
 snapshot(){return this.run(async()=>{
  if(!this.file)throw Error('NO_DOCUMENT');
  await this.flush();
  const generation=this.generation;
  const text=await this.readText();
  const selection=await this.exec('get_selection');
  if(this.dirty||generation!==this.generation)throw Error('DOCUMENT_CHANGED');
  return {document:{id:this.file.id,version:this.file.version,name:this.file.name,text},selection:{text:selection.text||''}};
 },{busy:true})}
 apply(proposal,selectionText){this.agent?.invalidate();return this.run(async()=>{
  await this.flush();
  if(!this.file)throw Error('STALE_PROPOSAL');
  const before=await this.readText();
  const validation=validateProposal(proposal,{fileId:this.file.id,version:this.file.version,text:before,selectionText});
  if(!validation.ok)throw Error('STALE_PROPOSAL');
  const matches=await this.exec('find_text_locations',{keyword:proposal.original,matchCase:true,__agent:true});
  if(matches.count!==1||!matches.matches?.[0]?.anchorId)throw Error('AMBIGUOUS_SELECTION');
  await this.exec('replace_at_position',{anchor:matches.matches[0].anchorId,newText:proposal.replacement,__agent:true});
  this.markDirty();
  try{const after=await this.readText();const expected=before.replace(proposal.original,()=>proposal.replacement);if(after!==expected)throw Error('REPLACEMENT_VERIFICATION_FAILED')}catch(e){await this.exec('undo',{steps:1});this.markDirty();await this.flush();throw e}
  await this.flush();return this.file;
 },{busy:true})}
 exportBytes(){return this.run(async()=>{if(!this.file)throw Error('NO_DOCUMENT');const r=await this.exec('export_document',{name:this.file.name});return {name:this.file.name,bytes:new Uint8Array(r.bytes)}})}
 beginAgent(){return this.agent.begin()}
 agentContext(runId,options){return this.agent.context(runId,options)}
 executeAgentTool(runId,callId,name,args){return this.agent.execute(runId,callId,name,args)}
 endAgent(runId){this.agent.stop(runId)}
 restoreAgent(runId){return this.agent.restore(runId)}
 dispose(){this.agent?.switched();this.finishBoot('EDITOR_DISPOSED');this.releaseFrame()}
}
