import { toBaseLocale, type Locale } from '@/i18n-config';
import { PACK_LIMITS, RESERVED_PACK_IDS, PLATFORM_KEYS, type PackError } from './packs-store';

/** 受理失败原因的中文说明。提交端点与提交页共用一份，避免两处各写各的。 */
export const PACK_ERROR_MESSAGES: Record<PackError, string> = {
    manifest_invalid: 'manifest 不是合法的 JSON 对象',
    invalid_schema: 'manifest.schema 目前只支持 1',
    invalid_id: 'manifest.id 非法：需为 2-50 位小写字母、数字或连字符',
    reserved_id: `该 id 是第一方保留名（${RESERVED_PACK_IDS.join('、')}），请另取`,
    invalid_version: 'manifest.version 需为语义化版本，如 1.0.0',
    invalid_min_app_version: 'manifest.minAppVersion 需为语义化版本，如 0.21.0',
    invalid_engine_api: 'manifest.engineApi 需为正整数',
    signed_fields_present: '草案里不得包含 publishedAt 或签名字段——它们由平台在审核通过时补写',
    no_components: 'manifest.components 不能为空',
    too_many_components: `组件数超过 ${PACK_LIMITS.componentCount} 个上限`,
    invalid_component: '组件 name 非法：需为小写字母、数字、点、下划线或连字符',
    invalid_platform: `platforms 只能取 ${PLATFORM_KEYS.join(' / ')}，且不得重复`,
    invalid_archive: 'archive 需为 .tar.gz 文件名，且不含路径分隔符',
    duplicate_archive: '同一个 archive 被多个组件声明',
    invalid_unpack_dir: 'unpackDir 需为单层目录名，不得含路径分隔符或 ..',
    invalid_size: 'size 需为正整数字节数',
    invalid_sha256: 'sha256 需为 64 位十六进制',
    submission_too_large: `提交总体积超过 ${PACK_LIMITS.submissionBytes / 1024 / 1024} MB 上限`,
    note_too_long: `用途自述超过 ${PACK_LIMITS.noteChars} 字上限`,
    id_taken: '该 pack id 已被其他作者占用',
    version_not_newer: '版本号必须高于该 id 已有的最高版本',
    draft_not_found: '上传令牌无效，请重新提交 manifest',
    draft_expired: '上传令牌已过期，请重新提交 manifest',
    not_owner: '该提交不属于当前账户',
    file_not_declared: '该文件不在 manifest 声明的组件归档里',
    file_already_uploaded: '该文件已上传，重传请重新提交 manifest',
    size_mismatch: '实际字节数与 manifest 声明的 size 不符',
    sha256_mismatch: '实际哈希与 manifest 声明的 sha256 不符',
    file_missing: 'manifest 声明的组件归档没有上传',
    bad_archive: '无法解析的归档，请确认是标准 tar.gz',
    unsafe_path: '归档内存在非法路径（不得含 .. 或绝对路径）',
    link_entry: '归档内存在软链接或硬链接，构建时请用 tar --dereference 物化',
    unsupported_entry: '归档内存在设备文件等不受支持的条目类型',
    too_many_entries: `单个归档条目数超过 ${PACK_LIMITS.entryCount} 个上限`,
    unpacked_too_large: `单个归档解压后超过 ${PACK_LIMITS.unpackedBytes / 1024 / 1024} MB 上限`,
};

