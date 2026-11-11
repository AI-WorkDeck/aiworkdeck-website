import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { once } from 'events';
import { hashFile, inspectTarGz, TAR_LIMITS, type TarInspection } from './pack-scan';
import { compareSemver } from './plugins-store';
import { signBytes } from './plugin-signing';

/**
 * 原生资源包（native pack）的提交 / 审核 / 发布存储层。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §1 / §2 / §3 / §8。
 *
 * 与 JAR 插件（plugins-store.ts）三点关键差异：
 *
 * 1. **体积量级不同**：JAR 受理上限 20 MB，可以整包进内存；pack 是 300 MB 量级，
 *    整条链路（上传、校验、发布）都必须流式，任何 readFileSync 都是 OOM。
 *    因此提交拆成三步：submit（收 manifest 草案，建 pending 草稿）→
 *    upload（逐个文件 octet-stream 流式落盘）→ finalize（受理检查）。
 * 2. **签名对象不同**：JAR 签的是两端重建的 canonical JSON；pack 签的是托管出去的
 *    manifest.json 原始字节（旁挂 .sig），审核通过那一刻定稿。
 * 3. **上架动作不在官网**：approve 只产出「发布件」到 data/pack-publish/（outbox），
 *    真正推上镜像由 scripts/publish-pack-outbox.sh 在服务器上执行——
 *    审核通过 ≠ 立即上架，发布节奏完全由平台控制（§1）。
 */

const PACKS_FILE = path.join(process.cwd(), 'data', 'packs.json');
const DRAFTS_FILE = path.join(process.cwd(), 'data', 'pack-drafts.json');
const SUBMISSIONS_ROOT = path.join(process.cwd(), 'data', 'pack-submissions');
const PUBLISH_ROOT = path.join(process.cwd(), 'data', 'pack-publish');

export const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const COMPONENT_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ARCHIVE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.tar\.gz$/;
const UNPACK_DIR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * 第一方 pack 保留名单：这些 id 由内置 skill 的 requires_pack 消费（§8.1），
 * 三方提交撞上一律拒收——否则三方能靠抢注 id 顶替第一方资源。
 */
export const RESERVED_PACK_IDS = ['litigation-visual'];

export const PLATFORM_KEYS = ['*', 'mac-arm64', 'win-x64'] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export const PACK_LIMITS = {
    /** 单次提交（全部 tar.gz 之和）上限 */
    submissionBytes: 300 * 1024 * 1024,
    /** 单个 tar 内条目数上限 */
    entryCount: TAR_LIMITS.entryCount,
    /** 单个 tar 解压后总体积上限 */
    unpackedBytes: TAR_LIMITS.unpackedBytes,
    /** 组件数上限（平台矩阵撑死几件，几十件必是异常提交） */
    componentCount: 32,
    /** 作者自述长度上限 */
    noteChars: 4000,
    /** 草稿有效期：超时未 finalize 的半成品会被清掉 */
    draftTtlMs: 6 * 60 * 60 * 1000,
};

export type PackStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface PackComponent {
    name: string;
    platforms: string[];
    archive: string;
    size: number;
    sha256: string;
    unpackDir: string;
}

/** 提交者随包附的未签名草案：没有 publishedAt、没有签名（§8.1） */
export interface PackManifestDraft {
    schema: number;
    id: string;
    version: string;
    minAppVersion: string;
    engineApi: number;
    components: PackComponent[];
}

/** 审核台用的组件摘要（逐条目清单在 .inspection.json 里，不进 packs.json） */
export interface PackComponentSummary {
    name: string;
    archive: string;
    platforms: string[];
    unpackDir: string;
    size: number;
    sha256: string;
    entryCount: number;
    unpackedBytes: number;
    execCount: number;
    literalCount: number;
}

export interface PackEntry {
    id: string;
    version: string;
    author: string;
    authorId: string;
    /** 作者的用途自述（§8.2 审核台展示） */
    note: string;
    manifest: PackManifestDraft;
    components: PackComponentSummary[];
    /** 全部 tar.gz 之和 */
    totalSize: number;
    status: PackStatus;
    reviewNote?: string;
    reviewedAt?: string;
    /** 整个 id 被封（revoke '*'）：封禁表要为它发一条 version "*" 的通配元素 */
    revokedAll?: boolean;
    /** 审核通过时写入 manifest 并被签名覆盖 */
    publishedAt?: string;
    /** manifest.json 定稿字节的 Ed25519 签名（base64） */
    signature?: string;
    /** manifest.json 定稿字节的 sha256，便于与发布件对账 */
    manifestSha256?: string;
    submittedAt: string;
    updatedAt: string;
}

