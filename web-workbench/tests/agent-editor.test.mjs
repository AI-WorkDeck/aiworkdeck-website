// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession} from '../src/editor.js';
import {AgentEditor} from '../src/agent-editor.js';
import {validateAgentContext,validateToolResult} from '../src/agent-contract.js';

function fixture(t,text=['甲方30日付款。','删除此段','尾段']){
 const engine={paragraphs:[...text],revision:1,tables:[],anchors:new Map(),commands:[],format:{character:{bold:false,italic:false,underline:false,sizePt:12},paragraph:{alignment:'left',outlineLevel:0}},selection:null};
 const s=Object.create(EditorSession.prototype);
 Object.assign(s,{file:{id:'f',name:'合成.docx',version:1},dirty:false,generation:0,savedRevision:1,queue:Promise.resolve(),ready:Promise.resolve(),
  frame:{inert:false,contentWindow:{blur(){}}},onBusy(){},onState(){},disposed:false,loading:false});
 s.agent=new AgentEditor(s);s.store={saveFile:async(id,bytes,version)=>({...s.file,version:version+1,bytes})};
 t.after(()=>clearTimeout(s.timer));
 const output=()=>JSON.stringify({paragraphs:engine.paragraphs,tables:engine.tables,format:engine.format,padding:'x'.repeat(120)});
 function editSelection(text){
  const a=engine.selection,{paragraph:p,start,end}=a,old=engine.paragraphs[p];
  const next=old.slice(0,start)+text+old.slice(end),split=next.split('\n'),delta=split.length-1;
  engine.paragraphs.splice(p,1,...split);
  for(const anchor of engine.anchors.values()){
   if(anchor.paragraph>p)anchor.paragraph+=delta;
   else if(anchor.paragraph===p){
    if(anchor.start>=end&&anchor!==a){anchor.start+=text.length-(end-start);anchor.end+=text.length-(end-start)}
    else if(anchor.start===start&&anchor.end===end){anchor.text=text;anchor.end=start+text.length}
   }
  }
  engine.selection={paragraph:p,start:start+text.length,end:start+text.length};engine.revision++;
 }
 s.executor={executeCommand:async(action,p)=>{
  engine.commands.push({action,p});
  if(engine.hook){const result=await engine.hook(action,p);if(result)return result}
  const success=result=>({success:true,...result});
  if(action==='get_document_text')return success({revision:engine.revision,paragraphs:engine.paragraphs.map((text,index)=>({text,index})),truncated:false});
  if(action==='get_paragraph')return success({text:engine.paragraphs[p.index]});
  if(action==='export_document')return success({bytes:[...new TextEncoder().encode(output())]});
  if(action==='load_document'){
   const data=JSON.parse(new TextDecoder().decode(new Uint8Array(p.bytes)));engine.paragraphs=data.paragraphs;engine.tables=data.tables;engine.format=data.format;engine.revision++;return success({});
  }
  if(action==='find_text_locations'){
   const matches=[];
   for(const [paragraph,text]of engine.paragraphs.entries()){
    const source=p.matchCase?text:text.toLowerCase(),needle=p.matchCase?p.keyword:p.keyword.toLowerCase();let start=0;
    for(;;){const offset=source.indexOf(needle,start);if(offset<0)break;const anchorId='a'+engine.anchors.size;
     engine.anchors.set(anchorId,{paragraph,start:offset,end:offset+p.keyword.length,text:text.slice(offset,offset+p.keyword.length)});
     matches.push({anchorId,text:text.slice(offset,offset+p.keyword.length),contextBefore:text.slice(0,offset),contextAfter:text.slice(offset+p.keyword.length)});start=offset+Math.max(needle.length,1);}
   }
   engine.revision++;return success({matches,count:matches.length});
  }
  if(action==='get_bookmark_context'){
   const a=engine.anchors.get(p.name);return success(a?{exists:true,text:a.text,paragraphIndex:a.paragraph}:{exists:false,text:'',paragraphIndex:-1});
  }
  if(action==='select_paragraph'){engine.selection={paragraph:p.index,start:0,end:engine.paragraphs[p.index].length};return success({text:engine.paragraphs[p.index]})}
  if(action==='set_selection'){const a=engine.anchors.get(p.anchor);engine.selection={...a};return success({text:a.text})}
  if(action==='goto'){assert.ok(['start','end'].includes(p.type));const paragraph=p.type==='start'?0:engine.paragraphs.length-1,offset=p.type==='start'?0:engine.paragraphs[paragraph].length;engine.selection={paragraph,start:offset,end:offset};return success({})}
  if(action==='collapse_selection'){const offset=p.to==='start'?engine.selection.start:engine.selection.end;engine.selection.start=offset;engine.selection.end=offset;return success({})}
  if(action==='replace_selection'){editSelection(p.text);return success({})}
  if(action==='set_track_changes')return success({recordChanges:p.on});
  if(action==='format_selection'){for(const [k,v]of Object.entries(p))if(k!=='__agent')engine.format.character[k==='fontSize'?'sizePt':k]=v;engine.revision++;return success({})}
  if(action==='set_paragraph_format'){for(const [k,v]of Object.entries(p))if(k!=='__agent')engine.format.paragraph[k==='headingLevel'?'outlineLevel':k]=v;engine.revision++;return success({})}
  if(action==='get_formatting')return success(engine.format);
  if(action==='insert_table'){const table='表'+(engine.tables.length+1);engine.tables.push({table,cells:p.rows.map(r=>[...r])});engine.revision++;return success({table})}
  if(action==='table_read'){
   const table=p.tableName?engine.tables.find(v=>v.table===p.tableName):engine.tables[p.tableIndex];
   if(!table)return {success:false,error:'NO_TABLE',message:'表格序号越界: 0（文档共 0 张表，序号 0 开始）'};
   return success({table:table.table,tableIndex:engine.tables.indexOf(table),tables:engine.tables.length,rows:table.cells.length,cols:table.cells[0].length,cells:table.cells.slice(0,p.maxRows).map(r=>r.slice(0,p.maxCols)),truncated:false,...(table.note?{note:table.note}:{})});
  }
  if(action==='table_set_cell'){const table=engine.tables.find(v=>v.table===p.tableName);table.cells[Number(p.cell.slice(1))-1][p.cell.charCodeAt(0)-65]=p.text;engine.revision++;return success({})}
  return success({});
 }};
 return {s,engine,begin:()=>s.beginAgent(),// Tests that are not about the originalText guard quote the target's current text, as a correct model call does.
  execute:(ctx,edits,callId='call')=>s.executeAgentTool(ctx.runId,callId,'doc_apply_edits',{edits:edits.map(e=>e.type==='replace_text'&&e.originalText===undefined?{type:e.type,targetId:e.targetId,originalText:s.agent.current?.targets.get(e.targetId)?.text??'',newText:e.newText}:e)})};
}
const paragraph=(ctx,index)=>ctx.targets.find(t=>t.kind==='paragraph'&&t.paragraphIndex===index).targetId;

