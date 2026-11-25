// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Which bundled CJK fonts a DOCX needs (POLISH W6 step 2). The engine registers fonts only at boot, so the
// host decides before creating the editor and passes ?fonts=… (see scripts/asset-representations.mjs).
// Families mirror buildCjkAliasConf in vendor/core/frontend/src/composables/zetaOfficeBoot.js; a document
// naming 宋体 must get the serif font, never the sans one (different metrics move line breaks and pages).
import JSZip from 'jszip';

const GROUPS={
 sans:['黑体','SimHei','黑体-简','Heiti SC','华文黑体','STHeiti','华文细黑','STXihei','微软雅黑','Microsoft YaHei','Microsoft YaHei UI','等线','DengXian','等线 Light','DengXian Light','思源黑体','Source Han Sans SC','Source Han Sans CN','Noto Sans CJK SC','MS Gothic','Yu Gothic','Malgun Gothic','Noto Sans SC'],
 serif:['宋体','SimSun','新宋体','NSimSun','宋体-简','Songti SC','华文宋体','STSong','华文中宋','STZhongsong','思源宋体','Source Han Serif SC','Source Han Serif CN','Noto Serif CJK SC','MS Mincho','Noto Serif SC'],
 kai:['楷体','KaiTi','楷体_GB2312','KaiTi_GB2312','楷体-简','Kaiti SC','华文楷体','STKaiti','LXGW WenKai','霞鹜文楷'],
 fangsong:['仿宋','FangSong','仿宋_GB2312','FangSong_GB2312','华文仿宋','STFangsong','Zhuque Fangsong','朱雀仿宋（预览测试版）'],
};
const norm=s=>String(s).trim().toLowerCase().replace(/\s+/g,' ');
const CATEGORY_BY_FAMILY=new Map(Object.entries(GROUPS).flatMap(([category,families])=>families.map(f=>[norm(f),category])));
/** Always booted: typing Chinese into any document needs a CJK fallback, and it is the smallest (7 MB). */
export const BASE_FONT_CATEGORIES=Object.freeze(['sans']);
export const ALL_FONT_CATEGORIES=Object.freeze(['sans','serif','kai','fangsong']);

/** Font family names a DOCX refers to: font table, theme East Asian fonts, and run/style font attributes. */
export async function docxFontFamilies(bytes){
 const zip=await JSZip.loadAsync(bytes);const names=new Set();
 const read=async p=>zip.file(p)?.async('string')??'';
 for(const m of (await read('word/fontTable.xml')).matchAll(/<w:font\b[^>]*\bw:name="([^"]+)"/g))names.add(m[1]);
 for(const p of Object.keys(zip.files).filter(p=>/^word\/theme\/theme\d*\.xml$/.test(p)))
  for(const m of (await read(p)).matchAll(/<a:(?:ea|font)\b[^>]*\btypeface="([^"]+)"/g))if(m[1])names.add(m[1]);
 for(const p of ['word/styles.xml','word/document.xml','word/numbering.xml'])
  for(const m of (await read(p)).matchAll(/\bw:(?:eastAsia|ascii|hAnsi|cs)="([^"]+)"/g))names.add(m[1]);
 return [...names].map(n=>n.replace(/&amp;/g,'&'));
}

/** Bundled font categories to boot with for these documents (always includes the base). */
export function fontCategoriesFor(familyLists){
 const wanted=new Set(BASE_FONT_CATEGORIES);
 for(const families of familyLists)for(const f of families){const c=CATEGORY_BY_FAMILY.get(norm(f));if(c)wanted.add(c)}
 return ALL_FONT_CATEGORIES.filter(c=>wanted.has(c));
}

/** Whether the document body, headers, footers or notes contain CJK text (only then do CJK fonts render anything). */
export async function docxHasCjkText(bytes){
 const zip=await JSZip.loadAsync(bytes);
 for(const p of Object.keys(zip.files).filter(p=>/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(p)))
  // Test only the text between tags (never markup, never rendered: nothing is sanitized here).
  for(const m of (await zip.file(p).async('string')).matchAll(/>([^<]+)</g))if(/[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(m[1]))return true;
 return false;
}

/** Categories for a stored file; unreadable bytes fall back to every font rather than rendering wrongly. */
export async function fontCategoriesForFile(file){
 if(!file?.bytes)return [...BASE_FONT_CATEGORIES];
 try{
  if(!await docxHasCjkText(file.bytes))return [...BASE_FONT_CATEGORIES];
  return fontCategoriesFor([await docxFontFamilies(file.bytes)]);
 }catch{return [...ALL_FONT_CATEGORIES]}
}