interface PackDraft {
    token: string;
    id: string;
    version: string;
    authorId: string;
    author: string;
    note: string;
    manifest: PackManifestDraft;
    /** 声明要传的文件（= manifest 里全部组件的 archive） */
    files: { name: string; size: number }[];
    /** 已传完的文件：实测字节数与 sha256（边写边算，不回读） */
    uploaded: Record<string, { size: number; sha256: string }>;
    createdAt: string;
}

export type PackError =
    | 'manifest_invalid'
    | 'invalid_schema'
    | 'invalid_id'
    | 'reserved_id'
    | 'invalid_version'
    | 'invalid_min_app_version'
    | 'invalid_engine_api'
    | 'signed_fields_present'
    | 'no_components'
    | 'too_many_components'
    | 'invalid_component'
    | 'invalid_platform'
    | 'invalid_archive'
    | 'duplicate_archive'
    | 'invalid_unpack_dir'
    | 'invalid_size'
    | 'invalid_sha256'
    | 'submission_too_large'
    | 'note_too_long'
    | 'id_taken'
    | 'version_not_newer'
    | 'draft_not_found'
    | 'draft_expired'
    | 'not_owner'
    | 'file_not_declared'
    | 'file_already_uploaded'
    | 'size_mismatch'
    | 'sha256_mismatch'
    | 'file_missing'
    | 'bad_archive'
    | 'unsafe_path'
    | 'link_entry'
    | 'unsupported_entry'
    | 'too_many_entries'
    | 'unpacked_too_large';

/* ---------- 落盘（tmp + rename，与 plugins-store 同款） ---------- */

function ensureDirs() {
    fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
    fs.mkdirSync(SUBMISSIONS_ROOT, { recursive: true });
}

