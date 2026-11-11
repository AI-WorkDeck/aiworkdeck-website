import { SKILL_CATEGORIES } from '@/lib/skill-categories';
import { TOOL_GROUPS, isKnownTool } from '@/lib/skill-tools';
import { toBaseLocale } from '@/i18n-config';

/**
 * Skill 草稿生成的共享件：工具目录、JSON 形状约定、提示词、白名单清洗。
 * 一句话生成（skill-draft）与对话式创建（skill-chat）两条路由共用，
 * 保证两条路出来的草稿走同一套清洗，不会出现「聊天造出来的草稿绕过白名单」。
 */

/** 真实工具清单（按能力分组）喂给模型，杜绝 web_search 这类凭空编出来的工具名 */
export function toolCatalogForPrompt(): string {
  return TOOL_GROUPS.map(
    g => `- ${g.label.zh}（${g.hint.zh}）：${g.tools.map(t => t.name).join(', ')}`
  ).join('\n');
}

/** 对话式创建里包裹草稿 JSON 的标记。出现即视为定稿信号，标记后的内容不进聊天气泡。 */
export const DRAFT_OPEN_MARKER = '<skill-draft>';
export const DRAFT_CLOSE_MARKER = '</skill-draft>';

function draftJsonSpec(): string {
  const categories = SKILL_CATEGORIES.map(c => c.id).join(' | ');
  return `{
  "name": "Skill 名称（不超过 20 字）",
  "description": "一句话描述",
  "category": "从 ${categories} 中选一个",
  "triggers": ["触发词1", "触发词2"],
  "allowedTools": ["read_document"],
  "output": "输出约定（一两句自然语言，可为空字符串）",
  "prompt": "完整的 Markdown prompt 模板"
}`;
}

function methodology(lang: string): string {
  return `设计方法论（严格遵守）：
1. 触发词：3-8 个，覆盖用户会自然说出的短语（含常见简称、动宾结构，如「审合同」「合同审查」），每个不超过 40 字；
2. prompt 用 Markdown，结构为：# 标题 → 角色一句话 → ## 工作流程（编号步骤，每步指明用什么工具做什么）→ ## 要求（输出格式、风险分级、禁止编造等边界约束）；
3. 步骤要具体可执行，不写空话；法律类 Skill 必须包含「不确定的法律问题要明确说明，不得编造法条/判例」的约束；
4. 工具白名单只能从下面这份真实工具清单里选（名字必须一字不差），并且**必须选全**——命中 skill 后 LLM 可见工具 = allowedTools ∪ {read_document, list_files, query_memory}，漏选就等于这个 Skill 干不了那件事（例如没选 write_docx 就出不了 Word）：
${toolCatalogForPrompt()}
5. description 一句话（不超过 60 字）说清楚「帮谁做什么」；
6. 输出语言与用户描述一致（默认${toBaseLocale(lang) === 'zh' ? '中文' : '英文'}）。`;
}

/**
 * 一句话生成（Tab A）：用户给一两句描述，直接输出完整草稿 JSON。
 */
export function draftSystemPrompt(lang: string): string {
  return `你是 AI WorkDeck（法律人的 AI 工作台）Skill 广场的资深 Skill 设计师。用户会用一两句话描述想要的 Skill，你输出一份完整、可直接发布的 Skill 草稿。

一个 Skill = 提示词模板 + 触发词 + 工具白名单 + 输出约定。桌面端在用户输入命中触发词时，把 prompt 注入系统消息。

${methodology(lang)}

只输出一个 JSON 对象，不要任何其他文字、不要 markdown 代码围栏：
${draftJsonSpec()}`;
}

/**
 * 对话式创建（Tab B）：访谈式。先用少量关键问题把需求聊清楚，再产出草稿；
 * 草稿必须包在 ${DRAFT_OPEN_MARKER}…${DRAFT_CLOSE_MARKER} 里，方便服务端截流解析。
 */
