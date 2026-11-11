// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import JSZip from 'jszip';
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function createDocument(lines){
 const z=new JSZip();
 z.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 z.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 z.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map((s,i)=>`<w:p><w:pPr><w:spacing w:after="180" w:line="360" w:lineRule="auto"/>${i===0?'<w:jc w:val="center"/>':''}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Noto Serif SC"/><w:sz w:val="${i===0?32:24}"/>${i===0?'<w:b/>':''}</w:rPr><w:t xml:space="preserve">${xml(s)}</w:t></w:r></w:p>`).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
 return z.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
export async function validateDocx(bytes){
 if(bytes.byteLength>20*1024*1024)throw Error('FILE_TOO_LARGE');
 try{const zip=await JSZip.loadAsync(bytes);if(!zip.file('word/document.xml')||!zip.file('[Content_Types].xml'))throw Error('INVALID_DOCX')}
 catch{throw Error('INVALID_DOCX')}
}
export function downloadFile(name,bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
