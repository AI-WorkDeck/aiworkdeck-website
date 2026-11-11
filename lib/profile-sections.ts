import 'server-only';

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { findSchool } from './schools';

/**
 * 作者主页简历模块（dev-board#303）。
 *
 * 设计裁决：
 * - 模块按律所官网律师页的信息结构做（执业信息/专业领域/教育背景/社会任职/代表业绩/联系方式），
 *   比 LinkedIn 通用简历更贴律师身份；条目一律**自由文本一行一条**——律师简历条目本来就是
 *   成句展示，结构化字段（school/degree 分列）只会把编辑做复杂。
 * - **联系方式添加即公开**（维护者 2026-08-30 拍板）：不填不显示，填了就是为了获客公开；
 *   编辑处文案明示「将公开展示」。
 * - order 承载拖拽排序结果；未出现在 order 里的已填模块追加在尾部（向后兼容新增模块类型）。
 */

export const SECTION_TYPES = ['practice', 'expertise', 'education', 'positions', 'highlights', 'contact'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** 结构化教育条目（dev-board#307）：字段各自约束，不做开放式；domain 由服务端
 * 按学校名在院校名录里解析冻结，用于校徽热链，客户端传入的 domain 一律不信 */
export interface EducationEntry {
    school: string;
    degree?: string;
    startYear?: number;
    endYear?: number;
    domain?: string;
}

export interface ProfileSections {
    order: SectionType[];
    /** 执业信息：职业头衔 + 工作单位 */
    practice?: { title?: string; org?: string };
    /** 专业领域标签 */
    expertise?: string[];
    /** 教育背景（结构化；历史数据可能是 string，读取时归一） */
    education?: EducationEntry[];
    /** 社会任职（一行一条） */
    positions?: string[];
    /** 代表业绩（一行一条） */
    highlights?: string[];
    /** 联系方式（添加即公开）；hasWechatQr 表示已上传微信二维码图 */
    contact?: { phone?: string; email?: string; hasWechatQr?: boolean };
}

const FILE = path.join(process.cwd(), 'data', 'profile-sections.json');
const LINE_MAX = 120;
const LIST_MAX = 12;
const TAG_MAX = 24;

function readAll(): Record<string, ProfileSections> {
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function writeAll(all: Record<string, ProfileSections>) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 1));
    fs.renameSync(tmp, FILE);
}

export function getProfileSections(userId: string): ProfileSections {
    const mine = readAll()[userId];
    if (!mine) return { order: [] };
    // 历史兼容：教育条目曾是自由文本 string，一律归一成结构化条目
    if (Array.isArray(mine.education)) {
        mine.education = (mine.education as unknown[]).map(e =>
            typeof e === 'string' ? { school: e } : (e as EducationEntry)
        );
    }
    return mine;
}

const line = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, LINE_MAX) : '');
const list = (v: unknown, itemMax = LINE_MAX) =>
    Array.isArray(v)
        ? v.map(x => (typeof x === 'string' ? x.trim().slice(0, itemMax) : '')).filter(Boolean).slice(0, LIST_MAX)
        : [];

