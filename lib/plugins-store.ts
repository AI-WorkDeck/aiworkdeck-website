import { validatePluginPlatformManifest } from './plugin-manifest-platform';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { scanPluginPackage, type ScanReport } from './plugin-scan';
import { canonicalPayload, signPayload, sha256, type SignedPayload } from './plugin-signing';
import { siteConfig } from './site-config';
import { isLocale, LOCALE_META } from '@/i18n-config';

/**
 * 插件的提交 / 审核 / 分发存储。契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md，
 * Web 插件（web/ + frontendEntry）见 docs/NATIVE_PACK_DISTRIBUTION.md §11。
 *
 * 与 Skill 的关键区别：Skill 是纯文本、登录即发布；插件是可执行代码、
 * 与宿主同 JVM 同权限，因此**必须人工审核后签名才能上架，没有自动通过路径**。
 *
 * 二进制不放 public/——那样会绕过状态检查被直接下载。统一存 data/plugin-files/
 * 由 API 路由按状态与路径白名单流式返回。
 */

const PLUGINS_FILE = path.join(process.cwd(), 'data', 'plugins.json');
const FILES_ROOT = path.join(process.cwd(), 'data', 'plugin-files');

export const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** 受理硬性上限，见 PLUGIN_DISTRIBUTION.md §3 */
export const LIMITS = {
  packageBytes: 20 * 1024 * 1024,
  entryCount: 2000,
  singleFileBytes: 50 * 1024 * 1024,
};