function readJsonFile<T>(file: string, fallback: T): T {
    ensureDirs();
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

function writeJsonFile(file: string, value: unknown) {
    ensureDirs();
    // 先写临时文件再 rename：审核与提交并发时避免读到半截 JSON
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
}

function readPacks(): PackEntry[] {
    return readJsonFile<PackEntry[]>(PACKS_FILE, []);
}

function writePacks(list: PackEntry[]) {
    writeJsonFile(PACKS_FILE, list);
}

function readDrafts(): PackDraft[] {
    return readJsonFile<PackDraft[]>(DRAFTS_FILE, []);
}

function writeDrafts(list: PackDraft[]) {
    writeJsonFile(DRAFTS_FILE, list);
}

export function submissionDir(id: string, version: string): string {
    return path.join(SUBMISSIONS_ROOT, id, version);
}

export function publishDir(id: string, version: string): string {
    return path.join(PUBLISH_ROOT, id, version);
}

function inspectionFile(id: string, version: string): string {
    return path.join(submissionDir(id, version), '.inspection.json');
}

/* ---------- 查询 ---------- */

export function listPacks(filter?: { status?: PackStatus; authorId?: string }): PackEntry[] {
    let list = readPacks();
    if (filter?.status) list = list.filter((p) => p.status === filter.status);
    if (filter?.authorId) list = list.filter((p) => p.authorId === filter.authorId);
    return [...list].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getPack(id: string, version?: string): PackEntry | undefined {
    const all = readPacks();
    if (version) return all.find((p) => p.id === id && p.version === version);
    const sameId = all.filter((p) => p.id === id);
    const approved = sameId.filter((p) => p.status === 'approved');
    const pool = approved.length ? approved : sameId;
    return pool.sort((a, b) => compareSemver(b.version, a.version))[0];
}

/** 审核台详情：逐条目清单与字面量线索（体积大，刻意不进 packs.json） */
export function readPackInspection(
    id: string,
    version: string
): Record<string, TarInspection> | undefined {
    const file = inspectionFile(id, version);
    if (!fs.existsSync(file)) return undefined;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return undefined;
    }
}

/** 审核时人工下载核查用的归档路径；只认该版本 manifest 里登记过的 archive */
export function packArchivePath(id: string, version: string, archive: string): string | undefined {
    const entry = getPack(id, version);
    if (!entry || !entry.manifest.components.some((c) => c.archive === archive)) return undefined;
    const target = path.join(submissionDir(id, version), archive);
    if (!isInside(submissionDir(id, version), target) || !fs.existsSync(target)) return undefined;
    return target;
}

function isInside(root: string, target: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(target));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/* ---------- manifest 草案校验 ---------- */

export function validateManifestDraft(raw: unknown): {
    manifest?: PackManifestDraft;
    error?: PackError;
    detail?: string;
} {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'manifest_invalid' };
    const m = raw as Record<string, unknown>;

    if (m.schema !== 1) return { error: 'invalid_schema' };
    // 草案里出现签名相关字段说明提交者搞错了流程：publishedAt 与签名只能由平台补
    if ('publishedAt' in m || 'signature' in m) return { error: 'signed_fields_present' };

    const id = String(m.id ?? '').trim().toLowerCase();
    if (!PACK_ID_RE.test(id)) return { error: 'invalid_id' };
    if (RESERVED_PACK_IDS.includes(id)) return { error: 'reserved_id', detail: id };

    const version = String(m.version ?? '').trim();
    if (!SEMVER_RE.test(version)) return { error: 'invalid_version' };

    const minAppVersion = String(m.minAppVersion ?? '').trim();
    if (!SEMVER_RE.test(minAppVersion)) return { error: 'invalid_min_app_version' };

    const engineApi = m.engineApi;
    if (!Number.isInteger(engineApi) || (engineApi as number) < 1 || (engineApi as number) > 1000) {
        return { error: 'invalid_engine_api' };
    }

    if (!Array.isArray(m.components) || m.components.length === 0) return { error: 'no_components' };
    if (m.components.length > PACK_LIMITS.componentCount) return { error: 'too_many_components' };

    const components: PackComponent[] = [];
    const archives = new Set<string>();
    let totalSize = 0;
    for (const rawComponent of m.components as unknown[]) {
        if (!rawComponent || typeof rawComponent !== 'object') return { error: 'invalid_component' };
        const c = rawComponent as Record<string, unknown>;

        const name = String(c.name ?? '').trim();
        if (!COMPONENT_NAME_RE.test(name)) return { error: 'invalid_component', detail: String(c.name ?? '') };

        if (!Array.isArray(c.platforms) || c.platforms.length === 0) {
            return { error: 'invalid_platform', detail: name };
        }
        const platforms = (c.platforms as unknown[]).map((p) => String(p));
        if (platforms.some((p) => !(PLATFORM_KEYS as readonly string[]).includes(p))) {
            return { error: 'invalid_platform', detail: platforms.join(', ') };
        }
        if (new Set(platforms).size !== platforms.length) {
            return { error: 'invalid_platform', detail: `${name} 平台键重复` };
        }

        const archive = String(c.archive ?? '').trim();
        if (!ARCHIVE_NAME_RE.test(archive)) return { error: 'invalid_archive', detail: archive };
        if (archives.has(archive)) return { error: 'duplicate_archive', detail: archive };
        archives.add(archive);

        const unpackDir = String(c.unpackDir ?? '').trim();
        if (!UNPACK_DIR_RE.test(unpackDir)) return { error: 'invalid_unpack_dir', detail: unpackDir };

        const size = c.size;
        if (!Number.isInteger(size) || (size as number) <= 0 || (size as number) > PACK_LIMITS.submissionBytes) {
            return { error: 'invalid_size', detail: archive };
        }
        totalSize += size as number;

        const sha256 = String(c.sha256 ?? '').trim().toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(sha256)) return { error: 'invalid_sha256', detail: archive };

        components.push({ name, platforms, archive, size: size as number, sha256, unpackDir });
    }

    if (totalSize > PACK_LIMITS.submissionBytes) {
        return { error: 'submission_too_large', detail: `${Math.round(totalSize / 1024 / 1024)} MB` };
    }

    return { manifest: { schema: 1, id, version, minAppVersion, engineApi: engineApi as number, components } };
}

/**
 * id 归属与版本单调（§8.1）：新 id 归提交者，老 id 只有原作者能提新版本，
 * 且必须严格高于该 id 已有的最高版本（含被驳回/被封禁的——版本号不回收）。
 */
function checkOwnershipAndVersion(
    id: string,
    version: string,
    authorId: string
): { error?: PackError; detail?: string } {
    const existing = readPacks().filter((p) => p.id === id);
    if (!existing.length) return {};
    if (existing[0].authorId !== authorId) return { error: 'id_taken' };
    const highest = existing.map((p) => p.version).sort(compareSemver).pop()!;
    if (compareSemver(version, highest) <= 0) {
        return { error: 'version_not_newer', detail: `已有版本 ${highest}` };
    }
    return {};
}

/* ---------- 第一步：建草稿 ---------- */

