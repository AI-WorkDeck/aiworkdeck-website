/**
 * 原生资源包（native pack）受理 / 签名 / 封禁验证脚本。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §2 / §8。
 *
 * 覆盖：manifest 草案校验、id 归属与版本单调、sha256/size 对账、
 * tar 逐条目防护（软链/绝对路径/../条目数/解压体积）正反例、
 * 上传体积双保险、签名往返与发布件产出、封禁表形制。
 *
 * 必须在一个空目录里执行（data/packs.json 等会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-packs.mts
 */
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

// 签名私钥先不配：第一段要验「未配置私钥时 approve 必须拒绝」
delete process.env.AWD_PLUGIN_SIGNING_KEY;

const store = await import('@/lib/packs-store');
const { inspectTarGz } = await import('@/lib/pack-scan');
const { generateKeyPair, signBytes, verifyBytes } = await import('@/lib/plugin-signing');
const { GET: revokedGET } = await import('@/app/api/registry/packs/revoked/route');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

/* ---------- tar 夹具：手搓 512 字节头，不引依赖 ---------- */

interface FixtureEntry {
    name: string;
    data?: Buffer;
    mode?: number;
    typeflag?: string;
    linkname?: string;
    /** 只写头不写正文（造「声称很大」的条目，用来验解压体积上限） */
    declaredSizeOnly?: number;
}

