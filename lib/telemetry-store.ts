import { getDb, withTransaction } from './db';
import { PRICING_CLICK_EVENTS } from './pricing-analytics';

/**
 * 匿名遥测存储层（迁移 v6）。
 *
 * - telemetry_rollup：桌面端每日汇总，(installId, date) upsert，payload 整包 JSON 文本
 * - telemetry_event：白名单事件流，只追加
 * - 聚合查询：admin 看板（/api/admin/telemetry）唯一数据入口
 * - 保留期清理：purgeExpiredTelemetry，兑现隐私政策「匿名遥测 24 个月，届期滚动删除」
 *
 * installId 是桌面端本地随机 UUID，不关联账户，此处不做任何身份还原。
 */

// ---------------------------------------------------------------------------
// 校验与限流
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

export function isDateStr(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

/** ingest 端点白名单事件名（桌面端契约，改动需与桌面端同步）。 */
export const EVENT_WHITELIST = new Set([
  'app.start',
  'ai.turn',
  'ai.tool',
  'ai.model',
  'editor.action',
  'editor.bridge',
  'skill.activated',
  'skill.lifecycle',
  'plugin.lifecycle',
  'project.created',
  'file.changed',
  'version.op',
  'ui.nav',
  'matter.classified',
  // 官网 /pricing 点击（PricingClickTracker → sendBeacon）。匿名：固定 installId、
  // 不带账户 / Cookie / UA / 来源页，attrs 只有 { lang }。名字与 data-analytics 属性逐字一致。
  ...PRICING_CLICK_EVENTS,
]);

/**
 * 简单内存限流：每 IP 每分钟 60 次（进程内计数，多实例部署各算各的，够用）。
 * 返回 true 表示放行。
 */
const RATE_LIMIT_PER_MINUTE = 60;
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

export function allowTelemetryRequest(ip: string, now = Date.now()): boolean {
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart >= 60_000) {
    // 顺手清理过期桶，防止 Map 无限增长
    if (rateBuckets.size > 10_000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.windowStart >= 60_000) rateBuckets.delete(k);
      }
    }
    rateBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_PER_MINUTE;
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

export interface RollupWrite {
  installId: string;
  date: string;
  appVersion: string | null;
  platform: string | null;
  /** 整包 JSON 文本（counters、by 系列、tokens、activeMinutes 等原样保存） */
  payload: string;
}

export function upsertRollup(r: RollupWrite): void {
  getDb()
    .prepare(
      `INSERT INTO telemetry_rollup (installId, date, appVersion, platform, payload, receivedAt)
       VALUES (@installId, @date, @appVersion, @platform, @payload, @receivedAt)
       ON CONFLICT (installId, date) DO UPDATE SET
         appVersion = excluded.appVersion,
         platform   = excluded.platform,
         payload    = excluded.payload,
         receivedAt = excluded.receivedAt`
    )
    .run({ ...r, receivedAt: new Date().toISOString() });
}

export interface EventWrite {
  ts: string;
  eventName: string;
  convKey: string | null;
  attrs: string | null;
}

