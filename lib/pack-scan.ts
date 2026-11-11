import crypto from 'crypto';
import fs from 'fs';
import zlib from 'zlib';

/**
 * 原生资源包（native pack）的 tar.gz 流式检查与线索提取。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §2 / §8.2。
 *
 * 为什么自己解 tar 而不是加依赖：这里要的不是「解压」，恰恰相反——
 * **一个字节都不许落盘、整包不许进内存**。生产机 1.8 GB 内存跑四个站点，
 * 一个 300 MB 的提交包如果被读成 Buffer，受理这一步就是 OOM。
 * tar 的头是固定 512 字节的定长结构，边读边判本就是它最自然的用法；
 * 现成的库反而要么给你 Buffer，要么把文件写出来。
 *
 * 检查在**每个条目解析出来的当下**做，不是读完再看（§10）：
 * 软链 / 硬链 / 绝对路径 / `..` 一律拒收，条目数与解压后总体积各有上限。
 *
 * 附带产出是审核线索：原生二进制没有 class 常量池那样的可交叉验证面，
 * 能给人工审核的只有「这个二进制里出现过哪些 URL 和 IP 字面量」。
 * 这不是判定，是线索——拿不准就驳回（§8.2）。
 */

export const TAR_LIMITS = {
    /** 单个 tar 内条目数上限 */
    entryCount: 5000,
    /** 单个 tar 解压后总体积上限 */
    unpackedBytes: 500 * 1024 * 1024,
    /** 每个 tar 最多留多少条 URL/IP 线索（防止一个巨型二进制把审核页撑爆） */
    literals: 200,
};

export type TarEntryType = 'file' | 'dir' | 'other';

export interface TarEntryInfo {
    path: string;
    size: number;
    /** POSIX 权限位（八进制原值） */
    mode: number;
    /** 是否带可执行位——graphviz 的 dot 这类二进制靠它，审核时要能一眼看见 */
    exec: boolean;
    type: TarEntryType;
}

export interface TarLiteral {
    kind: 'url' | 'ip';
    value: string;
    /** 首次出现该字面量的条目路径 */
    file: string;
}

export interface TarInspection {
    entryCount: number;
    /** 解压后总字节数（按 tar 头里声明的 size 累加） */
    unpackedBytes: number;
    entries: TarEntryInfo[];
    literals: TarLiteral[];
    /** 线索条数触顶被截断 */
    literalsTruncated: boolean;
}

export type TarError =
    | 'bad_archive'
    | 'unsafe_path'
    | 'link_entry'
    | 'unsupported_entry'
    | 'too_many_entries'
    | 'unpacked_too_large';

export interface TarInspectResult {
    inspection?: TarInspection;
    error?: TarError;
    detail?: string;
}

const BLOCK = 512;

/**
 * 按需拉取的字节读取器。
 * readExact 只用来读 512 字节的头；条目正文一律走 readSome 分片消费，
 * 这样单个 40 MB 的 draw.io 资源也只占一个 chunk 的内存。
 */
class ByteReader {
    private iterator: AsyncIterator<Buffer>;
    private buf: Buffer = Buffer.alloc(0);
    private ended = false;

    constructor(source: AsyncIterable<Buffer>) {
        this.iterator = source[Symbol.asyncIterator]();
    }

    private async fill(): Promise<boolean> {
        if (this.ended) return false;
        const { value, done } = await this.iterator.next();
        if (done || !value) {
            this.ended = true;
            return false;
        }
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
        return true;
    }

    /** 读满 n 字节；流提前结束返回 null */
    async readExact(n: number): Promise<Buffer | null> {
        while (this.buf.length < n) {
            if (!(await this.fill())) return null;
        }
        const out = this.buf.subarray(0, n);
        this.buf = this.buf.subarray(n);
        return out;
    }

    /** 读至多 max 字节，有多少给多少；流结束返回 null */
    async readSome(max: number): Promise<Buffer | null> {
        while (this.buf.length === 0) {
            if (!(await this.fill())) return null;
        }
        const n = Math.min(max, this.buf.length);
        const out = this.buf.subarray(0, n);
        this.buf = this.buf.subarray(n);
        return out;
    }
}

function readString(header: Buffer, offset: number, length: number): string {
    const raw = header.subarray(offset, offset + length);
    const end = raw.indexOf(0);
    return raw.subarray(0, end === -1 ? raw.length : end).toString('utf-8');
}