export const PACK_ERROR_MESSAGES_EN: Record<PackError, string> = {
    manifest_invalid: 'manifest is not a valid JSON object',
    invalid_schema: 'manifest.schema currently only supports 1',
    invalid_id: 'manifest.id is invalid: must be 2–50 lowercase letters, digits, or hyphens',
    reserved_id: `This id is reserved for first-party packs (${RESERVED_PACK_IDS.join(', ')}); please choose another`,
    invalid_version: 'manifest.version must be a semantic version such as 1.0.0',
    invalid_min_app_version: 'manifest.minAppVersion must be a semantic version such as 0.21.0',
    invalid_engine_api: 'manifest.engineApi must be a positive integer',
    signed_fields_present: 'Draft manifest must not contain publishedAt or signature fields — they are added by the platform upon approval',
    no_components: 'manifest.components cannot be empty',
    too_many_components: `Component count exceeds the limit of ${PACK_LIMITS.componentCount}`,
    invalid_component: 'Component name is invalid: must use lowercase letters, digits, dots, underscores, or hyphens',
    invalid_platform: `platforms must be drawn from ${PLATFORM_KEYS.join(' / ')} without duplicates`,
    invalid_archive: 'archive must be a .tar.gz filename without path separators',
    duplicate_archive: 'The same archive is declared by multiple components',
    invalid_unpack_dir: 'unpackDir must be a single directory name without path separators or ..',
    invalid_size: 'size must be a positive integer byte count',
    invalid_sha256: 'sha256 must be a 64-character hex string',
    submission_too_large: `Total submission size exceeds the ${PACK_LIMITS.submissionBytes / 1024 / 1024} MB limit`,
    note_too_long: `Purpose note exceeds the ${PACK_LIMITS.noteChars}-character limit`,
    id_taken: 'This pack id is already taken by another author',
    version_not_newer: 'Version must be higher than the existing highest version for this id',
    draft_not_found: 'Upload token is invalid; please resubmit the manifest',
    draft_expired: 'Upload token has expired; please resubmit the manifest',
    not_owner: 'This submission does not belong to the current account',
    file_not_declared: 'This file is not listed in the manifest component archives',
    file_already_uploaded: 'This file has already been uploaded; resubmit the manifest to upload again',
    size_mismatch: 'Actual byte size does not match the size declared in manifest',
    sha256_mismatch: 'Actual SHA-256 hash does not match the sha256 declared in manifest',
    file_missing: 'One or more component archives declared in manifest were not uploaded',
    bad_archive: 'Unable to parse archive; please verify it is a valid tar.gz file',
    unsafe_path: 'Archive contains unsafe paths (.. or absolute paths are not allowed)',
    link_entry: 'Archive contains symbolic or hard links; build with tar --dereference to materialize them',
    unsupported_entry: 'Archive contains unsupported entry types such as device files',
    too_many_entries: `Single archive entry count exceeds the limit of ${PACK_LIMITS.entryCount}`,
    unpacked_too_large: `Single archive unpacked size exceeds the ${PACK_LIMITS.unpackedBytes / 1024 / 1024} MB limit`,
};

function localizePackDetail(detail: string, lang: Locale): string {
    if (toBaseLocale(lang) !== 'en') return detail;
    return detail
        .replace(/^(.+) 平台键重复$/, '$1 has duplicate platform keys')
        .replace(/^已有版本 (.+)$/, 'existing version $1')
        .replace(/^声明 (\d+) 字节，实到 (\d+) 字节$/, 'declared $1 bytes, received $2 bytes')
        .replace(/^(.+) 超出声明的 (\d+) 字节$/, '$1 exceeds declared $2 bytes')
        .replace(/^(.+) 上传中断$/, '$1 upload interrupted')
        .replace(/^(.+) 声明 (\d+) 字节，实到 (\d+) 字节$/, '$1 declared $2 bytes, received $3 bytes')
        .replace(/^(.+) manifest 声明 (\d+) 字节，实物 (\d+) 字节$/, '$1 manifest declared $2 bytes, actual $3 bytes')
        .replace(/^(.+) manifest 声明 ([0-9a-f]+)…，实物 ([0-9a-f]+)…$/, '$1 manifest declared $2…, actual $3…')
        .replace(/^条目头校验和不符$/, 'entry header checksum mismatch')
        .replace(/^条目长度非法$/, 'invalid entry length')
        .replace(/^长名条目被截断$/, 'long-name entry truncated')
        .replace(/^pax 头被截断$/, 'pax header truncated')
        .replace(/^(.+)（类型 (.+)）$/, '$1 (type $2)')
        .replace(/^超过 (\d+) 条$/, 'exceeds $1 entries')
        .replace(/^解压后超过 (\d+) MB$/, 'unpacked size exceeds $1 MB')
        .replace(/^(.+) 正文被截断$/, '$1 body truncated')
        .replace(/^无法解压（不是合法的 gzip\/tar）$/, 'unable to decompress (not a valid gzip/tar)');
}

export function packErrorMessage(error?: PackError, detail?: string, lang: Locale = 'zh'): string {
    const isEn = toBaseLocale(lang) === 'en';
    const table = isEn ? PACK_ERROR_MESSAGES_EN : PACK_ERROR_MESSAGES;
    const fallback = isEn ? 'Submission failed' : '提交失败';
    const base = (error && table[error]) || fallback;
    if (!detail) return base;
    const localized = localizePackDetail(detail, lang);
    return isEn ? `${base} (${localized})` : `${base}（${localized}）`;
}