export type PluginStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface PluginToolInfo {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface PluginEntry {
  id: string;
  version: string;
  name: string;
  description: string;
  icon?: string;
  author: string; // 提交者 username（快照，便于 registry 直出）
  authorId: string;
  homepage?: string;
  permissions: string[];
  tools: PluginToolInfo[];
  /** Web 插件入口（web/ 之下的相对路径）；纯 JAR 插件为空。见 NATIVE_PACK_DISTRIBUTION.md §11 */
  frontendEntry?: string;
  /** 相对包根路径 -> sha256 */
  files: Record<string, string>;
  size: number;
  status: PluginStatus;
  scan: ScanReport;
  /** 审核意见：驳回原因或封禁原因 */
  reviewNote?: string;
  reviewedAt?: string;
  signature?: string; // 审核通过时生成
  publishedAt?: string;
  downloads: number;
  submittedAt: string;
  updatedAt: string;
  priceCents?: number; // 定价（分），缺省/0 = 免费（PR-W3）
  pricingModel?: 'once'; // 预留字段，本轮只有一次性买断
}

/** 定价上限：¥1999，与 lib/products.ts 保持一致 */
export const MAX_PLUGIN_PRICE_CENTS = 199900;

function ensureDirs() {
  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
  fs.mkdirSync(FILES_ROOT, { recursive: true });
}

function readPlugins(): PluginEntry[] {
  ensureDirs();
  if (!fs.existsSync(PLUGINS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PLUGINS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writePlugins(list: PluginEntry[]) {
  ensureDirs();
  // 先写临时文件再 rename：审核与下载并发时避免读到半截 JSON
  const tmp = `${PLUGINS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, PLUGINS_FILE);
}

export function listPlugins(filter?: { status?: PluginStatus }): PluginEntry[] {
  const all = readPlugins();
  const list = filter?.status ? all.filter((p) => p.status === filter.status) : all;
  return [...list].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getPlugin(id: string, version?: string): PluginEntry | undefined {
  const all = readPlugins();
  if (version) return all.find((p) => p.id === id && p.version === version);
  // 不指定版本时返回该 id 最新的已上架版本，没有则返回最新提交
  const sameId = all.filter((p) => p.id === id);
  const approved = sameId.filter((p) => p.status === 'approved');
  const pool = approved.length ? approved : sameId;
  return pool.sort((a, b) => compareSemver(b.version, a.version))[0];
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export type SubmitError =
  | 'developer_permissions_required'
  | 'package_too_large'
  | 'too_many_entries'
  | 'file_too_large'
  | 'bad_zip'
  | 'unsafe_path'
  | 'manifest_missing'
  | 'manifest_invalid'
  | 'invalid_id'
  | 'invalid_version'
  | 'id_taken'
  | 'version_not_newer'
  | 'jar_missing'
  | 'frontend_entry_invalid'
  | 'no_payload'
  | 'contributed_file_missing';

/** Web 插件资源目录：frontendEntry 必须落在它之下 */
export const WEB_DIR = 'web/';

function pluginDisplayLocales(language?: string): string[] {
  const locale = isLocale(language) ? language : siteConfig.defaultLocale;
  return [...new Set([LOCALE_META[locale].bcp47, 'en-US', 'zh-CN'])];
}

function pluginDisplayText(value: unknown, fallback: string, files: Map<string, Buffer>, locales = pluginDisplayLocales()): string {
  const text = String(value || fallback);
  const token = /^%([^%]+)%$/.exec(text);
  if (!token) return text;
  for (const locale of locales) {
    const bytes = files.get(`l10n/${locale}.json`);
    if (!bytes) continue;
    try {
      const translated = JSON.parse(bytes.toString('utf8'))?.[token[1]];
      if (typeof translated === 'string' && translated.trim() && !/^%[^%]+%$/.test(translated)) return translated;
    } catch { /* Invalid optional dictionary: try the fallback language. */ }
  }
  return fallback;
}

/** Resolve display at read time: INTL mirrors CN-signed entries without rewriting them. */
export function getPluginDisplay(entry: PluginEntry, language?: string): Pick<PluginEntry, 'name' | 'description'> {
  const fallback = { name: entry.name, description: entry.description };
  try {
    const manifestBytes = readPluginFile(entry.id, entry.version, 'manifest.json');
    if (!manifestBytes) return fallback;
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return fallback;
    const files = new Map<string, Buffer>();
    const locales = pluginDisplayLocales(language);
    for (const locale of locales) {
      const name = `l10n/${locale}.json`;
      const bytes = readPluginFile(entry.id, entry.version, name);
      if (bytes) files.set(name, bytes);
    }
    return {
      name: pluginDisplayText(manifest.name, entry.name, files, locales),
      description: pluginDisplayText(manifest.description, entry.description, files, locales),
    };
  } catch { // Older mirrored entries may not have readable package metadata.
    return fallback;
  }
}

/**
 * 受理一个提交包。全部硬性检查通过后落盘为 pending，等待人工审核。
 * 任一检查失败都不落任何文件。
 */
export function submitPlugin(
  zipBuffer: Buffer,
  author: { id: string; username: string },
  opts?: { priceCents?: number; allowedPermissions?: readonly string[] }
): { plugin?: PluginEntry; error?: SubmitError; detail?: string } {
  if (zipBuffer.length > LIMITS.packageBytes) return { error: 'package_too_large' };

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return { error: 'bad_zip' };
  }

  const entries = zip.getEntries();
  if (entries.length > LIMITS.entryCount) return { error: 'too_many_entries' };

  // 逐条目做 zip slip 与体积检查，同时读进内存
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (name.split('/').some(part => /^\.awd-(?:dev|service-trust|bundled)(?:$|[.-])/i.test(part)) || files.has(name) || ((entry.attr >>> 16) & 0o170000) === 0o120000) return { error: 'unsafe_path', detail: name };
    if (!isSafeEntryPath(name)) return { error: 'unsafe_path', detail: name };
    if (entry.header.size > LIMITS.singleFileBytes) return { error: 'file_too_large', detail: name };
    try {
      files.set(name, entry.getData());
    } catch {
      return { error: 'bad_zip', detail: name };
    }
  }

  const manifestBuf = files.get('manifest.json');
  if (!manifestBuf) return { error: 'manifest_missing' };

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestBuf.toString('utf-8'));
  } catch {
    return { error: 'manifest_invalid' };
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { error: 'manifest_invalid' };
  let platformPayload = 0;
  try { platformPayload = validatePluginPlatformManifest(manifest, files).payloadCount; }
  catch (error) { return { error: 'manifest_invalid', detail: error instanceof Error ? error.message : 'Invalid platform contract' }; }

  const id = String(manifest.id || '').trim().toLowerCase();
  if (!PLUGIN_ID_RE.test(id)) return { error: 'invalid_id' };
  const version = String(manifest.version || '').trim();
  if (!SEMVER_RE.test(version)) return { error: 'invalid_version' };

  const existing = readPlugins().filter((p) => p.id === id);
  if (existing.length) {
    // id 归属：只有原作者能发新版本
    if (existing[0].authorId !== author.id) return { error: 'id_taken' };
    const highest = existing.map((p) => p.version).sort(compareSemver).pop()!;
    if (compareSemver(version, highest) <= 0) {
      return { error: 'version_not_newer', detail: `已有版本 ${highest}` };
    }
  }

  // 定价缺省继承（PR-W3 审查修复）：新版本漏传价格时沿用上一版本标价，
  // 防止付费插件因脚本/旧表单漏传 priceCents 在审核通过后静默变免费；显式传 0 才是改为免费
  let priceCents = opts?.priceCents;
  if (priceCents === undefined && existing.length) {
    const prev = [...existing].sort((a, b) => compareSemver(a.version, b.version)).pop()!;
    priceCents = prev.priceCents ?? 0;
  }

  const backendJars = Array.isArray(manifest.backendJars) ? (manifest.backendJars as string[]) : [];
  for (const jarName of backendJars) {
    if (!isSafeEntryPath(jarName) || !files.has(jarName)) {
      return { error: 'jar_missing', detail: jarName };
    }
  }

  // Web 插件（NATIVE_PACK_DISTRIBUTION.md §11）：frontendEntry 指向包内 web/ 下的静态入口。
  // 越界（../、web/ 之外、绝对路径）与指向不存在的文件都拒收——桌面端会把 web/ 整个
  // 静态服务出去，入口路径是它唯一的加载依据，这里放行等于让它去 load 一个不存在的东西。
  const frontendEntry = manifest.frontendEntry == null ? '' : String(manifest.frontendEntry).trim();
  if (frontendEntry) {
    if (
      !isSafeEntryPath(frontendEntry) ||
      !frontendEntry.startsWith(WEB_DIR) ||
      !files.has(frontendEntry)
    ) {
      return { error: 'frontend_entry_invalid', detail: frontendEntry };
    }
  }

  // 声明式贡献点（桌面仓插件规范 v2.9 §14）：纯声明插件（只有 manifest + 数据文件）
  // 也是合法载荷——模板/样式画像/皮肤声明的文件必须真实存在于包内（与 backendJars 同口径）。
  const contributes = (manifest.contributes ?? {}) as Record<string, unknown>;
  const declaredFiles: string[] = [];
  for (const key of ['templates', 'styleProfiles', 'themes'] as const) {
    const arr = Array.isArray(contributes[key]) ? (contributes[key] as { file?: unknown }[]) : [];
    for (const item of arr) {
      const rel = item && item.file != null ? String(item.file).trim() : '';
      if (!rel || !isSafeEntryPath(rel) || !files.has(rel)) {
        return { error: 'contributed_file_missing', detail: `${key}: ${rel || '(空)'}` };
      }
      declaredFiles.push(rel);
    }
  }
  const settingsCount = Array.isArray(manifest.settings) ? (manifest.settings as unknown[]).length : 0;
  const evidenceSourceCount = Array.isArray((contributes as { evidenceSources?: unknown[] }).evidenceSources)
    ? ((contributes as { evidenceSources?: unknown[] }).evidenceSources as unknown[]).length
    : 0;

  // 全部为空 = 这个包什么都不做，收下来只会浪费审核人力。
  // 声明式内容（模板/画像/皮肤/设置/证据来源声明）算合法载荷。
  if (!backendJars.length && !frontendEntry && !declaredFiles.length && !settingsCount && !evidenceSourceCount && !platformPayload) {
    return { error: 'no_payload' };
  }

  const permissions = Array.isArray(manifest.permissions) ? (manifest.permissions as string[]) : [];
  if (opts?.allowedPermissions && permissions.some(p => !opts.allowedPermissions!.includes(p))) return { error: 'developer_permissions_required' };
  const scan = scanPluginPackage({
    files: expandJarClasses(files, backendJars),
    declaredPermissions: permissions,
  });

  const fileHashes: Record<string, string> = {};
  let size = 0;
  for (const [name, buf] of files) {
    fileHashes[name] = sha256(buf);
    size += buf.length;
  }

  const now = new Date().toISOString();
  const entry: PluginEntry = {
    id,
    version,
    name: pluginDisplayText(manifest.name, id, files),
    description: pluginDisplayText(manifest.description, '', files),
    icon: manifest.icon ? String(manifest.icon) : undefined,
    author: author.username,
    authorId: author.id,
    homepage: manifest.homepage ? String(manifest.homepage) : undefined,
    permissions,
    tools: Array.isArray(manifest.tools) ? (manifest.tools as PluginToolInfo[]) : [],
    frontendEntry: frontendEntry || undefined,
    files: fileHashes,
    size,
    status: 'pending',
    scan,
    downloads: 0,
    submittedAt: now,
    updatedAt: now,
    // 0 = 免费不落字段；pricingModel 固定 once（预留）
    priceCents: priceCents && priceCents > 0 ? priceCents : undefined,
    pricingModel: 'once',
  };

  // 落盘：data/plugin-files/<id>/<version>/...
  const destRoot = path.join(FILES_ROOT, id, version);
  fs.rmSync(destRoot, { recursive: true, force: true });
  for (const [name, buf] of files) {
    const dest = path.join(destRoot, name);
    if (!isInside(destRoot, dest)) return { error: 'unsafe_path', detail: name };
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }

  const all = readPlugins();
  all.push(entry);
  writePlugins(all);
  return { plugin: entry };
}

/** zip 条目路径必须是包内相对路径：不含 ..、不是绝对路径、不含盘符或反斜杠 */
function isSafeEntryPath(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return false;
  if (name.includes('\\')) return false;
  return !name.split('/').some((seg) => seg === '..' || seg === '.');
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * 把 JAR 内的 .class 解出来交给扫描器——JAR 本身是压缩的 zip，
 * 直接扫外层字节匹配不到常量池里的字符串。
 */
function expandJarClasses(files: Map<string, Buffer>, jarNames: string[]): Map<string, Buffer> {
  const expanded = new Map(files);
  for (const jarName of jarNames) {
    const jarBuf = files.get(jarName);
    if (!jarBuf) continue;
    try {
      for (const e of new AdmZip(jarBuf).getEntries()) {
        if (e.isDirectory || !e.entryName.endsWith('.class')) continue;
        expanded.set(`${jarName}!${e.entryName}`, e.getData());
      }
    } catch {
      // JAR 解不开时交给人工审核判断，不在此拦截
    }
  }
  return expanded;
}

/** 审核通过：生成签名并上架。未配置签名私钥时返回 false，调用方须提示配置。 */
export function approvePlugin(id: string, version: string): { ok: boolean; reason?: string } {
  const all = readPlugins();
  const entry = all.find((p) => p.id === id && p.version === version);
  if (!entry) return { ok: false, reason: 'not_found' };

  const publishedAt = new Date().toISOString();
  const payload: SignedPayload = { id: entry.id, version: entry.version, publishedAt, files: entry.files };
  const signature = signPayload(payload);
  if (!signature) return { ok: false, reason: 'signing_not_configured' };

  entry.status = 'approved';
  entry.signature = signature;
  entry.publishedAt = publishedAt;
  entry.reviewedAt = publishedAt;
  entry.reviewNote = undefined;
  entry.updatedAt = publishedAt;
  writePlugins(all);
  return { ok: true };
}

export function rejectPlugin(id: string, version: string, note: string): boolean {
  const all = readPlugins();
  const entry = all.find((p) => p.id === id && p.version === version);
  if (!entry) return false;
  const now = new Date().toISOString();
  entry.status = 'rejected';
  entry.reviewNote = note;
  entry.reviewedAt = now;
  entry.updatedAt = now;
  entry.signature = undefined;
  writePlugins(all);
  return true;
}

/** 封禁一个已上架版本；version 传 '*' 封禁该 id 全部版本 */
export function revokePlugin(id: string, version: string, reason: string): boolean {
  const all = readPlugins();
  const targets = version === '*' ? all.filter((p) => p.id === id) : all.filter((p) => p.id === id && p.version === version);
  if (!targets.length) return false;
  const now = new Date().toISOString();
  for (const t of targets) {
    t.status = 'revoked';
    t.reviewNote = reason;
    t.reviewedAt = now;
    t.updatedAt = now;
  }
  writePlugins(all);
  return true;
}

export function incrementDownloads(id: string, version: string) {
  const all = readPlugins();
  const entry = all.find((p) => p.id === id && p.version === version);
  if (!entry) return;
  entry.downloads += 1;
  writePlugins(all);
}

/** 读取某版本包内的一个文件；path 必须是该版本 files 里登记过的键 */
export function readPluginFile(id: string, version: string, relPath: string): Buffer | undefined {
  const entry = getPlugin(id, version);
  if (!entry || !Object.prototype.hasOwnProperty.call(entry.files, relPath)) return undefined;
  const target = path.join(FILES_ROOT, id, version, relPath);
  const root = path.join(FILES_ROOT, id, version);
  if (!isInside(root, target) || !fs.existsSync(target)) return undefined;
  return fs.readFileSync(target);
}

/** 供自检：重建签名载荷，确认与签名时一致 */
export function payloadOf(entry: PluginEntry): SignedPayload {
  return {
    id: entry.id,
    version: entry.version,
    publishedAt: entry.publishedAt || '',
    files: entry.files,
  };
}

export { canonicalPayload };
