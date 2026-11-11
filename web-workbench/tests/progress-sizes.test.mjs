// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync} from 'node:zlib';
import {resourceSizes} from '../scripts/progress-sizes.mjs';
import {FONT_NAMES} from '../scripts/asset-representations.mjs';
test('build denominator derives from pinned decoded content and rejects changed cache bytes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'awd-progress-pins-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'lowa'));
 const manifest={files:{},encodings:{'soffice.wasm':'br','soffice.data':'br'}};
 for(const file of ['lowa/soffice.wasm','lowa/soffice.data',...FONT_NAMES]){
  const bytes=file.startsWith('lowa/')?brotliCompressSync(Buffer.alloc(1024,1)):Buffer.alloc(10,1);
  await fs.writeFile(path.join(dir,file),bytes);manifest.files[file]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 const sizes=await resourceSizes(dir,manifest);assert.equal(sizes['soffice.wasm'],1024);assert.equal(sizes['cjk.ttc'],10);assert.equal(Object.values(sizes).reduce((a,b)=>a+b),2088);
 await fs.writeFile(path.join(dir,'lowa/soffice.wasm'),Buffer.alloc(manifest.files['lowa/soffice.wasm'].bytes));
 await assert.rejects(resourceSizes(dir,manifest),/Resource pin mismatch/);
});
