import fs from 'fs';
import path from 'path';
import { SKILL_ID_RE } from './skill-id';
import { isSkillCategory } from './skill-categories';
import { siteConfig } from '@/lib/site-config';

export { SKILL_ID_RE };

const SKILLS_FILE = path.join(process.cwd(), 'data', 'skills.json');
const FAILED_SUBMISSIONS_FILE = path.join(process.cwd(), 'data', 'failed-submissions.jsonl');

/**
 * Skill 数据模型，对应桌面端 Skill 规范 v1（skill.yml + prompt.md 目录式打包）。
 * 桌面端通过 /api/registry/skills 与 /api/registry/skills/{id}/bundle 消费。
 */
export interface SkillOrigin {
  url: string; // 原始出处链接（开源仓库文件/目录）
  author: string; // 原作者/组织
  license?: string; // 许可证标识，如 MIT
}

export interface SkillEntry {
  id: string; // kebab-case slug，全局唯一
  name: string;
  description: string;
  icon: string; // emoji
  version: string;
  triggers: string[];
  allowedTools: string[];
  output?: string;
  prompt: string; // prompt.md 内容
  category?: string; // SKILL_CATEGORIES 之一
  featured?: boolean; // 精选置顶，仅管理后台可设
  origin?: SkillOrigin; // 改编自开源项目时的归属信息，仅种子/后台可设
  priceCents?: number; // 定价（分），缺省/0 = 免费（PR-W3）
  pricingModel?: 'once'; // 预留字段，本轮只有一次性买断
  authorId: string;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,60}$/;

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readSkills(): SkillEntry[] {
  ensureDataDir();
  if (!fs.existsSync(SKILLS_FILE)) {
    return [];
  }
  const raw = fs.readFileSync(SKILLS_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // 数据文件损坏（如写入中途被打断）：降级返回空集合而不是让整站 500，
    // 但必须打出明确日志——这不是合法的空结果，是故障。
    console.error('[skills-store] skills.json 解析失败，降级为空集合:', e);
    return [];
  }
}