export function chatSystemPrompt(lang: string): string {
  const zh = toBaseLocale(lang) === 'zh';
  return `你是 AI WorkDeck（法律人的 AI 工作台）Skill 广场的资深 Skill 设计师，正在通过对话帮用户从零设计一个 Skill。

一个 Skill = 提示词模板 + 触发词 + 工具白名单 + 输出约定。桌面端在用户输入命中触发词时，把 prompt 注入系统消息。

对话规则：
1. 一次只问一到两个问题，优先问最影响设计的：这个 Skill 帮谁、解决什么具体场景、期望产出什么（Word 文档？清单？意见书？）、有什么边界或禁区；
2. 用户已经说清楚的不要重复问；一般聊 2-4 轮就该拿出草稿，不要没完没了地访谈；
3. 用户如果一上来就描述得很完整，或明确说「直接生成」，就立刻产出草稿，不要为了流程而提问；
4. 产出草稿后如果用户要求修改，输出**修改后的完整草稿**（仍按下面的格式），不要只说改了哪里；
5. 对话语言与用户一致（默认${zh ? '中文' : '英文'}）。

${methodology(lang)}

产出草稿时：先用一两句话说明设计思路，然后**必须**把草稿 JSON 包在标记里，格式如下（标记必须独占一行，JSON 不要加代码围栏）：
${DRAFT_OPEN_MARKER}
${draftJsonSpec()}
${DRAFT_CLOSE_MARKER}

标记外不要出现草稿 JSON；没到产出阶段就不要输出标记。`;
}

/** 从模型输出里取出草稿并按白名单清洗；拿不到合法 JSON 返回 null。 */
export function parseDraft(content: string) {
  // 容错：剥掉标记与模型可能加的代码围栏，再截取首个 { 到末个 }
  const jsonText = content
    .replace(DRAFT_OPEN_MARKER, '')
    .replace(DRAFT_CLOSE_MARKER, '')
    .replace(/^```(?:json)?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let draft: any;
  try {
    draft = JSON.parse(jsonText.slice(start, end + 1));
  } catch {
    return null;
  }
  // 白名单转发，防止模型输出污染其他字段
  return {
    name: String(draft.name || '').slice(0, 60),
    description: String(draft.description || '').slice(0, 200),
    category: SKILL_CATEGORIES.some(c => c.id === draft.category) ? draft.category : undefined,
    triggers: Array.isArray(draft.triggers) ? draft.triggers.map(String).slice(0, 20) : [],
    // 只保留目录里真实存在的工具：模型偶尔会编工具名，留着会让白名单形同虚设
    allowedTools: Array.isArray(draft.allowedTools)
      ? draft.allowedTools.map(String).filter(isKnownTool).slice(0, 30)
      : [],
    output: String(draft.output || '').slice(0, 2000),
    prompt: String(draft.prompt || '').slice(0, 20000),
  };
}

/**
 * 对话消息里定位草稿块：取**最后一个**标记块（多轮修改后以最新为准）。
 * 没有闭合标记时容忍到文末——流被掐断时草稿往往缺尾巴，能解析多少算多少。
 */
export function extractDraftFromChat(content: string) {
  const openAt = content.lastIndexOf(DRAFT_OPEN_MARKER);
  if (openAt === -1) return null;
  const after = content.slice(openAt + DRAFT_OPEN_MARKER.length);
  const closeAt = after.indexOf(DRAFT_CLOSE_MARKER);
  return parseDraft(closeAt === -1 ? after : after.slice(0, closeAt));
}

/** 聊天气泡展示用：把草稿块从正文里剥掉（服务端已截流，这里兜历史消息的底）。 */
export function stripDraftBlocks(content: string): string {
  const openAt = content.indexOf(DRAFT_OPEN_MARKER);
  if (openAt === -1) return content;
  const closeAt = content.indexOf(DRAFT_CLOSE_MARKER, openAt);
  const head = content.slice(0, openAt);
  const tail = closeAt === -1 ? '' : content.slice(closeAt + DRAFT_CLOSE_MARKER.length);
  return (head + tail).trim();
}
