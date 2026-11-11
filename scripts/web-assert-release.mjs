// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// npm prebuild gate. A normal local Next-only build is unchanged.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const expected = process.env.AWD_WEB_RELEASE_SHA;
if (expected) {
  if (!/^[a-f0-9]{40}$/.test(expected)) throw Error('Invalid expected Web release SHA');
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const manifest = JSON.parse(fs.readFileSync('public/web/release-manifest.json', 'utf8'));
  if (actual !== expected || manifest.revision !== expected) throw Error('Refusing build/restart: checkout and staged Web artifact must match the reviewed SHA');
  for (const file of ['public/web/index.html', 'public/web/editor/editor.html', 'public/web/editor/lowa/soffice.wasm', 'public/web/editor/lowa/soffice.data']) {
    if (!fs.statSync(file).isFile()) throw Error('Staged Web artifact is incomplete: ' + file);
  }
  console.log(`Web release ${expected} is ready before Next build/restart`);
}
