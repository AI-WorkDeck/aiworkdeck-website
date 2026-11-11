/**
 * 三方 Web 插件（web/ + frontendEntry）受理 / 扫描 / 模板验证脚本。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §11。
 *
 * 覆盖：纯 web 插件受理通过、backendJars 与 frontendEntry 双空拒收、
 * frontendEntry 越界（../ / web 外 / 包内不存在）拒收、web 文件进 files 哈希表、
 * web JS 外联 URL 线索与 network 声明交叉核对、JAR 老路径不回归、
 * 模板 zip（type=web）SDK 与 CLI 配套文件可解且自身可被受理。
 *
 * 必须在一个空目录里执行（data/plugins.json 等会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-web-plugins.mts
 */
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const cwd = process.cwd();
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
assert.ok(!fs.existsSync(path.join(cwd, 'data', 'plugins.json')), '隔离目录残留 data/plugins.json，请换空目录');

const { submitPlugin, getPlugin } = await import('@/lib/plugins-store');
const { buildTemplateZip } = await import('@/lib/plugin-template');
const { siteConfig } = await import('@/lib/site-config');

const AUTHOR = { id: 'author-web-1', username: 'web-tester' };

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

function sha256(buf: Buffer | string): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function zipOf(files: Record<string, string | Buffer>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
        zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
    }
    return zip.toBuffer();
}

function manifest(extra: Record<string, unknown>): string {
    return JSON.stringify({ name: '测试插件', version: '1.0.0', description: 'd', ...extra });
}

const INDEX_HTML = '<!DOCTYPE html><html><body><script src="awd-plugin-sdk.js"></script></body></html>';
const SDK_JS = 'window.awd = { ready: function () { return Promise.resolve({}); } };';

/* ---------- 1. 纯 web 插件（无任何 JAR）受理通过 ---------- */
{
    const zip = zipOf({
        'manifest.json': manifest({ id: 'pure-web', frontendEntry: 'web/index.html', permissions: [] }),
        'web/index.html': INDEX_HTML,
        'web/awd-plugin-sdk.js': SDK_JS,
    });
    const res = submitPlugin(zip, AUTHOR);
    assert.ok(!res.error, `纯 web 插件应受理通过，实际 ${res.error}`);
    assert.strictEqual(res.plugin!.status, 'pending');
    assert.strictEqual(res.plugin!.frontendEntry, 'web/index.html');
    ok('纯 web 插件（backendJars 为空）受理通过');

    /* ---------- 2. web 文件进 files 哈希表（签名覆盖 = 桌面端逐文件可校验） ---------- */
    const files = res.plugin!.files;
    assert.strictEqual(files['web/index.html'], sha256(INDEX_HTML), 'web/index.html 哈希不符');
    assert.strictEqual(files['web/awd-plugin-sdk.js'], sha256(SDK_JS), 'SDK 哈希不符');
    assert.ok(files['manifest.json'], 'manifest.json 应在 files 表内');
    ok('web/ 下每个文件都进 files 哈希表且哈希正确');

    // 落盘可回读：桌面端 file 端点按 files 表的键取字节
    const { readPluginFile } = await import('@/lib/plugins-store');
    const back = readPluginFile('pure-web', '1.0.0', 'web/index.html');
    assert.strictEqual(back?.toString('utf8'), INDEX_HTML);
    ok('web/ 文件按 files 表的键可回读（下载端点口径）');

    // 纯 web 插件没有字节码，扫描不应因此报错，也不该产生 class 相关噪音
    assert.strictEqual(res.plugin!.scan.classCount, 0);
    assert.deepStrictEqual(res.plugin!.scan.hits, []);
    ok('纯 web 插件跳过 class 扫描且不报错');
}

/* ---------- 3. 双空拒收 ---------- */
{
    const zip = zipOf({
        'manifest.json': manifest({ id: 'empty-payload', permissions: [] }),
        'README.md': '# nothing',
    });
    const res = submitPlugin(zip, AUTHOR);
    assert.strictEqual(res.error, 'no_payload');
    ok('backendJars 与 frontendEntry 双空 -> no_payload');
}

/* ---------- 3b. 主题声明载荷与包内文件完整性 ---------- */
for (const file of ['themes/missing.json', '../outside.json', '/absolute.json', '']) {
    const id = 'theme-invalid-' + crypto.randomBytes(4).toString('hex');
    const res = submitPlugin(zipOf({
        'manifest.json': manifest({
            id, frontendEntry: 'web/index.html',
            contributes: { themes: [{ id: 'test-theme', file }] },
        }),
        'web/index.html': INDEX_HTML,
    }), AUTHOR);
    assert.strictEqual(res.error, 'contributed_file_missing', `主题文件 ${file} 应被拒收`);
    assert.ok(!getPlugin(id), '缺失或越界的主题声明不得因 Web 入口存在而落盘');
}
ok('主题声明文件缺失、空路径或越界时，即使带 Web 入口也拒收');

