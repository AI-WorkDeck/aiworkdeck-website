// Simplified -> Traditional (Taiwan) for user content that only exists in Simplified (registry skills, POLISH X47).
// Same rules as the one-off generators used for the site copy (scripts/to-zh-hant.cjs, #82): OpenCC character-level
// cn->tw (never phrase mode: it turns 文件/document into 檔案/file), then reviewed Taiwan terms, then fixes for
// known OpenCC slips. Results are memoised; inputs are short (names, descriptions, triggers).
import * as OpenCC from 'opencc-js/cn2t';

const convert = OpenCC.Converter({ from: 'cn', to: 'tw' });
const TERMS: [string, string][] = [
    ['賬', '帳'], ['數據庫', '資料庫'], ['登錄', '登入'], ['創建', '建立'], ['加載', '載入'], ['郵箱', '電子郵件'],
    ['個人信息', '個人資料'], ['信息', '資訊'], ['軟件', '軟體'], ['存儲', '儲存'], ['網絡', '網路'], ['默認', '預設'],
    ['視頻', '影片'], ['服務器', '伺服器'], ['用戶', '使用者'], ['菜單', '選單'], ['鏈接', '連結'], ['激活', '啟用'],
    ['質量', '品質'], ['數據', '資料'], ['文檔', '文件'], ['內存', '記憶體'], ['緩存', '快取'], ['消息', '訊息'],
    ['插件', '外掛'], ['設置', '設定'], ['芯片', '晶片'], ['硬件', '硬體'], ['聯繫', '聯絡'], ['隱私政策', '隱私權政策'],
    ['資源管理器', '檔案總管'], ['支持', '支援'], ['調用', '呼叫'], ['項目', '專案'],
];
const SLIPS: [string, string][] = [
    ['髮送', '發送'], ['髮出', '發出'], ['髮布', '發布'], ['幹擾', '干擾'], ['幹預', '干預'], ['幹涉', '干涉'],
    ['一並', '一併'], ['聲明瞭', '聲明了'], ['平臺', '平台'], ['工作臺', '工作台'], ['一臺', '一台'], ['後臺', '後台'], ['前臺', '前台'], ['站臺', '站台'],
];
const memo = new Map<string, string>();

export function toZhHant(text: string): string {
    if (!text || !/[㐀-鿿]/.test(text)) return text;
    const hit = memo.get(text);
    if (hit !== undefined) return hit;
    let out = convert(text);
    for (const [a, b] of TERMS) out = out.split(a).join(b);
    out = out.replace(/手機號(?!碼)/g, '手機號碼').replace(/使用者名(?!稱)/g, '使用者名稱');
    for (const [a, b] of SLIPS) out = out.split(a).join(b);
    if (memo.size > 5000) memo.clear();
    memo.set(text, out);
    return out;
}
