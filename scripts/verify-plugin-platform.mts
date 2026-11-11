// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Run from a new empty temporary cwd: this test creates only synthetic users/packages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';
import { NextRequest } from 'next/server';

assert.equal(fs.readdirSync(process.cwd()).length, 0, 'Run in a new empty temporary directory');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildTemplateZip } = await import('@/lib/plugin-template');
const { PLATFORM_MANIFEST } = await import('@/lib/plugin-platform-guide');
const { submitPlugin } = await import('@/lib/plugins-store');
const zip = new AdmZip(buildTemplateZip('web'));
const hashes = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/plugin-template-digests.json'), 'utf8'));
let passed = 0;
function check(label: string, run: () => void) { run(); console.log('PASS', label); passed++; }
for (const [name, hash] of Object.entries(hashes)) {
  check(`download bytes: ${name}`, () => assert.equal(crypto.createHash('sha256').update(zip.readFile(name)!).digest('hex'), hash));
  if (process.env.AWD_SDK_SOURCE) check(`upstream bytes: ${name}`, () => assert.deepEqual(zip.readFile(name), fs.readFileSync(path.join(process.env.AWD_SDK_SOURCE!, name))));
}
check('runtime and editor SDK copies are identical', () => {
  assert.deepEqual(zip.readFile('web/awd-plugin-sdk.js'), zip.readFile('sdk/plugin-sdk/awd-plugin-sdk.js'));
  assert.deepEqual(zip.readFile('web/awd-plugin-sdk.d.ts'), zip.readFile('sdk/plugin-sdk/awd-plugin-sdk.d.ts'));
  assert.deepEqual(zip.readFile('manifest.schema.json'), zip.readFile('sdk/plugin-sdk/manifest.schema.json'));
});
const extracted = path.resolve('download');
zip.extractAllTo(extracted);
const cli = path.join(extracted, 'scripts/plugin-dev.mjs');
function cliRun(...args: string[]) { return execFileSync(process.execPath, [cli, ...args], { cwd: extracted, encoding: 'utf8' }); }
check('downloaded basic template validates standalone', () => assert.match(cliRun('validate', '.'), /my-web-plugin/));
check('downloaded CLI accepts explicit UI profiles without requiring a dedicated tab', () => {
  const basic = JSON.parse(zip.readAsText('manifest.json'));
  for (const views of [[], [{ id: 'panel', name: 'Panel', entry: 'web/index.html', placement: 'sidebar', scope: 'project' }], [{ id: 'full', name: 'Full', entry: 'web/index.html', placement: 'workspace', scope: 'project' }]]) {
    fs.writeFileSync(path.join(extracted, 'manifest.json'), JSON.stringify({ ...basic, contributes: { views } }));
    assert.match(cliRun('validate', '.'), /my-web-plugin/);
  }
});

fs.writeFileSync(path.join(extracted, 'manifest.json'), PLATFORM_MANIFEST);
check('downloaded platform manifest validates standalone', () => assert.match(cliRun('validate', '.'), /my-service-plugin/));
check('downloaded CLI packages standalone', () => {
  cliRun('package', '.', '--out', '../packaged.zip');
  assert.equal(new AdmZip(fs.readFileSync('packaged.zip')).readAsText('manifest.json'), PLATFORM_MANIFEST);
});
const AUTHOR = { id: 'synthetic-developer', username: 'synthetic-developer' };
function packageOf(value: unknown, extra: Record<string, Buffer> = {}) {
  const packed = new AdmZip();
  packed.addFile('manifest.json', Buffer.from(JSON.stringify(value)));
  packed.addFile('web/index.html', Buffer.from('<!doctype html><html><body>synthetic</body></html>'));
  for (const [name, content] of Object.entries(extra)) packed.addFile(name, content);
  return packed.toBuffer();
}
let sequence = 0;
function fixture() { return { ...JSON.parse(PLATFORM_MANIFEST), id: `platform-test-${++sequence}` }; }
check('new declarations accepted only as pending', () => assert.equal(submitPlugin(packageOf(fixture()), AUTHOR).plugin?.status, 'pending'));
check('theme contribution with explicit empty views remains valid payload', () => {
  const manifest = { id: 'headless-theme', name: 'Headless theme', version: '1.0.0', contributes: { views: [], themes: [{ id: 'ink', name: 'Ink', file: 'themes/ink.json' }] } };
  assert.equal(submitPlugin(packageOf(manifest, { 'themes/ink.json': Buffer.from('{}') }), AUTHOR).plugin?.status, 'pending');
});

