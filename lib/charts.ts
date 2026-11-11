import 'server-only';

import { listSkills, recentDownloadCounts, type SkillEntry } from './skills-store';
import { findUserById, toPublicUser, type PublicUser } from './users';
import { getDb } from './db';
import { evaluateAllBadges, awardWeeklyNo1, listAwards, FOUNDER_LIMIT } from './badges';
import fs from 'fs';
import path from 'path';

/**
 * Skill 榜单体系（dev-board#301）。四榜：免费榜 / 收费榜 / 创作者榜 / 收益榜，
 * 各配「总榜 + 本周」双窗口（收益榜与创作者榜只有总榜——周窗口对它们没有稳定语义）。
 *
 * 设计裁决（依据见卡内落实记录）：
 * - 每榜只取前 10：全局长榜只激励头部、挫伤中尾部（JMIR 2021/2022 的排行榜负面效应），
 *   前 10 + 周窗口把「可达成感」还给普通创作者。
 * - 冷启动「虚位以待」：榜位不足 10 不造假数据、不灌假账号（专业圈识破即社区性死亡），
 *   空位本身就是投稿召唤，由页面渲染层处理。
 * - 收费榜与收益榜用 purchases/creator_earnings（真实购买，天然防刷）；免费榜只有
 *   downloads 可用（取包即计数，未去重）——量级大了要刷得动它得先刷得动桌面端安装，
 *   现阶段接受，字段语义在页面上写明「安装量」。
 * - **收益榜只显示量级区间，不显示精确金额**（维护者 2026-08-30 拍板）：律师群体
 *   对收入公开敏感，区间既保住荣誉感又不精确暴露。
 */

export interface SkillChartRow {
    rank: number;
    skill: Pick<SkillEntry, 'id' | 'name' | 'category' | 'priceCents'>;
    authorName: string;
    authorUsername: string;
    /** 免费榜=安装量；收费榜=购买人次 */
    value: number;
}

export interface CreatorChartRow {
    rank: number;
    user: PublicUser;
    works: number;
    installs: number;
    founderSeq?: number;
}

export interface EarningsChartRow {
    rank: number;
    user: PublicUser;
    /** 量级区间标签键（词典 chartsPage.tiers.*），不含精确金额 */
    tierKey: 'tier100k' | 'tier10k' | 'tier1k' | 'tier100' | 'tierStart';
}

export interface Charts {
    free: { all: SkillChartRow[]; weekly: SkillChartRow[] };
    paid: { all: SkillChartRow[]; weekly: SkillChartRow[] };
    creators: CreatorChartRow[];
    earnings: EarningsChartRow[];
}

const TOP_N = 10;

function authorOf(userId: string): { name: string; username: string } {
    const u = findUserById(userId);
    return { name: u?.displayName || u?.username || '—', username: u?.username || '' };
}

function toRows(skills: SkillEntry[], value: (s: SkillEntry) => number): SkillChartRow[] {
    return skills
        .map(s => ({ s, v: value(s) }))
        .filter(({ v }) => v > 0)
        .sort((a, b) => b.v - a.v || a.s.createdAt.localeCompare(b.s.createdAt))
        .slice(0, TOP_N)
        .map(({ s, v }, i) => {
            const author = authorOf(s.authorId);
            return {
                rank: i + 1,
                skill: { id: s.id, name: s.name, category: s.category, priceCents: s.priceCents },
                authorName: author.name,
                authorUsername: author.username,
                value: v,
            };
        });
}

