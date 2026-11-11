// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {validateToolCall,AGENT_LIMITS} from './agent-contract.js';
const byteLength=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).length;
const bodyText=paragraphs=>paragraphs.map(p=>p.text).join('\n');
const fail=code=>Object.assign(new Error(code),{code});
const id=()=>globalThis.crypto.randomUUID();
const cellName=(column,row)=>String.fromCharCode(65+column)+(row+1);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const mutatesText=edit=>['replace_text','insert_text','create_table'].includes(edit.type);

/** Host-only leases and native dispatch. Model arguments never contain native actions. */
export class AgentEditor{
 constructor(session){this.session=session;this.current=null;this.epoch=0}
 invalidate(reason='DOCUMENT_CHANGED'){if(this.current)this.current.invalid=reason}
 switched(){this.invalidate('STALE_DOCUMENT');this.epoch++}
 stop(runId){if(this.current?.ids?.has(runId)||this.current?.id===runId)this.current.stopped=true}
 saved(file,revision){
  const run=this.current;
  // Delayed modified notifications may cause an otherwise harmless autosave.
  // Only a revision already owned by this run can advance its persisted lease.
  if(run&&!run.invalid&&run.fileId===file.id&&run.epoch===this.epoch&&run.revision===revision){
   run.version=file.version;run.generation=this.session.generation;
  }
 }
 identity(run){
  if(this.current!==run||run.epoch!==this.epoch||this.session.disposed||this.session.file?.id!==run.fileId)throw fail('STALE_DOCUMENT');
  if(run.invalid)throw fail(run.invalid);
 }
 active(run){this.identity(run);if(run.unknown)throw fail('UNKNOWN_NATIVE_OUTCOME');if(run.stopped)throw fail('AGENT_STOPPED');if(Date.now()>run.deadline)throw fail('AGENT_DEADLINE')}
 async native(run,action,params={}){
  this.identity(run);
  const result=await this.session.exec(action,{...params,__agent:true});
  this.identity(run);return result;
 }
 async body(run){
  const paragraphs=[];let start=0,revision;
  for(;;){
   const result=await this.native(run,'get_document_text',{startParagraph:start,maxParagraphs:500});
   if(!Number.isSafeInteger(result.revision))throw fail('INCOMPLETE_DOCUMENT');
   if(revision!==undefined&&revision!==result.revision)throw fail('DOCUMENT_CHANGED');
   revision=result.revision;
   if(!Array.isArray(result.paragraphs))throw fail('INCOMPLETE_DOCUMENT');
   paragraphs.push(...result.paragraphs.map(p=>({index:p.index,text:String(p.text??'')})));
   if(byteLength(bodyText(paragraphs))>48000)throw fail('DOCUMENT_TOO_LARGE');
   if(!result.truncated)return {paragraphs,revision,text:bodyText(paragraphs)};
   if(!Number.isSafeInteger(result.nextStartParagraph)||result.nextStartParagraph<=start)throw fail('INCOMPLETE_DOCUMENT');
   start=result.nextStartParagraph;
  }
 }
 async guard(run){
  this.active(run);
  if(this.session.file.version!==run.version)throw fail('STALE_DOCUMENT_VERSION');
  const revision=await this.session.readRevision();this.active(run);
  if(revision!==run.revision)throw fail('DOCUMENT_CHANGED');
 }
 target(run,value){
  const targetId=id();run.targets.set(targetId,value);return targetId;
 }
 begin(){return this.session.run(async()=>{
  this.invalidate('SUPERSEDED_RUN');
  await this.session.flush();
  if(!this.session.file||this.session.dirty)throw fail('NO_STABLE_DOCUMENT');
  const initialId=id();
  const run={id:initialId,ids:new Set([initialId]),fileId:this.session.file.id,name:this.session.file.name,epoch:this.epoch,version:this.session.file.version,
   revision:this.session.savedRevision,generation:this.session.generation,targets:new Map(),calls:new Map(),
   deadline:Date.now()+AGENT_LIMITS.runTimeoutMs,editCount:0,stopped:false,unknown:false,checkpoint:null};
  this.current=run;
  const body=await this.body(run);this.active(run);
  if(body.revision!==run.revision)throw fail('DOCUMENT_CHANGED');
  return this.makeContext(run,body);
 },{busy:true})}
 makeContext(run,body){
  for(const [key,target]of run.targets)if(target.kind==='paragraph'||target.kind==='boundary')run.targets.delete(key);
  const targets=[];
  for(const [i,p]of body.paragraphs.entries()){
   if(p.text.length>8000||targets.length>=126)continue;
   const entry={targetId:id(),kind:'paragraph',text:p.text,paragraphIndex:i};
   targets.push(entry);
   if(byteLength({runId:run.id,targets})>23000){targets.pop();continue}
   run.targets.set(entry.targetId,{kind:'paragraph',index:i,text:p.text});
  }
  for(const position of ['start','end'])targets.push({targetId:this.target(run,{kind:'boundary',position,text:''}),kind:'boundary',position,text:''});
  return {runId:run.id,document:{id:this.session.file.id,name:this.session.file.name,version:this.session.file.version,text:body.text},targets};
 }
 context(runId,options={}){return this.session.run(async()=>{
  const run=this.current;if(!run||(!run.ids?.has(runId)&&run.id!==runId))throw fail('STALE_RUN');
  await this.guard(run);
  if(options?.rotate){const nextId=id();run.id=nextId;run.ids.add(nextId)}
  return this.makeContext(run,await this.body(run));
 },{busy:true})}
 envelope(run,tool,values={}){
  return {ok:true,tool,runId:run?.id||'',document:{id:run?.fileId||this.session.file?.id||'',name:run?.name||this.session.file?.name||'',version:run?.version??this.session.file?.version??0},
   revision:run?.revision??0,saved:!this.session.dirty,partial:false,verification:'verified',result:{},...values};
 }
 execute(runId,callId,tool,args){
  const run=this.current;
  if(!run||(!run.ids?.has(runId)&&run.id!==runId))return Promise.resolve(this.envelope(run,tool,{ok:false,verification:'failed',error:{code:'STALE_RUN',message:'STALE_RUN',outcomeUnknown:false,retryable:false}}));
  if(typeof callId!=='string'||!callId||callId.length>200)return Promise.resolve(this.envelope(run,tool,{ok:false,verification:'failed',error:{code:'INVALID_CALL_ID',message:'INVALID_CALL_ID',outcomeUnknown:false,retryable:false}}));
  const fingerprint=JSON.stringify([tool,args]),previous=run.calls.get(callId);
  if(previous)return previous.fingerprint===fingerprint?previous.promise:Promise.resolve(this.envelope(run,tool,{ok:false,verification:'failed',error:{code:'CALL_ID_CONFLICT',message:'CALL_ID_CONFLICT',outcomeUnknown:false,retryable:false}}));
  const promise=this.session.run(async()=>{
   const edits=[];let attemptedWrite=false;
   try{
    const parameters=validateToolCall(tool,args);
    await this.guard(run);
    clearTimeout(this.session.timer);
    let result;
    if(tool==='doc_find_text')result=await this.find(run,parameters);
    else if(tool==='doc_read_tables')result=await this.tables(run,parameters);
    else{
     if(run.editCount+parameters.edits.length>AGENT_LIMITS.maxEditsPerRun)throw fail('RUN_EDIT_LIMIT');
     // Validate every target before the first write. No half-valid batch is dispatched.
     const seen=new Set(),resolved=[];
     for(const edit of parameters.edits){
      if(seen.has(edit.targetId))throw fail('OVERLAPPING_TARGETS');seen.add(edit.targetId);
      resolved.push({edit,...await this.resolve(run,edit)});
     }
     await this.preflight(run,resolved);
     await this.checkpoint(run);this.active(run);
     const tracking=await this.native(run,'set_track_changes',{on:true});
     if(tracking.recordChanges!==true)throw fail('TRACK_CHANGES_UNAVAILABLE');
     for(let i=0;i<parameters.edits.length;i++){
      const edit=parameters.edits[i];
      try{
       this.active(run);await this.resolve(run,edit);
       const readback=await this.applyOne(run,edit,()=>{attemptedWrite=true;run.editCount++});
       edits.push({index:i,type:edit.type,status:'applied',readback});
      }catch(error){
       edits.push({index:i,type:edit.type,status:'failed'});
       for(let j=i+1;j<parameters.edits.length;j++)edits.push({index:j,type:parameters.edits[j].type,status:'not_run'});
       throw error;
      }
     }
     result={edits};
    }
    // Search bookmarks are document state too. Save them through the same CAS,
    // but never call generic command() or re-enter the session queue.
    run.revision=await this.session.readRevision();this.identity(run);
    if(run.revision!==this.session.savedRevision)this.session.markDirty();
    await this.session.flush();this.identity(run);
    if(this.session.dirty)throw fail('DOCUMENT_CHANGED');
    run.version=this.session.file.version;run.generation=this.session.generation;
    return this.envelope(run,tool,{result});
   }catch(error){
    const unknown=!!error.outcomeUnknown;
    run.unknown ||= unknown;
    if(attemptedWrite&&unknown)this.session.markDirty();
    // A settled partial edit is still real document data and must be saved.
    // Unknown native outcomes must not enqueue recovery writes behind a hung command.
    if(attemptedWrite&&!unknown){
     this.session.markDirty();
     try{
      run.revision=await this.session.readRevision();await this.session.flush();
      run.version=this.session.file.version;run.generation=this.session.generation;
     }catch(saveError){error=saveError;run.unknown ||= !!saveError.outcomeUnknown}
    }
    const candidate=error.code||error.message;
    const code=typeof candidate==='string'&&/^[A-Z0-9_]{1,100}$/.test(candidate)?candidate:'AGENT_TOOL_FAILED';
    if(attemptedWrite)run.stopped=true;
    return this.envelope(run,tool,{ok:false,partial:attemptedWrite,saved:run.unknown?false:!this.session.dirty,verification:run.unknown?'unknown':'failed',result:edits.length?{edits}:{},
     error:{code,message:String(error.message||code).slice(0,1000),outcomeUnknown:run.unknown,retryable:false}});
   }finally{
    // Retain a pending dirty save signal after leaving the owned serial batch.
    if(this.session.dirty&&!run.unknown&&!this.session.disposed)this.session.scheduleSave();
   }
  },{busy:true});
  run.calls.set(callId,{fingerprint,promise});return promise;
 }
 async find(run,{queries}){
  const result={queries:[]};
  for(const query of queries){
   this.active(run);
   if(!query.text.trim())throw fail('EMPTY_SEARCH');
   const found=await this.native(run,'find_text_locations',{keyword:query.text,matchCase:query.matchCase??false});
   const row={text:query.text.slice(0,300),queryIndex:result.queries.length,matches:[],returnedCount:0,truncated:!!found.truncated,excludedNonBody:0};
   result.queries.push(row);
   for(const match of found.matches||[]){
    if(!match.anchorId)continue;
    const ctx=await this.native(run,'get_bookmark_context',{name:match.anchorId});
    if(!ctx.exists||ctx.paragraphIndex<0){row.excludedNonBody++;continue}
    const entry={targetId:id(),text:ctx.text,paragraphIndex:ctx.paragraphIndex,contextBefore:String(match.contextBefore||''),contextAfter:String(match.contextAfter||'')};
    row.matches.push(entry);row.returnedCount++;
    if(byteLength(result)>20000){row.matches.pop();row.returnedCount--;row.truncated=true;break}
    run.targets.set(entry.targetId,{kind:'anchor',anchor:match.anchorId,text:ctx.text,contextBefore:entry.contextBefore,contextAfter:entry.contextAfter});
   }
  }
  return result;
 }
 async tables(run,{tables}){
  const result={tables:[]};
  for(const requested of tables){
   this.active(run);
   const table=await this.native(run,'table_read',{tableIndex:requested.tableIndex,maxRows:requested.maxRows??20,maxCols:requested.maxCols??10});
   const row={tableIndex:table.tableIndex,name:table.table,rows:table.rows,cols:table.cols,truncated:!!table.truncated,cells:[]};
   if(table.note)row.note=table.note;
   result.tables.push(row);
   let bounded=false;
   for(let r=0;r<table.cells.length&&!bounded;r++){
    const line=[];row.cells.push(line);
    for(let c=0;c<table.cells[r].length;c++){
     const text=String(table.cells[r][c]),entry={cell:cellName(c,r),text:text.slice(0,2000)};
     if(text.length>2000){entry.truncated=true;row.truncated=true}
     if(!table.note&&text.length<=2000)entry.targetId=id();
     line.push(entry);
     if(byteLength(result)>20000){line.pop();row.truncated=true;bounded=true;break}
     if(entry.targetId)run.targets.set(entry.targetId,{kind:'cell',table:table.table,index:table.tableIndex,rows:table.rows,cols:table.cols,
      row:r,column:c,text,maxRows:table.cells.length,maxCols:table.cells[0]?.length||1});
    }
   }
  }
  return result;
 }
 async resolve(run,edit){
  this.identity(run);
  const target=run.targets.get(edit.targetId);if(!target||target.invalid)throw fail('STALE_TARGET');
  if(edit.type==='set_table_cell'){
   if(target.kind!=='cell')throw fail('INVALID_TARGET_KIND');
   const table=await this.native(run,'table_read',{tableName:target.table,maxRows:target.maxRows,maxCols:target.maxCols});
   if(table.note||table.tableIndex!==target.index||table.rows!==target.rows||table.cols!==target.cols||table.cells[target.row]?.[target.column]!==target.text)throw fail('STALE_TABLE_CELL');
   return {target,table};
  }
  if(target.kind==='cell')throw fail('INVALID_TARGET_KIND');
  if(edit.type==='format_text'&&!target.text)throw fail('EMPTY_FORMAT_TARGET');
  if(target.kind==='boundary'){
   if(!['insert_text','create_table'].includes(edit.type))throw fail('INVALID_TARGET_KIND');
   return {target};
  }
  if(target.kind==='anchor'){
   const ctx=await this.native(run,'get_bookmark_context',{name:target.anchor});
   if(!ctx.exists||ctx.paragraphIndex<0||ctx.text!==target.text)throw fail('STALE_TARGET');
   return {target,index:ctx.paragraphIndex};
  }
  const paragraph=await this.native(run,'get_paragraph',{index:target.index});
  if(paragraph.text!==target.text)throw fail('STALE_TARGET');
  return {target,index:target.index};
 }
 async preflight(run,resolved){
  const body=await this.body(run);
  let projectedBytes=byteLength(body.text);
  const ranges=[];
  for(const {edit,target,index}of resolved){
   if(edit.type==='replace_text')projectedBytes+=byteLength(edit.newText)-byteLength(target.text);
   if(edit.type==='insert_text')projectedBytes+=byteLength(edit.text);
   if(edit.type==='create_table')projectedBytes+=2;
   if(target.kind==='cell'){
    if(ranges.some(r=>r.cell===target.table+':'+cellName(target.column,target.row)))throw fail('OVERLAPPING_TARGETS');
    ranges.push({cell:target.table+':'+cellName(target.column,target.row)});continue;
   }
   const paragraphIndex=target.kind==='boundary'?(target.position==='start'?0:body.paragraphs.length-1):index;
   const paragraph=body.paragraphs[paragraphIndex]?.text;
   if(paragraph===undefined)throw fail('STALE_TARGET');
   let candidates=[];
   if(target.kind==='boundary'){
    const at=target.position==='start'?0:paragraph.length;candidates=[[at,at]];
   }else if(target.kind==='paragraph'||edit.type==='format_paragraph')candidates=[[0,paragraph.length]];
   else{
    for(let start=0;;){
     const at=paragraph.indexOf(target.text,start);if(at<0)break;
     candidates.push([at,at+target.text.length]);start=at+Math.max(target.text.length,1);
    }
    const contextual=candidates.filter(([a,b])=>String(target.contextBefore||'').endsWith(paragraph.slice(Math.max(0,a-40),a))&&String(target.contextAfter||'').startsWith(paragraph.slice(b,b+40)));
    if(contextual.length)candidates=contextual;
   }
   if(!candidates.length)throw fail('STALE_TARGET');
   for(const previous of ranges)if(previous.index===paragraphIndex){
    if(candidates.some(([a,b])=>previous.candidates.some(([c,d])=>a===b&&c===d?a===c:Math.max(a,c)<Math.min(b,d))))throw fail('OVERLAPPING_TARGETS');
   }
   ranges.push({index:paragraphIndex,candidates});
  }
  if(projectedBytes>48000)throw fail('DOCUMENT_TOO_LARGE');
 }
 async select(run,target){
  if(target.kind==='boundary'){
   await this.native(run,'goto',{type:target.position});return;
  }
  const selected=target.kind==='anchor'?await this.native(run,'set_selection',{anchor:target.anchor}):await this.native(run,'select_paragraph',{index:target.index});
  if(String(selected.text??selected.selectedText??'')!==target.text)throw fail('ORIGINAL_TEXT_MISMATCH');
 }
 async tableState(run){
  try{return await this.native(run,'table_read',{tableIndex:0,maxRows:20,maxCols:10})}
  catch(error){
   // Only this exact pinned zero-table response means absence; other engine
   // errors, timeouts and invalid document types remain failures.
   if(error.message==='表格序号越界: 0（文档共 0 张表，序号 0 开始）')return {tables:0};
   throw error;
  }
 }
 async rememberTable(run,target,table){
  const checkpoint=run.checkpoint;
  if(checkpoint&&!run.createdTables?.has(target.table)&&!checkpoint.tables.has(target.table))checkpoint.tables.set(target.table,{table:target.table,rows:table.rows,cols:table.cols,cells:table.cells.map(row=>[...row]),maxRows:target.maxRows,maxCols:target.maxCols});
 }
 async checkpoint(run){
  if(run.checkpoint)return;
  this.active(run);await this.session.flush();await this.guard(run);
  const body=await this.body(run),table=await this.tableState(run);
  const exported=await this.native(run,'export_document',{name:this.session.file.name});
  const bytes=new Uint8Array(exported.bytes);
  if(bytes.length<100||bytes.length>20*1024*1024)throw fail('CHECKPOINT_SIZE');
  run.checkpoint={bytes,body:body.text,tableCount:table.tables,tables:new Map()};
  if(table.table)run.checkpoint.tables.set(table.table,{table:table.table,rows:table.rows,cols:table.cols,cells:table.cells,maxRows:20,maxCols:10});run.generation=this.session.generation;
 }
 rebase(run,before,after,index){
  const delta=after.length-before.length;
  for(const target of run.targets.values())if(target.kind==='paragraph'){
   if(target.index>index)target.index+=delta;
   else if(target.index===index&&after[index]?.text!==target.text)target.invalid=true;
  }
 }
 async applyOne(run,edit,onWrite){
  const before=await this.body(run),resolved=await this.resolve(run,edit),{target}=resolved;
  if(edit.type==='set_table_cell'){
   await this.rememberTable(run,target,resolved.table);
   const old=resolved.table.cells.map(row=>[...row]);
   this.active(run);onWrite();
   await this.native(run,'table_set_cell',{tableName:target.table,cell:cellName(target.column,target.row),text:edit.text});
   this.session.markDirty();
   const actual=await this.native(run,'table_read',{tableName:target.table,maxRows:target.maxRows,maxCols:target.maxCols});
   old[target.row][target.column]=edit.text;
   if(actual.note||actual.rows!==target.rows||actual.cols!==target.cols||!equal(actual.cells,old))throw fail('TABLE_VERIFICATION_FAILED');
   if((await this.body(run)).text!==before.text)throw fail('BODY_VERIFICATION_FAILED');
   target.invalid=true;return {cell:cellName(target.column,target.row),text:edit.text.slice(0,300),length:edit.text.length,truncated:edit.text.length>300};
  }
  await this.select(run,target);
  if(edit.type==='insert_text'||edit.type==='create_table')if(target.kind!=='boundary')await this.native(run,'collapse_selection',{to:edit.position==='before'?'start':'end'});
  this.active(run);onWrite();
  let format,created;
  if(edit.type==='replace_text'||edit.type==='insert_text')await this.native(run,'replace_selection',{text:edit.type==='replace_text'?edit.newText:edit.text});
  else if(edit.type==='format_text'||edit.type==='format_paragraph'){
   await this.native(run,edit.type==='format_text'?'format_selection':'set_paragraph_format',edit.format);
   format=await this.native(run,'get_formatting');
   for(const [key,value]of Object.entries(edit.format)){
    const actual=edit.type==='format_text'?format.character?.[key==='fontSize'?'sizePt':key]:format.paragraph?.[key==='headingLevel'?'outlineLevel':key];
    if(actual!==value)throw fail('FORMAT_VERIFICATION_FAILED');
   }
  }else if(edit.type==='create_table'){
   created=await this.native(run,'insert_table',{rows:edit.rows,headerRow:edit.headerRow??true});
   (run.createdTables??=new Set()).add(created.table);
   const table=await this.native(run,'table_read',{tableName:created.table,maxRows:10,maxCols:6});
   if(table.note||table.rows!==edit.rows.length||table.cols!==edit.rows[0].length||!equal(table.cells,edit.rows))throw fail('TABLE_VERIFICATION_FAILED');
  }
  this.session.markDirty();
  const after=await this.body(run);
  if(format){if(after.text!==before.text)throw fail('BODY_VERIFICATION_FAILED');return {format:edit.format}}
  if(created){
   if(after.text.replaceAll('\n','')!==before.text.replaceAll('\n',''))throw fail('BODY_VERIFICATION_FAILED');
   for(const t of run.targets.values())if(t.kind==='paragraph')t.invalid=true;
   return {table:created.table,rows:edit.rows.length,cols:edit.rows[0].length};
  }
  let candidates=[];
  const inserted=edit.type==='replace_text'?edit.newText:edit.text;
  let index=resolved.index;
  if(target.kind==='boundary'){
   index=target.position==='start'?0:before.paragraphs.length-1;
   candidates=[target.position==='start'?inserted+before.text:before.text+inserted];
  }else{
   const paragraph=before.paragraphs[index]?.text;if(paragraph===undefined)throw fail('STALE_TARGET');
   let offset=0;
   do{
    const found=target.kind==='paragraph'?0:paragraph.indexOf(target.text,offset);
    if(found<0)break;
    const end=found+target.text.length;
    const local=edit.type==='replace_text'?paragraph.slice(0,found)+inserted+paragraph.slice(end):
     paragraph.slice(0,edit.position==='before'?found:end)+inserted+paragraph.slice(edit.position==='before'?found:end);
    const paragraphs=before.paragraphs.map(p=>p.text);paragraphs[index]=local;candidates.push(paragraphs.join('\n'));
    if(target.kind==='paragraph'||!target.text.length)break;
    offset=found+1;
   }while(offset<=paragraph.length);
  }
  if(!candidates.includes(after.text))throw fail('TEXT_VERIFICATION_FAILED');
  this.rebase(run,before.paragraphs,after.paragraphs,index);
  if(edit.type==='replace_text')target.invalid=true;
  return {text:inserted.slice(0,300),length:inserted.length,truncated:inserted.length>300};
 }
 restore(runId){return this.session.run(async()=>{
  const run=this.current;
  if(!run||(!run.ids?.has(runId)&&run.id!==runId)||!run.checkpoint)throw fail('NO_AGENT_CHECKPOINT');
  this.identity(run);
  if(run.unknown)throw fail('UNKNOWN_NATIVE_OUTCOME');
  clearTimeout(this.session.timer);
  if(this.session.file.version!==run.version||await this.session.readRevision()!==run.revision)throw fail('CHECKPOINT_CONFLICT');
  this.identity(run);
  const s=this.session,file=s.file;
  s.loading=true;
  try{
   // show(file) deliberately skips an already-open id. Restoration must force
   // a native load and use the CURRENT persisted version for the following CAS.
   await s.exec('load_document',{name:file.name,bytes:Array.from(run.checkpoint.bytes),authorName:'Web user'});
   await s.exec('set_chrome',{all:false});await s.exec('set_zoom',{value:90});await s.exec('set_revision_view',{mode:'all'});
   const body=await this.body(run);
   if(body.text!==run.checkpoint.body)throw fail('RESTORE_VERIFICATION_FAILED');
   const tableState=await this.tableState(run);
   if(tableState.tables!==run.checkpoint.tableCount)throw fail('RESTORE_TABLE_VERIFICATION_FAILED');
   for(const expected of run.checkpoint.tables.values()){
    const actual=await this.native(run,'table_read',{tableName:expected.table,maxRows:expected.maxRows,maxCols:expected.maxCols});
    if(actual.rows!==expected.rows||actual.cols!==expected.cols||!equal(actual.cells,expected.cells))throw fail('RESTORE_TABLE_VERIFICATION_FAILED');
   }
   s.markDirty();await s.flush();
   if(s.dirty)throw fail('DOCUMENT_CHANGED');
   run.checkpoint=null;run.stopped=true;this.switched();
   return {file:s.file,restored:true,saved:true};
  }catch(error){s.dirty=true;s.emit('error',error.code||error.message);throw error}finally{s.loading=false}
 },{busy:true})}
}