function reject(label: string, mutate: (m: ReturnType<typeof fixture>) => void) {
  check(label, () => { const m = fixture(); mutate(m); assert.equal(submitPlugin(packageOf(m), AUTHOR).error, 'manifest_invalid'); });
}
reject('encoded view path rejected', m => m.contributes.views[0].entry = 'web/%2e%2e/index.html');
reject('missing view file rejected', m => m.contributes.views[0].entry = 'web/missing.html');
reject('duplicate placement rejected', m => m.contributes.views.push({ ...m.contributes.views[0], id: 'second' }));
reject('invalid dock rejected', m => m.contributes.views[0].defaultDock = 'top');
reject('invalid dock without allowlist rejected', m => { delete m.contributes.views[0].allowedDocks; m.contributes.views[0].defaultDock = 'top'; });
reject('MCP ambiguous credential source rejected', m => { m.settings.push({ key: 'legacy', type: 'string', scope: 'installation', secret: true }); m.contributes.mcpServers[0].credentialKey = 'legacy'; });
reject('MCP network permission required', m => m.permissions = []);
reject('MCP stdio rejected', m => m.contributes.mcpServers[0].transport = 'stdio');
reject('MCP URL whitespace rejected', m => m.contributes.mcpServers[0].url = 'https://api.example.com/mcp\n');
reject('MCP private URL rejected', m => m.contributes.mcpServers[0].url = 'https://127.0.0.1/mcp');
reject('MCP credential reference cannot escape namespace', m => m.contributes.mcpServers[0].credentialKey = 'system.openrouter.token');
reject('MCP connection must be same origin', m => m.contributes.mcpServers[0].url = 'https://another.example.com/mcp');
reject('MCP non-object schema rejected', m => m.contributes.mcpServers[0].tools[0].inputSchema = { type: 'string' });
reject('MCP unsupported nested constraint rejected', m => m.contributes.mcpServers[0].tools[0].inputSchema.properties.text.minLength = 1);
reject('MCP dangling required rejected', m => m.contributes.mcpServers[0].tools[0].inputSchema.required = ['missing']);
reject('MCP duplicate names rejected', m => m.contributes.mcpServers[0].tools.push(m.contributes.mcpServers[0].tools[0]));
reject('connection baseUrl must be origin', m => m.contributes.connections[0].baseUrl += '/v1');
reject('connection operation cannot redirect', m => m.contributes.connections[0].operations.summarize.path = '//evil.example.com');
reject('connection operation cannot accept arbitrary URL', m => m.contributes.connections[0].operations.summarize.path = '/v1?url=https://evil.example.com');
reject('connection cannot carry credential values', m => m.contributes.connections[0].auth.token = 'synthetic-never-use');
reject('setting options must be strings', m => m.settings[0].options = [123]);
reject('prototype inherited required property rejected', m => m.contributes.mcpServers[0].tools[0].inputSchema.required = ['constructor']);
reject('OAuth requires client metadata', m => m.contributes.connections[0].auth = { type: 'oauth2' });
reject('billing status operation must exist', m => m.contributes.connections[0].billing.statusOperation = 'missing');
reject('secret user setting rejected', m => m.settings[0].secret = true);
reject('secret installation default rejected', m => m.settings[0] = { ...m.settings[0], scope: 'installation', secret: true, default: 'sensitive' });
reject('unknown setting scope rejected', m => m.settings[0].scope = 'global');
check('public OAuth metadata including query accepted', () => {
  const m = fixture(); m.contributes.connections[0].auth = { type: 'oauth2', authorizationUrl: 'https://auth.example.com/authorize?audience=example', tokenUrl: 'https://auth.example.com/token', clientId: 'public-client', scopes: ['read'] };
  assert.equal(submitPlugin(packageOf(m), AUTHOR).plugin?.status, 'pending');
});
check('JSON null rejected without exception', () => assert.equal(submitPlugin(packageOf(null), AUTHOR).error, 'manifest_invalid'));
for (const marker of ['.awd-dev', '.awd-service-trust', '.awd-service-trust-123.tmp', '.awd-bundled', '.AWD-service-trust']) {
  check(`controlled marker rejected: ${marker}`, () => assert.equal(submitPlugin(packageOf(fixture(), { [marker]: Buffer.from('fake') }), AUTHOR).error, 'unsafe_path'));
}
check('symlink entry rejected', () => {
  const p = new AdmZip(packageOf(fixture()));
  p.getEntry('web/index.html')!.attr = (0o120777 << 16) >>> 0;
  assert.equal(submitPlugin(p.toBuffer(), AUTHOR).error, 'unsafe_path');
});
check('pure remote contribution counts as payload', () => {
  const m = fixture(); delete m.frontendEntry; delete m.contributes.views; delete m.settings;
  assert.equal(submitPlugin(packageOf(m), AUTHOR).plugin?.status, 'pending');
});

