// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// One-off generator (npm i --no-save opencc-js): builds a zh -> zh-hant lookup for every CJK string literal in a
// module. OpenCC character-level cn->tw (not phrase mode: 文件/document must not become 檔案/file), then reviewed
// Taiwan terms and fixes for OpenCC slips. Usage: node scripts/map-zh-hant.cjs <src.ts> <out.ts> <exportName>
const fs = require('fs'); const path = require('path');
const OpenCC = require('opencc-js');
const conv = OpenCC.Converter({ from: 'cn', to: 'tw' });
const TERMS = [['賬','帳'],['數據庫','資料庫'],['登錄','登入'],['創建','建立'],['加載','載入'],['郵箱','電子郵件'],['個人信息','個人資料'],['信息','資訊'],['軟件','軟體'],['存儲','儲存'],['網絡','網路'],['默認','預設'],['視頻','影片'],['服務器','伺服器'],['用戶','使用者'],['菜單','選單'],['鏈接','連結'],['激活','啟用'],['質量','品質'],['數據','資料'],['文檔','文件'],['內存','記憶體'],['緩存','快取'],['消息','訊息'],['插件','外掛'],['設置','設定'],['芯片','晶片'],['硬件','硬體'],['聯繫','聯絡'],['隱私政策','隱私權政策'],['資源管理器','檔案總管'],['支持','支援'],['調用','呼叫'],['項目','專案']];
const fix = s => { let o = conv(s); for (const [a, b] of TERMS) o = o.split(a).join(b);
  o = o.replace(/手機號(?!碼)/g, '手機號碼').replace(/使用者名(?!稱)/g, '使用者名稱').split('髮送').join('發送').split('髮出').join('發出').split('髮布').join('發布');
  for (const w of ['平臺', '工作臺', '一臺', '後臺', '前臺', '站臺']) o = o.split(w).join(w.replace('臺', '台'));
  for (const [a, b] of [['幹擾','干擾'],['幹預','干預'],['幹涉','干涉']]) o = o.split(a).join(b);
  return o.split('一並').join('一併').split('聲明瞭').join('聲明了'); };
const [src, out, name] = process.argv.slice(2);
const text = fs.readFileSync(src, 'utf8'); const map = new Map();
for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (/[㐀-鿿]/.test(m[1])) { const h = fix(m[1]); if (h !== m[1]) map.set(m[1], h); }
const lines = [...map].map(([z, h]) => `    '${z}': '${h}',`).join('\n');
fs.writeFileSync(out, `// Generated from ${path.basename(src)} by scripts/map-zh-hant.cjs (OpenCC cn->tw + reviewed Taiwan terms). Do not edit by hand;\n// re-run after changing the zh copy. zh-hant visitors read these instead of the Simplified originals (POLISH Q12).\nexport const ${name}: Readonly<Record<string, string>> = {\n${lines}\n};\n`);
console.log(out, map.size, 'strings');