test('unselected multi-edit, empty deletion and literal newline insertion persist; same-file DOCX checkpoint restores whole run',async t=>{
 const f=fixture(t),ctx=await f.begin();
 validateAgentContext({runId:ctx.runId,targets:ctx.targets});
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'甲方45日付款。'},{type:'replace_text',targetId:paragraph(ctx,1),newText:''},{type:'insert_text',targetId:paragraph(ctx,2),position:'after',text:'\n**字面**😀'}]);
 assert.equal(result.ok,true);validateToolResult(result);assert.deepEqual(f.engine.paragraphs,['甲方45日付款。','','尾段','**字面**😀']);assert.equal(result.saved,true);
 f.s.endAgent(ctx.runId);const restored=await f.s.restoreAgent(ctx.runId);assert.equal(restored.saved,true);assert.deepEqual(f.engine.paragraphs,['甲方30日付款。','删除此段','尾段']);
 assert.equal(f.engine.commands.filter(c=>c.action==='load_document').length,1);assert.ok(f.engine.commands.filter(c=>['replace_selection','set_track_changes'].includes(c.action)).every(c=>c.p.__agent));
});
test('all targets validated before mutation; forged and duplicate ids cannot partly apply',async t=>{
 const f=fixture(t),ctx=await f.begin(),result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'x'},{type:'replace_text',targetId:'forged',newText:'y'}]);
 assert.equal(result.ok,false);assert.equal(result.partial,false);assert.equal(f.engine.commands.some(c=>c.action==='replace_selection'),false);
});
test('native revision change and A-B-A epoch invalidate pending calls',async t=>{
 const f=fixture(t),ctx=await f.begin();f.engine.revision++;
 assert.equal((await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'x'}])).error.code,'DOCUMENT_CHANGED');
 const c2=await f.begin();f.s.agent.switched();f.s.agent.switched();assert.equal((await f.execute(c2,[{type:'replace_text',targetId:paragraph(c2,0),newText:'x'}])).partial,false);
});
test('replayed short insertion dispatches exactly once; changed args conflict',async t=>{
 const f=fixture(t),ctx=await f.begin(),edits=[{type:'insert_text',targetId:paragraph(ctx,0),position:'before',text:'A'}];
 const first=await f.execute(ctx,edits);assert.deepEqual(await f.execute(ctx,edits),first);assert.equal(f.engine.paragraphs[0],'A甲方30日付款。');
 assert.equal((await f.execute(ctx,[{...edits[0],text:'B'}])).error.code,'CALL_ID_CONFLICT');
});
test('find creates body handles and owned save revision remains usable across generations',async t=>{
 const f=fixture(t,['同词甲，同词乙。']),ctx=await f.begin();
 const found=await f.s.executeAgentTool(ctx.runId,'find','doc_find_text',{queries:[{text:'同词'}]});validateToolResult(found);assert.equal(found.ok,true);assert.equal(found.result.queries[0].matches.length,2);
 const result=await f.execute(ctx,found.result.queries[0].matches.map((m,i)=>({type:'replace_text',targetId:m.targetId,newText:i?'二':'一'})));
 assert.equal(result.ok,true);assert.equal(f.engine.paragraphs[0],'一甲，二乙。');
 const next=await f.s.agentContext(ctx.runId);assert.equal(next.document.text,'一甲，二乙。');assert.equal(next.targets.some(v=>v.targetId===paragraph(ctx,0)),false);
});
test('character false and paragraph properties are actually read back',async t=>{
 const f=fixture(t),ctx=await f.begin();
 assert.equal((await f.execute(ctx,[{type:'format_text',targetId:paragraph(ctx,0),format:{bold:false,italic:true,fontSize:15}},{type:'format_paragraph',targetId:paragraph(ctx,1),format:{alignment:'center',headingLevel:2}}])).ok,true);
 assert.equal(f.engine.format.character.bold,false);assert.equal(f.engine.format.paragraph.outlineLevel,2);
});
test('native table create/read and multiple exact cell writes use explicit identities',async t=>{
 const f=fixture(t),ctx=await f.begin(),boundary=ctx.targets.find(v=>v.position==='end');
 assert.equal((await f.execute(ctx,[{type:'create_table',targetId:boundary.targetId,position:'after',rows:[['甲','乙'],['1','2']]}])).ok,true);
 const table=await f.s.executeAgentTool(ctx.runId,'read','doc_read_tables',{tables:[{tableIndex:0}]});validateToolResult(table);
 assert.equal((await f.execute(ctx,[{type:'set_table_cell',targetId:table.result.tables[0].cells[1][1].targetId,text:''},{type:'set_table_cell',targetId:table.result.tables[0].cells[0][0].targetId,text:'改'}],'cells')).ok,true);
 assert.deepEqual(f.engine.tables[0].cells,[['改','乙'],['1','']]);
 await f.s.restoreAgent(ctx.runId);assert.deepEqual(f.engine.tables,[]);
});
test('reading tables of a document without tables is a verified empty result, not a failed run',async t=>{
 const f=fixture(t),ctx=await f.begin();
 const result=await f.s.executeAgentTool(ctx.runId,'probe','doc_read_tables',{tables:[{tableIndex:0}]});validateToolResult(result);
 assert.equal(result.ok,true);assert.deepEqual(result.result,{tables:[],tableCount:0});
});
test('a stale target fails before any write and reports the document as still saved',async t=>{
 const f=fixture(t),ctx=await f.begin(),stale=paragraph(ctx,0);
 assert.equal((await f.execute(ctx,[{type:'replace_text',targetId:stale,newText:'甲方45日付款。'}])).ok,true);
 const again=await f.execute(ctx,[{type:'replace_text',targetId:stale,newText:'甲方45日付款。'}],'again');validateToolResult(again);
 assert.equal(again.error.code,'STALE_TARGET');assert.equal(again.partial,false);assert.equal(again.verification,'failed');assert.equal(again.saved,true);
 assert.equal(f.engine.paragraphs[0],'甲方45日付款。');
});
test('replace_text is refused before any write when originalText is not what the target contains',async t=>{
 // Seen on staging: asked to change 第二条, the model took paragraphIndex 2 (第一条) and overwrote it with 第二条 text; the write read back fine.
 const f=fixture(t,['合同','第一条 服务内容。','第二条 三十日内付款。']),ctx=await f.begin(),before=f.engine.commands.length;
 const wrong=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),originalText:'合同',newText:'服务合同'},{type:'replace_text',targetId:paragraph(ctx,1),originalText:'第二条 三十日内付款。',newText:'第二条 四十五日内付款。'}]);validateToolResult(wrong);
 assert.equal(wrong.ok,false);assert.equal(wrong.error.code,'ORIGINAL_TEXT_MISMATCH');assert.equal(wrong.partial,false);assert.equal(wrong.verification,'failed');
 assert.deepEqual(f.engine.paragraphs,['合同','第一条 服务内容。','第二条 三十日内付款。']);
 assert.ok(!f.engine.commands.slice(before).some(c=>c.action==='replace_selection'),'the valid first edit of the batch is not written either');
 const right=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,2),originalText:' 第二条 三十日内付款。\n',newText:'第二条 四十五日内付款。'}],'right');
 assert.equal(right.ok,true);assert.deepEqual(f.engine.paragraphs,['合同','第一条 服务内容。','第二条 四十五日内付款。']);
});
test('re-sending the text a target already has writes nothing',async t=>{
 const f=fixture(t),ctx=await f.begin(),before=f.engine.commands.length,revision=f.engine.revision;
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'甲方30日付款。'}]);validateToolResult(result);
 assert.equal(result.ok,true);assert.equal(result.result.edits[0].status,'unchanged');assert.equal(f.engine.revision,revision);
 assert.ok(!f.engine.commands.slice(before).some(c=>c.action==='replace_selection'));
});
test('merged table read never mints writable cell handles',async t=>{
 const f=fixture(t);f.engine.tables=[{table:'合并',cells:[['a']],note:'merged'}];const ctx=await f.begin();
 const result=await f.s.executeAgentTool(ctx.runId,'read','doc_read_tables',{tables:[{tableIndex:0}]});assert.equal(result.result.tables[0].cells[0][0].targetId,undefined);
});
test('stop during in-flight write settles and saves it, then reports remaining edits not run',async t=>{
 const f=fixture(t),ctx=await f.begin();let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.engine.hook=async action=>{if(action==='replace_selection'){entered();await gate}};
 const pending=f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'已执行'},{type:'replace_text',targetId:paragraph(ctx,1),newText:'不执行'}]);
 await started;f.s.endAgent(ctx.runId);release();const result=await pending;
 assert.equal(result.ok,false);assert.equal(result.partial,true);assert.equal(result.saved,true);assert.deepEqual(f.engine.paragraphs,['已执行','删除此段','尾段']);assert.equal(result.result.edits[0].status,'applied');
});
test('unknown write timeout never retries, autosaves or restores behind pending native work',async t=>{
 const f=fixture(t),ctx=await f.begin();f.engine.hook=async action=>action==='replace_selection'?{success:false,code:'EDITOR_RESULT_TIMEOUT',outcomeUnknown:true,message:'timeout'}:undefined;
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'x'}]);assert.equal(result.verification,'unknown');assert.equal(result.saved,false);assert.equal(result.error.retryable,false);await assert.rejects(f.s.save(),/UNKNOWN_NATIVE_OUTCOME/);
 const count=f.engine.commands.length;await assert.rejects(f.s.restoreAgent(ctx.runId),/UNKNOWN_NATIVE_OUTCOME/);assert.equal(f.engine.commands.length,count);
 const second=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'x'}],'second');assert.equal(second.error.code,'UNKNOWN_NATIVE_OUTCOME');assert.equal(f.engine.commands.length,count);
});
test('partial known failure preserves first edit with honest failed statuses',async t=>{
 const f=fixture(t),ctx=await f.begin();let writes=0;f.engine.hook=async action=>action==='replace_selection'&&++writes===2?{success:false,error:'INJECTED'}:undefined;
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'成功'},{type:'replace_text',targetId:paragraph(ctx,1),newText:'失败'}]);
 assert.equal(result.ok,false);assert.equal(result.partial,true);assert.equal(result.saved,true);assert.deepEqual(result.result.edits.map(v=>v.status),['applied','failed']);assert.equal(f.engine.paragraphs[0],'成功');
});
test('user edit after the run prevents destructive checkpoint restore',async t=>{
 const f=fixture(t),ctx=await f.begin();await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'AI'}]);f.s.agent.invalidate();f.engine.paragraphs[0]='人工';f.engine.revision++;
 await assert.rejects(f.s.restoreAgent(ctx.runId),/DOCUMENT_CHANGED/);assert.equal(f.engine.paragraphs[0],'人工');
});
test('save CAS failure never advertises durable success or destroys the checkpoint',async t=>{
 const f=fixture(t),ctx=await f.begin();f.s.store.saveFile=async()=>{throw new Error('FILE_CONFLICT')};
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'待恢复'}]);assert.equal(result.ok,false);assert.equal(result.saved,false);assert.equal(f.s.dirty,true);assert.ok(f.s.recoveryBytes);assert.ok(f.s.agent.current.checkpoint);
});

