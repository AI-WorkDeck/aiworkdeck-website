// Convert Simplified leftovers in zh-hant website content to Traditional (Taiwan), string by string.
// Character-level OpenCC (cn -> tw), not phrase mode: phrase mode maps 文件 (document) to 檔案 (file).
// Only strings that actually contain Simplified characters are touched; then a small, safe term map (lane X, X33).
// Usage: node to-hant.cjs <file.json|file.ts> ...   (rewrites in place, prints counts)
const OpenCC = require('opencc-js') // npm i --no-save opencc-js (one-off tool, not a dependency);
const fs = require('fs');
const conv = OpenCC.Converter({ from: 'cn', to: 'tw' });
const TERMS = [['賬', '帳'], ['數據庫', '資料庫'], ['登錄', '登入'], ['創建', '建立'], ['加載', '載入'], ['郵箱', '電子郵件'],
  // Standard Taiwan usage, unambiguous in this product's texts. 程序 (legal 'procedure') and 支持 are deliberately left alone.
  ['個人信息', '個人資料'], ['信息', '資訊'], ['軟件', '軟體'], ['存儲', '儲存'], ['網絡', '網路'], ['默認', '預設'], ['視頻', '影片'],
  ['服務器', '伺服器'], ['用戶', '使用者'], ['菜單', '選單'], ['鏈接', '連結'], ['激活', '啟用'], ['質量', '品質'], ['數據', '資料'],
  ['文檔', '文件'], ['內存', '記憶體'], ['緩存', '快取'], ['消息', '訊息'], ['插件', '外掛']];
const fixString = s => {
  const c = conv(s);
  if (c === s && !s.includes('賬')) return s;
  let out = c;
  for (const [a, b] of TERMS) out = out.split(a).join(b);
  out = out.replace(/手機號(?!碼)/g, '手機號碼');
  // OpenCC one-to-many slips seen in review: 发送 read as 'hair'.
  out = out.split('髮送').join('發送').split('髮出').join('發出').split('髮布').join('發布');
  // OpenCC writes the formal 臺; the site (and common Taiwan usage) writes 台 in these words.
  for (const w of ['平臺', '工作臺', '一臺', '後臺', '前臺']) out = out.split(w).join(w.replace('臺', '台'));
  return out;
};
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  let changed = 0;
  let out;
  if (file.endsWith('.json')) {
    const walk = o => Array.isArray(o) ? o.map(walk) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]))
      : typeof o === 'string' ? (() => { const n = fixString(o); if (n !== o) changed++; return n; })() : o;
    out = JSON.stringify(walk(JSON.parse(src)), null, 2) + '\n';
  } else {
    // .ts legal documents: only double-quoted string literals inside the exported document object.
    const start = src.indexOf('export const legalDoc');
    if (start < 0) throw new Error(`${file}: no legalDoc export`);
    const head = src.slice(0, start);
    const body = src.slice(start).replace(/"((?:[^"\\\n]|\\.)*)"/g, (m, inner) => {
      const n = fixString(inner); if (n !== inner) changed++; return `"${n}"`;
    });
    out = head + body;
  }
  fs.writeFileSync(file, out);
  console.log(`${file}: ${changed} strings converted`);
}
