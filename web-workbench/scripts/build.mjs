// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {build} from 'vite';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {encodeFontRepresentations,mapFontRequests,mapFontFetching} from './asset-representations.mjs';
import {mapRuntimeTransport} from './runtime-transform.mjs';
import {resourceSizes} from './progress-sizes.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(root,'../public/web');
const source=JSON.parse(await fs.readFile(path.join(root,'source-manifest.json'),'utf8'));
for(const [name,hash] of Object.entries(source.files)){
 const bytes=await fs.readFile(path.join(root,'vendor/core',name));
 if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Vendored source changed: '+name);
}
const assetDir=path.join(root,'.cache/editor-assets');
try{await fs.access(path.join(assetDir,'lowa/soffice.wasm'))}catch{throw Error('Editor assets missing. Run npm run prepare:assets in web-workbench first.')}
const assets=JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8'));
const sizes=await resourceSizes(assetDir,assets);
await build({configFile:false,root,base:'/web/',build:{outDir:out,emptyOutDir:true,target:'es2022'}});
await build({configFile:false,root:path.join(root,'vendor/core/frontend/src/zetaoffice'),base:'./',plugins:[{name:'web-editor-transport',transform(code,id){if(id===path.join(root,'vendor/core/frontend/src/zetaoffice/editor-main.js'))return `import {configureBootProgress} from ${JSON.stringify(path.join(root,'src/load-progress.js'))};\nconfigureBootProgress(${JSON.stringify(sizes)});\n`+mapFontRequests(code);if(id===path.join(root,'vendor/core/frontend/src/composables/zetaOfficeBoot.js'))return mapRuntimeTransport(mapFontFetching(code,path.join(root,'src/font-transport.js')),path.join(root,'src/runtime-transport.js'))}}],build:{outDir:path.join(out,'editor'),emptyOutDir:true,target:'esnext',rollupOptions:{input:path.join(root,'vendor/core/frontend/src/zetaoffice/editor.html')}}});
await fs.cp(assetDir,path.join(out,'editor'),{recursive:true});
await encodeFontRepresentations(out,assets);
await fs.copyFile(path.join(root,'UPSTREAM.md'),path.join(out,'UPSTREAM.md'));
await fs.copyFile(path.join(root,'vendor/core/LICENSE'),path.join(out,'LICENSE'));
await fs.copyFile(path.join(root,'source-manifest.json'),path.join(out,'source-manifest.json'));
await fs.copyFile(path.join(root,'asset-manifest.json'),path.join(out,'asset-manifest.json'));
await fs.cp(path.join(root,'licenses'),path.join(out,'licenses'),{recursive:true});
// Explicit allowlist: never archive the private website, credentials or generated data.
const archive=new JSZip();
async function addSource(relative){
 const file=path.join(root,relative),stat=await fs.lstat(file);
 if(stat.isSymbolicLink())throw Error('Source archive rejects symlinks: '+relative);
 if(stat.isDirectory()){for(const name of (await fs.readdir(file)).sort())await addSource(path.join(relative,name));return}
 archive.file('web-workbench/'+relative.replaceAll(path.sep,'/'),await fs.readFile(file),{date:new Date('2026-01-01T00:00:00Z')});
}
for(const entry of ['src','vendor','scripts','tests','licenses','index.html','package.json','package-lock.json','source-manifest.json','asset-manifest.json','README.md','UPSTREAM.md'])await addSource(entry);
const sourceZip=await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
await fs.writeFile(path.join(out,'source.zip'),sourceZip);
await fs.writeFile(path.join(out,'source.zip.sha256'),createHash('sha256').update(sourceZip).digest('hex')+'  source.zip\n');
console.log('Web workbench built at public/web/; serve same-origin with COOP/COEP and asset Content-Encoding.');
