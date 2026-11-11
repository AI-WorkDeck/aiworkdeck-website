/**
 * 工具目录：桌面端已注册的工具 → 面向律师的「能力」分组。
 *
 * 与桌面端 frontend/src/utils/toolDisplayNames.js 对齐（后端 @ToolMeta 的显示名副本），
 * 后端新增工具时两边同步补一行。不含 Node 依赖，客户端可直接引用。
 *
 * 重要语义（表单文案必须讲清楚）：Skill 命中后 LLM 可见工具 =
 * allowedTools ∪ ai.skills.base-tools，而 base-tools 只有 read_document /
 * list_files / query_memory。所以「一个都不勾」不等于「不限制」，而是这个 Skill
 * 只能读文档、列文件、查记忆——写不了 Word 也查不了法规。
 */

import { pickLocale, type Locale } from '@/i18n-config';

export interface ToolItem {
  name: string;
  zh: string;
  en: string;
}

export interface ToolGroup {
  key: string;
  label: { zh: string; en: string };
  /** 一句话说明这组能力让 Skill 能做什么（用律师听得懂的话） */
  hint: { zh: string; en: string };
  tools: ToolItem[];
}

/** 后端 application.yml: ai.skills.base-tools —— 不勾任何能力时兜底可用的三个工具 */
export const BASE_TOOLS = ['read_document', 'list_files', 'query_memory'];