/** 白名单化清洗：未知字段丢弃、超长截断、空模块删除。永不抛错。 */
export function sanitizeSections(input: unknown, hasWechatQr: boolean): ProfileSections {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const out: ProfileSections = { order: [] };

    const practice = raw.practice as Record<string, unknown> | undefined;
    const title = line(practice?.title);
    const org = line(practice?.org);
    if (title || org) out.practice = { ...(title && { title }), ...(org && { org }) };

    const expertise = list(raw.expertise, TAG_MAX);
    if (expertise.length) out.expertise = expertise;
    for (const key of ['positions', 'highlights'] as const) {
        const items = list(raw[key]);
        if (items.length) out[key] = items;
    }

    // 教育：结构化条目逐字段白名单；年份约束 1900..今年+10；domain 服务端解析冻结
    if (Array.isArray(raw.education)) {
        const maxYear = new Date().getFullYear() + 10;
        const year = (v: unknown): number | undefined => {
            const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
            return Number.isInteger(n) && n >= 1900 && n <= maxYear ? n : undefined;
        };
        const entries = (raw.education as unknown[])
            .map(e => {
                const src = typeof e === 'string' ? { school: e } : (e && typeof e === 'object' ? e : {});
                const rec = src as Record<string, unknown>;
                const school = line(rec.school).slice(0, 80);
                if (!school) return null;
                const degree = line(rec.degree).slice(0, 40);
                const startYear = year(rec.startYear);
                const endYear = year(rec.endYear);
                const domain = findSchool(school)?.domain;
                return {
                    school,
                    ...(degree && { degree }),
                    ...(startYear && { startYear }),
                    ...(endYear && { endYear }),
                    ...(domain && { domain }),
                } as EducationEntry;
            })
            .filter((e): e is EducationEntry => !!e)
            .slice(0, 8);
        if (entries.length) out.education = entries;
    }

    const contact = raw.contact as Record<string, unknown> | undefined;
    const phone = line(contact?.phone).slice(0, 32);
    const email = line(contact?.email).slice(0, 80);
    if (phone || email || hasWechatQr) {
        out.contact = { ...(phone && { phone }), ...(email && { email }), ...(hasWechatQr && { hasWechatQr: true }) };
    }

    const seen = new Set<SectionType>();
    const order = Array.isArray(raw.order) ? raw.order : [];
    for (const t of order) {
        if (SECTION_TYPES.includes(t as SectionType) && !seen.has(t as SectionType)) {
            seen.add(t as SectionType);
        }
    }
    // 已填但没进 order 的模块补到尾部；order 里没内容的模块留着（空模块不渲染但保序无害）
    for (const t of SECTION_TYPES) {
        if (!seen.has(t) && out[t] !== undefined) seen.add(t);
    }
    out.order = [...seen];
    return out;
}

export function saveProfileSections(userId: string, input: unknown): ProfileSections {
    const all = readAll();
    const sanitized = sanitizeSections(input, !!readWechatQr(userId));
    all[userId] = sanitized;
    writeAll(all);
    return sanitized;
}

/* ---------- 微信二维码图（联系方式模块的可选附件，处理方式同头像） ---------- */

const QR_DIR = path.join(process.cwd(), 'data', 'profile-qr');
export const QR_MAX_BYTES = 5 * 1024 * 1024;

function qrPath(userId: string): string {
    return path.join(QR_DIR, `${userId}.webp`);
}

/** 与 lib/avatars 同理：一律经 sharp 重编码，剥 EXIF、防伪装文件 */
export async function saveWechatQr(userId: string, buffer: Buffer): Promise<{ error?: string }> {
    if (buffer.length > QR_MAX_BYTES) return { error: 'too_large' };
    try {
        const webp = await sharp(buffer, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
        fs.mkdirSync(QR_DIR, { recursive: true });
        fs.writeFileSync(qrPath(userId), webp);
        // contact.hasWechatQr 跟着落一次盘，保证公开页与文件状态一致
        const all = readAll();
        const mine = all[userId] ?? { order: [] };
        mine.contact = { ...(mine.contact ?? {}), hasWechatQr: true };
        if (!mine.order.includes('contact')) mine.order.push('contact');
        all[userId] = mine;
        writeAll(all);
        return {};
    } catch {
        return { error: 'invalid_image' };
    }
}

export function deleteWechatQr(userId: string) {
    try {
        fs.rmSync(qrPath(userId), { force: true });
    } catch { /* 已不存在即达成目的 */ }
    const all = readAll();
    const mine = all[userId];
    if (mine?.contact) {
        delete mine.contact.hasWechatQr;
        if (!mine.contact.phone && !mine.contact.email) delete mine.contact;
        writeAll(all);
    }
}

export function readWechatQr(userId: string): Buffer | null {
    try {
        return fs.readFileSync(qrPath(userId));
    } catch {
        return null;
    }
}
