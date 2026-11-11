import { toBaseLocale, type Locale } from '@/i18n-config';

/**
 * 精选 Skill 的英文展示文案（PR 官网中英混杂修复）。
 *
 * 为什么放代码层而不进数据：生产 data/skills.json 由 scripts/seed.mjs「只增不改」
 * 合并，给种子数据加英文字段到不了已上线的条目；且翻译是策展行为，不属于
 * 用户投稿数据本身。EN 页面渲染时按 id 覆盖 name/description/triggers 的显示，
 * 社区投稿没有映射就回落原文。prompt/output 是功能载体，保持原文不翻。
 */

interface SkillEnCopy {
  name: string;
  description: string;
  triggers?: string[];
}

const SKILL_EN: Record<string, SkillEnCopy> = {
  'contract-review': {
    name: 'Contract Review Assistant',
    description:
      'Reviews contracts under PRC law: flags risk clauses, suggests revisions, and outputs a structured review memo.',
    triggers: ['Review this contract', 'Contract review', 'review contract'],
  },
  'weekly-report': {
    name: 'Weekly Report Generator',
    description: "Compiles a structured weekly report from this week's documents and work records.",
    triggers: ['Write my weekly report', 'Generate weekly report', 'weekly report'],
  },
  'contract-risk-review': {
    name: 'Contract Red-Line Review',
    description:
      "Reviews a contract clause by clause from your side's position, flags risks and deviations, and drafts replacement language plus a negotiation fallback plan.",
    triggers: [
      'Review this contract',
      'Contract risk points',
      'Fix these clauses',
      'Negotiation strategy',
      'Our-side review',
      'Contract red lines',
    ],
  },
  'nda-triage': {
    name: 'NDA Triage',
    description:
      'Triages incoming NDAs into green, amber, or red: sign as-is, negotiate specific clauses, or escalate for full legal review.',
    triggers: ['Look at this NDA', 'Can I sign this NDA', 'NDA screening', 'NDA triage', 'Any traps in this NDA'],
  },
  'signature-checklist': {
    name: 'Signing Checklist',
    description:
      'Pre-signing checks on party names, annexes, signature blocks, and authority; sequences the signing and blocks defective execution.',
    triggers: [
      'Ready to sign',
      'Pre-seal check',
      'Check signature pages',
      'Run the signing process',
      'Final check before signing',
    ],
  },
  'compliance-check': {
    name: 'Compliance Pre-Check',
    description:
      'Before launching a feature or business line, maps applicable regulations, required licenses and approvals, and compliance gaps, with a remediation list.',
    triggers: [
      'Is this compliant',
      'Compliance check',
      'What licenses do we need',
      'Personal data compliance',
      'Pre-launch compliance review',
      'Any regulatory risk',
    ],
  },
  'legal-risk-assessment': {
    name: 'Legal Risk Assessment',
    description:
      'Grades business plans or disputes on an impact-times-likelihood matrix, with mitigation measures and escalation advice.',
    triggers: ['How risky is this', 'Legal risk assessment', 'Should we escalate', 'Risk grading', 'How serious is this'],
  },
  'vendor-agreement-check': {
    name: 'Vendor Agreement Health Check',
    description:
      'Inventories every agreement signed with a vendor, checks that the master agreement, data terms, and orders are complete, and flags expiries and gaps.',
    triggers: [
      'What did we sign with this vendor',
      'Vendor agreement inventory',
      'Is the contract expiring',
      'Pre-renewal check',
      'Vendor diligence',
    ],
  },
  'legal-letter-response': {
    name: 'Legal Letter Response',
    description:
      "After a demand letter, claim, or regulator inquiry arrives, analyzes the other side's asks, judges whether to escalate, and drafts a measured reply.",
    triggers: [
      "Got a lawyer's letter",
      'How do I reply to this letter',
      'Draft a reply letter',
      'Regulator inquiry',
      'Claim letter received',
    ],
  },
  'legal-brief': {
    name: 'Legal Briefing',
    description:
      'Produces a fast, structured brief on a legal question or breaking event: conclusion first, statutory basis, market practice, and an action list.',
    triggers: [
      'Write a legal brief',
      'Research this legal question',
      'New regulation explainer',
      'Draft a legal memo',
      'Legal response to an incident',
    ],
  },
  'legal-meeting-brief': {
    name: 'Legal Meeting Brief',
    description:
      'Prepares background, positions, and Q&A for negotiations, board meetings, and regulator sessions, then tracks action items.',
    triggers: [
      'Negotiation meeting tomorrow',
      'Board materials prep',
      'Pre-meeting brief',
      'Help me prep this meeting',
      'Collect meeting action items',
    ],
  },
  'agreement-gotchas': {
    name: 'Agreement Gotcha Scan',
    description:
      'Reads an agreement end to end to dig out trap clauses, grades them fatal, major, or minor, and drafts the change requests to send back.',
    triggers: ['Agreement traps', 'Trap clauses', 'Pre-signing check', 'Avoid the pitfalls', 'What are the catches'],
  },
  'terms-plain-reader': {
    name: 'Plain-Language Terms Reader',
    description:
      'Translates dense user agreements, terms of service, and privacy policies into plain language, flags red-flag clauses, and advises on signing.',
    triggers: ['Explain these terms', 'Terms of service', 'Privacy policy', 'Plain-language terms', 'Safe to sign?'],
  },
  'patent-analyst': {
    name: 'Patent Analyst',
    description:
      'Dissects a patent like a senior examiner: field, problem, solution, effects, claims, and a first-pass novelty and inventiveness read.',
    triggers: ['Patent analysis', 'Analyze this patent', 'Claims', 'Novelty', 'Inventiveness assessment'],
  },
  'vendor-risk-assess': {
    name: 'Vendor Compliance Risk Assessment',
    description:
      "Assesses a third-party vendor's security and privacy compliance materials, rates the risk high, medium, or low, with reasons and workable controls.",
    triggers: [
      'Vendor risk',
      'Third-party assessment',
      'Data processing agreement',
      'Security compliance review',
      'Procurement compliance',
    ],
  },
  'summons-response-analysis': {
    name: 'Litigation Response Strategy',
    description:
      'Close-reads the complaint and case materials, breaks down each claim, and drafts a defense outline or feedback on the final complaint.',
    triggers: [
      'Received a complaint',
      'Respond to a lawsuit',
      'Statement of defense',
      'Break down the claims',
      'Complaint feedback',
    ],
  },
  'witness-hearing-prep': {
    name: 'Witness Hearing Prep',
    description:
      'Interviews through the facts question by question, then generates the examination outline, cross-examination forecasts, risk analysis, and a prep checklist.',
    triggers: [
      'Witness taking the stand',
      'Examination outline',
      'Witness preparation',
      'Cross-examination',
      'Pre-trial coaching',
    ],
  },
  'pareto-doc-summary': {
    name: 'Pareto Document Digest',
    description:
      'Distills legal documents by the 80/20 rule: 80% of the substance in under 20% of the length, with no hard facts dropped.',
    triggers: ['Quick summary', 'Speed-read this document', '80/20 digest', 'Just the key points', "Too long, didn't read"],
  },
  'cuad-clause-scan': {
    name: 'CUAD Clause Risk Scan',
    description:
      'For M&A and financing diligence: scans contracts across ten CUAD risk dimensions, grades each finding, and drafts replacement language.',
    triggers: ['Diligence clause scan', 'CUAD', 'Investment agreement review', 'Change-of-control clauses', 'Clause risk grading'],
  },
  'ma-legal-diligence': {
    name: 'M&A Legal Diligence',
    description:
      'Inventories the data room to build a governance map, hunts deal-blocker clauses like change of control, detects missing documents, and reports findings graded P0-P3.',
    triggers: ['M&A diligence', 'Legal due diligence', 'Data room review', 'Deal-blocker scan', 'Diligence report'],
  },
  'citation-verifier': {
    name: 'Citation Verifier',
    description:
      'Checks every statute and case citation in a document, flagging misquotes, repealed provisions, and citations that cannot be verified.',
    triggers: ['Verify citations', 'Check the statutes', 'Case citation check', 'Citation audit', 'Check the footnotes'],
  },
  'contract-version-diff': {
    name: 'Contract Version Diff',
    description:
      'Clause-level comparison across negotiation rounds, separating substantive changes from wording polish so you see who changed what.',
    triggers: ['Version diff', 'Compare contract versions', 'What changed', 'Multi-version comparison', 'Change log'],
  },
  'tabular-contract-review': {
    name: 'Tabular Batch Review',
    description:
      'Extracts a batch of contracts into a uniform review table, every cell backed by a source quote or marked unverifiable; built for diligence and inventories.',
    triggers: ['Batch contract review', 'Diligence table', 'Contract inventory', 'Review this batch', 'Build a diligence checklist'],
  },
  'matter-status-synthesis': {
    name: 'Matter Status Synthesis',
    description:
      'Synthesizes a matter status report from working documents and correspondence, substance only, for reporting, weekly updates, and handovers.',
    triggers: ['Matter status roundup', 'Write the weekly update', 'Case progress report', 'Status report', 'Work handover'],
  },
  'clause-library-indexer': {
    name: 'Clause Library Indexer',
    description:
      'Auto-generates tags, summaries, and titles for contract clauses, turning them into a searchable clause library; batch import supported.',
    triggers: ['Add clause to library', 'Tag this clause', 'Clause indexing', 'Archive this clause', 'Clause summary'],
  },
  'clause-rewriter': {
    name: 'Clause Rewriter',
    description:
      'Rewrites existing contract clauses exactly as instructed, touching only what must change, and returns drop-in replacement text.',
    triggers: ['Rewrite this clause', 'Clause rewrite', 'Adjust this clause', 'Make it mutual', "Flip the clause's position"],
  },
  'case-law-researcher': {
    name: 'Case Law Researcher',
    description:
      'Finds real, verifiable supporting cases for a legal argument, with docket numbers and holdings, and says so plainly when nothing is found.',
    triggers: ['Find precedents', 'Search cases', 'Similar-case search', 'Find supporting cases', 'Guiding cases'],
  },
  'everyday-legal-advisor': {
    name: 'Everyday Legal Advisor',
    description:
      'Explains everyday legal problems clearly: what kind of issue it is, what to do next, what evidence to keep. For reference only, not formal legal advice.',
    triggers: ['Legal question', 'What to do in a dispute', 'Had an accident', 'Unpaid debts', 'Consumer rights'],
  },
  'startup-agreement-drafter': {
    name: 'Startup Agreement Drafter',
    description:
      'Drafts one-page agreements for startups fast (like a design partner agreement), covering IP, confidentiality, data, and commercial rights.',
    triggers: [
      'Design partner agreement',
      'Draft a partnership agreement',
      'One-page agreement',
      'Seed customer agreement',
      'Startup agreements',
    ],
  },
};

