/** The plugin store lists each plugin once: official vs community by publisher, samples hidden, brand spelling fixed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import AdmZip from 'adm-zip';

assert.ok(!fs.existsSync('package.json'), 'Run in an isolated fixture directory (npm run test:store-plugins)');
const store = await import('@/lib/plugins-store');
const signing = await import('@/lib/plugin-signing');
const { listStorePlugins, OFFICIAL_AUTHOR_ID } = await import('@/lib/store-plugins');
process.env.AWD_PLUGIN_SIGNING_KEY = signing.generateKeyPair().privateKeyPem;

const publish = (id: string, version: string, author: { id: string; username: string }, downloads = 0) => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ id, version, name: id, description: `${id} plugin`, contributes: { themes: [{ id: 'paper', file: 'themes/paper.json' }] } })));
    zip.addFile('themes/paper.json', Buffer.from(JSON.stringify({ colors: { 'surface-primary': '#ffffff' } })));
    const submitted = store.submitPlugin(zip.toBuffer(), author);
    assert.equal(submitted.error, undefined, `${id} ${version} submits`);
    assert.deepEqual(store.approvePlugin(id, version), { ok: true });
    for (let i = 0; i < downloads; i++) store.incrementDownloads(id, version);
};
const official = { id: OFFICIAL_AUTHOR_ID, username: 'AI Workdeck' };
publish('project-chat', '1.0.0', official);
publish('project-chat', '1.1.0', official, 3);
publish('hello-plugin', '1.0.0', official, 4);
publish('community-tool', '0.1.0', { id: 'dev-1', username: 'jane' }, 12);

const listed = listStorePlugins('en');
assert.deepEqual(listed.map(p => p.id).sort(), ['community-tool', 'project-chat'], 'Developer sample is hidden and each id appears once');
const chat = listed.find(p => p.id === 'project-chat')!;
assert.equal(chat.version, '1.1.0', 'Latest approved version is listed');
assert.equal(chat.official, true);
assert.equal(chat.author, 'AI WorkDeck', 'Official cards use the brand spelling, not the old author snapshot');
const community = listed.find(p => p.id === 'community-tool')!;
assert.equal(community.official, false);
assert.equal(community.author, 'jane');
assert.equal(community.downloads, 12);
assert.ok(store.getPlugin('hello-plugin', '1.0.0'), 'The hidden sample stays in the registry for developers');
console.log('PASS store lists each plugin once, splits official/community, hides samples, fixes brand spelling');
