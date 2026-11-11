// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('asset-manifest.json',root),'utf8'));
const cache=new URL('.cache/editor-assets/',root);
function download(url,depth=0){return new Promise((resolve,reject)=>{
 if(depth>8)return reject(Error('Too many asset redirects'));
 const req=https.get(url,{headers:{'Accept-Encoding':'identity','User-Agent':'AI-WorkDeck-assets/1.0'}},res=>{
  if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return resolve(download(new URL(res.headers.location,url).href,depth+1))}
  if(res.statusCode!==200){res.resume();return reject(Error('Asset HTTP '+res.statusCode))}
  const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>200*1024*1024)req.destroy(Error('Asset too large'));else chunks.push(c)});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
 });req.setTimeout(90000,()=>req.destroy(Error('Asset download timed out')));req.on('error',reject);
})}
const valid=(bytes,entry)=>bytes.length===entry.bytes&&createHash('sha256').update(bytes).digest('hex')===entry.sha256;
for(const [name,entry] of Object.entries(manifest.files)){
 const target=new URL(name,cache);let bytes;
 try{const cached=await fs.readFile(target);if(valid(cached,entry)){console.log('Verified cached '+name);continue}}catch{}
 if(process.env.AWD_EDITOR_ASSETS_DIR)bytes=await fs.readFile(path.join(process.env.AWD_EDITOR_ASSETS_DIR,name));
 else{console.log('Fetching pinned '+name);bytes=await download(entry.url);if(entry.zipEntrySuffix){const zip=await JSZip.loadAsync(bytes);const match=Object.values(zip.files).find(f=>!f.dir&&f.name.endsWith(entry.zipEntrySuffix)&&!f.name.includes('__MACOSX'));if(!match)throw Error('Font archive entry missing');bytes=await match.async('nodebuffer')}}
 if(!valid(bytes,entry))throw Error('Asset hash/size mismatch: '+name+'; do not publish mismatched engine assets');
 await fs.mkdir(new URL('./',target),{recursive:true});await fs.writeFile(target,bytes);console.log('Prepared '+name);
}
await fs.writeFile(new URL('lowa/.encodings.json',cache),JSON.stringify(manifest.encodings,null,2));