/**
 * 分组之间允许重叠（例如 doc_find_text 同时属于「读文档」和「改文档」）：
 * 最终提交的是并集，重叠只是为了每组单独勾选也能跑通。
 */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    key: 'read',
    label: { zh: '读文档', en: 'Read documents' },
    hint: { zh: '通读全文、看大纲、识别合同条款、在项目里找文件', en: 'Read full text, outlines, contract clauses, find files' },
    tools: [
      { name: 'read_document', zh: '读取文档', en: 'Read document' },
      { name: 'doc_get_document_text', zh: '通读打开的文档', en: 'Read open document' },
      { name: 'doc_get_outline', zh: '获取文档大纲', en: 'Get outline' },
      { name: 'doc_get_clauses', zh: '识别合同条款', en: 'Map contract clauses' },
      { name: 'list_files', zh: '列出文件', en: 'List files' },
      { name: 'search_project_files', zh: '搜索项目文件', en: 'Search project files' },
      { name: 'read_file', zh: '读取任意文件', en: 'Read file' },
    ],
  },
  {
    key: 'law',
    label: { zh: '查法规', en: 'Look up law' },
    hint: { zh: '检索法律法规原文、核实法条引用，避免编造', en: 'Search statutes, verify citations' },
    tools: [
      { name: 'law_search', zh: '语义搜索法规', en: 'Search regulations' },
      { name: 'law_search_keyword', zh: '关键词搜索法规', en: 'Keyword law search' },
      { name: 'get_law_article', zh: '查询指定法条', en: 'Look up article' },
      { name: 'law_recognition', zh: '法条识别与溯源', en: 'Identify citations' },
    ],
  },
  {
    key: 'docx',
    label: { zh: '出具文档', en: 'Produce documents' },
    hint: { zh: '生成 Word 成稿，如审查意见、法律意见书、核查报告', en: 'Generate Word deliverables' },
    tools: [
      { name: 'write_docx', zh: '生成 Word 文档', en: 'Create Word doc' },
      { name: 'write_file', zh: '写入文本文件', en: 'Write file' },
    ],
  },
  {
    key: 'organize',
    label: { zh: '整理案卷', en: 'Organize files' },
    hint: { zh: '新建文件夹、重命名、移动归类项目里的文件（文件树实时同步）', en: 'Create folders, rename and move project files' },
    tools: [
      { name: 'create_folder', zh: '新建文件夹', en: 'Create folder' },
      { name: 'rename_project_file', zh: '重命名文件', en: 'Rename file' },
      { name: 'move_project_file', zh: '移动文件', en: 'Move file' },
    ],
  },
  {
    key: 'edit',
    label: { zh: '在文档里直接改', en: 'Edit in place' },
    hint: { zh: '在打开的文档上改字、替换、增删段落（会留修订痕迹）', en: 'Rewrite, replace, insert in the open document' },
    tools: [
      { name: 'doc_open_file', zh: '打开文档', en: 'Open document' },
      { name: 'doc_find_text', zh: '在文档里查找定位', en: 'Find in document' },
      { name: 'doc_find_replace', zh: '查找替换', en: 'Find & replace' },
      { name: 'doc_replace_selection', zh: '替换选中内容', en: 'Replace selection' },
      { name: 'doc_insert_at_cursor', zh: '在光标处插入', en: 'Insert at cursor' },
      { name: 'doc_insert_under_heading', zh: '在标题下插入', en: 'Insert under heading' },
      { name: 'doc_modify_paragraph', zh: '修改整段', en: 'Edit paragraph' },
      { name: 'doc_delete_text', zh: '删除文本', en: 'Delete text' },
      { name: 'doc_goto', zh: '跳转光标', en: 'Move cursor' },
      { name: 'doc_get_selection', zh: '读取选区', en: 'Read selection' },
      { name: 'doc_format_selection', zh: '设置文字格式', en: 'Format text' },
      { name: 'doc_set_paragraph_format', zh: '设置段落格式', en: 'Format paragraph' },
      { name: 'doc_undo', zh: '撤销修改', en: 'Undo' },
    ],
  },
  {
    key: 'comment',
    label: { zh: '加批注', en: 'Add comments' },
    hint: { zh: '在原文对应位置贴批注，而不是直接改动正文', en: 'Attach margin comments instead of rewriting' },
    tools: [
      { name: 'doc_open_file', zh: '打开文档', en: 'Open document' },
      { name: 'doc_find_text', zh: '在文档里查找定位', en: 'Find in document' },
      { name: 'doc_add_comment', zh: '添加批注', en: 'Add comment' },
    ],
  },
  {
    key: 'web',
    label: { zh: '上网检索', en: 'Search the web' },
    hint: { zh: '联网搜索、打开网页、查企业与公开信息', en: 'Web search, open pages, public records' },
    tools: [
      { name: 'search_web', zh: '网络搜索', en: 'Web search' },
      { name: 'qichacha_query', zh: '查询企业工商信息', en: 'Company registry lookup' },
      { name: 'qichacha_ipr', zh: '查询企业知识产权', en: 'Company IP lookup' },
      { name: 'tushare_query', zh: '查询金融数据', en: 'Financial data lookup' },
      { name: 'browse_url', zh: '浏览网页', en: 'Browse page' },
      { name: 'deep_search', zh: '深度检索', en: 'Deep search' },
      { name: 'search_knowledge_base', zh: '搜索知识库', en: 'Search knowledge base' },
    ],
  },
  {
    key: 'slides',
    label: { zh: '做 PPT', en: 'Build slides' },
    hint: { zh: '生成或修改演示文稿，如培训材料、方案汇报', en: 'Generate or edit presentations' },
    tools: [
      { name: 'pptx_generate', zh: '生成 PPT', en: 'Generate slides' },
      { name: 'pptx_generate_outline', zh: '生成 PPT 大纲', en: 'Outline slides' },
      { name: 'pptx_smart_modify', zh: '智能修改 PPT', en: 'Modify slides' },
      { name: 'pptx_open_file', zh: '打开 PPT', en: 'Open slides' },
      { name: 'pptx_get_slide_content', zh: '读取幻灯片内容', en: 'Read slide' },
      { name: 'pptx_edit_page', zh: '编辑幻灯片', en: 'Edit slide' },
      { name: 'pptx_insert_text', zh: '插入幻灯片文本', en: 'Insert slide text' },
      { name: 'pptx_save', zh: '保存 PPT', en: 'Save slides' },
      { name: 'pptx_list_files', zh: '列出 PPT 文件', en: 'List slide files' },
    ],
  },
  {
    key: 'memory',
    label: { zh: '记忆与证据', en: 'Memory & evidence' },
    hint: { zh: '记住客户偏好与办案习惯，按定位符回溯证据出处', en: 'Remember preferences, trace evidence sources' },
    tools: [
      { name: 'query_memory', zh: '检索记忆', en: 'Query memory' },
      { name: 'save_memory', zh: '保存记忆', en: 'Save memory' },
      { name: 'retrieve_evidence', zh: '检索证据', en: 'Retrieve evidence' },
      { name: 'get_user_profile', zh: '获取用户画像', en: 'Get user profile' },
    ],
  },
  {
    key: 'advanced',
    label: { zh: '算数与拆任务', en: 'Compute & delegate' },
    hint: { zh: '跑 Python 算表格数据、拆多步任务、维护任务清单', en: 'Run Python, split tasks, keep a task list' },
    tools: [
      { name: 'run_python', zh: '执行 Python 代码', en: 'Run Python' },
      { name: 'dispatch_subtask', zh: '委派子任务', en: 'Delegate subtask' },
      { name: 'todo_write', zh: '更新任务清单', en: 'Update task list' },
      { name: 'get_project_context', zh: '获取项目信息', en: 'Get project context' },
    ],
  },
  {
    key: 'meeting',
    label: { zh: '会议录音', en: 'Meeting recordings' },
    hint: { zh: '读取会议录音的转写稿与摘要素材（说话人分离），供纪要类 Skill 使用', en: 'Read diarized meeting transcripts and summaries' },
    tools: [
      { name: 'meeting_list_recordings', zh: '列出会议录音', en: 'List meeting recordings' },
      { name: 'meeting_get_transcript', zh: '读取会议转写稿', en: 'Read meeting transcript' },
    ],
  },
];

/** 新投稿的默认勾选：读文档 + 查法规 + 出具文档，覆盖绝大多数法律 Skill */
export const DEFAULT_TOOL_GROUPS = ['read', 'law', 'docx'];

const TOOL_INDEX: Record<string, ToolItem> = {};
for (const g of TOOL_GROUPS) {
  for (const t of g.tools) TOOL_INDEX[t.name] = t;
}

export const ALL_TOOL_NAMES = Object.keys(TOOL_INDEX);

/** 工具代号 → 人话；未收录的代号按 snake_case 分词兜底（与桌面端同一套兜底策略） */
export function toolLabel(name: string, lang: Locale = 'zh'): string {
  const item = TOOL_INDEX[name];
  if (item) return pickLocale(item, lang);
  return name.replace(/_/g, ' ');
}

export function isKnownTool(name: string): boolean {
  return !!TOOL_INDEX[name];
}

export function toolsOfGroups(keys: string[]): string[] {
  const set = new Set<string>();
  for (const key of keys) {
    TOOL_GROUPS.find(g => g.key === key)?.tools.forEach(t => set.add(t.name));
  }
  return [...set];
}