{
    const theme = JSON.stringify({ colors: { 'surface-primary': '#ffffff' } });
    const res = submitPlugin(zipOf({
        'manifest.json': manifest({
            id: 'pure-theme', contributes: { themes: [{ id: 'paper', file: 'themes/paper.json' }] },
        }),
        'themes/paper.json': theme,
    }), AUTHOR);
    assert.ok(!res.error, `纯主题声明插件应受理通过，实际 ${res.error}`);
    assert.strictEqual(res.plugin!.status, 'pending', '皮肤包仍须审核');
    assert.strictEqual(res.plugin!.frontendEntry, undefined);
    assert.strictEqual(res.plugin!.files['themes/paper.json'], sha256(theme));
    const { readPluginFile } = await import('@/lib/plugins-store');
    assert.strictEqual(readPluginFile('pure-theme', '1.0.0', 'themes/paper.json')?.toString('utf8'), theme);
    ok('纯主题声明受理为 pending，主题文件纳入签名哈希并可回读');
}

/* ---------- 3c. 包内多语言显示文案不改签名载荷 ---------- */
{
    const sourceManifest = manifest({
        id: 'localized-display', name: '%plugin.name%', description: '%plugin.desc%',
        frontendEntry: 'web/index.html',
    });
    const res = submitPlugin(zipOf({
        'manifest.json': sourceManifest,
        'web/index.html': INDEX_HTML,
        'l10n/zh-CN.json': JSON.stringify({ 'plugin.name': '极光玻璃', 'plugin.desc': '专注工作皮肤' }),
        'l10n/en-US.json': JSON.stringify({ 'plugin.name': 'Aurora Glass', 'plugin.desc': 'A focus skin' }),
    }), AUTHOR);
    assert.ok(!res.error);
    assert.strictEqual(res.plugin!.name, siteConfig.defaultLocale === 'zh' ? '极光玻璃' : 'Aurora Glass');
    assert.strictEqual(res.plugin!.description, siteConfig.defaultLocale === 'zh' ? '专注工作皮肤' : 'A focus skin');
    assert.strictEqual(res.plugin!.files['manifest.json'], sha256(sourceManifest));
    const { readPluginFile } = await import('@/lib/plugins-store');
    assert.strictEqual(readPluginFile('localized-display', '1.0.0', 'manifest.json')?.toString('utf8'), sourceManifest);
    ok('登记名称与简介按站点语言解析，原始 manifest 字节和签名哈希不变');

    const preferred = siteConfig.defaultLocale === 'zh' ? 'zh-CN' : 'en-US';
    const fallback = preferred === 'zh-CN' ? 'en-US' : 'zh-CN';
    const fallbackRes = submitPlugin(zipOf({
        'manifest.json': manifest({ id: 'localized-fallback', name: '%plugin.name%', description: '%missing%', frontendEntry: 'web/index.html' }),
        'web/index.html': INDEX_HTML,
        [`l10n/${preferred}.json`]: 'malformed JSON',
        [`l10n/${fallback}.json`]: JSON.stringify({ 'plugin.name': 'Fallback name' }),
    }), AUTHOR);
    assert.strictEqual(fallbackRes.plugin!.name, 'Fallback name');
    assert.strictEqual(fallbackRes.plugin!.description, '');
    const missingRes = submitPlugin(zipOf({
        'manifest.json': manifest({ id: 'localized-missing', name: '%missing%', frontendEntry: 'web/index.html' }),
        'web/index.html': INDEX_HTML,
    }), AUTHOR);
    assert.strictEqual(missingRes.plugin!.name, 'localized-missing');
    assert.strictEqual(getPlugin('pure-web')!.name, '测试插件');
    ok('首选词典无效时回退，缺失词条不展示占位符，字面名称仍保留');
}

/* ---------- 4. frontendEntry 越界 / 不存在 ---------- */
for (const [label, entry, extra] of [
    ['../ 逃逸', '../evil.html', {}],
    ['web/ 之外', 'evil.html', { 'evil.html': INDEX_HTML }],
    ['web/ 之外的兄弟目录', 'webx/index.html', { 'webx/index.html': INDEX_HTML }],
    ['绝对路径', '/etc/passwd', {}],
    ['包内不存在', 'web/missing.html', {}],
    ['指向目录', 'web/', { 'web/index.html': INDEX_HTML }],
] as [string, string, Record<string, string>][]) {
    const zip = zipOf({
        'manifest.json': manifest({ id: 'bad-entry', frontendEntry: entry, permissions: [] }),
        'web/index.html': INDEX_HTML,
        ...extra,
    });
    const res = submitPlugin(zip, AUTHOR);
    assert.strictEqual(res.error, 'frontend_entry_invalid', `${label} 应被拒收，实际 ${res.error}`);
    assert.ok(!getPlugin('bad-entry'), '拒收的包不得落任何记录');
}
ok('frontendEntry 越界 / 指向不存在的文件一律 frontend_entry_invalid');