function tarHeader(entry: FixtureEntry): Buffer {
    const size = entry.declaredSizeOnly ?? entry.data?.length ?? 0;
    const h = Buffer.alloc(512);
    h.write(entry.name, 0, 100, 'utf-8');
    h.write(`${(entry.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100, 8);
    h.write('0000000\0', 108, 8);
    h.write('0000000\0', 116, 8);
    h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
    h.write('00000000000\0', 136, 12);
    h.write('        ', 148, 8); // 校验和先填空格
    h.write(entry.typeflag ?? '0', 156, 1);
    if (entry.linkname) h.write(entry.linkname, 157, 100);
    h.write('ustar\0', 257, 6);
    h.write('00', 263, 2);
    let sum = 0;
    for (const byte of h) sum += byte;
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    return h;
}

function makeTarGz(entries: FixtureEntry[]): Buffer {
    const chunks: Buffer[] = [];
    for (const entry of entries) {
        chunks.push(tarHeader(entry));
        if (entry.declaredSizeOnly === undefined && entry.data?.length) {
            chunks.push(entry.data);
            const pad = (512 - (entry.data.length % 512)) % 512;
            if (pad) chunks.push(Buffer.alloc(pad));
        }
    }
    chunks.push(Buffer.alloc(1024)); // 结尾两个空块
    return zlib.gzipSync(Buffer.concat(chunks));
}

const scratch = path.join(cwd, 'scratch');
fs.mkdirSync(scratch, { recursive: true });
function writeFixture(name: string, buf: Buffer): string {
    const p = path.join(scratch, name);
    fs.writeFileSync(p, buf);
    return p;
}

const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

/* ---------- 1. tar 逐条目防护 ---------- */
console.log('\n[1] tar 逐条目防护（正反例）');

const goodTar = makeTarGz([
    { name: 'graphviz/', typeflag: '5', mode: 0o755 },
    { name: 'graphviz/bin/dot', mode: 0o755, data: Buffer.from('ELF fake binary https://graphviz.org/download 203.0.113.9 end') },
    { name: 'graphviz/README', data: Buffer.from('plain text, version 1.2.3.4 should not be reported as ip') },
]);
const goodPath = writeFixture('good.tar.gz', goodTar);
const goodResult = await inspectTarGz(goodPath);
assert.ok(goodResult.inspection, `合法归档不该报错：${goodResult.error} ${goodResult.detail}`);
assert.strictEqual(goodResult.inspection!.entryCount, 3);
const dot = goodResult.inspection!.entries.find(e => e.path === 'graphviz/bin/dot')!;
assert.strictEqual(dot.exec, true);
assert.strictEqual(goodResult.inspection!.entries.find(e => e.path === 'graphviz/README')!.exec, false);
ok('合法归档：条目/权限位/exec 标记正确');

const literals = goodResult.inspection!.literals;
assert.ok(literals.some(l => l.kind === 'url' && l.value.startsWith('https://graphviz.org/download')), 'URL 字面量没抽出来');
assert.ok(literals.some(l => l.kind === 'ip' && l.value === '203.0.113.9'), 'IP 字面量没抽出来');
ok('二进制内的 URL / IP 字面量被提取（版本号形态的 1.2.3.4 不算 IP 也在名单里，交人工判断）');

for (const [label, entries, expected] of [
    ['软链接', [{ name: 'a/evil', typeflag: '2', linkname: '/etc/passwd' }], 'link_entry'],
    ['硬链接', [{ name: 'a/evil', typeflag: '1', linkname: 'a/other' }], 'link_entry'],
    ['绝对路径', [{ name: '/etc/cron.d/evil', data: Buffer.from('x') }], 'unsafe_path'],
    ['父目录穿越', [{ name: '../../etc/evil', data: Buffer.from('x') }], 'unsafe_path'],
    ['字符设备', [{ name: 'a/dev', typeflag: '3' }], 'unsupported_entry'],
] as [string, FixtureEntry[], string][]) {
    const p = writeFixture(`bad-${expected}-${label}.tar.gz`, makeTarGz(entries));
    const res = await inspectTarGz(p);
    assert.strictEqual(res.error, expected, `${label} 应当被拒为 ${expected}，实得 ${res.error}`);
    assert.strictEqual(res.inspection, undefined);
}
ok('软链 / 硬链 / 绝对路径 / .. / 设备文件全部拒收');

const manyEntries: FixtureEntry[] = [];
for (let i = 0; i < 12; i++) manyEntries.push({ name: `f${i}`, data: Buffer.from('x') });
const manyPath = writeFixture('many.tar.gz', makeTarGz(manyEntries));
assert.strictEqual((await inspectTarGz(manyPath, { entryCount: 10 })).error, 'too_many_entries');
assert.ok((await inspectTarGz(manyPath, { entryCount: 12 })).inspection, '正好触线不该被拒');
ok('条目数上限：超一条即拒，正好等于上限放行');

const bigPath = writeFixture('big.tar.gz', makeTarGz([{ name: 'huge.bin', declaredSizeOnly: 600 * 1024 * 1024 }]));
assert.strictEqual((await inspectTarGz(bigPath)).error, 'unpacked_too_large');
ok('解压后总体积上限：只读头就判掉，不落盘不进内存');

const notGz = writeFixture('not.tar.gz', Buffer.from('this is not gzip at all'));
assert.strictEqual((await inspectTarGz(notGz)).error, 'bad_archive');
ok('非 gzip 字节被判为 bad_archive');

/* ---------- 2. manifest 草案校验 ---------- */
console.log('\n[2] manifest 草案校验');

const litvizTar = makeTarGz([{ name: 'litviz/cli.py', data: Buffer.from('print("hello")') }]);
const litvizPath = writeFixture('litviz.tar.gz', litvizTar);

function draftManifest(over: Record<string, unknown> = {}, componentOver: Record<string, unknown> = {}) {
    return {
        schema: 1,
        id: 'acme-pack',
        version: '1.0.0',
        minAppVersion: '0.21.0',
        engineApi: 1,
        components: [
            {
                name: 'litviz',
                platforms: ['*'],
                archive: 'litviz-1.0.0.tar.gz',
                size: litvizTar.length,
                sha256: sha256(litvizTar),
                unpackDir: 'litviz',
                ...componentOver,
            },
        ],
        ...over,
    };
}

const author = { id: 'author-a', username: 'alice' };
const other = { id: 'author-b', username: 'bob' };

const cases: [string, unknown, string][] = [
    ['schema 不是 1', draftManifest({ schema: 2 }), 'invalid_schema'],
    ['带 publishedAt', draftManifest({ publishedAt: '2026-08-20T00:00:00Z' }), 'signed_fields_present'],
    ['id 非法', draftManifest({ id: 'A_Pack' }), 'invalid_id'],
    ['撞第一方保留名', draftManifest({ id: 'litigation-visual' }), 'reserved_id'],
    ['version 非语义化', draftManifest({ version: '1.0' }), 'invalid_version'],
    ['minAppVersion 非语义化', draftManifest({ minAppVersion: 'latest' }), 'invalid_min_app_version'],
    ['engineApi 非整数', draftManifest({ engineApi: '1' }), 'invalid_engine_api'],
    ['components 为空', draftManifest({ components: [] }), 'no_components'],
    ['平台键非法', draftManifest({}, { platforms: ['linux-x64'] }), 'invalid_platform'],
    ['平台键重复', draftManifest({}, { platforms: ['*', '*'] }), 'invalid_platform'],
    ['archive 带路径', draftManifest({}, { archive: '../evil.tar.gz' }), 'invalid_archive'],
    ['archive 不是 tar.gz', draftManifest({}, { archive: 'a.zip' }), 'invalid_archive'],
    ['unpackDir 穿越', draftManifest({}, { unpackDir: '../bin' }), 'invalid_unpack_dir'],
    ['sha256 非法', draftManifest({}, { sha256: 'zz' }), 'invalid_sha256'],
    ['size 非正整数', draftManifest({}, { size: 0 }), 'invalid_size'],
    ['size 超上限', draftManifest({}, { size: 400 * 1024 * 1024 }), 'invalid_size'],
    ['不是对象', 'nonsense', 'manifest_invalid'],
];
for (const [label, manifest, expected] of cases) {
    const { error } = store.validateManifestDraft(manifest);
    assert.strictEqual(error, expected, `${label} 应当拒为 ${expected}，实得 ${error}`);
}
ok(`manifest 草案 ${cases.length} 条反例全部被拦`);

assert.ok(store.validateManifestDraft(draftManifest()).manifest, '合法草案应当通过');
ok('合法草案通过');

/* ---------- 3. 提交三步：草稿 / 流式上传 / 受理 ---------- */
console.log('\n[3] 提交三步与体积双保险');

async function upload(token: string, name: string, buf: Buffer, opts?: { authorId?: string; contentLength?: number }) {
    return store.receiveUpload(token, name, Readable.from(buf), {
        authorId: opts?.authorId ?? author.id,
        contentLength: opts?.contentLength,
    });
}

const draft1 = store.createPackDraft(draftManifest(), author);
assert.ok(draft1.draft, `建草稿失败：${draft1.error}`);
assert.strictEqual(draft1.draft!.files.length, 1);
ok('第一步只收 JSON 草案，返回 uploadToken 与待传文件清单');

assert.strictEqual((await upload(draft1.draft!.token, 'not-declared.tar.gz', litvizTar)).error, 'file_not_declared');
ok('未在 manifest 声明的文件名被拒');

assert.strictEqual((await upload(draft1.draft!.token, 'litviz-1.0.0.tar.gz', litvizTar, { authorId: other.id })).error, 'not_owner');
ok('别人的令牌传不了文件');

assert.strictEqual(
    (await upload(draft1.draft!.token, 'litviz-1.0.0.tar.gz', litvizTar, { contentLength: litvizTar.length + 1 })).error,
    'size_mismatch'
);
ok('Content-Length 预检：声称超出 manifest 声明的体积直接拒（第一道保险）');

// 第二道保险：header 撒谎（分块传输根本没有 Content-Length）时按实际写入计数拦截
const fatDraft = store.createPackDraft(draftManifest({ version: '1.0.1' }), author);
assert.strictEqual(
    (await upload(fatDraft.draft!.token, 'litviz-1.0.0.tar.gz', Buffer.concat([litvizTar, Buffer.alloc(4096)]))).error,
    'size_mismatch'
);
assert.strictEqual(
    fs.existsSync(path.join(store.submissionDir('acme-pack', '1.0.1'), 'litviz-1.0.0.tar.gz.part')),
    false,
    '超量的半成品必须删掉'
);
ok('实际写入计数：超出即中止并删除 .part（第二道保险）');

// 传少了同样不算数
assert.strictEqual((await upload(fatDraft.draft!.token, 'litviz-1.0.0.tar.gz', litvizTar.subarray(0, 10))).error, 'size_mismatch');
ok('传少了也判 size_mismatch，不会留下截断文件');

const uploaded = await upload(draft1.draft!.token, 'litviz-1.0.0.tar.gz', litvizTar);
assert.strictEqual(uploaded.ok, true);
assert.strictEqual(uploaded.sha256, sha256(litvizTar));
assert.strictEqual((await upload(draft1.draft!.token, 'litviz-1.0.0.tar.gz', litvizTar)).error, 'file_already_uploaded');
ok('流式落盘：边写边算哈希，重复上传同一文件被拒');

const finalized = await store.finalizePack(draft1.draft!.token, { authorId: author.id });
assert.ok(finalized.pack, `受理失败：${finalized.error} ${finalized.detail}`);
assert.strictEqual(finalized.pack!.status, 'pending');
assert.strictEqual(finalized.pack!.components[0].entryCount, 1);
assert.strictEqual(finalized.pack!.totalSize, litvizTar.length);
ok('受理通过 → pending，组件摘要落在 packs.json');

const inspection = store.readPackInspection('acme-pack', '1.0.0');
assert.ok(inspection && inspection['litviz-1.0.0.tar.gz'].entries.length === 1);
ok('逐条目清单落在 .inspection.json（不进 packs.json，审核台按需读）');

/* ---------- 4. sha256 / 缺文件对账 ---------- */
console.log('\n[4] 受理检查与实物对账');

const wrongShaDraft = store.createPackDraft(
    draftManifest({ version: '1.1.0' }, { sha256: 'a'.repeat(64) }),
    author
);
await upload(wrongShaDraft.draft!.token, 'litviz-1.0.0.tar.gz', litvizTar);
const wrongShaResult = await store.finalizePack(wrongShaDraft.draft!.token, { authorId: author.id });
assert.strictEqual(wrongShaResult.error, 'sha256_mismatch');
assert.strictEqual(fs.existsSync(store.submissionDir('acme-pack', '1.1.0')), false, '不过就要整目录删除');
ok('sha256 与实物不符：拒收并删除整个提交目录');

const missingDraft = store.createPackDraft(draftManifest({ version: '1.2.0' }), author);
assert.strictEqual((await store.finalizePack(missingDraft.draft!.token, { authorId: author.id })).error, 'file_missing');
ok('声明了却没传的组件归档：拒收');

// size/sha256 都按实物填，确保这次失败原因是 tar 防护而不是哈希对不上
const evilTar = makeTarGz([{ name: 'x/evil', typeflag: '2', linkname: '/etc/passwd' }]);
const evilDraft = store.createPackDraft(
    draftManifest({ version: '1.4.0' }, { size: evilTar.length, sha256: sha256(evilTar) }),
    author
);
assert.ok(evilDraft.draft);
await upload(evilDraft.draft!.token, 'litviz-1.0.0.tar.gz', evilTar);
assert.strictEqual((await store.finalizePack(evilDraft.draft!.token, { authorId: author.id })).error, 'link_entry');
ok('哈希对得上但归档里有软链：仍然拒收（防护在受理期，不在安装期才发现）');

/* ---------- 5. id 归属与版本单调 ---------- */
console.log('\n[5] id 归属与版本单调');

assert.strictEqual(store.createPackDraft(draftManifest({ version: '2.0.0' }), other).error, 'id_taken');
ok('老 id 只有原作者能提新版本');

assert.strictEqual(store.createPackDraft(draftManifest({ version: '1.0.0' }), author).error, 'version_not_newer');
assert.strictEqual(store.createPackDraft(draftManifest({ version: '0.9.0' }), author).error, 'version_not_newer');
assert.ok(store.createPackDraft(draftManifest({ version: '2.0.0' }), author).draft, '更高版本应当放行');
ok('版本必须严格高于已有最高版本');

assert.ok(store.createPackDraft(draftManifest({ id: 'bob-pack' }), other).draft, '新 id 归提交者');
ok('新 id 归提交者');

// bob 正在传 bob-pack；alice 此时提同 id 会走到「清理同 id 目录」那一步——不拦住
// 就等于谁后提交谁能抹掉对方传了一半的几百兆
assert.strictEqual(store.createPackDraft(draftManifest({ id: 'bob-pack' }), author).error, 'id_taken');
ok('别人正在传的同 id 草稿不许被顶掉');

/* ---------- 6. 签名与发布件 ---------- */
console.log('\n[6] 审核通过 = 签名 + 出发布件');

assert.deepStrictEqual(store.approvePack('acme-pack', '1.0.0'), {
    ok: false,
    reason: 'signing_not_configured',
});
ok('未配置 AWD_PLUGIN_SIGNING_KEY 时 approve 必须拒绝（与插件同语义）');

const keys = generateKeyPair();
process.env.AWD_PLUGIN_SIGNING_KEY = keys.privateKeyPem;

const roundTrip = Buffer.from('原始字节直签，不走 canonical JSON');
const sig = signBytes(roundTrip)!;
assert.ok(sig, 'signBytes 应当出签名');
assert.strictEqual(verifyBytes(roundTrip, sig, keys.publicKeyPem), true);
assert.strictEqual(verifyBytes(Buffer.concat([roundTrip, Buffer.from('!')]), sig, keys.publicKeyPem), false);
assert.strictEqual(verifyBytes(roundTrip, sig, generateKeyPair().publicKeyPem), false);
ok('signBytes / verifyBytes 往返成立，改一个字节或换一把公钥立即失败');

assert.deepStrictEqual(store.approvePack('acme-pack', '1.0.0'), { ok: true });
const approved = store.getPack('acme-pack', '1.0.0')!;
assert.strictEqual(approved.status, 'approved');
assert.ok(approved.publishedAt && approved.signature);
ok('approve 落状态、publishedAt 与签名');

const outDir = store.publishDir('acme-pack', '1.0.0');
const manifestBytes = fs.readFileSync(path.join(outDir, 'manifest.json'));
const sigText = fs.readFileSync(path.join(outDir, 'manifest.json.sig'), 'utf-8').trim();
assert.strictEqual(verifyBytes(manifestBytes, sigText, keys.publicKeyPem), true);
ok('发布件里的 manifest.json 原始字节能被公钥验过（客户端验的就是这一步）');

const publishedManifest = JSON.parse(manifestBytes.toString('utf-8'));
assert.strictEqual(publishedManifest.publishedAt, approved.publishedAt);
assert.strictEqual(publishedManifest.id, 'acme-pack');
assert.deepStrictEqual(
    manifestBytes,
    store.finalManifestBytes(approved.manifest, approved.publishedAt!),
    '定稿字节必须可重放——重算一遍要逐字节相同，否则事后无法复核签名'
);
assert.ok(fs.existsSync(path.join(outDir, 'litviz-1.0.0.tar.gz')), '组件归档要一并进 outbox');
ok('发布件目录形制完整（manifest + sig + 全部归档），定稿字节可重放');

/* ---------- 7. 驳回与封禁表 ---------- */
console.log('\n[7] 驳回与封禁表');

assert.strictEqual(store.rejectPack('bob-pack', '1.0.0', '来源不明'), false);
ok('未受理的版本驳回不了（bob-pack 只建了草稿没 finalize）');

assert.strictEqual(store.revokePack('acme-pack', '1.0.0', '上游二进制被披露有后门'), true);
const revoked = await (await revokedGET()).json();
assert.deepStrictEqual(
    revoked.map((r: { id: string; version: string }) => `${r.id}@${r.version}`),
    ['acme-pack@1.0.0']
);
assert.strictEqual(revoked[0].reason, '上游二进制被披露有后门');
assert.ok(revoked[0].revokedAt, '封禁表要带 revokedAt');
ok('封禁表形制 {id, version, reason, revokedAt} 与插件一致');

assert.strictEqual(store.revokePack('acme-pack', '*', '整个 id 下架'), true);
const wildcard = await (await revokedGET()).json();
assert.deepStrictEqual(
    wildcard.map((r: { id: string; version: string }) => `${r.id}@${r.version}`),
    ['acme-pack@*']
);
ok('通配封禁如实发成 version "*"（镜像上可能有官网没记录的旧版本快照）');

console.log(`\n全部通过：${passed} 项`);
