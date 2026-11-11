/**
 * 官方插件清单。
 *
 * 这些能力随桌面端一起发布、在左栏常驻，不走在线分发链路——列在这里是为了让访客
 * 知道「插件」这个概念在产品里长什么样，以及第三方插件能做到什么程度。
 *
 * 与桌面端 frontend/src/config/leftSidebarPlugins.js 的入口一一对应，
 * 那边增删了能力，这里要跟着改。
 */

export interface OfficialPlugin {
  /** 与桌面端左栏的 key 对应 */
  key: string;
  name: string;
  nameEn: string;
  /** 一句话说明它替用户做什么，不写技术实现 */
  summary: string;
  summaryEn: string;
  /** 具体能力点，3-4 条，落到可感知的动作上 */
  highlights: string[];
  highlightsEn: string[];
  /** lucide 图标名，渲染侧按此映射 */
  icon: 'FileSearch' | 'Users' | 'ShieldCheck' | 'AudioLines';
}

export const OFFICIAL_PLUGINS: OfficialPlugin[] = [
  {
    key: 'dd-files',
    name: '尽职调查',
    nameEn: 'Due Diligence',
    summary: '把尽调清单、资料收集与缺漏核验放在一处，进度一眼可见。',
    summaryEn: 'Keeps the diligence checklist, document collection, and gap checks in one place, with progress at a glance.',
    highlights: [
      '按清单归集资料，逐项标记已收/待补',
      '自动核对已收文件与清单条目的对应关系',
      '生成尽调进度与缺漏说明',
    ],
    highlightsEn: [
      'Collects documents against the checklist, marking each item received or outstanding',
      'Automatically matches received files to checklist items',
      'Generates progress reports and gap notes',
    ],
    icon: 'FileSearch',
  },
  {
    key: 'desensitize',
    name: '文件脱敏',
    nameEn: 'Document Redaction',
    summary: '批量替换文档中的当事人姓名、公司、金额等敏感信息。',
    summaryEn: 'Batch-replaces party names, companies, amounts, and other sensitive details across documents.',
    highlights: [
      '识别人名、机构、证件号、金额等常见敏感项',
      '按策略选择替换、遮盖或保留',
      '保持原文排版，导出可直接对外的版本',
    ],
    highlightsEn: [
      'Detects names, organizations, ID numbers, amounts, and other common sensitive items',
      'Replace, mask, or keep each item according to policy',
      'Preserves the original layout and exports a version ready to share',
    ],
    icon: 'ShieldCheck',
  },
  {
    key: 'easyvoice',
    name: '语音转写',
    nameEn: 'Voice Transcription',
    summary: '把会议录音、庭审录音转成带时间轴的文字稿。',
    summaryEn: 'Turns meeting and courtroom recordings into time-coded transcripts.',
    highlights: [
      '长音频分段转写，支持中文口语',
      '输出带时间戳的文字稿，便于回溯定位',
      '转写结果可直接进入对话作为上下文',
    ],
    highlightsEn: [
      'Transcribes long audio in segments, tuned for spoken Chinese',
      'Outputs time-stamped transcripts for quick lookup',
      'Feeds transcripts straight into the AI chat as context',
    ],
    icon: 'AudioLines',
  },
];