/** tar 的数值字段是八进制字符串；GNU 对超大值改用 base-256（首字节高位置 1） */
function readNumber(header: Buffer, offset: number, length: number): number {
    const raw = header.subarray(offset, offset + length);
    if (raw.length && (raw[0] & 0x80) !== 0) {
        let value = 0;
        for (let i = 1; i < raw.length; i++) value = value * 256 + raw[i];
        return value;
    }
    const text = readString(header, offset, length).trim();
    if (!text) return 0;
    const parsed = parseInt(text, 8);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function isZeroBlock(block: Buffer): boolean {
    for (let i = 0; i < block.length; i++) if (block[i] !== 0) return false;
    return true;
}

/** 校验和：头部 148-155 位在计算时按空格处理，对不上说明不是 tar 或已损坏 */
function checksumOk(header: Buffer): boolean {
    const declared = readNumber(header, 148, 8);
    if (!Number.isFinite(declared)) return false;
    let unsigned = 0;
    let signed = 0;
    for (let i = 0; i < BLOCK; i++) {
        const byte = i >= 148 && i < 156 ? 0x20 : header[i];
        unsigned += byte;
        signed += byte > 127 ? byte - 256 : byte;
    }
    return declared === unsigned || declared === signed;
}

/**
 * 包内相对路径的安全判据（zip-slip 同款）：
 * 不得为绝对路径、不得含 `..` 段、不得带盘符或反斜杠。
 */
export function isSafeTarPath(name: string): boolean {
    if (!name || name.length > 255) return false;
    if (name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return false;
    if (name.includes('\\') || name.includes('\0')) return false;
    return !name.split('/').some((seg) => seg === '..');
}

const URL_RE = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{3,180}/g;
const IPV4_RE = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;

function isRoutableIpv4(value: string): boolean {
    const parts = value.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    // 版本号（1.2.3.4 这类）混在二进制里到处都是；0.x 与 255.x 不是可连的目标，滤掉降噪
    if (parts[0] === 0 || parts[0] === 255) return false;
    return true;
}

/**
 * 逐条目扫 URL/IP 字面量。跨 chunk 的字面量靠尾部重叠窗口接住：
 * 每片保留末尾 200 字节与下一片拼接，正好覆盖 URL 上限之外的边界情况。
 */
class LiteralScanner {
    private seen = new Set<string>();
    private carry = '';
    private currentFile = '';
    readonly literals: TarLiteral[] = [];
    truncated = false;

    begin(file: string) {
        this.carry = '';
        this.currentFile = file;
    }

    feed(chunk: Buffer) {
        // latin1 保证一字节一字符，二进制里不会因多字节解码错位丢掉字面量
        const text = this.carry + chunk.toString('latin1');
        this.collect(text);
        this.carry = text.slice(-200);
    }

    end() {
        this.carry = '';
    }

    private collect(text: string) {
        for (const match of text.matchAll(URL_RE)) this.add('url', match[0].replace(/[.,;)\]]+$/, ''));
        for (const match of text.matchAll(IPV4_RE)) {
            if (isRoutableIpv4(match[0])) this.add('ip', match[0]);
        }
    }

    private add(kind: TarLiteral['kind'], value: string) {
        const key = `${kind}:${value}`;
        if (this.seen.has(key)) return;
        if (this.literals.length >= TAR_LIMITS.literals) {
            this.truncated = true;
            return;
        }
        this.seen.add(key);
        this.literals.push({ kind, value, file: this.currentFile });
    }
}

/**
 * 流式检查一个 tar.gz：不解压落盘、不整包进内存。
 * 任一条目触发防护即中止并返回错误码（调用方据此整包拒收）。
 */