/* ---------- 5. web JS 外联线索与 network 声明交叉核对 ---------- */
const PHONE_HOME_JS = [
    'const API = "https://collector.example.net/v1/ingest";',
    'const FALLBACK = "203.0.113.9";',
    "fetch('https://collector.example.net/v1/ingest');", // 同值不同上下文，剪掉尾随标点后应去重
    'const OK = "https://www.w3.org/1999/xhtml";',              // 命名空间不算信号
    'fetch(API); fetch(FALLBACK);',
].join('\n');

{
    const zip = zipOf({
        'manifest.json': manifest({ id: 'phone-home', frontendEntry: 'web/index.html', permissions: [] }),
        'web/index.html': INDEX_HTML,
        'web/app.js': PHONE_HOME_JS,
    });
    const res = submitPlugin(zip, AUTHOR);
    assert.ok(!res.error, '扫描只出报告，不自动拒收');
    const scan = res.plugin!.scan;

    const urls = scan.findings.filter((f) => f.kind === 'web_external_url');
    assert.strictEqual(urls.length, 1, `外联 URL 应去重后只报 1 条，实际 ${JSON.stringify(urls)}`);
    assert.strictEqual(urls[0].value, 'https://collector.example.net/v1/ingest');
    assert.strictEqual(urls[0].file, 'web/app.js');
    assert.ok(
        scan.findings.some((f) => f.kind === 'hardcoded_ip' && f.value === '203.0.113.9'),
        'IPv4 字面量也要提取'
    );
    assert.ok(
        !scan.findings.some((f) => f.value.includes('w3.org')),
        '命名空间 URI 不应进报告'
    );

    const undeclared = scan.crossCheck.filter((c) => c.kind === 'undeclared' && c.permission === 'network');
    assert.strictEqual(undeclared.length, 1, '外联 URL + 未声明 network 应报 undeclared');
    assert.strictEqual(scan.needsAttention, true, '交叉核对不一致要在报告里标出来');
    ok('web JS 外联 URL/IP 去重提取，未声明 network 标 warning（不自动拒）');
}

{
    const zip = zipOf({
        'manifest.json': manifest({ id: 'phone-home-declared', frontendEntry: 'web/index.html', permissions: ['network'] }),
        'web/index.html': INDEX_HTML,
        'web/app.js': PHONE_HOME_JS,
    });
    const scan = submitPlugin(zip, AUTHOR).plugin!.scan;
    assert.deepStrictEqual(
        scan.crossCheck.filter((c) => c.permission === 'network'),
        [],
        '如实声明 network 后不应再有 network 相关的交叉核对问题'
    );
    ok('如实声明 network 后交叉核对无问题');
}

{
    // 纯 web 插件声明 file_read：没有字节码可扫，不该报「声明了却没用到」的噪音
    const zip = zipOf({
        'manifest.json': manifest({ id: 'web-file-read', frontendEntry: 'web/index.html', permissions: ['file_read'] }),
        'web/index.html': INDEX_HTML,
    });
    const scan = submitPlugin(zip, AUTHOR).plugin!.scan;
    assert.deepStrictEqual(scan.crossCheck, [], `纯 web 插件不该有 unused 噪音：${JSON.stringify(scan.crossCheck)}`);
    ok('纯 web 插件不产生 unused 交叉核对噪音');
}

/* ---------- 6. JAR 老路径不回归 ---------- */
{
    const zip = zipOf({
        'manifest.json': manifest({ id: 'jar-only', backendJars: ['tool.jar'], permissions: [] }),
        'tool.jar': Buffer.from('not-a-real-jar'),
    });
    const res = submitPlugin(zip, AUTHOR);
    assert.ok(!res.error, `纯 JAR 插件仍应受理通过，实际 ${res.error}`);
    assert.strictEqual(res.plugin!.frontendEntry, undefined);
    ok('纯 JAR 插件受理路径未回归');

    const missing = submitPlugin(
        zipOf({ 'manifest.json': manifest({ id: 'jar-missing', backendJars: ['nope.jar'] }) }),
        AUTHOR
    );
    assert.strictEqual(missing.error, 'jar_missing');
    ok('jar_missing 判定不变');
}