export interface DraftView {
    token: string;
    id: string;
    version: string;
    files: { name: string; size: number }[];
    totalSize: number;
}

/**
 * 收 manifest 草案，建 pending 草稿并返回 uploadToken。
 * 这一步只做「不看实物就能判的检查」；实物相关的（sha256、tar 内容）在 finalize。
 */
export function createPackDraft(
    rawManifest: unknown,
    author: { id: string; username: string },
    opts?: { note?: string }
): { draft?: DraftView; error?: PackError; detail?: string } {
    const note = String(opts?.note ?? '').trim();
    if (note.length > PACK_LIMITS.noteChars) return { error: 'note_too_long' };

    const { manifest, error, detail } = validateManifestDraft(rawManifest);
    if (error || !manifest) return { error, detail };

    const owned = checkOwnershipAndVersion(manifest.id, manifest.version, author.id);
    if (owned.error) return owned;

    // 别人正在传的同 id 草稿不许碰：下面的清理会删掉目标目录，
    // 不拦住就等于「谁后提交谁能抹掉对方传了一半的几百兆」
    const foreignDraft = readDrafts().find(
        (d) =>
            d.id === manifest.id &&
            d.authorId !== author.id &&
            Date.now() - Date.parse(d.createdAt) <= PACK_LIMITS.draftTtlMs
    );
    if (foreignDraft) return { error: 'id_taken' };

    // 同一 id+version 的旧草稿直接作废（连同已传的半成品），避免两次提交串味
    const drafts = readDrafts().filter((d) => {
        const stale = Date.now() - Date.parse(d.createdAt) > PACK_LIMITS.draftTtlMs;
        const sameTarget = d.id === manifest.id && d.version === manifest.version;
        if (stale || sameTarget) {
            fs.rmSync(submissionDir(d.id, d.version), { recursive: true, force: true });
            return false;
        }
        return true;
    });

    const dir = submissionDir(manifest.id, manifest.version);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const draft: PackDraft = {
        token: crypto.randomBytes(24).toString('base64url'),
        id: manifest.id,
        version: manifest.version,
        authorId: author.id,
        author: author.username,
        note,
        manifest,
        files: manifest.components.map((c) => ({ name: c.archive, size: c.size })),
        uploaded: {},
        createdAt: new Date().toISOString(),
    };
    drafts.push(draft);
    writeDrafts(drafts);

    return {
        draft: {
            token: draft.token,
            id: draft.id,
            version: draft.version,
            files: draft.files,
            totalSize: draft.files.reduce((sum, f) => sum + f.size, 0),
        },
    };
}

function findDraft(token: string): { draft?: PackDraft; error?: PackError } {
    const draft = readDrafts().find((d) => d.token === token);
    if (!draft) return { error: 'draft_not_found' };
    if (Date.now() - Date.parse(draft.createdAt) > PACK_LIMITS.draftTtlMs) return { error: 'draft_expired' };
    return { draft };
}

function saveDraft(updated: PackDraft) {
    const drafts = readDrafts();
    const index = drafts.findIndex((d) => d.token === updated.token);
    if (index === -1) return;
    drafts[index] = updated;
    writeDrafts(drafts);
}

function dropDraft(token: string) {
    writeDrafts(readDrafts().filter((d) => d.token !== token));
}

/* ---------- 第二步：流式收文件 ---------- */

/**
 * 收一个组件归档。**整条路径不许出现 formData()/arrayBuffer()**——
 * 那会把整包缓冲进内存，300 MB 的包在 1.8 GB 内存的生产机上直接打死站点。
 *
 * 体积双保险（§8.1）：contentLength 预检挡住「声称就很大」的请求，
 * 实际写入计数挡住「header 撒谎」的请求——分块传输根本没有 Content-Length。
 */
