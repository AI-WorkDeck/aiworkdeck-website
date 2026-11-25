// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only preview of a DOCX while the editor engine loads (POLISH W6 step 5, spec readiness/w6/preview-spec.md).
// Content over layout: paragraphs, headings, bold/italic/underline, lists, simple tables, tracked changes as final
// text, explicit page breaks; page width and margins from the last w:sectPr. No headers/footers/notes/fields.
// Dependency-free (a small tag scanner), so it runs in the browser and in node tests alike.
import JSZip from 'jszip';

const TWIP_TO_PX = 96 / 1440;
const A4 = { width: 11906, top: 1440, right: 1440, bottom: 1440, left: 1440 };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (a, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(a)?.[1];
const on = a => { const v = attr(a || '', 'w:val'); return v === undefined || !/^(0|false|off|none)$/i.test(v); };

/** Parse document.xml into blocks: {type:'p', style, list, runs:[{text,b,i,u}], pageBreak} | {type:'table', rows:[[cellBlocks]]}. */
export function parseDocumentXml(xml) {
  const body = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? '';
  const tokens = body.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>|([^<]+)/g);
  const root = { blocks: [] };
  let p = null, run = null, rPr = null, deleted = 0, inText = false, sect = null, table = null, row = null, cell = null;
  const tables = []; // nesting
  const container = () => (cell ? cell.blocks : root.blocks);
  for (const m of tokens) {
    const [, close, tag, rest, selfClose, text] = m;
    if (text !== undefined) { if (inText && p && !deleted) p.runs.push({ ...rPr, text: unxml(text) }); continue; }
    const open = !close, empty = !!selfClose;
    switch (tag) {
      case 'w:tbl': if (open) { table = { type: 'table', rows: [] }; tables.push({ table, row, cell }); container().push(table); row = cell = null; } else { const prev = tables.pop(); ({ row, cell } = prev); table = tables.at(-1)?.table ?? null; } break;
      case 'w:tr': if (open && table) { row = []; table.rows.push(row); } break;
      case 'w:tc': if (open && row) { cell = { blocks: [] }; row.push(cell); } else if (close) cell = null; break;
      case 'w:p': if (open && !empty) { p = { type: 'p', style: '', list: false, runs: [], pageBreak: false }; container().push(p); } else if (empty) container().push({ type: 'p', style: '', list: false, runs: [], pageBreak: false }); else p = null; break;
      case 'w:pStyle': if (p) p.style = attr(rest, 'w:val') || ''; break;
      case 'w:numPr': if (p && open) p.list = true; break;
      case 'w:r': if (open && !empty) { run = true; rPr = { b: false, i: false, u: false }; } else if (close) { run = null; rPr = null; } break;
      case 'w:b': if (rPr) rPr.b = on(rest); break;
      case 'w:i': if (rPr) rPr.i = on(rest); break;
      case 'w:u': if (rPr) rPr.u = attr(rest, 'w:val') !== 'none'; break;
      case 'w:t': inText = open && !empty; break;
      case 'w:tab': if (p && run && !deleted) p.runs.push({ ...rPr, text: '\t' }); break;
      case 'w:br': if (p && !deleted) { if (attr(rest, 'w:type') === 'page') p.pageBreak = true; else p.runs.push({ ...rPr, text: '\n' }); } break;
      case 'w:del': if (!empty) deleted += open ? 1 : -1; break;
      case 'w:delText': break; // deleted text never shown
      case 'w:sectPr': if (open) sect = sect || {}; break;
      case 'w:pgSz': if (sect) sect.width = Number(attr(rest, 'w:w')) || undefined; break;
      case 'w:pgMar': if (sect) for (const k of ['top', 'right', 'bottom', 'left']) sect[k] = Number(attr(rest, `w:${k}`)) || undefined; break;
      default: break;
    }
  }
  const s = { ...A4, ...Object.fromEntries(Object.entries(sect || {}).filter(([, v]) => v)) };
  return { blocks: root.blocks, page: { width: Math.round(s.width * TWIP_TO_PX), margin: ['top', 'right', 'bottom', 'left'].map(k => Math.round(s[k] * TWIP_TO_PX)) } };
}

const HEADING = /^(heading|标题|標題|title)\s*(\d)?$/i;
function runsHtml(runs) {
  return runs.map(r => {
    let h = esc(r.text).replace(/\n/g, '<br>').replace(/\t/g, '<span class="pv-tab">\t</span>');
    if (r.u) h = `<u>${h}</u>`; if (r.i) h = `<em>${h}</em>`; if (r.b) h = `<strong>${h}</strong>`;
    return h;
  }).join('');
}

/** HTML for the preview sheet; every top-level and cell paragraph carries data-p (document order) for the swap anchor. */
export function previewHtml({ blocks, page }, styleNames = {}) {
  let n = 0;
  const block = b => {
    if (b.type === 'table') return `<table class="pv-table">${b.rows.map(r => `<tr>${r.map(c => `<td>${c.blocks.map(block).join('')}</td>`).join('')}</tr>`).join('')}</table>`;
    const heading = HEADING.exec(String(styleNames[b.style] ?? b.style).replace(/[\s_-]+/g, ' ').trim());
    const tag = heading ? `h${Math.min(Number(heading[2] || 1), 4)}` : 'p';
    const text = runsHtml(b.runs);
    const brk = b.pageBreak ? '<hr class="pv-page-break">' : '';
    return `<${tag} data-p="${n++}" class="${b.list ? 'pv-li' : ''}">${text || '<br>'}</${tag}>${brk}`;
  };
  const [t, r, bt, l] = page.margin;
  return `<article class="pv-sheet" style="width:${page.width}px;padding:${t}px ${r}px ${bt}px ${l}px">${blocks.map(block).join('')}</article>`;
}

/** Plain text of each data-p paragraph, in order (used to find the anchor paragraph in the editor after the swap). */
export function previewParagraphTexts({ blocks }) {
  const out = [];
  const walk = b => { if (b.type === 'table') b.rows.forEach(r => r.forEach(c => c.blocks.forEach(walk))); else out.push(b.runs.map(r => r.text).join('')); };
  blocks.forEach(walk);
  return out;
}

export async function docxPreview(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw Object.assign(Error('No document body'), { code: 'PREVIEW_UNAVAILABLE' });
  const doc = parseDocumentXml(xml);
  // Style ids are often numeric in Chinese Word ("1", "2"); headings are recognised by the style's name.
  const styles = (await zip.file('word/styles.xml')?.async('string')) ?? '';
  const styleNames = Object.fromEntries([...styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>[\s\S]*?<w:name w:val="([^"]+)"/g)].map(m => [m[1], m[2]]));
  return { html: previewHtml(doc, styleNames), paragraphs: previewParagraphTexts(doc), page: doc.page };
}