/** ISO 周键（周一起算），用于周榜结算去重 */
export function isoWeekKey(d = new Date()): string {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const WEEKS_FILE = path.join(process.cwd(), 'data', 'chart-weeks.json');

/**
 * 周结算：跨入新的 ISO 周后，把上一周免费/收费周榜第一名的作者授予「周榜魁首」。
 * 幂等（awardWeeklyNo1 内部按 (周, 榜) 去重），由榜单计算入口顺带触发，无独立 cron。
 * 上一周窗口用「近 14 天减近 7 天」近似不可行，这里取简单口径：结算时点直接用
 * 当前近 7 天数据的第一名——榜单页有访问就会在周界附近结算，误差以天计，
 * 对「荣誉」语义足够；等流量大了再上精确的按周流水。
 */
function settleWeekly(freeWeekly: SkillChartRow[], paidWeekly: SkillChartRow[]) {
    try {
        const week = isoWeekKey();
        let state: { lastSettled?: string } = {};
        try {
            state = JSON.parse(fs.readFileSync(WEEKS_FILE, 'utf-8'));
        } catch { /* 首次 */ }
        if (state.lastSettled === week) return;

        // 首次运行只记周键不发奖：没有「上一周」可言
        if (state.lastSettled) {
            const freeTop = freeWeekly[0];
            const paidTop = paidWeekly[0];
            if (freeTop?.authorUsername) {
                const u = findUserById(listSkills().find(s => s.id === freeTop.skill.id)?.authorId ?? '');
                if (u) awardWeeklyNo1(u.id, state.lastSettled, 'free');
            }
            if (paidTop?.authorUsername) {
                const u = findUserById(listSkills().find(s => s.id === paidTop.skill.id)?.authorId ?? '');
                if (u) awardWeeklyNo1(u.id, state.lastSettled, 'paid');
            }
        }
        fs.writeFileSync(WEEKS_FILE, JSON.stringify({ lastSettled: week }));
    } catch { /* 结算失败不影响榜单展示，下次访问重试 */ }
}

export function computeCharts(): Charts {
    // 榜单页是全站「荣誉时钟」：每次计算前先跑一轮徽章评定（幂等、当前量级开销可忽略），
    // 创始编号补发也在这里兜底
    evaluateAllBadges();

    const skills = listSkills();
    const free = skills.filter(s => !s.priceCents);
    const paid = skills.filter(s => (s.priceCents ?? 0) > 0);
    const weeklyCounts = recentDownloadCounts(7);

    // 收费榜：真实购买人次（总/近 7 天）
    const purchaseRows = getDb()
        .prepare(
            `SELECT itemId, COUNT(*) AS n,
                    SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS weekN
             FROM purchases WHERE itemType = 'skill' GROUP BY itemId`
        )
        .all(new Date(Date.now() - 7 * 86400_000).toISOString()) as Array<{ itemId: string; n: number; weekN: number }>;
    const buyAll = new Map(purchaseRows.map(r => [r.itemId, r.n]));
    const buyWeek = new Map(purchaseRows.map(r => [r.itemId, r.weekN]));

    const charts: Charts = {
        free: {
            all: toRows(free, s => s.downloads),
            weekly: toRows(free, s => weeklyCounts.get(s.id) ?? 0),
        },
        paid: {
            all: toRows(paid, s => buyAll.get(s.id) ?? 0),
            weekly: toRows(paid, s => buyWeek.get(s.id) ?? 0),
        },
        creators: computeCreators(skills),
        earnings: computeEarnings(),
    };

    settleWeekly(charts.free.weekly, charts.paid.weekly);
    return charts;
}

function computeCreators(skills: SkillEntry[]): CreatorChartRow[] {
    const byAuthor = new Map<string, { works: number; installs: number }>();
    for (const s of skills) {
        const cur = byAuthor.get(s.authorId) || { works: 0, installs: 0 };
        cur.works += 1;
        cur.installs += s.downloads;
        byAuthor.set(s.authorId, cur);
    }
    const founderSeq = new Map(
        listAwards().filter(a => a.badgeId === 'founder').map(a => [a.userId, a.seq])
    );
    return [...byAuthor.entries()]
        .sort((a, b) => b[1].works - a[1].works || b[1].installs - a[1].installs)
        .slice(0, TOP_N)
        .flatMap(([uid, stat], i) => {
            const user = findUserById(uid);
            if (!user) return [];
            return [{
                rank: i + 1,
                user: toPublicUser(user),
                works: stat.works,
                installs: stat.installs,
                founderSeq: founderSeq.get(uid) ?? undefined,
            }];
        });
}

function computeEarnings(): EarningsChartRow[] {
    const rows = getDb()
        .prepare(
            `SELECT creatorUserId, SUM(amountCents) AS total
             FROM creator_earnings GROUP BY creatorUserId
             HAVING total > 0 ORDER BY total DESC LIMIT ${TOP_N}`
        )
        .all() as Array<{ creatorUserId: string; total: number }>;
    return rows.flatMap((r, i) => {
        const user = findUserById(r.creatorUserId);
        if (!user) return [];
        const tierKey: EarningsChartRow['tierKey'] =
            r.total >= 10_000_000 ? 'tier100k'
                : r.total >= 1_000_000 ? 'tier10k'
                    : r.total >= 100_000 ? 'tier1k'
                        : r.total >= 10_000 ? 'tier100'
                            : 'tierStart';
        return [{ rank: i + 1, user: toPublicUser(user), tierKey }];
    });
}

export { FOUNDER_LIMIT };
