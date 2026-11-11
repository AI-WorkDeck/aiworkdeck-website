// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {FONT_NAMES} from './asset-representations.mjs';
export async function resourceSizes(assetDir, manifest) {
  const sizes = {};
  for (const name of ['soffice.wasm', 'soffice.data', ...FONT_NAMES]) {
    const runtime = name.startsWith('soffice.');
    const file = runtime ? 'lowa/' + name : name;
    const bytes = await fs.readFile(path.join(assetDir, file)), pin = manifest.files[file];
    if (!pin || bytes.length !== pin.bytes || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw Error('Resource pin mismatch: ' + file);
    if (runtime && manifest.encodings[name] !== 'br') throw Error('Unexpected resource encoding: ' + name);
    sizes[name] = runtime ? brotliDecompressSync(bytes).length : bytes.length;
  }
  return sizes;
}
