// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createDocument} from '../src/docx.js';
import {docxFontFamilies,fontCategoriesFor,fontCategoriesForFile,ALL_FONT_CATEGORIES} from '../src/font-needs.js';
import {mapFontSelection,mapFontRequests} from '../scripts/asset-representations.mjs';
import fs from 'node:fs/promises';

async function docx({fontTable=[],themeEa=null,runFont=null,text='第一条 合同双方'}={}){
 const zip=await JSZip.loadAsync(await createDocument([text]));
 zip.file('word/fontTable.xml',`<?xml version="1.0"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${fontTable.map(n=>`<w:font w:name="${n}"/>`).join('')}</w:fonts>`);
 if(themeEa)zip.file('word/theme/theme1.xml',`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:fontScheme><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:font script="Hans" typeface="${themeEa}"/></a:minorFont></a:fontScheme></a:theme>`);
 if(runFont){const d=await zip.file('word/document.xml').async('string');zip.file('word/document.xml',d.replace('<w:r>',`<w:r><w:rPr><w:rFonts w:eastAsia="${runFont}"/></w:rPr>`))}
 return new Uint8Array(await zip.generateAsync({type:'uint8array'}));
}

test('a Latin-only document boots with the small sans fallback only',async()=>{
 assert.deepEqual(await fontCategoriesForFile({bytes:await docx({fontTable:['Calibri','宋体','仿宋'],text:'Service Agreement'})}),['sans'],'CJK fonts listed but no CJK text: base only');
 assert.deepEqual(await fontCategoriesForFile({bytes:await createDocument(['Service Agreement · Example'])}),['sans'],'the English sample');
 assert.deepEqual(await fontCategoriesForFile({bytes:await createDocument(['服务合同（示例）'])}),['sans','serif'],'the Chinese sample uses Noto Serif SC');
 assert.deepEqual(await fontCategoriesForFile(null),['sans'],'no document yet: base font so typed Chinese never shows as boxes');
});
test('fonts named anywhere in the document map to their category, never to a substitute',async()=>{
 assert.deepEqual(await fontCategoriesForFile({bytes:await docx({fontTable:['仿宋_GB2312','宋体']})}),['sans','serif','fangsong']);
 assert.deepEqual(await fontCategoriesForFile({bytes:await docx({themeEa:'宋体'})}),['sans','serif'],'theme East Asian font counts');
 assert.deepEqual(await fontCategoriesForFile({bytes:await docx({runFont:'楷体'})}),['sans','serif','kai'],'run-level eastAsia font counts (the generated runs also name Noto Serif SC)');
 assert.ok((await docxFontFamilies(await docx({fontTable:['Microsoft YaHei']}))).includes('Microsoft YaHei'));
 assert.deepEqual(fontCategoriesFor([['microsoft  yahei','FANGSONG']]),['sans','fangsong'],'case and spacing insensitive');
});
test('unreadable bytes load every font rather than render with the wrong one',async()=>{
 assert.deepEqual(await fontCategoriesForFile({bytes:new Uint8Array([1,2,3])}),[...ALL_FONT_CATEGORIES]);
});
test('the editor transform filters bundled fonts by ?fonts= and leaves the list intact without it',async()=>{
 const src=await fs.readFile(new URL('../vendor/core/frontend/src/zetaoffice/editor-main.js',import.meta.url),'utf8');
 const out=mapFontSelection(mapFontRequests(src));
 assert.match(out,/const __fontCategories = q\.get\('fonts'\) == null \? null :/);
 assert.match(out,/\]\.filter\(f => __fontCategories == null \|\| __fontCategories\.includes\(f\.category\)\),\n {4}\/\/ 本机字体/);
 assert.throws(()=>mapFontSelection(out.replace('  fontUrls: [\n','  fonts: [\n')),/fontUrls anchor/);
});