/** 策展账号与官方账号的英文显示名（按 username 索引） */
const CURATOR_EN: Record<string, string> = {
  'contract-lab': 'Contract Lab',
  'compliance-desk': 'Compliance Desk',
  'litigation-bench': 'Litigation Bench',
  'research-atelier': 'Research Atelier',
  'legal-ops': 'Legal Ops',
  aiworkdeck: 'AI WorkDeck Official',
};

/**
 * EN 页面的 Skill 展示副本：按 id 覆盖 name/description/triggers，没有映射回落原文。
 * 只改展示，不改数据——订单、skill.yml、registry 一律仍用规范中文名。
 */
export function localizeSkill<T extends { id: string; name: string; description: string; triggers: string[] }>(
  skill: T,
  lang: Locale,
): T {
  if (toBaseLocale(lang) !== 'en') return skill;
  const copy = SKILL_EN[skill.id];
  if (!copy) return skill;
  return {
    ...skill,
    name: copy.name,
    description: copy.description,
    triggers: copy.triggers ?? skill.triggers,
  };
}

/** 作者显示名：EN 页面把策展号译名换上，社区用户名原样返回 */
export function localizeDisplayName(
  user: { username: string; displayName: string } | undefined,
  lang: Locale,
): string | undefined {
  if (!user) return undefined;
  if (toBaseLocale(lang) !== 'en') return user.displayName;
  return CURATOR_EN[user.username] ?? user.displayName;
}