export async function inspectTarGz(
    filePath: string,
    limits: { entryCount?: number; unpackedBytes?: number } = {}
): Promise<TarInspectResult> {
    const maxEntries = limits.entryCount ?? TAR_LIMITS.entryCount;
    const maxUnpacked = limits.unpackedBytes ?? TAR_LIMITS.unpackedBytes;

    const file = fs.createReadStream(filePath);
    const gunzip = zlib.createGunzip();
    const stream = file.pipe(gunzip);
    const reader = new ByteReader(stream as unknown as AsyncIterable<Buffer>);
    const scanner = new LiteralScanner();
    const entries: TarEntryInfo[] = [];
    let unpackedBytes = 0;
    /** GNU 长名（typeflag L）与 pax path= 记录暂存，覆盖下一条目的 name */
    let pendingName = '';

    const fail = (error: TarError, detail?: string): TarInspectResult => {
        file.destroy();
        gunzip.destroy();
        return { error, detail };
    };

    try {
        for (;;) {
            const header = await reader.readExact(BLOCK);
            if (!header) break; // 归档提前结束：容忍（尾部两个空块本就是可选的实现细节）
            if (isZeroBlock(header)) break;
            if (!checksumOk(header)) return fail('bad_archive', '条目头校验和不符');

            const typeflag = String.fromCharCode(header[156] || 0x30);
            const rawName = readString(header, 0, 100);
            const prefix = readString(header, 345, 155);
            const size = readNumber(header, 124, 12);
            const mode = readNumber(header, 100, 8);
            const linkname = readString(header, 157, 100);
            if (!Number.isFinite(size) || size < 0) return fail('bad_archive', '条目长度非法');

            let name = pendingName || (prefix ? `${prefix}/${rawName}` : rawName);
            pendingName = '';
            name = name.replace(/\/+$/, '');

            // GNU 长名 / 长链接名：正文就是下一条目的名字
            if (typeflag === 'L' || typeflag === 'K') {
                const buf = await reader.readExact(size);
                if (!buf) return fail('bad_archive', '长名条目被截断');
                if (typeflag === 'L') pendingName = buf.toString('utf-8').replace(/\0+$/, '');
                await skipPadding(reader, size);
                continue;
            }
            // pax 扩展头：只取 path=，其余忽略
            if (typeflag === 'x' || typeflag === 'g') {
                const buf = await reader.readExact(size);
                if (!buf) return fail('bad_archive', 'pax 头被截断');
                const paxPath = /\d+ path=([^\n]*)\n/.exec(buf.toString('utf-8'));
                if (typeflag === 'x' && paxPath) pendingName = paxPath[1];
                await skipPadding(reader, size);
                continue;
            }

            if (typeflag === '1' || typeflag === '2') {
                // 软链/硬链一律拒绝：构建期必须 --dereference 物化（§2）
                return fail('link_entry', `${name} -> ${linkname}`);
            }
            const isDir = typeflag === '5';
            // '0' 普通文件（header[156] 为 0 时上面已折算成 '0'）、'7' 连续文件按普通文件处理
            const isFile = typeflag === '0' || typeflag === '7';
            if (!isDir && !isFile) {
                // 字符设备/块设备/FIFO 等：pack 里没有任何正当理由出现
                return fail('unsupported_entry', `${name}（类型 ${typeflag}）`);
            }

            if (!isSafeTarPath(name)) return fail('unsafe_path', name);

            if (entries.length + 1 > maxEntries) return fail('too_many_entries', `超过 ${maxEntries} 条`);
            unpackedBytes += size;
            if (unpackedBytes > maxUnpacked) {
                return fail('unpacked_too_large', `解压后超过 ${Math.round(maxUnpacked / 1024 / 1024)} MB`);
            }

            entries.push({
                path: name,
                size: isDir ? 0 : size,
                mode: mode & 0o7777,
                exec: !isDir && (mode & 0o111) !== 0,
                type: isDir ? 'dir' : 'file',
            });

            // 正文分片消费：只做字面量扫描，读完即丢
            if (size > 0) {
                scanner.begin(name);
                let remaining = size;
                while (remaining > 0) {
                    const chunk = await reader.readSome(Math.min(remaining, 64 * 1024));
                    if (!chunk) return fail('bad_archive', `${name} 正文被截断`);
                    scanner.feed(chunk);
                    remaining -= chunk.length;
                }
                scanner.end();
                await skipPadding(reader, size);
            }
        }
    } catch {
        return fail('bad_archive', '无法解压（不是合法的 gzip/tar）');
    } finally {
        file.destroy();
        gunzip.destroy();
    }

    return {
        inspection: {
            entryCount: entries.length,
            unpackedBytes,
            entries,
            literals: scanner.literals,
            literalsTruncated: scanner.truncated,
        },
    };
}

async function skipPadding(reader: ByteReader, size: number) {
    const pad = (BLOCK - (size % BLOCK)) % BLOCK;
    if (pad > 0) await reader.readExact(pad);
}

/** 流式算 sha256 与字节数——同样不把文件读进内存 */
export async function hashFile(filePath: string): Promise<{ sha256: string; size: number }> {
    const hash = crypto.createHash('sha256');
    let size = 0;
    const stream = fs.createReadStream(filePath);
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
        hash.update(chunk);
        size += chunk.length;
    }
    return { sha256: hash.digest('hex'), size };
}
