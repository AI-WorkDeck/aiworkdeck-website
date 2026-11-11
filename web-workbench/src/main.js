// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import './style.css';
import {readLocalFile} from './import-file.js';
import {ConversationStore} from './conversations.js';
import {progressView} from './boot-progress-view.js';
import {openWorkspace,TEMPORARY_PROJECT_ID} from './storage.js';
import {projectLocales,projectLocale} from './project-locales.js';
import {EditorSession} from './editor.js';
import {createDocument,validateDocx,downloadFile} from './docx.js';
import {streamChat} from './chat.js';
import {runDocumentAgent} from './agent-runner.js';
import {countLiteralMatches,validateProposal} from './proposal.js';

const requestedLocale=projectLocale(new URLSearchParams(location.search).get('lang'));
const projectText=projectLocales[requestedLocale];
const language=requestedLocale==='zh'||requestedLocale==='zh-hant'?'zh':'en';
const en=language==='en';
const t=(zh,english)=>en?english:zh;
document.documentElement.lang=requestedLocale;
document.documentElement.dir=requestedLocale==='ar'?'rtl':'ltr';
const icons={folder:'<path d="M3 7h6l2 2h10v11H3z"/><path d="M3 7V4h6l2 3"/>',file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',plus:'<path d="M12 5v14M5 12h14"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',chevron:'<path d="m8 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',send:'<path d="m4 12 16-8-5 16-3-6zM12 14l8-10"/>',save:'<path d="M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-8h8v8"/>',undo:'<path d="m8 5-5 5 5 5M3 10h10a6 6 0 0 1 0 12"/>',redo:'<path d="m16 5 5 5-5 5M21 10H11a6 6 0 0 0 0 12"/>',check:'<path d="m5 12 4 4L19 6"/>',panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/>',chat:'<path d="M4 4h16v12H9l-5 5z"/>',arrow:'<path d="m14 6-6 6 6 6"/>',trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.file}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,name,label,cls='icon-button')=>`<button type="button" class="${cls}" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}${cls==='icon-button'?'':`<span>${esc(label)}</span>`}</button>`;
const state={store:null,session:null,projects:[],projectId:null,files:[],tabs:[],activeId:null,busy:false,booting:true,messages:[],aiRunning:false,selection:null,controller:null,capabilities:null};
document.querySelector('#app').innerHTML=`
 <header class="topbar"><a class="brand" href="/${language}" aria-label="AI WorkDeck"><span class="brand-mark">W<span>·</span></span><strong>AI WorkDeck</strong><span class="web-badge">WEB</span></a><div class="top-divider"></div><span class="workspace-name">${t('工作台','Workspace')}</span><div class="top-spacer"></div><span class="local-label"><i></i>${t('本浏览器保存','Saved in this browser')}</span><a class="language-link" href="?lang=${en?'zh':'en'}">${en?'中文':'EN'}</a><a class="desktop-link" href="/${language}/start" target="_blank" rel="noopener noreferrer" aria-label="${t('下载桌面端（在新标签页打开）','Download desktop (opens in a new tab)')}">${icon('download')}${t('下载桌面端','Download desktop')}</a><a class="account-link" id="account-link" href="/${language}/account?next=${encodeURIComponent('/web/?lang='+language)}">${t('账户与额度','Account & credits')}</a></header>
 <div class="layout"><nav class="activity-bar" aria-label="${t('面板','Panels')}">${button('toggle-files','folder',t('项目文件','Project files'),'activity-button active')}${button('toggle-ai','spark',t('AI 助手','AI assistant'),'activity-button')}<div class="activity-spacer"></div><a class="activity-button" href="/web/UPSTREAM.md" target="_blank" title="${t('开源与许可','Source & licenses')}" aria-label="${t('开源与许可','Source & licenses')}">ⓘ</a></nav>
 <aside class="files-panel"><div class="panel-heading"><span>${t('项目文件','EXPLORER')}</span>${button('new-project','plus',t('新建项目','New project'))}</div><div class="project-picker"><label class="sr-only" for="project-select">${t('当前项目','Current project')}</label><select id="project-select"></select>${button('project-menu','more',t('项目操作','Project actions'))}</div><button class="subtle-button copy-project" data-action="copy-project">${esc(projectText.copy)}</button><div class="file-actions">${button('new-file','plus',t('新建文档','New document'),'subtle-button')}${button('import','upload',t('导入','Import'),'subtle-button')}</div><div id="file-tree" class="file-tree" role="tree" aria-label="${t('文件','Files')}"></div><div class="storage-note"><span class="storage-symbol">${icon('save')}</span><strong>${t('你的浏览器，你的工作区','Your browser. Your workspace.')}</strong><p>${t('文档保存在此浏览器，不会自动同步到其他设备。重要文件请下载备份。','Documents stay in this browser and do not sync across devices. Download important files as a backup.')}</p><button class="text-button" data-action="persist">${t('保护本地存储','Protect local storage')}</button><span id="persist-status"></span></div></aside>
 <div class="resize-handle left-resize" role="separator" aria-label="${t('调整文件面板宽度','Resize file panel')}" aria-orientation="vertical" tabindex="0"></div>
 <main class="document-pane"><div class="tabs" id="tabs" role="tablist" aria-label="${t('打开的文档','Open documents')}"></div><div class="document-toolbar"><div class="toolbar-group">${button('undo','undo',t('撤销','Undo'))}${button('redo','redo',t('重做','Redo'))}</div><div class="toolbar-group format-group"><button class="format-button" data-action="bold" title="${t('加粗','Bold')}" aria-label="${t('加粗','Bold')}"><b>B</b></button><button class="format-button" data-action="italic" title="${t('斜体','Italic')}" aria-label="${t('斜体','Italic')}"><i>I</i></button><button class="format-button" data-action="underline" title="${t('下划线','Underline')}" aria-label="${t('下划线','Underline')}"><u>U</u></button><label class="sr-only" for="font-size">${t('字号','Font size')}</label><select id="font-size" title="${t('字号','Font size')}"><option value="">${t('字号','Size')}</option><option>10</option><option>12</option><option>14</option><option>16</option><option>20</option><option>24</option></select></div><div class="toolbar-group review-group"><label class="sr-only" for="review-mode">${t('修订显示','Revision display')}</label><select id="review-mode"><option value="all">${t('显示修订','Show changes')}</option><option value="final">${t('最终正文','Final text')}</option></select></div><div class="toolbar-spacer"></div><button id="save-button" class="save-button" data-action="save">${icon('check')}<span>${t('正在准备','Preparing')}</span></button>${button('download','download',t('下载 DOCX','Download DOCX'),'download-button')}</div>
 <div class="document-breadcrumb"><span id="breadcrumb">${t('工作区','Workspace')}</span><span id="doc-kind">DOCX</span></div><div class="editor-stage"><div id="editor-container"></div><div id="empty-editor" class="empty-editor" hidden><div class="empty-icon">${icon('file')}</div><h1>${t('让工作从这里开始','Make room for your work')}</h1><p>${t('新建文档，或导入一份 DOCX。你可以直接编辑，也可以邀请 AI 一起审阅。','Create a document or import a DOCX. Edit it directly, then invite AI to help you review.')}</p><div>${button('new-file','plus',t('新建文档','New document'),'primary-button')}${button('import','upload',t('导入 DOCX','Import DOCX'),'secondary-button')}</div></div><div id="editor-cover" class="editor-cover"><span class="spinner"></span><strong id="cover-title">${t('正在准备文档编辑器','Preparing your document editor')}</strong><p id="cover-detail">${t('首次加载需要一点时间。文档在此浏览器中编辑。','The first load may take a moment. Your document is edited in this browser.')}</p><div id="boot-progress" class="boot-progress" role="progressbar" aria-labelledby="boot-progress-label" aria-valuemin="0" aria-valuemax="100"><span></span></div><span id="boot-progress-label" class="boot-progress-label"></span><span id="boot-progress-live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span><button id="cover-retry" class="secondary-button" data-action="reload" hidden>${t('重试','Retry')}</button></div></div><section id="import-status" class="import-status" hidden aria-labelledby="import-title"><strong id="import-title" role="status" aria-live="polite"></strong><p id="import-detail"></p><progress id="import-progress" max="100" aria-labelledby="import-title"></progress><p id="import-safety"></p><div><button class="secondary-button" data-action="cancel-import" hidden>${t('取消读取','Cancel reading')}</button><button class="secondary-button" data-action="retry-import" hidden>${t('重试','Retry')}</button><button class="secondary-button" data-action="dismiss-import" hidden>${t('关闭提示','Dismiss')}</button></div></section><div id="save-error" class="save-error" role="alert" hidden><span></span><button data-action="save">${t('重试保存','Retry save')}</button><button data-action="download">${t('下载当前稿','Download current draft')}</button></div></main>
 <div class="resize-handle right-resize" role="separator" aria-label="${t('调整 AI 面板宽度','Resize AI panel')}" aria-orientation="vertical" tabindex="0"></div>
 <aside class="ai-panel"><div class="panel-heading ai-heading"><span>${icon('spark')} AI ${t('助手','ASSISTANT')}</span><div class="ai-heading-actions">${button('history','chat',t('历史对话','History'),'subtle-button')}${button('clear-chat','plus',t('新对话','New conversation'))}</div></div><section id="conversation-history" class="conversation-history" hidden><strong>${t('本项目的历史对话','Conversations in this project')}</strong><p>${t('仅保存在此浏览器。新对话会保留旧记录。','Stored in this browser only. New conversations keep previous history.')}</p><div id="conversation-list"></div></section><div id="conversation-error" class="save-error" role="alert" hidden></div><div id="conversation-current" class="conversation-current" role="status"></div><div class="ai-context">${icon('file')}<span id="ai-document">${t('尚未打开文档','No document open')}</span><span class="context-dot"></span></div><div id="chat-messages" class="chat-messages"><div id="ai-welcome" class="ai-welcome"><span class="ai-orbit">${icon('spark')}</span><h2>${t('与你一起，把细节做好','A second pair of eyes')}</h2><p>${t('直接告诉 AI 要改什么，它会定位正文、修改内容和格式，并保存到当前文档。也可以切换为只解释和审阅。','Tell AI what to change. It can locate text, edit content and formatting, and save the current document. Switch modes for review only.')}</p><div class="prompt-cards"><button data-prompt="${t('请概括这份合同的主要义务，并指出需要我进一步确认的信息。','Summarize the main obligations and identify information I should confirm.')}"><strong>${t('梳理合同要点','Summarize key terms')}</strong><span>${t('主体、义务与重要期限','Parties, obligations and deadlines')} →</span></button><button data-prompt="${t('请审阅当前合同，说明关键风险、对应原文及修改方向。无法核实的法律依据请明确标注。','Review this contract. Explain key risks, quote the relevant text, and suggest improvements. Clearly identify unverified legal references.')}"><strong>${t('检查风险与遗漏','Review risks and omissions')}</strong><span>${t('结合原文，逐项解释','Explain each point with its source')} →</span></button></div></div></div>
 <div class="composer-wrap"><div class="ai-account-status" id="ai-account-status" role="status"></div><div id="selection-chip" class="selection-chip" hidden><span></span>${button('clear-selection','close',t('清除选区快照','Clear selection snapshot'))}</div><div class="composer-modes"><button class="mode-button active" data-action="mode-agent" id="mode-agent">${t('直接修改文档','Edit document')}</button><button class="mode-button" data-action="mode-chat" id="mode-chat">${t('解释 / 审阅','Explain / review')}</button><button class="mode-button" data-action="capture-selection" id="mode-rewrite">${t('修改选中文字','Revise selection')}</button></div><form id="chat-form"><label class="sr-only" for="chat-input">${t('给 AI 的要求','Instructions for AI')}</label><textarea id="chat-input" rows="3" placeholder="${t('例如：把付款期限改为45日，并加粗付款条款标题…','For example: change payment to 45 days and bold its heading…')}" maxlength="4000"></textarea><div class="composer-bottom"><span>${t('直接修改模式会保存文档改动','Edit mode saves document changes')}</span><button type="submit" id="send-button" class="send-button" aria-label="${t('发送','Send')}">${icon('send')}</button><button type="button" id="stop-button" class="stop-button" data-action="stop-ai" hidden>${t('停止','Stop')}</button></div></form><p class="ai-disclosure">${t('发送会提交正文；直接修改模式还可按需读取基础表格。不含页眉页脚和脚注。最多4轮 AI 调用，按实际用量使用 Credits / Pro。停止不会撤回已完成的修改或费用。','Sends body paragraphs; edit mode can also read basic tables as needed. Excludes headers, footers and footnotes. Up to 4 AI calls, billed to Credits / Pro. Stopping does not undo completed changes or charges.')}</p></div></aside></div>
 <footer class="statusbar"><span class="status-brand">AI WorkDeck</span><span id="status-text">${t('正在准备工作区','Preparing workspace')}</span><span class="footer-spacer"></span><a href="/web/UPSTREAM.md" target="_blank">${t('开源与许可','Source & licenses')}</a><span>${t('浏览器本地 · 无云同步','Browser storage · No cloud sync')}</span></footer><input type="file" id="file-input" accept=".docx" multiple hidden><div id="toast" class="toast" role="status" hidden></div><dialog id="dialog"></dialog>`;
const $=selector=>document.querySelector(selector);
const welcomeHTML=$('#chat-messages').innerHTML;
let mode='agent',toastTimer;
let activeAgentRun=null,restorableAgentRun=null;
let importing=null,importRetry=null,historyStore=null,historyBusy=false;
const errorText=e=>{
 const code=e?.name==='QuotaExceededError'?e.name:e?.code||e?.message||'';
 const map={QuotaExceededError:t('浏览器存储空间不足。请先备份重要文档，再释放空间后重试。','Browser storage is full. Back up important documents, free space, and retry.'),FILE_READ_TIMEOUT:t('读取超时。若文件在 iCloud 或其他云盘，请先下载到本机后重试。','Reading timed out. Download cloud-drive files to this device, then retry.'),FILE_READ_FAILED:t('无法读取文件，请确认文件已下载到本机且有读取权限。','Cannot read the file. Make sure it is downloaded and readable.'),DOCUMENT_TOO_LARGE:t('正文超过首版 AI 上下文限制；手动编辑和下载仍可用。','The body text exceeds this version’s AI context limit. Manual editing and download remain available.'),INCOMPLETE_DOCUMENT:t('正文未能完整读取，未发送给 AI。','The body text could not be read completely and was not sent to AI.'),VERSION_CONFLICT:t('此文档已在另一个窗口更新。当前稿仍在编辑器中，请先下载备份，再重新打开。','This document changed in another window. Download your current draft before reopening.'),STALE_PROPOSAL:t('文档或选区已变化。请重新选择文字并请求建议。','The document or selection has changed. Select the passage and request a new suggestion.'),AMBIGUOUS_SELECTION:t('无法唯一定位这段文字。请只选择同一段落中唯一的一处内容。','The passage could not be located uniquely. Select unique text within a single paragraph.'),REPLACEMENT_VERIFICATION_FAILED:t('修改回读未通过，已撤销本次修改。请核对文档后重试。','The change could not be verified and was undone. Check the document before retrying.'),DOCUMENT_CHANGED:t('读取期间文档发生变化，请稍后重试。','The document changed while reading. Please try again.'),NO_DOCUMENT:t('请先打开一份文档。','Open a document first.'),INVALID_DOCX:t('这不是可读取的 DOCX 文件。请检查文件格式或是否加密。','This is not a readable DOCX. Check its format or encryption.'),FILE_TOO_LARGE:t('首版支持 20 MB 以内的 DOCX。','This version supports DOCX files up to 20 MB.'),AI_STREAM_INTERRUPTED:t('连接中断，回复尚未完成。请核对文档改动记录和费用状态。','The connection ended before the reply completed. Check document changes and billing status before another request.'),EDITOR_BOOT_TIMEOUT:t('编辑器在十分钟内未能完成加载。请检查网络后重试。','The editor could not finish loading within ten minutes. Check your connection and retry.'),EDITOR_BOOT_FAILED:t('编辑器未能加载。请检查网络后重试。','The editor could not load. Check your connection and retry.'),EDITOR_ENGINE_FAILED:t('编辑器已停止响应。请重新加载工作区。','The editor stopped responding. Reload the workspace.'),INVALID_AI_RESPONSE:t('AI 响应格式不正确，请稍后重试。','The AI response could not be read. Please retry.')};
 return map[code]||e?.message||t('操作未完成，请重试。','The operation did not complete. Please retry.');
};
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000)}
function fail(e){console.error('Workbench operation failed:',e?.code||e?.name||'Error');toast(errorText(e))}
function setBusy(value){
 state.busy=value;$('#editor-cover').hidden=!value;
 if(!state.booting){$('#boot-progress').hidden=true;$('#boot-progress-label').hidden=true;$('#boot-progress-live').textContent='';lastBootAnnouncement='';$('#editor-cover .spinner').hidden=false}
 if(value&&!state.booting){
  $('#cover-title').textContent=!state.session?.file?t('正在打开文档','Opening your document'):t('正在处理文档','Working on your document');
  $('#cover-detail').textContent=t('完成保存后继续，确保改动留在正确的文档中。','Finishing the document operation before continuing.');
 }
 $('#app').classList.toggle('is-busy',value);
}
let lastBootAnnouncement='';
function renderBootProgress(s){
 const view=progressView(s,en),bar=$('#boot-progress'),label=$('#boot-progress-label');
 bar.hidden=view.hidden;label.hidden=view.hidden;label.textContent=view.label;
 bar.classList.toggle('indeterminate',view.percent===null);bar.setAttribute('aria-valuetext',view.label);
 if(view.percent===null)bar.removeAttribute('aria-valuenow');else bar.setAttribute('aria-valuenow',String(view.percent));
 bar.firstElementChild.style.width=view.percent===null?'':view.percent+'%';
 const announcement=s.status==='slow'?t('加载比平时慢，可以继续等待或刷新重试。','Loading is taking longer than usual. You can keep waiting or refresh to retry.'):s.status==='error'?t('编辑器未能加载，请刷新重试。','The editor could not load. Refresh to retry.'):view.percent===null?view.label:t(`主要资源加载 ${Math.floor(view.percent/10)*10}%`,`Loading main resources ${Math.floor(view.percent/10)*10}%`);
 if(announcement!==lastBootAnnouncement){$('#boot-progress-live').textContent=announcement;lastBootAnnouncement=announcement}
}
function bootState(s){
 const cover=$('#editor-cover');cover.dataset.bootStatus=s.status;
 renderBootProgress(s);
 $('#cover-retry').hidden=!['slow','error'].includes(s.status);
 if(s.status==='ready'){$('#cover-title').textContent=t('正在打开文档','Opening your document');$('#cover-detail').textContent=t('正在读取此浏览器中保存的文档。','Reading the document saved in this browser.');return}
 if(s.status==='disposed')return;
 cover.hidden=false;$('#editor-cover .spinner').hidden=true;
 const phases={resources:t('首次加载需要一点时间，资源会保存在浏览器缓存中。','The first load may take a moment. Resources are cached in your browser.'),fonts:t('正在准备字体和编辑资源。','Preparing fonts and editing resources.'),starting:t('主要资源已加载，正在初始化编辑功能。','Main resources loaded. Initializing editing features.'),opening:t('正在启动文档编辑器。','Starting the document editor.')};
 $('#cover-title').textContent=s.status==='error'?t('暂时无法打开工作区','Workspace could not open'):s.status==='slow'?t('加载比平时慢','Loading is taking longer than usual'):t('正在准备文档编辑器','Preparing your document editor');
 $('#cover-detail').textContent=s.status==='error'?errorText({code:s.error}):phases[s.phase]+(s.status==='slow'?t(' 仍在等待加载完成，可继续等待；十分钟内未完成会停止。也可刷新重试。',' Still waiting for loading to finish. You can keep waiting, up to ten minutes in total, or refresh to retry.'):'');
 $('#cover-retry').textContent=t('刷新重试','Refresh and retry');
}
function sessionState(s){
 if(s.status==='error'&&!s.file){state.activeId=null;clearSelection();render()}
 if(s.file){const i=state.files.findIndex(f=>f.id===s.file.id);if(i>=0)state.files[i]=s.file}
 const labels={dirty:t('尚未保存','Unsaved'),saving:t('正在保存','Saving'),saved:t('已保存','Saved'),loading:t('正在打开','Opening'),error:t('保存未完成','Not saved'),empty:t('无打开文档','No document')};
 $('#save-button').innerHTML=icon(s.status==='saved'?'check':'save')+`<span>${labels[s.status]||''}</span>`;
 $('#save-button').dataset.status=s.status;$('#status-text').textContent=labels[s.status]||'';
 const err=$('#save-error');err.hidden=s.status!=='error';if(s.status==='error')err.querySelector('span').textContent=errorText({message:s.error});
 const active=$('#tabs .tab.active');if(active)active.classList.toggle('dirty',s.dirty);
}
function currentFile(){return state.files.find(f=>f.id===state.activeId)}
const projectName=p=>p.id===TEMPORARY_PROJECT_ID?projectText.temporary:p.name;
function render(){
 $('[data-action="project-menu"]').disabled=state.projectId===TEMPORARY_PROJECT_ID;
 $('#project-select').innerHTML=state.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===state.projectId?'selected':''}>${esc(projectName(p))}</option>`).join('');
 $('#file-tree').innerHTML=state.files.length?`<div class="tree-project">${icon('chevron')}<span>${t('文档','Documents')}</span><small>${state.files.length}</small></div>`+state.files.map(f=>`<div class="tree-row ${f.id===state.activeId?'selected':''}" role="treeitem" aria-selected="${f.id===state.activeId}"><button class="file-open" data-file="${esc(f.id)}" title="${esc(f.name)}"><span class="doc-icon">W</span><span>${esc(f.name)}</span></button><button class="file-menu icon-button" data-file-menu="${esc(f.id)}" aria-label="${esc(t('文档操作：','Document actions: ')+f.name)}">${icon('more')}</button></div>`).join(''):`<div class="tree-empty">${t('这个项目还没有文档。','No documents in this project yet.')}<button data-action="import">${t('导入第一份文档','Import your first document')}</button></div>`;
 $('#tabs').innerHTML=state.tabs.map(id=>state.files.find(f=>f.id===id)).filter(Boolean).map(f=>`<div class="tab ${f.id===state.activeId?'active':''} ${f.id===state.activeId&&state.session?.dirty?'dirty':''}"><button role="tab" aria-selected="${f.id===state.activeId}" data-file="${esc(f.id)}"><span class="doc-icon">W</span><span>${esc(f.name)}</span><i class="dirty-dot"></i></button><button data-close="${esc(f.id)}" class="tab-close" aria-label="${esc(t('关闭 ','Close ')+f.name)}">${icon('close')}</button></div>`).join('')+button('new-file','plus',t('新建文档','New document'));
 const f=currentFile(),project=state.projects.find(p=>p.id===state.projectId);
 $('#breadcrumb').textContent=project?projectName(project)+(f?' / '+f.name:''):t('工作区','Workspace');$('#ai-document').textContent=f?.name||t('尚未打开文档','No document open');$('#doc-kind').hidden=!f;$('#empty-editor').hidden=!!f;
 $('.document-toolbar').classList.toggle('disabled',!f);renderSelection();
}
async function rememberTabs(){await state.store.setSetting('tabs:'+state.projectId,{tabs:state.tabs,activeId:state.activeId});await state.store.setSetting('activeProject',state.projectId)}
async function openFile(id){if(activeAgentRun)return;if(state.busy||id===state.activeId)return;const f=await state.store.getFile(id);if(!f)return;await state.session.show(f);state.activeId=id;if(!state.tabs.includes(id))state.tabs.push(id);clearSelection();render();await rememberTabs()}
async function closeFile(id){if(activeAgentRun)return;if(state.busy)return;if(id===state.activeId){const others=state.tabs.filter(x=>x!==id);const next=others.at(-1);await state.session.show(next?await state.store.getFile(next):null);state.activeId=next||null;clearSelection()}state.tabs=state.tabs.filter(x=>x!==id);render();await rememberTabs()}
async function selectProject(id){if(state.busy||importing||historyBusy)return;if(state.aiRunning)throw Error(t('请先停止当前 AI 请求，再切换项目。','Stop the current AI request before switching projects.'));await state.session.show(null);importRetry=null;$('#import-status').hidden=true;state.projectId=id;state.files=await state.store.listFiles(id);await loadMessages();const remembered=await state.store.getSetting('tabs:'+id);state.tabs=(remembered?.tabs||[]).filter(id=>state.files.some(f=>f.id===id));state.activeId=null;render();const target=state.tabs.includes(remembered?.activeId)?remembered.activeId:state.tabs.at(-1);if(target)await openFile(target);await rememberTabs()}
function modal({title,description='',value=null,confirm=t('确定','Confirm'),danger=false}){
 const dialog=$('#dialog');dialog.innerHTML=`<form method="dialog"><h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}${value!==null?`<label for="dialog-input">${t('名称','Name')}</label><input id="dialog-input" name="name" maxlength="150" value="${esc(value)}" required>`:''}<div class="dialog-actions"><button value="cancel" class="secondary-button">${t('取消','Cancel')}</button><button value="ok" class="${danger?'danger-button':'primary-button'}">${esc(confirm)}</button></div></form>`;dialog.showModal();if(value!==null){$('#dialog-input').focus();$('#dialog-input').select()}
 return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'?(value!==null?$('#dialog-input').value:true):null),{once:true})});
}
async function newProject(){const name=await modal({title:t('新建项目','New project'),value:t('未命名项目','Untitled project')});if(!name)return;const p=await state.store.createProject(name);state.projects.push(p);await selectProject(p.id)}
async function newFile(){const name=await modal({title:t('新建文档','New document'),value:t('未命名文档.docx','Untitled document.docx')});if(!name)return;const f=await state.store.createFile({projectId:state.projectId,name:docxName(name),bytes:await createDocument([''])});state.files.push(f);await openFile(f.id)}
function docxName(name){return /\.docx$/i.test(name.trim())?name.trim():name.trim()+'.docx'}
function importStatus(phase,input,index,total,percent){
 const names={reading:t('正在读取本机文件','Reading local file'),validating:t('正在检查 DOCX','Checking DOCX'),saving:t('正在保存到此浏览器','Saving in this browser'),opening:t('正在打开文档','Opening document')};
 const box=$('#import-status');box.hidden=false;box.dataset.phase=phase;box.setAttribute('aria-busy','true');
 $('#import-title').textContent=`${names[phase]} · ${index+1}/${total}`;
 $('#import-detail').textContent=input.name+(percent===undefined?'':` · ${percent}%`);
 const bar=$('#import-progress');bar.hidden=false;if(percent===undefined)bar.removeAttribute('value');else bar.value=percent;
 $('#import-safety').textContent=t('在此浏览器本地导入，不会上传原文件。原文件保持不变。','Imported locally in this browser; the original file is not uploaded or changed.');
 for(const action of ['retry-import','dismiss-import'])$(`[data-action="${action}"]`).hidden=true;
 $('[data-action="cancel-import"]').hidden=!['reading','validating'].includes(phase);
}
async function importFiles(files,retrySaved=null){
 if(!files.length)return;
 if(importing||state.busy||activeAgentRun){toast(t('当前操作完成后，请重新选择文件。','Please select files again after the current operation finishes.'));return}
 const job={controller:new AbortController(),saved:retrySaved};importing=job;importRetry=null;
 $('#file-input').value='';$('#project-select').disabled=true;$('#editor-container').inert=true;
 let index=0;const started=Date.now();
 const slow=setInterval(()=>{if(Date.now()-started>10000)$('#import-safety').textContent=t('仍在处理，请保持此页面打开。云盘文件可能需要先下载到本机；原文件不会被更改。','Still working. Keep this page open. Cloud-drive files may need downloading first; the original stays unchanged.')},1000);
 try{
  for(;index<files.length;index++){
   const input=files[index];
   importStatus('reading',input,index,files.length,0);
   if(!/\.docx$/i.test(input.name))throw Error('INVALID_DOCX');
   if(input.size>20*1024*1024)throw Error('FILE_TOO_LARGE');
   if(!job.saved){
    const bytes=await readLocalFile(input,{signal:job.controller.signal,onProgress:p=>importStatus('reading',input,index,files.length,p)});
    importStatus('validating',input,index,files.length);
    await validateDocx(bytes);job.controller.signal.throwIfAborted();
    importStatus('saving',input,index,files.length);
    job.saved=await state.store.createFile({projectId:state.projectId,name:input.name,bytes});
    state.files.push(job.saved);render();
   }
   importStatus('opening',input,index,files.length);
   await openFile(job.saved.id);job.saved=null;
  }
  $('#import-status').dataset.phase='complete';$('#import-title').textContent=t(`已导入 ${files.length} 份文档`,`Imported ${files.length} document(s)`);
  $('#import-detail').textContent=t('已保存到此浏览器，文档已打开，可以开始编辑。','Saved in this browser. The document is open and ready to edit.');
 }catch(e){
  if(!state.session.file){state.activeId=null;render()}
  $('#import-status').dataset.phase='error';$('#import-title').textContent=e.name==='AbortError'?t('已取消导入','Import cancelled'):t('导入未完成','Import did not finish');
  $('#import-detail').textContent=files[index].name+' · '+(e.name==='AbortError'?t('尚未保存当前文件，可以重新选择。','The current file was not saved. You can select it again.'):errorText(e));
  if(e.name!=='AbortError'){importRetry={files:files.slice(index),saved:job.saved};$('[data-action="retry-import"]').hidden=false}
  $('#import-safety').textContent=job.saved?t('文件已保存在左侧列表。重试只会重新打开，不会重复导入。','The file is saved in the file list. Retry opens it without importing a duplicate.'):t(`原文件未改变。此前已导入 ${index} 份文档保留在列表中。`,`Your original is unchanged. ${index} earlier imported document(s) remain in the file list.`);
 }finally{
  clearInterval(slow);importing=null;$('#import-status').setAttribute('aria-busy','false');$('#import-progress').hidden=true;
  $('[data-action="cancel-import"]').hidden=true;$('[data-action="dismiss-import"]').hidden=false;
  $('#project-select').disabled=state.aiRunning;$('#editor-container').inert=false;render();
 }
}
async function fileMenu(id){const f=state.files.find(f=>f.id===id);if(!f)return;const dialog=$('#dialog');dialog.innerHTML=`<h2>${esc(f.name)}</h2><div class="action-menu"><button data-menu-choice="rename">${t('重命名','Rename')}</button><button data-menu-choice="download">${t('下载 DOCX','Download DOCX')}</button><button data-menu-choice="delete" class="danger-text">${t('删除文档','Delete document')}</button></div><form method="dialog"><button class="secondary-button">${t('取消','Cancel')}</button></form>`;dialog.showModal();const choice=await new Promise(resolve=>{dialog.addEventListener('click',function listener(e){const b=e.target.closest('[data-menu-choice]');if(b){dialog.removeEventListener('click',listener);dialog.close();resolve(b.dataset.menuChoice)}},{once:false});dialog.addEventListener('close',()=>resolve(null),{once:true})});
 if(choice==='rename'){const name=await modal({title:t('重命名文档','Rename document'),value:f.name});if(name){const updated=await state.store.renameFile(id,docxName(name));state.files[state.files.findIndex(f=>f.id===id)]=updated;if(state.session.file?.id===id)state.session.file.name=updated.name;render()}}
 if(choice==='download'){if(id===state.activeId)await download();else downloadFile(f.name,(await state.store.getFile(id)).bytes)}
 if(choice==='delete'&&await modal({title:t('删除文档？','Delete this document?'),description:t('此操作会删除本浏览器中的文档。建议先下载备份。','This removes the document from this browser. Download a backup first.'),confirm:t('删除','Delete'),danger:true})){await closeFile(id);await state.store.deleteFile(id);state.files=state.files.filter(f=>f.id!==id);render()}
}
async function copyProject(){
 if(state.aiRunning||historyBusy||importing)return;
 const sourceId=state.projectId;
 const projects=(await state.store.listProjects()).filter(p=>p.id!==sourceId&&p.id!==TEMPORARY_PROJECT_ID);
 if(!projects.length){toast(projectText.noProjects);return}
 const conversations=historyStore.data(sourceId).items.filter(c=>c.messages.length);
 const dialog=$('#dialog');dialog.returnValue='';
 const options=(items,kind,title)=>`<fieldset><legend>${esc(title)}</legend>${items.map(item=>`<label class="copy-item"><input type="checkbox" name="${kind}" value="${esc(item.id)}"><span>${esc(item.name||item.title||item.messages?.find(m=>m.role==='user')?.content?.slice(0,60)||projectText.untitled)}</span></label>`).join('')}</fieldset>`;
 dialog.innerHTML=`<form method="dialog" class="copy-form" dir="${requestedLocale==='ar'?'rtl':'ltr'}"><h2>${esc(projectText.copy)}</h2><p>${esc(projectText.description)}</p><label for="copy-target">${esc(projectText.target)}</label><select id="copy-target">${projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><div class="copy-items">${options(state.files,'file',projectText.files)}${options(conversations,'conversation',projectText.conversations)}</div><p id="copy-status" role="status" aria-live="polite"></p><div class="dialog-actions"><button value="cancel" class="secondary-button">${esc(projectText.cancel)}</button><button value="ok" class="primary-button">${esc(projectText.copy)}</button></div></form>`;
 dialog.showModal();
 let copying=false;
 const preventCancel=e=>{if(copying)e.preventDefault()};dialog.addEventListener('cancel',preventCancel);
 dialog.addEventListener('close',()=>dialog.removeEventListener('cancel',preventCancel),{once:true});
 dialog.querySelector('form').addEventListener('submit',async e=>{
  if(e.submitter?.value!=='ok')return;
  e.preventDefault();if(copying)return;
  const fileIds=[...dialog.querySelectorAll('[name="file"]:checked')].map(e=>e.value);
  const conversationIds=[...dialog.querySelectorAll('[name="conversation"]:checked')].map(e=>e.value);
  if(!fileIds.length&&!conversationIds.length){$('#copy-status').textContent=projectText.choose;return}
  const targetId=$('#copy-target').value;
  copying=true;historyBusy=true;$('#editor-container').inert=true;
  dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);$('#copy-status').textContent=projectText.busy;
  try{
   await state.session.save();await saveMessages();
   await state.store.copyToProject({sourceId,targetId,fileIds,conversationIds});
   dialog.close();toast(projectText.done);
  }catch{ $('#copy-status').textContent=projectText.failed }
  finally{copying=false;historyBusy=false;$('#editor-container').inert=false;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=false)}
 });
}
async function projectMenu(){if(state.projectId===TEMPORARY_PROJECT_ID)return;const p=state.projects.find(p=>p.id===state.projectId);const name=await modal({title:t('重命名项目','Rename project'),value:p.name});if(name){const updated=await state.store.renameProject(p.id,name);state.projects[state.projects.findIndex(x=>x.id===p.id)]=updated;render()}}
async function download(){const output=await state.session.exportBytes();downloadFile(output.name,output.bytes);toast(t('已导出当前文档','Current document exported'))}
function clearSelection(){setMode('agent')}
function setMode(next){if(state.aiRunning)return;state.selection=null;mode=next;renderSelection();renderCapabilities()}
function renderSelection(){const selected=mode==='rewrite'&&state.selection;$('#selection-chip').hidden=!selected;if(selected)$('#selection-chip span').textContent=state.selection.text.slice(0,100);$('#mode-agent').classList.toggle('active',mode==='agent');$('#mode-chat').classList.toggle('active',mode==='chat');$('#mode-rewrite').classList.toggle('active',!!selected)}
async function captureSelection(){const snapshot=await state.session.snapshot();if(!snapshot.selection.text.trim()){toast(t('请先在文档中选中要修改的一段文字。','Select a passage in the document first.'));return}if(countLiteralMatches(snapshot.document.text,snapshot.selection.text)!==1){toast(t('这段文字在文档中不是唯一匹配。请扩大或调整选区。','The text is not unique in this document. Adjust the selection.'));return}state.selection={...snapshot.selection,fileId:snapshot.document.id,version:snapshot.document.version};mode='rewrite';renderSelection();renderCapabilities();$('#chat-input').focus()}
function renderMessages(){
 const list=$('#chat-messages');let body=state.messages.map((m,i)=>`<article class="chat-message ${m.role}" data-message-index="${i}"><div class="message-meta"><span>${m.role==='user'?t('你','You'):'AI WorkDeck'}</span><small>${esc(m.fileName||'')}</small></div><div class="message-body">${esc(m.content||'')}${m.pending?'<span class="streaming-dot"></span>':''}</div>${m.error?`<div class="message-error">${esc(m.error)}${m.auth?` <a href="${esc($('#account-link').getAttribute('href'))}">${t('登录后重试','Sign in and retry')} →</a>`:''}</div>`:''}${m.proposal?`<div class="proposal-card"><div class="proposal-label">${icon('spark')} ${m.copiedHistory?esc(projectText.readOnly):t('修改建议 · 待你确认','Suggested revision · Your approval')}</div><div class="proposal-before">${esc(m.proposal.original)}</div><div class="proposal-after">${esc(m.proposal.replacement)}</div>${m.proposal.explanation?`<p>${esc(m.proposal.explanation)}</p>`:''}<button class="primary-button" data-apply="${i}" ${m.applied||m.pending||m.copiedHistory?'disabled':''}>${icon(m.applied?'check':'spark')}${m.copiedHistory?esc(projectText.readOnly):m.applied?t('已应用并保存','Applied and saved'):t('应用为修订','Apply as tracked change')}</button></div>`:''}${m.agent?agentHTML(m):''}${m.role==='assistant'&&!m.agent?receiptHTML(m):''}</article>`).join('');
 if(state.messages.length){list.innerHTML=body;list.scrollTop=list.scrollHeight}else{list.innerHTML=welcomeHTML}
 $('#send-button').hidden=state.aiRunning;$('#stop-button').hidden=!state.aiRunning;$('#chat-input').disabled=state.aiRunning;
 for(const node of document.querySelectorAll('.composer-modes button,#project-select'))node.disabled=state.aiRunning||historyBusy||!!importing;
 for(const node of document.querySelectorAll('.document-toolbar button,.document-toolbar select'))node.disabled=!!activeAgentRun;
}
const money=(cents,currency)=>Number.isFinite(cents)&&typeof currency==='string'?`${currency} ${(cents/100).toFixed(2)}`:t('金额待核对','Amount unverified');
const reasonText=code=>({unauthorized:t('登录后使用 AI；编辑和下载无需登录。','Sign in for AI. Editing and download work without sign-in.'),no_credits:t('可用额度不足。请在账户页查看 Credits / Pro。','Insufficient funds. Check Credits / Pro in your account.'),busy:t('已有请求处理中或待结算，请先查看状态。','A request is processing or awaiting settlement. Check its status.'),reconciliation_paused:t('AI 暂停，等待异常费用核对。编辑和下载可继续。','AI paused for billing reconciliation. Editing and download remain available.'),ai_unavailable:t('AI 暂未启用。编辑和下载可继续。','AI is unavailable. Editing and download remain available.')})[code]||t('AI 状态暂不可用，请刷新状态后重试。','AI status unavailable. Refresh its status to try again.');
function renderCapabilities(){
 const c=state.capabilities,box=$('#ai-account-status'),enabled=mode==='agent'?c?.agentEnabled:c?.aiEnabled;
 const price=mode==='agent'?t('直接修改最多4轮；本次合计最高预留 ','Edit mode uses up to 4 calls; maximum total reservation: ')+money(c?.agent?.maxRunChargeCents,c?.currency):t('单次最高预留 ','Maximum reservation per request: ')+money(c?.maxChargeCents,c?.currency);
 box.innerHTML=`<span>${esc(enabled?t('发送即同意按实际用量计费；','Sending authorizes usage billing; ')+price:reasonText(mode==='agent'?c?.agentReason:c?.reason))}</span> ${!c?.authenticated?`<a href="${esc($('#account-link').getAttribute('href'))}">${t('登录','Sign in')}</a>`:''}<button type="button" data-action="refresh-ai">${t('刷新状态','Refresh status')}</button>${c?.activeRequest?`<button type="button" data-action="check-active">${t('查看未决请求','Check pending request')}</button>`:''}`;
 $('#send-button').disabled=!enabled;
}
async function refreshCapabilities(){
 try{const r=await fetch('/api/web/capabilities?lang='+language,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('CAPABILITIES_UNAVAILABLE');const c=await r.json();state.capabilities=c;
  if(typeof c.loginUrl==='string'){const url=new URL(c.loginUrl,location.origin);if(url.origin===location.origin)$('#account-link').href=url.pathname+url.search}
 }catch{state.capabilities=null}renderCapabilities();
}
function receiptHTML(m){
 if(!m.requestId)return '';const r=m.receipt;
 const names={reserved:t('已预留，等待处理','Reserved; waiting'),submitted:t('处理中，费用待核对','Processing; charge unverified'),usage_pending:t('用量待核对；15 分钟后可刷新结算状态','Usage pending; refresh status after 15 minutes'),settled:t('已结算','Settled'),released:t('预留已释放','Reservation released'),refunded_pending:t('预留已退回，AI 暂停待核对','Reservation refunded; AI paused for reconciliation')};
 const status=r?names[r.state]||t('状态待核对','Status unverified'):t('费用状态待核对','Billing status unverified');
 const amount=r&&Number.isFinite(r.chargedCents)?money(r.chargedCents,r.currency):t('金额待核对','Amount unverified');
 return `<div class="request-receipt" data-receipt="${esc(m.requestId)}"><span>${esc(status)} · ${esc(amount)}</span>${r&&Number.isFinite(r.reservedCents)?`<small>${t('预留','Reserved')}: ${esc(money(r.reservedCents,r.currency))}</small>`:''}<small>${t('请求','Request')}: ${esc(m.requestId)}</small><button type="button" data-check-request="${esc(m.requestId)}">${t('刷新费用状态','Refresh billing status')}</button>${m.receiptError?`<small>${esc(m.receiptError)}</small>`:''}</div>`;
}
async function checkReceipt(id){
 const projectId=state.projectId,conversationId=historyStore.data(projectId).activeId,messages=state.messages;const owner=messages.find(m=>m.role==='assistant'&&(m.requestId===id||m.agent?.requests.some(r=>r.requestId===id)));const m=owner?.agent?owner.agent.requests.find(r=>r.requestId===id):owner;if(!m)return;
 try{const r=await fetch('/api/web/requests/'+encodeURIComponent(id)+'?lang='+language,{credentials:'same-origin',cache:'no-store'});const data=await r.json();if(!r.ok||data.requestId!==id)throw Error(data.error?.message||t('费用状态待核对','Billing status unverified'));m.receipt=data;delete m.receiptError}catch(e){m.receiptError=e.message}
 const box=document.querySelector(`[data-receipt="${id}"]`);if(box)box.outerHTML=receiptHTML(m);if(owner?.agent&&state.messages===messages)renderMessages();await historyStore.updateReceipt(projectId,conversationId,id,m);
}
async function checkActiveRequest(){const id=state.capabilities?.activeRequest?.requestId;if(!id)return;let m=state.messages.find(m=>(m.requestId===id||m.agent?.requests.some(r=>r.requestId===id))&&m.role==='assistant');if(!m){m={role:'assistant',content:t('账户中有未决 AI 请求。','Your account has a pending AI request.'),requestId:id};state.messages.push(m);renderMessages();await saveMessages()}await checkReceipt(id);await refreshCapabilities()}
async function saveMessages(){await historyStore.save(state.projectId,state.messages);renderHistory()}
async function loadMessages(){state.messages=await historyStore.load(state.projectId);restorableAgentRun=null;renderMessages();renderHistory()}
function renderHistory(){
 if(!historyStore)return;
 const data=historyStore.data(state.projectId);if(!data)return;
 const title=c=>c.title||c.messages.find(m=>m.role==='user')?.content?.slice(0,60)||t('新对话','New conversation');
 $('#conversation-current').textContent=title(data.items.find(c=>c.id===data.activeId)||{messages:[]});
 $('#conversation-list').innerHTML=[...data.items].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(c=>`<div class="conversation-row ${c.id===data.activeId?'selected':''}"><button data-conversation="${esc(c.id)}" aria-current="${c.id===data.activeId?'true':'false'}"><strong>${esc(title(c))}</strong><small>${esc(new Date(c.updatedAt).toLocaleString(en?'en-US':'zh-CN'))} · ${c.messages.length} ${t('条消息','messages')}</small><small>${esc([...new Set(c.messages.map(m=>m.fileName).filter(Boolean))].join(' · '))}</small></button><button class="icon-button" data-rename-conversation="${esc(c.id)}" aria-label="${t('重命名对话','Rename conversation')}">${icon('more')}</button><button class="icon-button" data-delete-conversation="${esc(c.id)}" aria-label="${t('删除对话','Delete conversation')}">${icon('trash')}</button></div>`).join('');
}
async function conversationAction(kind,id){
 if(state.aiRunning){toast(t('请先停止当前 AI 请求，再管理对话。','Stop the current AI request before managing conversations.'));return}if(historyBusy)return;
 const projectId=state.projectId;
 if(kind==='delete'&&!await modal({title:t('删除这段对话？','Delete this conversation?'),description:t('只删除此浏览器中的对话记录，不会删除文档或撤销已完成的修改、费用。','Deletes this browser’s conversation only. Documents, completed edits and charges remain.'),confirm:t('删除对话','Delete conversation'),danger:true}))return;
 let title;
 if(kind==='rename'){title=await modal({title:t('重命名对话','Rename conversation'),value:historyStore.data(projectId).items.find(c=>c.id===id)?.title||''});if(!title)return}
 if(state.aiRunning||historyBusy||state.projectId!==projectId)return;
 historyBusy=true;$('#project-select').disabled=true;$('#conversation-error').hidden=true;$('#conversation-current').textContent=t('正在保存对话…','Saving conversation…');
 try{await saveMessages();state.messages=await historyStore.change(projectId,kind,id,title);restorableAgentRun=null;renderMessages();renderHistory()}
 catch(e){$('#conversation-error').hidden=false;$('#conversation-error').textContent=t('对话未能保存，旧记录已保留。请重试刚才的操作。','Conversation could not be saved. Previous history is retained. Please retry the action.')+' '+errorText(e)}
 finally{historyBusy=false;$('#project-select').disabled=state.aiRunning||!!importing;renderHistory()}
}

function agentHTML(m){
 const run=m.agent;
 const labels={running:t('正在处理','Working'),completed:t('已完成本轮','Run finished'),failed:t('本轮已中止，请核对下方结果','Run halted; check results below'),stopped:t('已停止；已完成的改动仍保留','Stopped; completed changes remain'),interrupted:t('连接已结束；不会自动继续修改','Connection ended; changes will not resume automatically')};
 const tools={doc_find_text:t('定位文字','Find text'),doc_read_tables:t('读取表格','Read tables'),doc_apply_edits:t('修改文档','Edit document')};
 const statuses={executing:t('执行中','Working'),verified:t('回读通过','Readback verified'),failed:t('未完成','Incomplete'),unknown:t('结果待核对，请检查文档','Outcome unknown; check document'),not_started:t('未执行','Not started')};
 const settled=run.requests.filter(r=>r.receipt?.state==='settled'&&Number.isSafeInteger(r.receipt.chargedCents));
 const currencies=new Set(settled.map(r=>r.receipt.currency));
 const known=currencies.size===1?money(settled.reduce((sum,r)=>sum+r.receipt.chargedCents,0),settled[0].receipt.currency):t('金额待核对','Amount unverified');
 const unknown=run.requests.some(r=>!['settled','released'].includes(r.receipt?.state));
 return `<section class="agent-record" aria-label="${t('文档操作记录','Document operation log')}"><strong>${esc(labels[run.status]||labels.interrupted)}</strong>${run.steps.length?`<ol>${run.steps.map(step=>`<li><span>${esc(tools[step.tool]||step.tool)}${step.editCount?` · ${step.editCount} ${t('项','edits')}`:''}</span><small>${esc(statuses[step.status]||statuses.unknown)}${step.result?.saved?` · ${t('已保存','Saved')}`:''}${step.result?.partial?` · ${t('仅部分完成','Partially completed')}`:''}</small></li>`).join('')}</ol>`:`<p>${m.pending?t('正在读取文档并生成操作…','Reading the document and planning changes…'):t('未执行文档操作。','No document tool was executed.')}</p>`}${restorableAgentRun===run.runId&&!m.pending&&!m.restored&&!m.copiedHistory?`<button type="button" class="secondary-button" data-restore-agent="${esc(run.runId)}">${t('撤销本轮文档改动','Undo this run’s document changes')}</button><small>${t('仅当文档此后未被修改时可恢复；不退回已使用额度。','Available only while the document has not changed since this run; does not refund AI usage.')}</small>`:''}${m.restored?`<p>${t('已恢复本轮开始前的文档并保存。','Document restored to its state before this run and saved.')}</p>`:''}${run.requests.length?`<details class="agent-billing"><summary>${t('费用','Billing')} · ${settled.length?t('已核实合计 ','Verified total ')+esc(known):t('尚无已结算费用','No settled charges yet')}${unknown?' · '+t('部分费用待核对','Some charges unverified'):''}</summary>${run.requests.map(receiptHTML).join('')}</details>`:''}</section>`;
}
function agentFailure(record){
 if(record.status==='stopped')return t('已停止继续调用；请核对已经完成或待核实的文档操作。','Further calls stopped. Check completed or unverified document operations.');
 if(record.status==='completed')return null;
 const code=record.error?.code;
 const known={
  STALE_AGENT_RUN:t('文档已变化，本轮停止。请核对当前内容后重新发起。','The document changed. This run stopped; check its contents before starting again.'),
  AGENT_TIMEOUT:t('本轮处理超时。请先核对文档与费用，可继续发起下一轮修改。','This run timed out. Check the document and billing before continuing.'),
  AGENT_OPERATION_FAILED:t('部分操作未能确认完成，本轮停止。请检查文档。','An operation could not be verified. This run stopped; check the document.'),
  AGENT_EDIT_LIMIT:t('单轮自动修改已达上限（24 处）。已完成部分已保存，可继续发送指令完成剩余部分。','Reached the per-run edit limit (24 edits). Completed changes are saved; send another prompt to continue.'),
  AGENT_RUN_CHARGE_LIMIT:t('已达到单轮费用安全上限。已完成部分已保存，可继续发送指令完成剩余部分。','Reached the per-run billing safety limit. Completed changes are saved; send another prompt to continue.'),
  DOCUMENT_TOO_LARGE:t('当前文档内容超出单次 AI 处理上限，请精简或分节处理。','The document exceeds the single-run size limit; shorten or split it.'),
  rate_limited:t('请求过于频繁，自动重试未完成。请稍候几秒再试。','Too many requests in a short window; wait a few seconds and try again.'),
  invalid_tool_call:t('AI 返回的修改指令格式异常且自动重试未成功。已完成的改动已保存，可直接再试一次。','The AI returned a malformed edit instruction after automatic retries. Completed changes are saved; please try again.'),
  upstream_failed:t('AI 服务响应中断且自动重试未成功。已完成的改动已保存，请稍后再试。','The AI service interrupted after automatic retries. Completed changes are saved; please try again.'),
  price_changed:t('报价已变化，后续调用未发送。请刷新额度状态。','The quote changed; no further call was sent. Refresh billing status.')
 };
 return known[code]||(['no_credits','busy','unauthorized','reconciliation_paused','ai_unavailable'].includes(code)?reasonText(code):t('本轮未完成。请先检查操作记录、文档和费用；不会自动重试。','This run did not finish. Check the operation log, document and billing first; it will not retry automatically.'));
}
async function sendAgent(message){
 if(state.aiRunning||state.busy||importing||historyBusy||!message.trim())return;
 if(!state.capabilities?.agentEnabled){await refreshCapabilities();if(!state.capabilities?.agentEnabled){toast(reasonText(state.capabilities?.agentReason));return}}
 const capabilities=structuredClone(state.capabilities),controller=new AbortController();
 state.aiRunning=true;state.controller=controller;activeAgentRun='preparing';restorableAgentRun=null;renderMessages();
 let initial,reply;
 try{
  initial=await state.session.beginAgent();activeAgentRun=initial.runId;
  if(controller.signal.aborted)return;
  const history=state.messages.filter(m=>m.fileId===initial.document.id&&!m.error&&!m.proposal&&!m.pending).slice(-8).filter(m=>m.content?.length<=4000).map(m=>({role:m.role,content:m.content}));
  reply={role:'assistant',content:'',pending:true,fileId:initial.document.id,fileName:initial.document.name};
  state.messages.push({role:'user',content:message.trim(),fileId:initial.document.id,fileName:initial.document.name},reply);
  await saveMessages();$('#chat-input').value='';renderMessages();
  const record=await runDocumentAgent({initial,instruction:message.trim(),language,history,capabilities,signal:controller.signal,
   execute:(...args)=>state.session.executeAgentTool(...args),refreshContext:(id,opts)=>state.session.agentContext(id,opts),
   onUpdate:async record=>{reply.agent=structuredClone(record);reply.content=record.text;await saveMessages();renderMessages()}
  });
  reply.agent=record;reply.error=agentFailure(record);reply.auth=record.error?.status===401;
  if(record.steps.some(s=>s.editCount>0&&s.result?.saved)&&!record.steps.some(s=>s.status==='unknown'||s.result?.verification==='unknown'))restorableAgentRun=record.runId;
 }catch(e){if(reply)reply.error=errorText(e);else fail(e)}
 finally{
  if(initial)state.session.endAgent(initial.runId);
  activeAgentRun=null;state.aiRunning=false;state.controller=null;
  if(reply)reply.pending=false;renderMessages();await saveMessages().catch(fail);
  for(const request of reply?.agent?.requests||[])if(!request.receipt)await checkReceipt(request.requestId).catch(fail);
  await refreshCapabilities();
 }
}
async function restoreAgent(id){
 if(state.aiRunning||state.busy||restorableAgentRun!==id)return;
 const m=state.messages.find(m=>m.agent?.runId===id);if(!m||m.copiedHistory)return;
 if(!await modal({title:t('撤销本轮文档改动？','Undo this run’s changes?'),description:t('恢复到本轮 AI 开始前的文档。若此后已修改文档，恢复会被拒绝，避免覆盖你的改动。','Restore the document from before this AI run. If it has changed since, restoration is refused to protect your edits.'),confirm:t('恢复文档','Restore document')}))return;
 if(state.aiRunning||state.busy||restorableAgentRun!==id)return;
 await state.session.restoreAgent(id);m.restored=true;restorableAgentRun=null;renderMessages();await saveMessages();
}

async function sendChat(message){
 if(mode==='agent')return sendAgent(message);
 if(state.aiRunning||state.busy||importing||historyBusy||!message.trim())return;
 if(!state.capabilities?.aiEnabled){await refreshCapabilities();if(!state.capabilities?.aiEnabled){toast(reasonText(state.capabilities?.reason));return}}
 state.aiRunning=true;const controller=new AbortController();state.controller=controller;renderMessages();let snapshot;
 try{snapshot=await state.session.snapshot()}catch(e){state.aiRunning=false;state.controller=null;renderMessages();throw e}
 if(controller.signal.aborted){state.aiRunning=false;state.controller=null;renderMessages();toast(t('已停止，尚未发送给 AI。','Stopped before sending to AI.'));return}
 const requestId=crypto.randomUUID();const selection=mode==='rewrite'?state.selection:null;
 if(mode==='rewrite'&&(!selection||selection.fileId!==snapshot.document.id||selection.version!==snapshot.document.version)){state.aiRunning=false;clearSelection();renderMessages();throw Error('STALE_PROPOSAL')}
 const payload={requestId,language,mode,message:message.trim(),document:snapshot.document,history:state.messages.filter(m=>m.fileId===snapshot.document.id&&!m.error&&!m.proposal).slice(-8).filter(m=>m.content?.length<=4000).map(m=>({role:m.role,content:m.content})),...(selection?{selection:{text:selection.text}}:{})};
 if(new TextEncoder().encode(JSON.stringify(payload)).length>48000){state.aiRunning=false;renderMessages();throw Error('DOCUMENT_TOO_LARGE')}
 const user={role:'user',content:message.trim(),fileId:snapshot.document.id,fileName:snapshot.document.name};const reply={role:'assistant',content:'',pending:true,fileId:snapshot.document.id,fileName:snapshot.document.name,requestId,selectionText:selection?.text};state.messages.push(user,reply);try{await saveMessages()}catch(e){state.messages.splice(-2);state.aiRunning=false;renderMessages();throw e}state.aiRunning=true;$('#chat-input').value='';renderMessages();
 try{
  await streamChat(payload,{signal:controller.signal,onEvent:(event,data)=>{
   if(event==='delta'&&typeof data.text==='string'){reply.content+=data.text;const node=document.querySelector(`[data-message-index="${state.messages.indexOf(reply)}"] .message-body`);if(node){const atEnd=$('#chat-messages').scrollHeight-$('#chat-messages').scrollTop-$('#chat-messages').clientHeight<80;if(!node.firstChild||node.firstChild.nodeType!==Node.TEXT_NODE)node.prepend(document.createTextNode(''));node.firstChild.textContent=reply.content;if(atEnd)$('#chat-messages').scrollTop=$('#chat-messages').scrollHeight}return}
   if(event==='proposal'){
    if(payload.mode!=='rewrite')throw Error('INVALID_AI_RESPONSE');
    if(data.requestId!==requestId||!validateProposal(data,{fileId:snapshot.document.id,version:snapshot.document.version,text:snapshot.document.text,selectionText:selection?.text}).ok)throw Error('INVALID_AI_RESPONSE');
    reply.proposal=data;
   }
   if(event==='usage'){if(data.requestId!==requestId)throw Error('INVALID_AI_RESPONSE');reply.receipt=data;const box=document.querySelector(`[data-receipt="${requestId}"]`);if(box)box.outerHTML=receiptHTML(reply);return}
   if(event==='done'&&data.requestId!==requestId)throw Error('INVALID_AI_RESPONSE');
   renderMessages();
  }});
 }catch(e){delete reply.proposal;reply.error=e.name==='AbortError'?t('已停止，未应用修改。','Stopped. No changes were applied.'):errorText(e);reply.auth=e.status===401||/auth|unauth|login/i.test(e.code||'')}
 finally{reply.pending=false;state.aiRunning=false;state.controller=null;renderMessages();await saveMessages().catch(fail);if(!reply.receipt)await checkReceipt(requestId).catch(fail);await refreshCapabilities()}
}
async function applySuggestion(index){const m=state.messages[index];if(!m?.proposal||m.copiedHistory||m.applied||m.pending||state.busy)return;await state.session.apply(m.proposal,m.selectionText);m.applied=true;clearSelection();renderMessages();await saveMessages();toast(t('修订已应用并保存，可在文档中核对。','Tracked change applied and saved. Review it in the document.'))}
const actions={
 'refresh-ai':refreshCapabilities,'check-active':checkActiveRequest,
 'copy-project':copyProject,'new-project':newProject,'new-file':newFile,import:()=>$('#file-input').click(),'project-menu':projectMenu,download,save:()=>state.session.save(),undo:()=>state.session.command('undo',{steps:1}),redo:()=>state.session.command('redo',{steps:1}),bold:()=>state.session.command('ui_command',{name:'bold'}),italic:()=>state.session.command('ui_command',{name:'italic'}),underline:()=>state.session.command('ui_command',{name:'underline'}),'capture-selection':captureSelection,'clear-selection':clearSelection,'mode-chat':()=>setMode('chat'),'mode-agent':()=>setMode('agent'),'stop-ai':()=>{state.controller?.abort();if(activeAgentRun)state.session.endAgent(activeAgentRun)},reload:()=>location.reload(),
 'toggle-files':()=>document.body.classList.toggle('files-hidden'),'toggle-ai':()=>document.body.classList.toggle('ai-hidden'),
 'clear-chat':()=>conversationAction('new'),history:()=>{$('#conversation-history').hidden=!$('#conversation-history').hidden;renderHistory()},
 'cancel-import':()=>importing?.controller.abort(),'retry-import':()=>{if(importRetry)return importFiles(importRetry.files,importRetry.saved)},'dismiss-import':()=>{$('#import-status').hidden=true;importRetry=null},
 persist:async()=>{const granted=await navigator.storage?.persist?.();$('#persist-status').textContent=granted?t('已获得持久存储权限','Persistent storage granted'):t('浏览器未授予权限，请继续下载备份。','Not granted by this browser. Keep downloaded backups.')},
};
document.addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target)return;
 const task=target.dataset.conversation?()=>conversationAction('switch',target.dataset.conversation):target.dataset.renameConversation?()=>conversationAction('rename',target.dataset.renameConversation):target.dataset.deleteConversation?()=>conversationAction('delete',target.dataset.deleteConversation):target.dataset.restoreAgent?()=>restoreAgent(target.dataset.restoreAgent):target.dataset.checkRequest?()=>checkReceipt(target.dataset.checkRequest):target.dataset.file?()=>openFile(target.dataset.file):target.dataset.close?()=>closeFile(target.dataset.close):target.dataset.fileMenu?()=>fileMenu(target.dataset.fileMenu):target.dataset.apply!==undefined?()=>applySuggestion(Number(target.dataset.apply)):target.dataset.prompt?()=>{$('#chat-input').value=target.dataset.prompt;$('#chat-input').focus()}:actions[target.dataset.action];
 if(task){if(historyBusy){toast(t('正在保存对话，请稍候。','Saving conversation. Please wait.'));return}if(importing&&!['cancel-import','toggle-files','toggle-ai'].includes(target.dataset.action)){toast(t('正在导入文件，请稍候。','Importing files. Please wait.'));return}if(activeAgentRun&&!target.dataset.checkRequest&&!['stop-ai','toggle-files','toggle-ai','refresh-ai','check-active'].includes(target.dataset.action)){toast(t('AI 正在操作当前文档，请先停止。','AI is working on this document. Stop it before another operation.'));return}if(state.booting&&target.dataset.action!=='reload')return;if(state.busy&&!['stop-ai','toggle-files','toggle-ai','reload'].includes(target.dataset.action))return;Promise.resolve().then(task).catch(fail)}
});
$('#tabs').addEventListener('mousedown',e=>{if(e.button===1&&e.target.closest('.tab'))e.preventDefault()});
$('#tabs').addEventListener('auxclick',e=>{
 if(e.button!==1)return;
 const tab=e.target.closest('.tab');if(!tab)return;e.preventDefault();
 if(state.busy||state.booting||importing||historyBusy||activeAgentRun){toast(t('当前操作完成后再关闭标签页。','Wait for the current operation before closing the tab.'));return}
 const id=tab.querySelector('[data-file]')?.dataset.file;if(id)closeFile(id).catch(fail);
});
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();sendChat($('#chat-input').value).catch(fail)});
$('#chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();sendChat(e.currentTarget.value).catch(fail)}});
$('#file-input').addEventListener('change',e=>importFiles([...e.target.files]).catch(fail));
$('#project-select').addEventListener('change',e=>selectProject(e.target.value).catch(e=>{render();fail(e)}));
$('#font-size').addEventListener('change',e=>{if(!activeAgentRun&&!importing&&e.target.value)state.session.command('format_selection',{sizePt:Number(e.target.value),atCursor:true}).catch(fail)});
$('#review-mode').addEventListener('change',e=>!activeAgentRun&&!importing&&state.session.run(()=>state.session.exec('set_revision_view',{mode:e.target.value})).catch(fail));
window.addEventListener('beforeunload',e=>{if(state.session?.dirty||activeAgentRun||importing){e.preventDefault();e.returnValue=''}});
window.addEventListener('pagehide',()=>state.session?.save().catch(()=>{}));
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!activeAgentRun&&!importing)state.session?.save().catch(fail)}});
for(const [selector,variable,min,max,inverse] of [['.left-resize','--files-width',180,360,false],['.right-resize','--ai-width',280,540,true]]){
 const handle=$(selector);let startX,startWidth;
 handle.addEventListener('pointerdown',e=>{startX=e.clientX;startWidth=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable));handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing')});
 handle.addEventListener('pointermove',e=>{if(!handle.hasPointerCapture(e.pointerId))return;const width=Math.min(max,Math.max(min,startWidth+(e.clientX-startX)*(inverse?-1:1)));document.documentElement.style.setProperty(variable,width+'px')});
 handle.addEventListener('pointerup',()=>document.body.classList.remove('resizing'));
 handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const n=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable));document.documentElement.style.setProperty(variable,Math.min(max,Math.max(min,n+(e.key==='ArrowRight'?20:-20)*(inverse?-1:1)))+'px')});
}
window.addEventListener('focus',()=>{if(!state.aiRunning)refreshCapabilities()});
async function start(){
 void refreshCapabilities();
 if(!window.isSecureContext||!window.crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){throw Error(t('浏览器无法启用文档编辑器。请使用最新版 Edge 或 Chrome，并确认站点的跨源隔离配置。','The editor needs a current Edge or Chrome browser and correctly configured cross-origin isolation.'))}
 state.store=await openWorkspace();historyStore=new ConversationStore(state.store);state.projects=await state.store.listProjects();
 const firstVisit=!state.projects.length;
 const temporary=await state.store.ensureTemporaryProject();
 state.projects=[temporary,...state.projects.filter(p=>p.id!==temporary.id)];
 if(firstVisit){
  const project=temporary;
  const lines=en?['Service Agreement · Example','This fictional document is provided for editing and review practice.','Client: Northstar Design Studio','Provider: Cedar Consulting','1. Scope of services','The Provider shall deliver a project proposal and two rounds of revisions.','2. Payment','The Client shall pay the full fee within 30 days after delivery.','3. Acceptance','The Client shall confirm acceptance after receiving the deliverables.','4. Confidentiality','Both parties shall keep confidential information received during this engagement.','Try it: edit a clause, or select a sentence and ask AI for a clearer version.']:['服务合同 · 示例','本文件为虚构示例，用于体验文档编辑与审阅。','甲方：星河设计工作室','乙方：云杉咨询服务有限公司','第一条  服务内容','乙方向甲方提供项目方案及两轮修改服务。','第二条  付款安排','甲方应在交付后30日内支付全部服务费用。','第三条  交付与验收','甲方收到服务成果后进行验收并确认。','第四条  保密义务','双方对合作过程中获知的保密信息承担保密义务。','试一试：直接修改条款，或选中一句话，请 AI 提出更清晰的写法。'];
  const sample=await state.store.createFile({projectId:project.id,name:t('服务合同（示例）.docx','Service agreement (example).docx'),bytes:await createDocument(lines)});
  await state.store.setSetting('tabs:'+project.id,{tabs:[sample.id],activeId:sample.id});
 }
 const last=await state.store.getSetting('activeProject');state.projectId=state.projects.some(p=>p.id===last)?last:state.projects[0].id;state.files=await state.store.listFiles(state.projectId);state.messages=await historyStore.load(state.projectId);renderHistory();
 state.session=new EditorSession({container:$('#editor-container'),store:state.store,onState:sessionState,onBusy:setBusy,onBoot:bootState,language});
 render();await state.session.ready;state.booting=false;
 const tabs=await state.store.getSetting('tabs:'+state.projectId);state.tabs=(tabs?.tabs||[]).filter(id=>state.files.some(f=>f.id===id));const active=state.tabs.includes(tabs?.activeId)?tabs.activeId:state.tabs.at(-1);
 if(active)await openFile(active);else{await state.session.show(null);setBusy(false);render()}
 for(const m of state.messages){if(m.pending){m.pending=false;if(m.agent){m.agent.status='interrupted';for(const step of m.agent.steps)if(step.status==='executing')step.status='unknown';}m.error=t('连接已结束，请核对费用状态；不会自动重发。','Connection ended. Check billing status; the request is not resent.');delete m.proposal}}
 if(state.messages.length)renderMessages();
 for(const m of state.messages.filter(m=>m.role==='assistant')){if(m.requestId&&!m.receipt)void checkReceipt(m.requestId);for(const r of m.agent?.requests||[])if(!r.receipt)void checkReceipt(r.requestId)}
}
start().catch(e=>{renderBootProgress({status:'error'});state.booting=false;$('#editor-cover').dataset.bootStatus='error';$('#cover-title').textContent=t('暂时无法打开工作区','Workspace could not open');$('#cover-detail').textContent=errorText(e);$('#editor-cover').hidden=false;$('#editor-cover .spinner').hidden=true;$('#cover-retry').hidden=false;fail(e)});
