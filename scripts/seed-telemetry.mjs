// 遥测看板本地自查用 seed 脚本。
// 用法：npm run dev 起服务后执行 node scripts/seed-telemetry.mjs [baseUrl]
//
// 两段式：
// 1. 先走真实 HTTP ingest 端点冒烟（顺带触发迁移 v6 建表），验证校验/白名单/幂等；
// 2. 历史数据量大（约上千条 rollup），受每 IP 每分钟 60 次限流约束不适合走 HTTP，
//    直接写 data/awd.db（与线上同 schema；绝不在脚本里建表，避免与迁移 v6 冲突）。

import crypto from 'crypto';
import path from 'path';
import Database from 'better-sqlite3';

const BASE = process.argv[2] || 'http://localhost:3000';
const DAYS = 90;
const INSTALLS = 36;

const PLATFORMS = ['darwin-arm64', 'darwin-arm64', 'win32-x64', 'darwin-x64'];
const VERSIONS = ['0.9.3', '0.9.4', '0.10.0', '0.10.0', '0.10.0'];
const TOOLS = [
  'doc_replace', 'doc_insert', 'doc_get_text', 'web_search', 'extract_file_text',
  'doc_add_comment', 'sheet_set_cells', 'pdf_to_word', 'browser_open', 'todo_write',
  'doc_get_clauses', 'move_file', 'screenshot', 'sheet_get_range', 'version_commit',
  'doc_format', 'clipboard_read',
];
const SKILLS = [
  '合同审查', '尽职调查', '文书脱敏', '法律检索',
  '劳动用工模板', '诉讼时间线', '证据整理',
];
const MATTERS = [
  '合同纠纷', '公司治理', '劳动人事', '知识产权', '并购重组',
  '争议解决', '合规审查', '房地产', '金融证券',
];

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }
function dateStr(daysBack) {
  return new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function makeRollupBody(ins, back) {
  const turns = 3 + rand(40);
  const edits = rand(30);
  const byTool = {};
  for (let k = 0; k < 4 + rand(5); k++) {
    const t = pick(TOOLS);
    byTool[t] = (byTool[t] || 0) + 1 + rand(12);
  }
  const bySkill = {};
  if (Math.random() < 0.7) {
    for (let k = 0; k < 1 + rand(3); k++) {
      const s = pick(SKILLS);
      bySkill[s] = (bySkill[s] || 0) + 1 + rand(5);
    }
  }
  const byMatterCategory = {};
  if (Math.random() < 0.8) {
    for (let k = 0; k < 1 + rand(3); k++) {
      const m = pick(MATTERS);
      byMatterCategory[m] = (byMatterCategory[m] || 0) + 1 + rand(4);
    }
  }
  return {
    installId: ins.id,
    date: dateStr(back),
    appVersion: ins.version,
    platform: ins.platform,
    counters: { 'ai.turn': turns, 'editor.action': edits, 'app.start': 1 + rand(3) },
    byProvider: { openrouter: turns },
    byModel: { 'anthropic/claude-sonnet-4.5': turns },
    byTool,
    bySkill,
    byMatterCategory,
    tokens: { input: turns * (800 + rand(2000)), output: turns * (300 + rand(900)) },
    activeMinutes: 20 + rand(300),
  };
}

async function post(p, body) {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// 每台安装：随机「出生日」，之后按活跃概率衰减出勤，模拟真实留存曲线
const installs = Array.from({ length: INSTALLS }, (_, i) => ({
  id: crypto.randomUUID(),
  bornDaysAgo: DAYS - rand(DAYS - 1) - 1,
  platform: pick(PLATFORMS),
  version: VERSIONS[Math.min(rand(VERSIONS.length) + Math.floor(i / 12), VERSIONS.length - 1)],
  stickiness: 0.25 + Math.random() * 0.65,
}));

// -------- 第一段：HTTP ingest 冒烟（触发迁移建表） --------

const smoke = installs[0];
const r1 = await post('/api/telemetry/rollup', makeRollupBody(smoke, 0));
if (r1.status !== 200 || r1.json.ok !== true) {
  console.error('rollup 冒烟失败，请确认 dev 服务器已启动：', r1);
  process.exit(1);
}
// 幂等：同 (installId, date) 再报一次应仍是 200
const r2 = await post('/api/telemetry/rollup', makeRollupBody(smoke, 0));
if (r2.status !== 200) {
  console.error('rollup 幂等复报失败：', r2);
  process.exit(1);
}
// 非法 installId 应 400
const bad = await post('/api/telemetry/rollup', { installId: 'not-a-uuid', date: dateStr(0), counters: {} });
if (bad.status !== 400) {
  console.error('非法 installId 未被拒绝：', bad);
  process.exit(1);
}
// events：白名单外单条应被静默丢弃
const ev = await post('/api/telemetry/events', {
  installId: smoke.id,
  appVersion: smoke.version,
  events: [
    { ts: new Date().toISOString(), eventName: 'ai.turn', convKey: 'conv-1', attrs: { sample: true } },
    { ts: new Date().toISOString(), eventName: 'ui.nav' },
    { ts: new Date().toISOString(), eventName: 'not.in.whitelist' },
  ],
});
if (ev.status !== 200 || ev.json.accepted !== 2) {
  console.error('events 冒烟失败（期望 accepted=2）：', ev);
  process.exit(1);
}
console.log('HTTP ingest 冒烟通过（rollup 幂等 / 400 校验 / events 白名单过滤）');

// -------- 第二段：历史数据直写 DB（限流下走 HTTP 太慢） --------

const db = new Database(path.join(process.cwd(), 'data', 'awd.db'));
db.pragma('journal_mode = WAL');
const hasTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='telemetry_rollup'")
  .get();
if (!hasTable) {
  console.error('telemetry_rollup 表不存在：请先启动 dev 服务器并访问一次 ingest 端点以执行迁移。');
  process.exit(1);
}

const upsert = db.prepare(`
  INSERT INTO telemetry_rollup (installId, date, appVersion, platform, payload, receivedAt)
  VALUES (@installId, @date, @appVersion, @platform, @payload, @receivedAt)
  ON CONFLICT (installId, date) DO UPDATE SET
    appVersion = excluded.appVersion, platform = excluded.platform,
    payload = excluded.payload, receivedAt = excluded.receivedAt
`);
const insertEvent = db.prepare(`
  INSERT INTO telemetry_event (installId, ts, eventName, convKey, appVersion, attrs, receivedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let rollups = 0;
let events = 0;
const now = new Date().toISOString();
db.transaction(() => {
  for (const ins of installs) {
    for (let back = ins.bornDaysAgo; back >= 0; back--) {
      const ageWeeks = Math.floor((ins.bornDaysAgo - back) / 7);
      const pActive = back === ins.bornDaysAgo ? 1 : ins.stickiness * Math.pow(0.88, ageWeeks);
      if (Math.random() > pActive) continue;
      const body = makeRollupBody(ins, back);
      upsert.run({
        installId: body.installId,
        date: body.date,
        appVersion: body.appVersion,
        platform: body.platform,
        payload: JSON.stringify(body),
        receivedAt: now,
      });
      rollups++;
    }
    for (let k = 0; k < 5 + rand(10); k++) {
      insertEvent.run(
        ins.id,
        new Date(Date.now() - rand(86400) * 1000).toISOString(),
        pick(['app.start', 'ai.turn', 'ai.tool', 'editor.action', 'ui.nav', 'matter.classified']),
        Math.random() < 0.5 ? `conv-${rand(1000)}` : null,
        ins.version,
        JSON.stringify({ sample: true }),
        now
      );
      events++;
    }
  }
})();
db.close();

console.log(`seed 完成：${installs.length} 台安装，${rollups} 条 rollup，${events} 条事件已入库`);
