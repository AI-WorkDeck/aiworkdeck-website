/** Run from a fresh temporary cwd: only synthetic plugin data is written. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

assert.ok(!fs.existsSync('package.json') && !fs.existsSync('data'), 'Use a fresh temporary cwd');
const { submitPlugin, readPluginFile } = await import('@/lib/plugins-store');
const zip = new AdmZip();
zip.addFile('manifest.json', Buffer.from(JSON.stringify({
    id: 'path-fixture', version: '1.0.0', name: 'Path fixture',
    frontendEntry: 'web/index.html', permissions: [],
})));
zip.addFile('web/index.html', Buffer.from('<p>Fixture</p>'));
const submitted = submitPlugin(zip.toBuffer(), { id: 'path-fixture-author', username: 'fixture' });
assert.ok(submitted.plugin, submitted.error);
assert.equal(readPluginFile('path-fixture', '1.0.0', 'web/index.html')?.toString(), '<p>Fixture</p>');

fs.writeFileSync(path.join('data', 'outside.txt'), 'synthetic-private-fixture');
let rejected = 0;
for (const [id, version, file] of [
    ['../outside', '1.0.0', 'web/index.html'],
    ['path-fixture', '../../outside', 'web/index.html'],
    ['path-fixture', '1.0.0', '../../../outside.txt'],
    ['path-fixture', '1.0.0', 'web/../../../../outside.txt'],
    ['path-fixture', '1.0.0', '/tmp/outside.txt'],
    ['path-fixture', '1.0.0', '..\\outside.txt'],
    ['path-fixture', '1.0.0', 'C:\\outside.txt'],
    ['path-fixture', '1.0.0', '%2e%2e%2foutside.txt'],
    ['path-fixture', '1.0.0', 'web/./index.html'],
    ['path-fixture', '1.0.0', 'not-declared.txt'],
]) {
    assert.equal(readPluginFile(id, version, file), undefined, JSON.stringify([id, version, file]));
    rejected++;
}
assert.equal(fs.readFileSync(path.join('data', 'outside.txt'), 'utf8'), 'synthetic-private-fixture');
console.log(`PASS plugin file paths: valid nested file readable; ${rejected} invalid/undeclared requests rejected`);
