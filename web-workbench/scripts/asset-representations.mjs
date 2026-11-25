// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
export const FONT_NAMES=['cjk.ttc','cjk-serif.otf','cjk-kai.ttf','cjk-fangsong.ttf'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>name.endsWith('.ttf')?'font/ttf':'font/otf'; // cjk.ttc is pinned Noto Sans OTF bytes.
export function mapFontRequests(code){
 for(const name of FONT_NAMES){const old=`'./${name}'`;if(code.split(old).length!==2)throw Error('Expected exactly one pinned font URL: '+name);code=code.replace(old,`'./compressed/${name}'`)}
 return code;
}
// ?fonts=sans,serif boots with only those bundled font categories (website adapter; same contract as
// aiworkdeck#1686 bundled-fonts.js). Absent = all fonts. Fonts register only at boot, so the host picks
// them per document before creating the editor (POLISH W6 step 2).
export function mapFontSelection(code){
 const query="const q = new URLSearchParams(location.search)\n";
 const open="  fontUrls: [\n";
 const close="    // 本机字体排在随包字体之后";
 for(const [label,needle] of [['query',query],['fontUrls',open],['system fonts',close]])if(code.split(needle).length!==2)throw Error('Expected exactly one '+label+' anchor for font selection');
 return code.replace(query,query+"const __fontCategories = q.get('fonts') == null ? null : q.get('fonts').split(',').map(s => s.trim()).filter(Boolean)\n")
  .replace(open,open+"    ...[\n")
  .replace(close,"    ].filter(f => __fontCategories == null || __fontCategories.includes(f.category)),\n"+close);
}
export function mapFontFetching(code,transportModule){
 const original=`        const r = await fetch(f.url)
        if (!r.ok) { log('CJK font not found at ' + f.url + ' (skipping)'); return null }
        const bytes = new Uint8Array(await r.arrayBuffer())`;
 if(code.split(original).length!==2)throw Error('Expected pinned font fetch block');
 const failure="        log('CJK font fetch failed: ' + f.url + ' — ' + e + ' (skipping)')";
 if(code.split(failure).length!==2)throw Error('Expected pinned font failure block');
 return `import {fetchFontBytes} from ${JSON.stringify(transportModule)};\n`+code.replace(original,'        const bytes = await fetchFontBytes(f.url, log)').replace(failure,"        if(e?.code==='REQUIRED_FONT_UNAVAILABLE')throw e\n"+failure);
}
export async function encodeFontRepresentations(root,assets){
 const files={};await fs.mkdir(path.join(root,'editor/compressed'),{recursive:true});
 for(const name of FONT_NAMES){
  const decoded=await fs.readFile(path.join(root,'editor',name)),pinned=assets.files[name];
  if(!pinned||decoded.length!==pinned.bytes||hash(decoded)!==pinned.sha256)throw Error('Original font hash mismatch: '+name);
  const encoded=brotliCompressSync(decoded,{params:{[constants.BROTLI_PARAM_QUALITY]:6}});
  const target='editor/compressed/'+name;
  files[target]={originalPath:'editor/'+name,contentEncoding:'br',contentType:mime(name),encoded:{bytes:encoded.length,sha256:hash(encoded)},decoded:{bytes:decoded.length,sha256:hash(decoded)}};
  await fs.writeFile(path.join(root,target),encoded);
 }
 await fs.writeFile(path.join(root,'representation-manifest.json'),JSON.stringify({version:1,files},null,2)+'\n');
 return verifyFontRepresentations(root,assets);
}
export async function verifyFontRepresentations(root,assets){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'representation-manifest.json'),'utf8'));
 const expected=FONT_NAMES.map(name=>'editor/compressed/'+name).sort();
 if(manifest.version!==1||JSON.stringify(Object.keys(manifest.files||{}).sort())!==JSON.stringify(expected))throw Error('Unexpected font representation set');
 for(const name of FONT_NAMES){
  const key='editor/compressed/'+name,r=manifest.files[key],pinned=assets.files[name];
  if(r.originalPath!=='editor/'+name||r.contentEncoding!=='br'||r.contentType!==mime(name)||!pinned||r.decoded.bytes!==pinned.bytes||r.decoded.sha256!==pinned.sha256)throw Error('Invalid font representation contract: '+name);
  const encoded=await fs.readFile(path.join(root,key));
  if(encoded.length!==r.encoded.bytes||hash(encoded)!==r.encoded.sha256)throw Error('Encoded font mismatch: '+name);
  const decoded=brotliDecompressSync(encoded);
  if(decoded.length!==pinned.bytes||hash(decoded)!==pinned.sha256)throw Error('Decoded font mismatch: '+name);
 }
 return manifest;
}