/* ---------- 7. 模板 zip（type=web）SDK 与 CLI 配套文件 ---------- */
{
    const buf = buildTemplateZip('web');
    const names = new AdmZip(buf).getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName).sort();
    assert.deepStrictEqual(
        names,
        ['AGENT_TASK.md', 'README.md', 'dev/host-simulator.html', 'examples/platform-manifest.json', 'manifest.json', 'manifest.schema.json', 'scripts/plugin-dev.mjs', 'sdk/plugin-sdk/awd-plugin-sdk.d.ts', 'sdk/plugin-sdk/awd-plugin-sdk.js', 'sdk/plugin-sdk/manifest.d.ts', 'sdk/plugin-sdk/manifest.schema.json', 'web/awd-plugin-sdk.d.ts', 'web/awd-plugin-sdk.js', 'web/index.html'],
        `web 模板SDK 与 CLI 配套文件不齐：${names.join(', ')}`
    );

    const entries = new Map(
        new AdmZip(buf).getEntries().map((e) => [e.entryName, e.getData().toString('utf8')])
    );
    const tplManifest = JSON.parse(entries.get('manifest.json')!);
    assert.strictEqual(tplManifest.frontendEntry, 'web/index.html');
    assert.deepStrictEqual(tplManifest.backendJars, []);

    // SDK 副本必须完整实现 v1 契约（方法名 + 握手 + 错误信封）
    const sdk = entries.get('web/awd-plugin-sdk.js')!;
    for (const token of [
        "type: 'call'",
        "msg.type === 'init'",
        "msg.type === 'result'",
        'context.get',
        'files.list',
        'files.read',
        'ui.toast',
        'storage.get',
        'storage.set',
        'sdk/plugin-sdk/',
        '1.5.0',
        'im.request',
        'im.downloadAttachment',
        'chat.addFile',
        'files.prepareDrag',
        'files.endDrag',
    ]) {
        assert.ok(sdk.includes(token), `SDK 副本缺少 ${token}`);
    }

    // 宿主模拟器：sandbox 必须不含 allow-same-origin，且实现全部 v1 方法
    const sim = entries.get('dev/host-simulator.html')!;
    assert.ok(sim.includes('sandbox="allow-scripts allow-forms"'), '模拟器 iframe 缺 sandbox');
    // 注释里可以解释为什么不能开，sandbox 属性本身绝不能出现 allow-same-origin
    assert.ok(!/sandbox="[^"]*allow-same-origin/.test(sim), '模拟器绝不能开 allow-same-origin');
    for (const method of ['im.request', 'im.downloadAttachment', 'chat.addFile', 'files.prepareDrag', 'files.endDrag']) {
        assert.ok(sim.includes(method), `模拟器未处理 ${method}`);
    }
    assert.ok(sim.includes('host_required'), '真实宿主能力不得模拟成功');
    assert.ok(sim.includes('../web/index.html'), '模拟器应嵌入 web/index.html');
    for (const code of ['permission_denied', 'unknown_method']) {
        assert.ok(sim.includes(code), `模拟器缺错误码 ${code}`);
    }
    // 静态服务必须不改写 URL：serve 的 clean URLs 会把 /web/index.html 转成 /web，
    // 相对引用的 SDK 随之 404，面板永远停在等待握手——README 里给的命令不能踩这个坑
    const readme = entries.get('README.md')!;
    assert.ok(readme.includes('python3 -m http.server'), 'README 应给出不改写 URL 的静态服务命令');
    assert.ok(readme.includes('cleanUrls'), 'README 应提醒 npx serve 的 clean URLs 坑');
    ok('type=web 模板SDK 与 CLI 配套文件齐全，SDK 与模拟器覆盖 v1 契约');

    // 模板原样提交必须能被自己的受理逻辑收下——否则开发者第一步就撞墙
    const res = submitPlugin(buf, { id: 'author-web-2', username: 'tpl-tester' });
    assert.ok(!res.error, `web 模板原样提交应受理通过，实际 ${res.error}`);
    assert.strictEqual(res.plugin!.frontendEntry, 'web/index.html');
    assert.deepStrictEqual(
        res.plugin!.scan.crossCheck,
        [],
        `模板自身不该触发交叉核对问题：${JSON.stringify(res.plugin!.scan.crossCheck)}`
    );
    assert.strictEqual(res.plugin!.scan.needsAttention, false);
    ok('web 模板原样打包即可通过受理，且扫描干净');
}

/* ---------- 8. Java 模板未受影响 ---------- */
{
    const names = new AdmZip(buildTemplateZip()).getEntries().map((e) => e.entryName).sort();
    assert.deepStrictEqual(names, [
        'README.md',
        'manifest.json',
        'pom.xml',
        'src/main/java/com/example/myplugin/MyTools.java',
    ]);
    assert.deepStrictEqual(
        names,
        new AdmZip(buildTemplateZip('java')).getEntries().map((e) => e.entryName).sort()
    );
    ok('缺省模板仍是 Java 模板（老下载链接行为不变）');
}

console.log(`\n全部通过：${passed} 项`);