export async function receiveUpload(
    token: string,
    fileName: string,
    source: Readable,
    opts: { authorId: string; contentLength?: number }
): Promise<{ ok?: true; size?: number; sha256?: string; error?: PackError; detail?: string }> {
    const { draft, error } = findDraft(token);
    if (error || !draft) return { error };
    if (draft.authorId !== opts.authorId) return { error: 'not_owner' };

    const declared = draft.files.find((f) => f.name === fileName);
    if (!declared) return { error: 'file_not_declared', detail: fileName };
    if (draft.uploaded[fileName]) return { error: 'file_already_uploaded', detail: fileName };
    if (opts.contentLength !== undefined && opts.contentLength > declared.size) {
        return { error: 'size_mismatch', detail: `声明 ${declared.size} 字节，实到 ${opts.contentLength}` };
    }

    const dir = submissionDir(draft.id, draft.version);
    fs.mkdirSync(dir, { recursive: true });
    const partPath = path.join(dir, `${fileName}.part`);
    const finalPath = path.join(dir, fileName);
    if (!isInside(dir, partPath) || !isInside(dir, finalPath)) {
        return { error: 'file_not_declared', detail: fileName };
    }

    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(partPath);
    let written = 0;
    try {
        for await (const chunk of source as unknown as AsyncIterable<Buffer>) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            written += buf.length;
            if (written > declared.size) {
                out.destroy();
                fs.rmSync(partPath, { force: true });
                return { error: 'size_mismatch', detail: `${fileName} 超出声明的 ${declared.size} 字节` };
            }
            hash.update(buf);
            if (!out.write(buf)) await once(out, 'drain');
        }
        await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    } catch {
        out.destroy();
        fs.rmSync(partPath, { force: true });
        return { error: 'bad_archive', detail: `${fileName} 上传中断` };
    }

    if (written !== declared.size) {
        fs.rmSync(partPath, { force: true });
        return { error: 'size_mismatch', detail: `声明 ${declared.size} 字节，实到 ${written}` };
    }

    // 传完才改名：中途断线留下的只有 .part，扫描路径看不到半成品
    fs.renameSync(partPath, finalPath);
    const sha256 = hash.digest('hex');

    const fresh = findDraft(token).draft;
    if (!fresh) return { error: 'draft_not_found' };
    fresh.uploaded[fileName] = { size: written, sha256 };
    saveDraft(fresh);

    return { ok: true, size: written, sha256 };
}

/* ---------- 第三步：受理检查 ---------- */

/**
 * 全部文件传完后触发受理。任一硬检查不过：整个提交目录删除、草稿作废、
 * 返回具体原因（§8.1）。通过则落成 pending，进人工审核队列。
 */
export async function finalizePack(
    token: string,
    opts: { authorId: string }
): Promise<{ pack?: PackEntry; error?: PackError; detail?: string }> {
    const found = findDraft(token);
    if (found.error || !found.draft) return { error: found.error };
    const draft = found.draft;
    if (draft.authorId !== opts.authorId) return { error: 'not_owner' };

    const dir = submissionDir(draft.id, draft.version);
    const abort = (error: PackError, detail?: string) => {
        fs.rmSync(dir, { recursive: true, force: true });
        dropDraft(token);
        return { error, detail };
    };

    // 提交期间可能有别人抢注了 id、或自己另开了更高版本：这里再判一次
    const owned = checkOwnershipAndVersion(draft.id, draft.version, draft.authorId);
    if (owned.error) return abort(owned.error, owned.detail);

    const inspections: Record<string, TarInspection> = {};
    const components: PackComponentSummary[] = [];
    let totalSize = 0;

    for (const component of draft.manifest.components) {
        const filePath = path.join(dir, component.archive);
        if (!fs.existsSync(filePath)) return abort('file_missing', component.archive);

        // 不信任上传期算出的哈希：以磁盘上的实物为准重算一遍（流式）
        const { sha256, size } = await hashFile(filePath);
        if (size !== component.size) {
            return abort('size_mismatch', `${component.archive} manifest 声明 ${component.size}，实物 ${size}`);
        }
        if (sha256 !== component.sha256) {
            return abort('sha256_mismatch', `${component.archive} manifest 声明 ${component.sha256}，实物 ${sha256}`);
        }
        totalSize += size;
        if (totalSize > PACK_LIMITS.submissionBytes) return abort('submission_too_large');

        const result = await inspectTarGz(filePath, {
            entryCount: PACK_LIMITS.entryCount,
            unpackedBytes: PACK_LIMITS.unpackedBytes,
        });
        if (result.error || !result.inspection) {
            return abort(result.error!, result.detail ? `${component.archive}: ${result.detail}` : component.archive);
        }
        inspections[component.archive] = result.inspection;
        components.push({
            name: component.name,
            archive: component.archive,
            platforms: component.platforms,
            unpackDir: component.unpackDir,
            size: component.size,
            sha256: component.sha256,
            entryCount: result.inspection.entryCount,
            unpackedBytes: result.inspection.unpackedBytes,
            execCount: result.inspection.entries.filter((e) => e.exec).length,
            literalCount: result.inspection.literals.length,
        });
    }

    fs.writeFileSync(inspectionFile(draft.id, draft.version), JSON.stringify(inspections));

    const now = new Date().toISOString();
    const entry: PackEntry = {
        id: draft.id,
        version: draft.version,
        author: draft.author,
        authorId: draft.authorId,
        note: draft.note,
        manifest: draft.manifest,
        components,
        totalSize,
        status: 'pending',
        submittedAt: now,
        updatedAt: now,
    };

    const all = readPacks();
    all.push(entry);
    writePacks(all);
    dropDraft(token);
    return { pack: entry };
}

