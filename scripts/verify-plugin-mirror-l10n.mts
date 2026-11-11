/** CN signs once; INTL mirrors the same data and localizes only public display. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';

const self = fileURLToPath(import.meta.url);
const repo = path.dirname(path.dirname(self));
const mode = process.argv[2];
if (!mode) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awd-plugin-mirror-'));
    try {
        const cn = path.join(root, 'cn');
        const intl = path.join(root, 'intl');
        fs.mkdirSync(cn); fs.mkdirSync(intl);
        const run = (cwd: string, site: string, action: string) => execFileSync(
            path.join(repo, 'node_modules/.bin/tsx'), ['--tsconfig', path.join(repo, 'tsconfig.json'), self, action],
            { cwd, env: { ...process.env, NEXT_PUBLIC_AWD_SITE: site, AWD_PLUGIN_SIGNING_KEY: '' }, stdio: 'inherit' },
        );
        run(cn, 'cn', 'seed');
        fs.cpSync(path.join(cn, 'data'), path.join(intl, 'data'), { recursive: true });
        fs.copyFileSync(path.join(cn, 'public-key.pem'), path.join(intl, 'public-key.pem'));
        run(intl, 'intl', 'verify');
        run(cn, 'cn', 'verify');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
} else {
    assert.ok(!fs.existsSync('package.json'), 'Use an isolated fixture directory');
    const store = await import('@/lib/plugins-store');
    const signing = await import('@/lib/plugin-signing');
    if (mode === 'seed') {
        const keys = signing.generateKeyPair();
        process.env.AWD_PLUGIN_SIGNING_KEY = keys.privateKeyPem;
        fs.writeFileSync('public-key.pem', keys.publicKeyPem);
        const zip = new AdmZip();
        const files = {
            'manifest.json': JSON.stringify({ id: 'mirror-theme', version: '1.0.2', name: '%plugin.name%', description: '%plugin.desc%', contributes: { themes: [{ id: 'paper', file: 'themes/paper.json' }] } }),
            'themes/paper.json': JSON.stringify({ colors: { 'surface-primary': '#ffffff' } }),
            'l10n/zh-CN.json': JSON.stringify({ 'plugin.name': '极光玻璃', 'plugin.desc': '专注工作皮肤' }),
            'l10n/en-US.json': JSON.stringify({ 'plugin.name': 'Aurora Glass', 'plugin.desc': 'A focus skin' }),
            'l10n/ja-JP.json': JSON.stringify({ 'plugin.name': 'オーロラガラス', 'plugin.desc': '集中できるテーマ' }),
        };
        for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text));
        const submitted = store.submitPlugin(zip.toBuffer(), { id: 'mirror-author', username: 'mirror-tester' });
        assert.equal(submitted.error, undefined);
        assert.equal(submitted.plugin?.name, '极光玻璃');
        assert.equal(submitted.plugin?.description, '专注工作皮肤');
        assert.deepEqual(store.approvePlugin('mirror-theme', '1.0.2'), { ok: true });
        console.log('PASS CN submit and sign localized plugin with an isolated test key');
    } else {
        const { siteConfig } = await import('@/lib/site-config');
        const entry = store.getPlugin('mirror-theme', '1.0.2')!;
        assert.equal(entry.name, '极光玻璃', 'The mirrored registry must remain the CN original');
        assert.equal(entry.description, '专注工作皮肤');
        assert.equal(process.env.AWD_PLUGIN_SIGNING_KEY, '', 'INTL must not require a signing key');
        const expected = siteConfig.defaultLocale === 'zh'
            ? { name: '极光玻璃', description: '专注工作皮肤' }
            : { name: 'Aurora Glass', description: 'A focus skin' };
        const registryBefore = fs.readFileSync('data/plugins.json');
        const filesBefore = Object.keys(entry.files).map(name => [name, store.readPluginFile(entry.id, entry.version, name)!] as const);
        const { GET } = await import('@/app/api/registry/plugins/route');
        const response = await GET();
        assert.equal(response.status, 200);
        const rows = await response.json();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, expected.name, 'Actual registry API must localize the mirrored CN name');
        assert.equal(rows[0].description, expected.description);
        assert.deepEqual(store.getPluginDisplay(entry), expected, 'Marketplace display uses the same localized fields');
        assert.deepEqual(store.getPluginDisplay(entry, 'ja'), { name: 'オーロラガラス', description: '集中できるテーマ' });
        assert.deepEqual(store.getPluginDisplay(entry, 'zh'), { name: '极光玻璃', description: '专注工作皮肤' });
        assert.deepEqual(store.getPluginDisplay(entry, 'fr'), { name: 'Aurora Glass', description: 'A focus skin' }, 'Missing preferred dictionary falls back to English');
        for (const language of ['unknown', '../../outside', '/tmp/outside', 'constructor', '__proto__']) {
            assert.deepEqual(store.getPluginDisplay(entry, language), expected, 'Only existing URL locales may select a package dictionary');
        }
        assert.deepEqual(fs.readFileSync('data/plugins.json'), registryBefore);
        for (const [name, bytes] of filesBefore) {
            assert.deepEqual(store.readPluginFile(entry.id, entry.version, name), bytes);
            assert.equal(signing.sha256(bytes), entry.files[name]);
        }
        assert.ok(signing.verifyPayload(store.payloadOf(entry), entry.signature!, fs.readFileSync('public-key.pem', 'utf8')));
        assert.deepEqual(store.getPluginDisplay({ ...entry, id: 'legacy-no-files', name: 'Legacy', description: 'Legacy description' }), { name: 'Legacy', description: 'Legacy description' });
        console.log(`PASS ${process.env.NEXT_PUBLIC_AWD_SITE}: API/display localized; mirrored registry, signed manifest/files and signature unchanged; missing legacy files retain display`);
    }
}