// Exercise the actual cookie-authorized API route with an isolated synthetic local session.
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/users.json', JSON.stringify([{ ...AUTHOR, email: 'synthetic@example.invalid', displayName: 'Synthetic', passwordHash: '', createdAt: new Date().toISOString() }]));
const { createSession } = await import('@/lib/sessions');
const { POST } = await import('@/app/api/plugins/route');
const { token } = createSession(AUTHOR.id);
const { saveDeveloper, applyDeveloper, reviewDeveloper } = await import('@/lib/developers');
const { findUserById } = await import('@/lib/users');
const developer = saveDeveloper(findUserById(AUTHOR.id)!, { kind: 'individual', displayName: 'Synthetic', organization: '', contactType: 'email', contact: 'synthetic@example.invalid', experience: 'Synthetic fixture', plan: 'Test permissions', permissions: JSON.parse(PLATFORM_MANIFEST).permissions }, 0);
const pendingDeveloper = applyDeveloper(findUserById(AUTHOR.id)!, developer.version);
reviewDeveloper(AUTHOR.id, pendingDeveloper.version, 'approve', 'Synthetic fixture', true);
async function post(m: unknown, cookie = true) {
  const form = new FormData(); form.append('file', new File([new Uint8Array(packageOf(m))], 'plugin.zip', { type: 'application/zip' }));
  return POST(new NextRequest('http://localhost/api/plugins', { method: 'POST', headers: cookie ? { Cookie: `awd_session=${token}` } : {}, body: form }));
}
assert.equal((await post(fixture(), false)).status, 401); passed++; console.log('PASS actual POST requires session');
const accepted = await post(fixture()); assert.equal(accepted.status, 200); assert.equal((await accepted.json()).plugin.status, 'pending'); passed++; console.log('PASS actual authenticated POST remains pending');
const invalid = fixture(); invalid.contributes.mcpServers[0].tools[0].inputSchema.oneOf = [];
const refused = await post(invalid); assert.equal(refused.status, 400); assert.equal((await refused.json()).error, 'manifest_invalid'); passed++; console.log('PASS actual POST rejects unsupported schema');