test('overlapping paragraph and anchor rejected before first native mutation',async t=>{
 const f=fixture(t),ctx=await f.begin(),found=await f.s.executeAgentTool(ctx.runId,'find','doc_find_text',{queries:[{text:'30'}]});
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'整段'},{type:'replace_text',targetId:found.result.queries[0].matches[0].targetId,newText:'45'}]);
 assert.equal(result.error.code,'OVERLAPPING_TARGETS');assert.equal(result.partial,false);assert.equal(f.engine.commands.some(c=>c.action==='replace_selection'),false);
});
test('predicted body cap fails before dispatch instead of leaving an unreadable partial document',async t=>{
 const f=fixture(t,['a'.repeat(47000)]),ctx=await f.begin(),boundary=ctx.targets.find(v=>v.position==='end');
 const result=await f.execute(ctx,[{type:'insert_text',targetId:boundary.targetId,position:'after',text:'x'.repeat(2000)}]);
 assert.equal(result.error.code,'DOCUMENT_TOO_LARGE');assert.equal(result.partial,false);assert.equal(f.engine.commands.some(c=>c.action==='replace_selection'),false);
});
test('late owned modified notification with unchanged native revision does not disable safe restore',async t=>{
 const f=fixture(t),ctx=await f.begin();await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'AI'}]);f.s.scheduleSave();
 assert.equal((await f.s.restoreAgent(ctx.runId)).saved,true);assert.equal(f.engine.paragraphs[0],'甲方30日付款。');
});
test('arbitrary native messages become bounded error messages rather than invalid protocol codes',async t=>{
 const f=fixture(t),ctx=await f.begin();f.engine.hook=async action=>action==='replace_selection'?{success:false,error:'中文原生错误',message:'中文原生错误'}:undefined;
 const result=await f.execute(ctx,[{type:'replace_text',targetId:paragraph(ctx,0),newText:'x'}]);assert.equal(result.error.code,'AGENT_TOOL_FAILED');validateToolResult(result);
});