export function insertEvents(installId: string, appVersion: string | null, events: EventWrite[]): number {
  if (events.length === 0) return 0;
  const receivedAt = new Date().toISOString();
  withTransaction(d => {
    const insert = d.prepare(
      `INSERT INTO telemetry_event (installId, ts, eventName, convKey, appVersion, attrs, receivedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of events) {
      insert.run(installId, e.ts, e.eventName, e.convKey, appVersion, e.attrs, receivedAt);
    }
  });
  return events.length;
}

// ---------------------------------------------------------------------------
// 保留期清理
// ---------------------------------------------------------------------------

/** cutoff 必须是 ISO 8601 UTC 时间戳，与 receivedAt 的写入格式一致。 */
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * 删除 receivedAt 早于 cutoffIso 的全部遥测数据（两张表）。
 *
 * **按 receivedAt 删，不按 date。** date 是桌面端在请求体里自己声明的业务日期，
 * 客户端时钟错乱或有人手搓请求就能把它填成 2019 年（刚上报就被下一次清理删掉）
 * 或 2099 年（永不过期，赖在库里超出承诺期限）。receivedAt 是服务端在
 * upsertRollup / insertEvents 里盖的接收时刻，「我们持有这条数据多久」只有它说了算。
 *
 * 注意 rollup 是 (installId, date) upsert 且 receivedAt = excluded.receivedAt：
 * 同一天的汇总被重发时整行 payload 被覆盖、保留期从最后一次接收重新起算。
 * 这是对的——库里躺着的是那一刻收到的那份数据，不是两年前那份。
 *
 * 两张表在同一事务里删，避免只删一半留下跨表不一致的半截历史。
 */
export function purgeExpiredTelemetry(cutoffIso: string): { rollups: number; events: number } {
  // 字符串比较是删除范围的唯一依据，格式错了就是删错量：
  // 传 `new Date().toString()`（"Fri Aug 08 2026 …"）时首字母 'F' 大于任何数字，
  // `receivedAt < cutoff` 对每一行都成立，一次调用清空整张表。这个失手代价太大，值一道闸。
  if (!ISO_TS_RE.test(cutoffIso)) {
    throw new Error(`purgeExpiredTelemetry: cutoffIso 必须是 ISO UTC 时间戳，收到 ${cutoffIso}`);
  }
  return withTransaction(d => {
    const rollups = d.prepare('DELETE FROM telemetry_rollup WHERE receivedAt < ?').run(cutoffIso)
      .changes;
    const events = d.prepare('DELETE FROM telemetry_event WHERE receivedAt < ?').run(cutoffIso)
      .changes;
    return { rollups, events };
  });
}

// ---------------------------------------------------------------------------
// 聚合查询（admin 看板）
// ---------------------------------------------------------------------------

export interface TelemetrySummary {
  range: { from: string; to: string };
  dailyActive: Array<{ date: string; count: number }>;
  totals: {
    installs: number;
    newInstalls: number;
    mau: number;
    wau: number;
    aiTurns: number;
    docsEdited: number;
    tokens: number;
  };
  versionDist: Array<{ version: string; count: number }>;
  topTools: Array<{ name: string; count: number }>;
  topSkills: Array<{ name: string; count: number }>;
  matterDist: Array<{ name: string; count: number }>;
  retention: {
    /** 每个 cohort：首见周（周一日期）、人数、第 1-8 周留存率（百分比，未到期的周为 null） */
    cohorts: Array<{ cohortWeek: string; size: number; weeks: Array<number | null> }>;
  };
}

interface RollupRow {
  installId: string;
  date: string;
  appVersion: string | null;
  payload: string;
}

interface ParsedPayload {
  counters?: Record<string, unknown>;
  byTool?: Record<string, unknown>;
  bySkill?: Record<string, unknown>;
  byMatterCategory?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
}

function addCounts(target: Map<string, number>, obj: Record<string, unknown> | undefined): void {
  if (!obj) return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      target.set(k, (target.get(k) ?? 0) + v);
    }
  }
}

function topN(m: Map<string, number>, n: number): Array<{ name: string; count: number }> {
  return [...m.entries()]
    .map(([name, count]) => ({ name, count: Math.round(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 该日期所在 ISO 周的周一（YYYY-MM-DD）。 */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * admin 看板聚合。
 *
 * **保留期清理会让本函数的部分口径「缩水」，这不是事故。**
 * dailyActive / aiTurns / topTools 等受 from/to 约束，只看区间内的行；
 * 但 installs、mau、wau、以及留存 cohort 的首见日期与活跃周走的是**全表扫描**，
 * 全表 = 库里还剩下的行。purgeExpiredTelemetry 跑完（保留期 24 个月）之后：
 *
 * - installs（「累计安装数」）会**变小**：24 个月没再上报过的 install 整个消失，
 *   它不是「累计装机量」，是「最近 24 个月内出现过的 installId 数」；
 * - 24 个月前的 cohort 行会从留存表里**整行消失**，历史留存曲线的左端被逐周截断；
 * - 老 install 的早期活跃周被删后，跨越保留期边界的 cohort 留存率会偏低
 *   （分母还在、分子那几周的行没了）——这类 cohort 本身也很快会被删掉。
 *
 * 这是「届期滚动删除」的必然结果，不能靠改这里补救（数据已经不在了）。
 * 唯一的处置是在看板上标注口径「仅含最近 24 个月」，别让人把它当事故查。
 */
export function summarizeTelemetry(from: string, to: string): TelemetrySummary {
  const db = getDb();

  const inRange = db
    .prepare(
      `SELECT installId, date, appVersion, payload FROM telemetry_rollup
        WHERE date >= ? AND date <= ? ORDER BY date ASC`
    )
    .all(from, to) as RollupRow[];

  // dailyActive
  const dailyMap = new Map<string, Set<string>>();
  for (const r of inRange) {
    let set = dailyMap.get(r.date);
    if (!set) dailyMap.set(r.date, (set = new Set()));
    set.add(r.installId);
  }
  const dailyActive = [...dailyMap.entries()]
    .map(([date, set]) => ({ date, count: set.size }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // payload 聚合
  let aiTurns = 0;
  let docsEdited = 0;
  let tokens = 0;
  const toolMap = new Map<string, number>();
  const skillMap = new Map<string, number>();
  const matterMap = new Map<string, number>();
  const latestVersionByInstall = new Map<string, string>(); // 区间内每 install 最新版本（rows 按 date 升序，后写覆盖）
  for (const r of inRange) {
    if (r.appVersion) latestVersionByInstall.set(r.installId, r.appVersion);
    let p: ParsedPayload;
    try {
      p = JSON.parse(r.payload) as ParsedPayload;
    } catch {
      continue;
    }
    const counters = p.counters ?? {};
    const turn = counters['ai.turn'];
    if (typeof turn === 'number' && Number.isFinite(turn)) aiTurns += turn;
    const edits = counters['editor.action'];
    if (typeof edits === 'number' && Number.isFinite(edits)) docsEdited += edits;
    if (p.tokens) {
      for (const v of Object.values(p.tokens)) {
        if (typeof v === 'number' && Number.isFinite(v)) tokens += v;
      }
    }
    addCounts(toolMap, p.byTool);
    addCounts(skillMap, p.bySkill);
    addCounts(matterMap, p.byMatterCategory);
  }

  const versionCount = new Map<string, number>();
  for (const v of latestVersionByInstall.values()) {
    versionCount.set(v, (versionCount.get(v) ?? 0) + 1);
  }
  const versionDist = [...versionCount.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count);

  // 全表口径：累计安装、首见日期（newInstalls 与留存都要）
  // 「全表」= 保留期内剩下的行，清理跑完 installs 会变小、老 cohort 会消失，见函数头注释。
  const firstSeenRows = db
    .prepare('SELECT installId, MIN(date) AS firstDate FROM telemetry_rollup GROUP BY installId')
    .all() as Array<{ installId: string; firstDate: string }>;
  const installs = firstSeenRows.length;
  const newInstalls = firstSeenRows.filter(r => r.firstDate >= from && r.firstDate <= to).length;

  const mau = (
    db
      .prepare('SELECT COUNT(DISTINCT installId) AS c FROM telemetry_rollup WHERE date > ? AND date <= ?')
      .get(addDaysUtc(to, -30), to) as { c: number }
  ).c;
  const wau = (
    db
      .prepare('SELECT COUNT(DISTINCT installId) AS c FROM telemetry_rollup WHERE date > ? AND date <= ?')
      .get(addDaysUtc(to, -7), to) as { c: number }
  ).c;

  // 留存：按首见周分 cohort，第 N 周留存 = cohort 中在 [周一+7N, 周一+7N+7) 有活跃的比例。
  // cohort 取首见周落在查询区间内的安装；活跃判定用全表数据（不受区间右端裁剪时误判为流失）。
  // 同样受保留期清理影响：被删掉活跃周的老 cohort 留存率会偏低，见函数头注释。
  const activeWeeksByInstall = new Map<string, Set<string>>();
  const allDates = db
    .prepare('SELECT installId, date FROM telemetry_rollup')
    .all() as Array<{ installId: string; date: string }>;
  for (const r of allDates) {
    let set = activeWeeksByInstall.get(r.installId);
    if (!set) activeWeeksByInstall.set(r.installId, (set = new Set()));
    set.add(mondayOf(r.date));
  }
  const cohortMembers = new Map<string, string[]>();
  for (const r of firstSeenRows) {
    if (r.firstDate < from || r.firstDate > to) continue;
    const week = mondayOf(r.firstDate);
    const arr = cohortMembers.get(week);
    if (arr) arr.push(r.installId);
    else cohortMembers.set(week, [r.installId]);
  }
  const todayWeek = mondayOf(new Date().toISOString().slice(0, 10));
  const cohorts = [...cohortMembers.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([cohortWeek, members]) => {
      const weeks: Array<number | null> = [];
      for (let w = 1; w <= 8; w++) {
        const targetWeek = addDaysUtc(cohortWeek, w * 7);
        if (targetWeek > todayWeek) {
          weeks.push(null); // 尚未到期的周
          continue;
        }
        const retained = members.filter(id => activeWeeksByInstall.get(id)?.has(targetWeek)).length;
        weeks.push(Math.round((retained / members.length) * 1000) / 10);
      }
      return { cohortWeek, size: members.length, weeks };
    });

  return {
    range: { from, to },
    dailyActive,
    totals: {
      installs,
      newInstalls,
      mau,
      wau,
      aiTurns: Math.round(aiTurns),
      docsEdited: Math.round(docsEdited),
      tokens: Math.round(tokens),
    },
    versionDist,
    topTools: topN(toolMap, 15),
    topSkills: topN(skillMap, 15),
    matterDist: topN(matterMap, 15),
    retention: { cohorts },
  };
}