// Execute the generated simulator script in a deterministic DOM shell: no browser/network service.
const html = zip.readAsText('dev/host-simulator.html');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const elements = new Map<string, any>();
function element(id: string) {
  if (!elements.has(id)) elements.set(id, { listeners: {} as Record<string, Function>, addEventListener(event: string, callback: Function) { this.listeners[event] = callback; }, appendChild() {}, remove() {}, contentWindow: { postMessage() {} }, classList: { add() {}, remove() {} }, textContent: '', scrollHeight: 1, scrollTop: 0 });
  return elements.get(id);
}
const listeners: Record<string, Function> = {};
const replies: any[] = [];
const simulatorManifest = JSON.parse(PLATFORM_MANIFEST);
const context = vm.createContext({ console, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => simulatorManifest }), document: { getElementById: element, querySelector: element, createElement: element }, window: { addEventListener: (name: string, cb: Function) => listeners[name] = cb } });
vm.runInContext(script, context);
const frame = [...elements.values()].find(e => e.listeners.load);
frame.contentWindow.postMessage = (message: unknown) => replies.push(message);
async function call(method: string, params = {}) {
  replies.length = 0; listeners.message({ source: frame.contentWindow, data: { awd: 'v1', type: 'call', seq: 99, method, params } });
  await new Promise(resolve => setTimeout(resolve, 0));
  const result = replies.find(r => r.type === 'result'); assert.ok(result, `simulator replied to ${method}`); return result;
}
// Read protocol from the generated script, avoiding a test-only product override.
const protocol = Number(script.match(/var PROTOCOL = (\d+)/)![1]);
const originalListener = listeners.message;
listeners.message = (event: any) => { event.data.awd = protocol; originalListener(event); };
assert.equal((await call('ui.openWorkspace')).error.code, 'unavailable');
simulatorManifest.contributes.views.push({ id: 'full', name: 'Full view', entry: 'web/index.html', placement: 'workspace', scope: 'project' });
assert.equal((await call('ui.openWorkspace')).error.code, 'host_required');
assert.equal((await call('ui.openWorkspace', { pluginId: 'another-plugin' })).error.code, 'host_required');
simulatorManifest.contributes.views = [];
assert.equal((await call('ui.openWorkspace')).error.code, 'unavailable');
delete simulatorManifest.contributes.views;
assert.equal((await call('ui.openWorkspace')).error.code, 'unavailable');
passed++; console.log('PASS workspace opening requires an explicitly declared view and a real host');
assert.equal((await call('settings.update', { values: { language: 'en' } })).ok, true);
assert.equal((await call('settings.get', { key: 'language' })).result.value, 'en');
assert.equal((await call('settings.update', { values: { unknown: 'no' } })).ok, false);
assert.equal((await call('connections.request', { id: 'service', operation: 'summarize' })).ok, false);
assert.equal((await call('connections.connect', { id: 'service' })).result.opened, true);
assert.equal((await call('connections.request', { id: 'service', operation: 'summarize' })).result.simulated, true);
assert.equal((await call('mcp.call', { serverId: 'remote', name: 'summarize', arguments: { text: 'synthetic' } })).result.isError, false);
assert.equal((await call('mcp.call', { serverId: 'remote', name: 'undeclared' })).ok, false);
assert.equal((await call('connections.disconnect', { id: 'service' })).ok, true);
assert.equal((await call('mcp.call', { serverId: 'remote', name: 'summarize' })).ok, false);
assert.equal((await call('services.request', { service: 'speech', operation: 'generate' })).error.code, 'host_required');
const failureButton = element('button');
failureButton.listeners.click();
assert.equal((await call('connections.list')).error.code, 'plugin_service_failed');
failureButton.listeners.click();
assert.equal((await call('connections.list')).ok, true);
assert.equal((await call('services.request', { service: 'ai', operation: 'anything' })).error.code, 'host_required');
assert.equal((await call('services.cancel', { requestId: 'synthetic' })).result.cancelled, false);
assert.equal((await call('notifications.publish', { eventKey: 'test', title: 'Test' })).error.code, 'permission_denied');
simulatorManifest.permissions.push('notifications');
assert.equal((await call('notifications.publish', { eventKey: 'test', title: 'Test' })).error.code, 'host_required');
assert.equal((await call('notifications.resolve', { eventKey: 'test', state: 'done' })).error.code, 'host_required');
passed++; console.log('PASS notification simulator checks permission and never pretends to deliver or resolve a real notice');
passed++; console.log('PASS generated simulator scoped settings, connection lifecycle, MCP and real-service refusal');
console.log(JSON.stringify({ passed, cwd: process.cwd(), sourceComparison: !!process.env.AWD_SDK_SOURCE, simulator: 'generated JavaScript in VM DOM shell, not actual host/browser' }, null, 2));
