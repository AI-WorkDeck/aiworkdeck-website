// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {docxPreview,parseDocumentXml} from '../src/docx-preview.js';

const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
async function docx(body,styles=''){const z=new JSZip();z.file('word/document.xml',`<w:document ${W}><w:body>${body}</w:body></w:document>`);if(styles)z.file('word/styles.xml',`<w:styles ${W}>${styles}</w:styles>`);return z.generateAsync({type:'uint8array'})}

test('headings by style name, inline formatting, escaping and final text of tracked changes',async()=>{
 const p=await docxPreview(await docx(
  '<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>补充协议</w:t></w:r></w:p>'+
  '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>粗体</w:t></w:r><w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t xml:space="preserve"> &lt;a&gt; </w:t></w:r>'+
  '<w:ins><w:r><w:t>新增</w:t></w:r></w:ins><w:del><w:r><w:delText>删除</w:delText></w:r></w:del></w:p>',
  '<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style>'));
 assert.match(p.html,/<h1 data-p="0"[^>]*>补充协议<\/h1>/);
 assert.match(p.html,/<strong>粗体<\/strong> &lt;a&gt; 新增/);
 assert.doesNotMatch(p.html,/删除|<em>/);
 assert.deepEqual(p.paragraphs,['补充协议','粗体 <a> 新增']);
});
test('tables, lists, explicit page breaks and page geometry from sectPr (A4 default)',async()=>{
 const doc=parseDocumentXml(`<w:document ${W}><w:body><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>一</w:t><w:br w:type="page"/></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>甲</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>乙</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="12240"/><w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080"/></w:sectPr></w:body></w:document>`);
 assert.equal(doc.blocks[0].list,true);assert.equal(doc.blocks[0].pageBreak,true);
 assert.equal(doc.blocks[1].type,'table');assert.equal(doc.blocks[1].rows[0].length,2);
 assert.deepEqual(doc.page,{width:816,margin:[48,72,48,72]});
 assert.deepEqual(parseDocumentXml(`<w:document ${W}><w:body><w:p/></w:body></w:document>`).page,{width:794,margin:[96,96,96,96]});
});
test('a file without a document body is reported, not rendered blank',async()=>{
 const z=new JSZip();z.file('x.txt','x');
 await assert.rejects(docxPreview(await z.generateAsync({type:'uint8array'})),e=>e.code==='PREVIEW_UNAVAILABLE');
});