/* ---------- 审核 ---------- */

/**
 * manifest.json 的**定稿字节**：补 publishedAt、按固定键序重排一次序列化，
 * 得到的这串字节既是签名对象，也是托管出去的那份文件本身。
 * 客户端验签验的是它下载到的整个文件字节，因此这里的键序与缩进一旦定下就不能改。
 */
export function finalManifestBytes(manifest: PackManifestDraft, publishedAt: string): Buffer {
    const ordered = {
        schema: manifest.schema,
        id: manifest.id,
        version: manifest.version,
        publishedAt,
        minAppVersion: manifest.minAppVersion,
        engineApi: manifest.engineApi,
        components: manifest.components.map((c) => ({
            name: c.name,
            platforms: c.platforms,
            archive: c.archive,
            size: c.size,
            sha256: c.sha256,
            unpackDir: c.unpackDir,
        })),
    };
    return Buffer.from(`${JSON.stringify(ordered, null, 2)}\n`, 'utf-8');
}

/**
 * 审核通过 = 签名 + 出发布件。
 *
 * 产物落 data/pack-publish/<id>/<version>/（outbox）：manifest.json 定稿 +
 * manifest.json.sig + 全部 tar.gz。**这一步不上架**——推上镜像与切指针由
 * scripts/publish-pack-outbox.sh 在服务器上执行（§8.3）。
 */
export function approvePack(id: string, version: string): { ok: boolean; reason?: string } {
    const all = readPacks();
    const entry = all.find((p) => p.id === id && p.version === version);
    if (!entry) return { ok: false, reason: 'not_found' };

    const publishedAt = new Date().toISOString();
    const manifestBytes = finalManifestBytes(entry.manifest, publishedAt);
    const signature = signBytes(manifestBytes);
    if (!signature) return { ok: false, reason: 'signing_not_configured' };

    const srcDir = submissionDir(id, version);
    const outDir = publishDir(id, version);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    for (const component of entry.manifest.components) {
        const src = path.join(srcDir, component.archive);
        if (!fs.existsSync(src)) {
            fs.rmSync(outDir, { recursive: true, force: true });
            return { ok: false, reason: 'archive_missing' };
        }
        fs.copyFileSync(src, path.join(outDir, component.archive));
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestBytes);
    fs.writeFileSync(path.join(outDir, 'manifest.json.sig'), `${signature}\n`);

    entry.status = 'approved';
    entry.signature = signature;
    entry.manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
    entry.publishedAt = publishedAt;
    entry.reviewedAt = publishedAt;
    entry.reviewNote = undefined;
    entry.updatedAt = publishedAt;
    writePacks(all);
    return { ok: true };
}

export function rejectPack(id: string, version: string, note: string): boolean {
    const all = readPacks();
    const entry = all.find((p) => p.id === id && p.version === version);
    if (!entry) return false;
    const now = new Date().toISOString();
    entry.status = 'rejected';
    entry.reviewNote = note;
    entry.reviewedAt = now;
    entry.updatedAt = now;
    entry.signature = undefined;
    writePacks(all);
    return true;
}

/**
 * 封禁一个已上架版本；version 传 '*' 封禁该 id 全部版本。
 * 只改状态与封禁表——镜像上的删档与指针回退是服务器侧动作（§8.4）。
 */
export function revokePack(id: string, version: string, reason: string): boolean {
    const all = readPacks();
    const targets = version === '*' ? all.filter((p) => p.id === id) : all.filter((p) => p.id === id && p.version === version);
    if (!targets.length) return false;
    const now = new Date().toISOString();
    for (const target of targets) {
        target.status = 'revoked';
        target.reviewNote = reason;
        target.reviewedAt = now;
        target.updatedAt = now;
        // 通配封禁要在封禁表里如实表达成 version "*"：镜像上可能存在官网没有记录的
        // 版本（回退安装用的旧版本快照常年在架），逐版本枚举挡不住它们
        if (version === '*') target.revokedAll = true;
    }
    writePacks(all);
    return true;
}
