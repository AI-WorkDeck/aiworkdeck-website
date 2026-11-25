// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// POLISH W20: zh-hant copy uses Taiwan terms even where the characters are already Traditional
// (插件 -> 外掛, 信息 -> 資訊, 消息 -> 訊息, 登錄 -> 登入, 設備 -> 裝置, 用戶 -> 使用者, …).
import fs from 'node:fs';
const MAINLAND = ['插件', '信息', '消息', '登錄', '設備', '代碼', '文檔', '搜索', '加載', '網絡', '默認', '視頻', '軟件', '用戶', '創建', '數據', '鏈接', '二進制', '實時', '集成', '項目', '服務器', '菜單', '激活', '緩存', '郵箱', '設置', '聯繫', '刷新'];
const ALLOWED = ['國家企業信用信息公示系統', '統一社會信用代碼']; // official names
const bad = [];
const walk = (o, p) => {
  if (typeof o === 'string') { let s = o; for (const a of ALLOWED) s = s.split(a).join(''); for (const w of MAINLAND) if (s.includes(w)) bad.push(`${p}: ${w} in "${o.slice(0, 60)}"`); }
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
};
walk(JSON.parse(fs.readFileSync('dictionaries/zh-hant.json', 'utf8')), '');
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('✓ zh-hant dictionary uses Taiwan terms (W20)');
