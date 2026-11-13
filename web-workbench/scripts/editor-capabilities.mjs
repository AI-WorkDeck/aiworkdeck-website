// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Writes src/editor-capabilities.json: the editor actions the vendored executor accepts.
// The backend WEB allowlist is checked against this file; regenerate after every vendor update.
import fs from 'node:fs/promises';
import {EDITOR_ACTIONS} from '../vendor/core/frontend/src/composables/libreofficeExecutorClient.js';
const root=new URL('../',import.meta.url);
export async function editorCapabilities(){
 const source=JSON.parse(await fs.readFile(new URL('source-manifest.json',root),'utf8'));
 const assets=JSON.parse(await fs.readFile(new URL('asset-manifest.json',root),'utf8'));
 return {schemaVersion:1,source:{repository:source.repository,commit:source.commit,version:source.version},engineVersion:assets.engineVersion,documentKinds:['docx'],editorActions:[...new Set(EDITOR_ACTIONS)].sort()};
}
export const capabilitiesFile=new URL('src/editor-capabilities.json',root);
if(import.meta.url===`file://${process.argv[1]}`){
 await fs.writeFile(capabilitiesFile,JSON.stringify(await editorCapabilities(),null,2)+'\n');
 console.log('Wrote src/editor-capabilities.json');
}
