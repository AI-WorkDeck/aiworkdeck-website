// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {FONT_NAMES,encodeFontRepresentations} from '../web-workbench/scripts/asset-representations.mjs';
const repo = process.cwd();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const execute = (name, args, cwd = repo) => spawnSync(process.execPath, [path.join(repo, 'scripts', name), ...args], {cwd, encoding:'utf8'});
async function makeArtifact(root, assetName) {
  const contents = {'index.html':'<html>Workbench</html>', 'editor/editor.html':'<html>Editor</html>', 'editor/lowa/soffice.wasm':'synthetic-wasm', 'editor/lowa/soffice.data':'synthetic-data', 'source-manifest.json':'{}', LICENSE:'test-license', 'UPSTREAM.md':'test-source', ['assets/'+assetName]:'bundle-'+assetName};
  for(const name of FONT_NAMES)contents['editor/'+name]='synthetic-font-'+name;
  const files = {};
  for (const [name, content] of Object.entries(contents)) {
    await fs.mkdir(path.dirname(path.join(root,name)), {recursive:true});
    await fs.writeFile(path.join(root,name),content);
    if (name.startsWith('editor/')&&name!=='editor/editor.html') files[name.slice(7)]={bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex')};
  }
  await fs.writeFile(path.join(root,'asset-manifest.json'), JSON.stringify({engineVersion:'test', files}));
  await encodeFontRepresentations(root,{files});
  const packed=execute('web-artifact.mjs',['pack',root]);
  assert.equal(packed.status,0,packed.stderr);
}
test('artifact verification rejects corruption and installer preserves old hashes atomically', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'web-release-test-'));
  try {
    await fs.mkdir(path.join(root,'scripts'));
    for (const file of ['web-artifact.mjs','web-install-artifact.mjs']) await fs.copyFile(path.join(repo,'scripts',file),path.join(root,'scripts',file));
    await fs.mkdir(path.join(root,'web-workbench/scripts'),{recursive:true});
    await fs.copyFile(path.join(repo,'web-workbench/scripts/asset-representations.mjs'),path.join(root,'web-workbench/scripts/asset-representations.mjs'));
    const first=path.join(root,'first'); await makeArtifact(first,'old-aaa.js');
    assert.equal(execute('web-artifact.mjs',['verify',first,revision]).status,0);
    assert.notEqual(execute('web-artifact.mjs',['verify',first,'f'.repeat(40)]).status,0);
    let result=execute('web-install-artifact.mjs',[first,revision+'-'+'a'.repeat(16),revision],root);
    assert.equal(result.status,0,result.stderr);
    const oldTarget=await fs.realpath(path.join(root,'public/web'));
    const second=path.join(root,'second'); await makeArtifact(second,'new-bbb.js');
    await fs.appendFile(path.join(second,'index.html'),'tamper');
    assert.notEqual(execute('web-artifact.mjs',['verify',second,revision]).status,0);
    assert.notEqual(execute('web-install-artifact.mjs',[second,revision+'-'+'b'.repeat(16),revision],root).status,0);
    assert.equal(await fs.realpath(path.join(root,'public/web')),oldTarget,'failed validation must keep live release');
    await makeArtifact(second,'new-bbb.js');
    result=execute('web-install-artifact.mjs',[second,revision+'-'+'b'.repeat(16),revision],root);
    assert.equal(result.status,0,result.stderr);
    assert.equal(await fs.readFile(path.join(root,'public/web/assets/old-aaa.js'),'utf8'),'bundle-old-aaa.js');
    assert.equal(await fs.readFile(path.join(root,'public/web/assets/new-bbb.js'),'utf8'),'bundle-new-bbb.js');
    assert.equal(await fs.realpath(path.join(root,'.web-previous')),oldTarget);
    const retry=path.join(root,'retry'); await makeArtifact(retry,'new-bbb.js');
    result=execute('web-install-artifact.mjs',[retry,revision+'-'+'b'.repeat(16),revision],root);
    assert.equal(result.status,0,result.stderr);
    assert.equal(await fs.realpath(path.join(root,'.web-previous')),oldTarget,'retry must preserve rollback target');
    const third=path.join(root,'third');await makeArtifact(third,'new-ccc.js');
    await fs.symlink('/etc/passwd',path.join(third,'unexpected-link'));
    assert.notEqual(execute('web-artifact.mjs',['verify',third,revision]).status,0);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
