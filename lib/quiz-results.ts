import 'server-only';

import fs from 'fs';
import path from 'path';

/**
 * 「法人格」测试结果与埋点（dev-board#329）。
 *
 * - 结果：登录用户一人一条（重测覆盖），JSON 文件存储（沿 badges.json 惯例）。
 * - 埋点：quiz-events.jsonl 追加流水（沿 cert-scans.jsonl 惯例，尽力而为），
 *   北极星三率 = 完成率(visit→complete) / 保存率(complete→download) / 回流率(from=qcard)。
 */

export interface QuizResult {
    userId: string;
    typeId: string;
    dims: [number, number, number];
    at: string;
}

const RESULTS_FILE = path.join(process.cwd(), 'data', 'quiz-results.json');
const EVENTS_FILE = path.join(process.cwd(), 'data', 'quiz-events.jsonl');

function readResults(): QuizResult[] {
    try {
        return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

export function getQuizResult(userId: string): QuizResult | undefined {
    return readResults().find(r => r.userId === userId);
}

export function saveQuizResult(userId: string, typeId: string, dims: [number, number, number]) {
    const all = readResults().filter(r => r.userId !== userId);
    all.push({ userId, typeId, dims, at: new Date().toISOString() });
    const tmp = `${RESULTS_FILE}.tmp`;
    fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(all, null, 1));
    fs.renameSync(tmp, RESULTS_FILE);
}

export const QUIZ_EVENTS = ['visit', 'start', 'complete', 'download', 'share'] as const;
export type QuizEvent = (typeof QUIZ_EVENTS)[number];

export function logQuizEvent(ev: QuizEvent, extra?: { from?: string; typeId?: string; n?: string; v?: string }) {
    try {
        fs.appendFileSync(
            EVENTS_FILE,
            JSON.stringify({
                at: new Date().toISOString(),
                ev,
                ...(extra?.from ? { from: extra.from.slice(0, 32) } : {}),
                ...(extra?.typeId ? { typeId: extra.typeId.slice(0, 32) } : {}),
                // 昵称（维护者 2026-09-03：明细表要能看到谁在测/谁在分享）。
                // 用户自愿填写并印在公开分享卡上的信息，已由卡片 URL 过服务端，仅作留存
                ...(extra?.n ? { n: extra.n.slice(0, 12) } : {}),
                // 文案版本（peer/biz）：分享/下载动作的归因，看客户名片版是否更常被晒
                ...(extra?.v === 'biz' ? { v: 'biz' } : {}),
            }) + '\n'
        );
    } catch { /* 统计尽力而为 */ }
}

/** 事件时间戳按北京时间归日（服务器时区不可依赖） */
function beijingDay(iso: string): string {
    return new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export interface QuizFunnel { visit: number; start: number; complete: number; download: number; share: number }

export interface QuizAdminStats {
    totals: QuizFunnel;
    today: QuizFunnel;
    /** 近 14 个自然日（北京时间），升序 */
    daily: Array<{ date: string } & QuizFunnel>;
    /** 类型分布，按累计降序。save = 该类型的 share+download 动作数（谁更愿意被晒出去） */
    types: Array<{ typeId: string; total: number; today: number; recent3: number; save: number }>;
    /** 明细流水：最近 50 条 complete/share/download（时间倒序），n 为昵称，v='biz' 表示名片版 */
    recent: Array<{ at: string; ev: string; typeId?: string; n?: string; v?: string }>;
    /** visit 事件的来源分布，按次数降序；无 from 记作 direct */
    sources: Array<{ from: string; count: number }>;
    /** start-refs.jsonl 里 quiz-* 来源的注册引导数（结果页产品桥 → /start） */
    quizStartRefs: number;
    /** 登录用户存档到个人主页的结果数 */
    savedResults: number;
}

/** 管理后台的法人格增长面板数据（dev-board#329 维护者要求自助看数） */
export function quizAdminStats(): QuizAdminStats {
    const zero = (): QuizFunnel => ({ visit: 0, start: 0, complete: 0, download: 0, share: 0 });
    const totals = zero();
    const today = zero();
    const daily = new Map<string, QuizFunnel>();
    const typeTotal = new Map<string, number>();
    const typeToday = new Map<string, number>();
    const typeRecent3 = new Map<string, number>();
    const typeSave = new Map<string, number>();
    const sources = new Map<string, number>();
    const recent: QuizAdminStats['recent'] = [];
    const todayKey = beijingDay(new Date().toISOString());
    const recent3Key = beijingDay(new Date(Date.now() - 2 * 86400_000).toISOString());

    try {
        const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            let e: { at?: string; ev?: string; from?: string; typeId?: string };
            try { e = JSON.parse(line); } catch { continue; }
            const ev = e.ev as keyof QuizFunnel;
            if (!e.at || !(ev in totals)) continue;
            const day = beijingDay(e.at);
            totals[ev] += 1;
            if (day === todayKey) today[ev] += 1;
            if (!daily.has(day)) daily.set(day, zero());
            daily.get(day)![ev] += 1;
            if (ev === 'visit') sources.set(e.from || 'direct', (sources.get(e.from || 'direct') ?? 0) + 1);
            if (ev === 'complete' && e.typeId) {
                typeTotal.set(e.typeId, (typeTotal.get(e.typeId) ?? 0) + 1);
                if (day === todayKey) typeToday.set(e.typeId, (typeToday.get(e.typeId) ?? 0) + 1);
                if (day >= recent3Key) typeRecent3.set(e.typeId, (typeRecent3.get(e.typeId) ?? 0) + 1);
            }
            if ((ev === 'share' || ev === 'download') && e.typeId) {
                typeSave.set(e.typeId, (typeSave.get(e.typeId) ?? 0) + 1);
            }
            if (ev === 'complete' || ev === 'share' || ev === 'download') {
                const ex = e as { n?: string; v?: string };
                recent.push({ at: e.at, ev, typeId: e.typeId, n: ex.n, v: ex.v });
            }
        }
    } catch { /* 无数据文件时全零 */ }

    let quizStartRefs = 0;
    try {
        const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'start-refs.jsonl'), 'utf-8');
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
                if (String(JSON.parse(line).ref ?? '').startsWith('quiz-')) quizStartRefs += 1;
            } catch { /* 跳过坏行 */ }
        }
    } catch { /* 同上 */ }

    return {
        totals,
        today,
        daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
            .map(([date, f]) => ({ date, ...f })),
        types: [...typeTotal.entries()].sort((a, b) => b[1] - a[1])
            .map(([typeId, total]) => ({
                typeId, total,
                today: typeToday.get(typeId) ?? 0,
                recent3: typeRecent3.get(typeId) ?? 0,
                save: typeSave.get(typeId) ?? 0,
            })),
        recent: recent.slice(-50).reverse(),
        sources: [...sources.entries()].sort((a, b) => b[1] - a[1])
            .map(([from, count]) => ({ from, count })),
        quizStartRefs,
        savedResults: readResults().length,
    };
}

/**
 * 参与统计（dev-board#329 维护者追加：要有比较和参与感）：总完成数 +
 * 各类型解锁数。complete 事件计数，读整文件在当前量级可忽略。
 */
export function quizCompletionStats(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    let total = 0;
    try {
        const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
        for (const line of raw.split('\n')) {
            if (!line.includes('"ev":"complete"')) continue;
            total += 1;
            const m = line.match(/"typeId":"([a-z]+)"/);
            if (m) byType[m[1]] = (byType[m[1]] ?? 0) + 1;
        }
    } catch { /* 统计尽力而为 */ }
    return { total, byType };
}