function writeSkills(skills: SkillEntry[]) {
  ensureDataDir();
  // 先写临时文件再 rename（与 lib/packs-store.ts 同款）：整份覆盖写期间被读到的
  // 半截 JSON 会让 JSON.parse 抛错。
  const tmp = `${SKILLS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(skills, null, 2));
  fs.renameSync(tmp, SKILLS_FILE);
}

export interface SkillInput {
  id: string;
  name: string;
  description: string;
  icon?: string;
  triggers: string[];
  allowedTools?: string[];
  output?: string;
  prompt: string;
  category?: string;
  priceCents?: number; // 0 或 1~199900（分）
}

/** 定价上限：¥1999，与 lib/products.ts 保持一致 */
export const MAX_SKILL_PRICE_CENTS = 199900;

export function validateSkillInput(input: SkillInput): string | undefined {
  if (!SKILL_ID_RE.test(input.id)) return 'invalid_id';
  if (!input.name?.trim() || input.name.trim().length > 60) return 'invalid_name';
  if (!input.description?.trim() || input.description.trim().length > 200) return 'invalid_description';
  const triggers = (input.triggers || []).map(t => t.trim()).filter(Boolean);
  if (triggers.length < 1 || triggers.length > 20 || triggers.some(t => t.length > 40)) return 'invalid_triggers';
  const tools = (input.allowedTools || []).map(t => t.trim()).filter(Boolean);
  if (tools.length > 30 || tools.some(t => !TOOL_NAME_RE.test(t))) return 'invalid_tools';
  if (!input.prompt?.trim() || input.prompt.length > 20000) return 'invalid_prompt';
  if (input.output && input.output.length > 2000) return 'invalid_output';
  if (input.icon && [...input.icon].length > 4) return 'invalid_icon';
  if (input.category && !isSkillCategory(input.category)) return 'invalid_category';
  if (
    input.priceCents !== undefined &&
    (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > MAX_SKILL_PRICE_CENTS)
  ) {
    return 'invalid_price';
  }
  return undefined;
}

/**
 * 校验失败的投稿留底（JSONL 追加），便于维护者人工挽回流失内容。
 * 只记录业务字段（SkillInput 本身就是白名单），不含 cookie/token。留底失败不阻断响应。
 */
export function logFailedSubmission(record: { userId: string; error: string; input: SkillInput }) {
  try {
    ensureDataDir();
    fs.appendFileSync(FAILED_SUBMISSIONS_FILE, JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
  } catch {
    // 尽力而为
  }
}

function normalize(input: SkillInput) {
  return {
    id: input.id,
    name: input.name.trim(),
    description: input.description.trim(),
    icon: input.icon?.trim() || '◆',
    triggers: input.triggers.map(t => t.trim()).filter(Boolean),
    allowedTools: (input.allowedTools || []).map(t => t.trim()).filter(Boolean),
    output: input.output?.trim() || undefined,
    prompt: input.prompt,
    category: input.category && isSkillCategory(input.category) ? input.category : undefined,
    // 0 = 免费不落字段，保持既有 JSON 紧凑；pricingModel 固定 once（预留）
    priceCents: input.priceCents && input.priceCents > 0 ? input.priceCents : undefined,
    pricingModel: 'once' as const,
  };
}

export function listSkills(opts?: {
  q?: string;
  sort?: 'newest' | 'popular';
  authorId?: string;
  category?: string;
  featuredFirst?: boolean;
}): SkillEntry[] {
  let skills = readSkills();
  if (opts?.authorId) {
    skills = skills.filter(s => s.authorId === opts.authorId);
  }
  if (opts?.category) {
    skills = skills.filter(s => s.category === opts.category);
  }
  if (opts?.q) {
    const q = opts.q.trim().toLowerCase();
    skills = skills.filter(
      s =>
        s.id.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.triggers.some(t => t.toLowerCase().includes(q))
    );
  }
  if (opts?.sort === 'popular') {
    skills.sort((a, b) => b.downloads - a.downloads || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  } else {
    skills.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  if (opts?.featuredFirst) {
    skills.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  }
  return skills;
}

export function getSkill(id: string): SkillEntry | undefined {
  return readSkills().find(s => s.id === id);
}

export function createSkill(input: SkillInput, authorId: string): { skill?: SkillEntry; error?: string } {
  const error = validateSkillInput(input);
  if (error) return { error };
  const skills = readSkills();
  if (skills.some(s => s.id === input.id)) return { error: 'id_taken' };
  const now = new Date().toISOString();
  const skill: SkillEntry = {
    ...normalize(input),
    version: '1.0.0',
    authorId,
    downloads: 0,
    createdAt: now,
    updatedAt: now,
  };
  skills.push(skill);
  writeSkills(skills);
  return { skill };
}

export function updateSkill(id: string, input: SkillInput, authorId: string): { skill?: SkillEntry; error?: string } {
  const error = validateSkillInput({ ...input, id });
  if (error) return { error };
  const skills = readSkills();
  const index = skills.findIndex(s => s.id === id);
  if (index === -1) return { error: 'not_found' };
  if (skills[index].authorId !== authorId) return { error: 'forbidden' };
  // 版本号自动递增补丁位，重装即更新
  const [major, minor, patch] = skills[index].version.split('.').map(n => parseInt(n, 10) || 0);
  skills[index] = {
    ...skills[index],
    ...normalize({ ...input, id }),
    version: `${major}.${minor}.${patch + 1}`,
    updatedAt: new Date().toISOString(),
  };
  writeSkills(skills);
  return { skill: skills[index] };
}

/** 管理后台：删除 Skill（已装桌面端不受影响，仅从广场下架） */
export function deleteSkill(id: string): boolean {
  const skills = readSkills();
  const next = skills.filter(s => s.id !== id);
  if (next.length === skills.length) return false;
  writeSkills(next);
  return true;
}

/** 管理后台：设置/取消精选置顶 */
export function setSkillFeatured(id: string, featured: boolean): boolean {
  const skills = readSkills();
  const skill = skills.find(s => s.id === id);
  if (!skill) return false;
  skill.featured = featured || undefined;
  writeSkills(skills);
  return true;
}

export function incrementDownloads(id: string) {
  const skills = readSkills();
  const skill = skills.find(s => s.id === id);
  if (!skill) return;
  skill.downloads += 1;
  writeSkills(skills);
  recordDailyDownload(id);
}

/**
 * 免费榜「本周」窗口的数据源（dev-board#301）：downloads 是单调计数器、没有历史，
 * 这里按天补一份增量流水 data/skill-downloads-daily.json（{日期: {skillId: 次数}}），
 * 只保留最近 30 天。失败静默——榜单是衍生功能，绝不能反噬安装计数主路径。
 */
const DAILY_FILE = path.join(process.cwd(), 'data', 'skill-downloads-daily.json');

function recordDailyDownload(id: string) {
  try {
    let daily: Record<string, Record<string, number>> = {};
    try {
      daily = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf-8'));
    } catch { /* 首次或损坏：从空表重建 */ }
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    for (const day of Object.keys(daily)) {
      if (day < cutoff) delete daily[day];
    }
    daily[today] = daily[today] || {};
    daily[today][id] = (daily[today][id] || 0) + 1;
    // 先写临时文件再 rename：与 writeSkills 同款，避免写入中途中断留下半截 JSON
    const tmp = `${DAILY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(daily));
    fs.renameSync(tmp, DAILY_FILE);
  } catch { /* 见上：静默 */ }
}

/** 最近 N 天各 skill 的安装增量（供周榜） */
export function recentDownloadCounts(days: number): Map<string, number> {
  const counts = new Map<string, number>();
  try {
    const daily: Record<string, Record<string, number>> = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf-8'));
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    for (const [day, perSkill] of Object.entries(daily)) {
      if (day < cutoff) continue;
      for (const [id, n] of Object.entries(perSkill)) {
        counts.set(id, (counts.get(id) || 0) + n);
      }
    }
  } catch { /* 无流水即空表 */ }
  return counts;
}

/**
 * 生成桌面端 skill.yml。标量与数组一律用 JSON 编码 —— JSON 是 YAML 1.2 的子集，
 * 桌面端 SnakeYAML 可直接解析，且免去手写 YAML 转义的坑。
 */
export function toSkillYaml(skill: SkillEntry, authorUsername: string): string {
  const lines = [
    `id: ${JSON.stringify(skill.id)}`,
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description)}`,
    `icon: ${JSON.stringify(skill.icon)}`,
    `version: ${JSON.stringify(skill.version)}`,
    `author: ${JSON.stringify(authorUsername)}`,
    `homepage: ${JSON.stringify(`${siteConfig.origin}/${siteConfig.defaultLocale}/skills/${skill.id}`)}`,
    `triggers: ${JSON.stringify(skill.triggers)}`,
    `prompt: "prompt.md"`,
    `allowed_tools: ${JSON.stringify(skill.allowedTools)}`,
  ];
  if (skill.output) {
    lines.push(`output: ${JSON.stringify(skill.output)}`);
  }
  return lines.join('\n') + '\n';
}
