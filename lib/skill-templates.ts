import { toBaseLocale, type Locale } from '@/i18n-config';

/**
 * 投稿页起步模板（skill-creator 式脚手架）：选中后一键填充表单，
 * 用户在骨架上改而不是面对空白框。不含 Node 依赖，客户端直接引用。
 */
export interface SkillTemplateFill {
  category: string;
  triggers: string[];
  /** 能力分组 key（lib/skill-tools.ts 的 TOOL_GROUPS），提交时展开成工具名 */
  toolGroups: string[];
  output: string;
  prompt: string;
}

export interface SkillTemplate {
  key: string;
  label: { zh: string; en: string };
  hint: { zh: string; en: string };
  fill: SkillTemplateFill;
  fillEn: SkillTemplateFill;
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    key: 'doc-review',
    label: { zh: '文档审查类', en: 'Document review' },
    hint: { zh: '审合同、审文书、找风险', en: 'Review docs, find risks' },
    fill: {
      category: 'contract',
      triggers: ['审查', '帮我审'],
      toolGroups: ['read', 'law', 'docx', 'comment'],
      output: '输出《审查意见》：一、总体评价；二、风险清单（原文/风险分析/修改建议）；三、补充建议。',
      prompt: `# {Skill 名称}

你是一名{角色定位，如：资深中国执业律师}。

## 工作流程
1. 用「读取文档」（read_document）通读全文，识别文档类型与整体结构；
2. 逐项排查以下风险点：{列出 4-8 个本领域关键风险点}；
3. 对每个风险点：引用原文、说明风险（引用法条前先用「查法规」law_search 核实）、给出可直接使用的修改建议；
4. 用「生成 Word 文档」（write_docx）输出审查意见。

## 要求
- 风险分级：高/中/低；
- 修改建议必须是可直接替换的文本；
- 不确定的法律问题明确说明，不得编造法条或判例。`,
    },
    fillEn: {
      category: 'contract',
      triggers: ['review', 'redline'],
      toolGroups: ['read', 'law', 'docx', 'comment'],
      output: 'Deliver a Review Memorandum: 1. Executive Summary; 2. Risk Register (clause quote / risk analysis / proposed redline); 3. Additional Recommendations.',
      prompt: `# {Skill Name}

You are a {role, e.g., senior commercial counsel}.

## Workflow
1. Read the entire document with \`read_document\` to identify the agreement type and overall structure;
2. Screen the document against the following risk areas: {list 4–8 key domain risk points};
3. For each risk item: quote the original clause, explain the exposure (verify any statute with \`law_search\` before citing), and provide drop-in replacement language;
4. Export the review memorandum as a Word document using \`write_docx\`.

## Requirements
- Severity rating for each issue: High / Medium / Low;
- Proposed revisions must be ready-to-insert contract text;
- Flag open legal questions explicitly and never fabricate statutes or case law.`,
    },
  },
  {
    key: 'doc-draft',
    label: { zh: '文书起草类', en: 'Drafting' },
    hint: { zh: '起草函件、协议、报告', en: 'Draft letters, agreements' },
    fill: {
      category: 'litigation',
      triggers: ['起草', '帮我写'],
      toolGroups: ['read', 'law', 'docx'],
      output: '输出一份可直接使用的完整文书（docx），关键待确认信息用【】标注。',
      prompt: `# {Skill 名称}

你是一名{角色定位}，擅长起草{文书类型}。

## 工作流程
1. 先向用户确认关键要素：{列出必须收集的信息，如当事人、金额、期限}；缺什么问什么，不要猜；
2. 按{文书类型}的规范结构起草：{列出文书的标准部分}；
3. 涉及法律依据时先用「查法规」（law_search）核实后引用；
4. 用「生成 Word 文档」（write_docx）输出成稿，无法确认的信息用【】占位并在文末列出待确认清单。

## 要求
- 语言正式、准确，符合执业规范；
- 不得编造事实与法条；
- 篇幅与场景匹配，不堆砌套话。`,
    },
    fillEn: {
      category: 'litigation',
      triggers: ['draft', 'write'],
      toolGroups: ['read', 'law', 'docx'],
      output: 'Generate a complete, ready-to-use Word document (docx), marking any unconfirmed facts in [brackets].',
      prompt: `# {Skill Name}

You are a {role} specializing in drafting {document type}.

## Workflow
1. Confirm essential deal or matter facts with the user first: {list required inputs such as parties, amounts, dates}; ask for missing facts instead of guessing;
2. Draft the document following the standard structure of {document type}: {list standard sections};
3. Verify any statutory authority via \`law_search\` before citing;
4. Export the finished draft using \`write_docx\`, placing unverified details in \`[brackets]\` and appending a checklist of open items at the end.

## Requirements
- Use formal, precise professional language;
- Never fabricate facts or legal authorities;
- Match length and tone to the matter without boilerplate padding.`,
    },
  },
  {
    key: 'checklist',
    label: { zh: '核查清单类', en: 'Checklist' },
    hint: { zh: '合规自查、尽调清单', en: 'Compliance & DD checks' },
    fill: {
      category: 'compliance',
      triggers: ['核查', '自查'],
      toolGroups: ['read', 'docx'],
      output: '输出《核查报告》：逐项结论（通过/风险/缺失）+ 证据出处 + 整改建议。',
      prompt: `# {Skill 名称}

你负责按固定清单对{核查对象}做逐项核查。

## 核查清单
1. {核查项一：判断标准}
2. {核查项二：判断标准}
3. {核查项三：判断标准}
{……列全，每项都要有明确的判断标准}

## 工作流程
1. 用「列出文件」（list_files）与「读取文档」（read_document）收集核查所需材料；
2. 逐项核查，每项给出结论（通过 / 风险 / 材料缺失）与依据出处；
3. 用「生成 Word 文档」（write_docx）输出核查报告，风险项排在最前。

## 要求
- 只依据材料下结论，材料不足就标「缺失」，不推测；
- 每个结论都要能追溯到具体文件与段落。`,
    },
    fillEn: {
      category: 'compliance',
      triggers: ['checklist', 'audit'],
      toolGroups: ['read', 'docx'],
      output: 'Deliver a Verification Report: item-by-item status (Pass / Risk / Missing) + source citations + remediation steps.',
      prompt: `# {Skill Name}

You are responsible for verifying {target subject} item by item against a fixed checklist.

## Verification Checklist
1. {Check item 1: pass/fail criteria}
2. {Check item 2: pass/fail criteria}
3. {Check item 3: pass/fail criteria}
{...list all items with clear evaluation criteria}

## Workflow
1. Gather relevant source materials using \`list_files\` and \`read_document\`;
2. Evaluate each checklist item and record the conclusion (Pass / Risk / Missing Material) together with exact source references;
3. Generate the verification report with \`write_docx\`, ordering risk items first.

## Requirements
- Base every conclusion strictly on the provided materials; mark items as "Missing" when evidence is insufficient rather than speculating;
- Every finding must cite the specific file and paragraph.`,
    },
  },
];

export function getSkillTemplates(lang: Locale = 'zh'): SkillTemplate[] {
  const base = toBaseLocale(lang);
  return SKILL_TEMPLATES.map(tpl => ({
    ...tpl,
    fill: base === 'en' ? tpl.fillEn : tpl.fill,
  }));
}
