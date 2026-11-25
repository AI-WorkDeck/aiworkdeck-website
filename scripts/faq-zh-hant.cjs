// Build `const zhHant` from `const zh` in lib/community-faq.ts (single-quoted TS strings), same rules as to-hant.cjs plus X23 terms.
// One-off generator (npm i --no-save opencc-js); re-run after editing the zh FAQ, then review the diff.
const OpenCC = require('opencc-js'); const fs = require('fs');
const conv = OpenCC.Converter({ from: 'cn', to: 'tw' });
const TERMS = [['賬','帳'],['數據庫','資料庫'],['登錄','登入'],['創建','建立'],['加載','載入'],['郵箱','電子郵件'],['個人信息','個人資料'],['信息','資訊'],['軟件','軟體'],['存儲','儲存'],['網絡','網路'],['默認','預設'],['視頻','影片'],['服務器','伺服器'],['用戶','使用者'],['菜單','選單'],['鏈接','連結'],['激活','啟用'],['質量','品質'],['數據','資料'],['文檔','文件'],['內存','記憶體'],['緩存','快取'],['消息','訊息'],['插件','外掛'],['設置','設定'],['芯片','晶片'],['硬件','硬體'],['聯繫','聯絡'],['隱私政策','隱私權政策']];
const fix = s => { let o = conv(s); for (const [a, b] of TERMS) o = o.split(a).join(b);
  o = o.replace(/手機號(?!碼)/g, '手機號碼').replace(/使用者名(?!稱)/g, '使用者名稱').split('髮送').join('發送').split('髮出').join('發出');
  for (const w of ['平臺', '工作臺', '一臺', '後臺', '前臺', '站臺']) o = o.split(w).join(w.replace('臺', '台'));
  return o.split('一並').join('一併').split('聲明瞭').join('聲明了'); };
const p = process.argv[2]; const src = fs.readFileSync(p, 'utf8');
const start = src.indexOf('const zh: FaqContent = {'); const end = src.indexOf('const en: FaqContent = {');
const block = src.slice(start, end).replace('const zh: FaqContent = {', "// zh-hant: generated from `zh` (OpenCC cn->tw + Taiwan terms, POLISH X33/Q12); edit both together.\nconst zhHant: FaqContent = {")
  .replace(/'((?:[^'\\\n]|\\.)*)'/g, (m, inner) => /[㐀-鿿]/.test(inner) ? `'${fix(inner)}'` : m)
  .replace(/\/zh\//g, '/zh-hant/');
fs.writeFileSync(p, src.slice(0, end) + block + src.slice(end));
console.log('zhHant block chars', block.length);
