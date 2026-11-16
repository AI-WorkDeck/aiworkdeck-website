/**
 * 插件自动扫描（lib/plugin-scan.ts）的真/假阳性对拍。
 * 起因：2026-08-23 上架尽调插件时，两条 high 全是子串匹配打出来的假阳性——
 * `java/lang/Runtime` 命中的其实是 `java/lang/RuntimeException`（每个 throw/catch
 * 的 JAR 都中），`com/checkba/` 命中的是**给插件用的** SPI 包（每个 JAR 插件都中）。
 * 一条对所有插件恒亮的 high 规则等于没有规则——人会学会无视它。
 *
 * 跑法：npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-plugin-scan.mts
 */
import assert from 'assert';
const { scanPluginPackage } = await import('@/lib/plugin-scan');

const cls = (s: string) => Buffer.from(s, 'latin1');
// ScanInput.files 是 Map<string, Buffer>，这里收成对数组再转 Map（用例里写字面量更好读）
const hitKeys = (files: [string, Buffer][]) =>
  new Set(scanPluginPackage({ files: new Map(files), declaredPermissions: [] }).hits.map((h) => h.rule));

let passed = 0;
const ok = (name: string) => { console.log('  ok ' + name); passed++; };

// —— 假阳性：不许再亮 ——
assert.ok(!hitKeys([['a.jar!X.class', cls('java/lang/RuntimeException')]]).has('process_exec'),
  'RuntimeException 不该算执行本机命令');
ok('RuntimeException 不再误报 process_exec');

assert.ok(!hitKeys([['a.jar!X.class', cls('com/checkba/plugin/api/Docs')]]).has('host_internals'),
  '引用 SPI 包不该算访问宿主内部');
ok('引用 com/checkba/plugin/api/ 不再误报 host_internals');

// —— 真阳性：必须还亮 ——
assert.ok(hitKeys([['a.jar!X.class', cls('java/lang/Runtime;')]]).has('process_exec'),
  '真的引用 java/lang/Runtime 必须报');
ok('java/lang/Runtime 仍然报 process_exec');

assert.ok(hitKeys([['a.jar!X.class', cls('java/lang/ProcessBuilder')]]).has('process_exec'),
  'ProcessBuilder 必须报');
ok('ProcessBuilder 仍然报 process_exec');

assert.ok(hitKeys([['a.jar!X.class', cls('com/checkba/service/ai/PluginService')]]).has('host_internals'),
  '绕过 SPI 直接摸宿主 service 必须报');
ok('com/checkba/service/... 仍然报 host_internals');

assert.ok(hitKeys([['a.jar!X.class', cls('setAccessible')]]).has('reflection_bypass'),
  'setAccessible 必须报');
ok('setAccessible 仍然报 reflection_bypass');

console.log(`\n${passed} 条通过`);

// A namespace-looking substring must not hide an external endpoint.
for (const url of [
  'http://www.w3.org.evil.example/path',
  'http://evil.example/www.w3.org',
  'http://evil.example/?xmlns=x',
  'http://schemas.evil.example/path',
  'http://localhost.evil.example/path',
  'http://127.evil.example/path',
  'http://www.w3.org@evil.example/path',
]) {
  for (const file of ['a.jar!X.class', 'web/main.js']) {
    const result = scanPluginPackage({ files: new Map([[file, cls(url)]]), declaredPermissions: [] });
    assert.ok(result.findings.some(f => f.value === url), `${file} must report ${url}`);
  }
}
for (const url of ['http://www.w3.org/2000/svg', 'http://schemas.xmlsoap.org/soap/envelope/', 'http://localhost:8080/api', 'http://127.0.0.1:8080/api']) {
  const result = scanPluginPackage({ files: new Map([['web/main.js', cls(url)]]), declaredPermissions: [] });
  assert.ok(!result.findings.some(f => f.value === url), `known namespace/loopback ${url}`);
}
console.log('URL authority adversarial cases passed');
