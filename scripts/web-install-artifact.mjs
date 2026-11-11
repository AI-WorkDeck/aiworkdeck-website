// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Run from the website checkout after verifying/extracting the CI archive.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const [stagedDirectory, releaseId, expectedRevision] = process.argv.slice(2);
if (!stagedDirectory || !/^[a-f0-9]{40}-[a-f0-9]{16}$/.test(releaseId || '') || !/^[a-f0-9]{40}$/.test(expectedRevision || '')) throw Error('Usage: web-install-artifact.mjs STAGED_DIR SHA-DIGEST16 SHA');
const root = process.cwd();
const stage = path.resolve(stagedDirectory);
execFileSync(process.execPath, [path.join(root, 'scripts/web-artifact.mjs'), 'verify', stage, expectedRevision], {stdio:'inherit'});
const link = path.join(root, 'public/web');
let previous;
try {
  const stat = await fs.lstat(link);
  if (!stat.isSymbolicLink()) throw Error('public/web must be absent or managed symlink; preserve/migrate the existing directory before deployment');
  previous = await fs.realpath(link);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const releases = path.join(root, '.web-releases');
const release = path.join(releases, releaseId);
await fs.mkdir(releases, {recursive:true});
if (previous && !previous.startsWith(releases + path.sep)) throw Error('Refusing to replace an unmanaged web symlink');
if (previous === release) {
  const liveManifest = await fs.readFile(path.join(release, 'release-manifest.json'), 'utf8');
  const stagedManifest = await fs.readFile(path.join(stage, 'release-manifest.json'), 'utf8');
  if (liveManifest !== stagedManifest) throw Error('Release ID collision');
  console.log(`Release ${releaseId} already installed; restart PM2 to finish retry`);
  process.exit(0);
}
if (previous) {
  const oldManifest = JSON.parse(await fs.readFile(path.join(previous, 'asset-manifest.json'), 'utf8'));
  const newManifest = JSON.parse(await fs.readFile(path.join(stage, 'asset-manifest.json'), 'utf8'));
  if (JSON.stringify(oldManifest) !== JSON.stringify(newManifest)) throw Error('Engine/font change needs versioned editor URLs and separate migration review');
  // Retain hashes referenced by already-open IDE and editor HTML. Never overwrite
  // a new asset with old bytes, including in the unlikely event of a collision.
  for (const relative of ['assets', 'editor/assets']) {
    const oldAssets = path.join(previous, relative);
    try { await fs.cp(oldAssets, path.join(stage, relative), {recursive:true, force:false, errorOnExist:false}); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
try { await fs.access(release); throw Error(`Release already exists: ${releaseId}; use a fresh build/run or review rollback`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.rename(stage, release);
await fs.mkdir(path.dirname(link), {recursive:true});
if (previous) {
  const rollback = path.join(root, '.web-previous');
  const tempRollback = rollback + '-' + process.pid;
  await fs.symlink(path.relative(root, previous), tempRollback);
  await fs.rename(tempRollback, rollback);
}
const nextLink = path.join(root, 'public/.web-next-' + process.pid);
await fs.symlink(path.relative(path.dirname(link), release), nextLink);
await fs.rename(nextLink, link);
console.log(`Installed ${releaseId}; restart PM2 now. Previous release: ${previous || '(first install)'}`);
