// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// CI packaging and deployment verification; never calls an AI provider.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyFontRepresentations} from '../web-workbench/scripts/asset-representations.mjs';
const [mode, directory = 'public/web', expectedRevision] = process.argv.slice(2);
const root = path.resolve(directory);
const manifestName = 'release-manifest.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(dir = root, prefix = '') {
  const result = {};
  for (const entry of (await fs.readdir(dir, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error(`Artifact cannot contain symlinks: ${name}`);
    if (entry.isDirectory()) Object.assign(result, await inventory(path.join(dir, entry.name), name + '/'));
    else if (entry.isFile() && name !== manifestName) {
      const bytes = await fs.readFile(path.join(root, name));
      result[name] = {bytes: bytes.length, sha256: hash(bytes)};
    } else if (!entry.isFile()) throw Error(`Unsupported artifact entry: ${name}`);
  }
  return result;
}
if (!['pack', 'verify'].includes(mode)) throw Error('Usage: node scripts/web-artifact.mjs pack|verify [directory] [expected git SHA]');
const files = await inventory();
for (const required of ['index.html', 'editor/editor.html', 'editor/lowa/soffice.wasm', 'editor/lowa/soffice.data', 'asset-manifest.json', 'source-manifest.json', 'LICENSE', 'UPSTREAM.md']) {
  if (!files[required]) throw Error(`Incomplete editor artifact: ${required}`);
}
const assets = JSON.parse(await fs.readFile(path.join(root, 'asset-manifest.json'), 'utf8'));
for (const [name, pinned] of Object.entries(assets.files)) {
  const actual = files['editor/' + name];
  if (!actual || actual.bytes !== pinned.bytes || actual.sha256 !== pinned.sha256) throw Error(`Pinned asset mismatch: ${name}`);
}
// Inventory hashes describe transmitted files; original font pins describe decoded bytes.
// Verification checks both representations and never relabels one hash as the other.
await verifyFontRepresentations(root,assets);
if (mode === 'pack') {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const manifest = {version:1, revision, node: process.version, engineVersion: assets.engineVersion, files};
  await fs.writeFile(path.join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Packaged ${Object.keys(files).length} files for ${revision}`);
} else {
  const manifest = JSON.parse(await fs.readFile(path.join(root, manifestName), 'utf8'));
  if (manifest.version !== 1 || !/^[a-f0-9]{40}$/.test(manifest.revision)) throw Error('Invalid release manifest');
  if (expectedRevision && manifest.revision !== expectedRevision) throw Error('Artifact does not match reviewed commit');
  if (JSON.stringify(manifest.files) !== JSON.stringify(files)) throw Error('Artifact file inventory/hash mismatch');
  console.log(`Verified ${Object.keys(files).length} files for ${manifest.revision}`);
}
