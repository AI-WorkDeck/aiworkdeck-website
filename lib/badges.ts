import 'server-only';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { listSkills } from './skills-store';
import { findUserById } from './users';
import { sendNotifyMail } from './mail-notify';

/**
 * Skill 创作者徽章体系（dev-board#300）。
 *
 * 设计裁决（研究结论见卡内落实记录，这里只记不变式）：
 * - **徽章与金钱完全脱钩**：不奖励 Credits、不与分成挂钩、更不做「分享得奖励」——
 *   后者踩微信「利诱分享」封禁红线，前两者会挤出创作者的专业声誉内在动机
 *   （过度理由效应）。徽章唯一的价值是身份与荣誉，配套证书是自愿分享的内容。
 * - **全部自动解锁、幂等重算**：evaluate 系列可以在任何时点对任何用户重跑，
 *   已发的不重发、条件达到的补发。没有人工发放通道。
 * - **创始贡献者限量 100 名、按首次投稿时间全局定序**（维护者 2026-08-30 拍板）。
 *   编号一经分配永不回收、永不变更——它会被印在用户已分享出去的证书上。
 * - 命名走典雅路线不做游戏化：这是法律人产品，徽章是「荣誉称号」不是「成就点数」。
 */

export type BadgeId =
    | 'founder'
    | 'first-skill'
    | 'skills-3'
    | 'skills-10'
    | 'skills-25'
    | 'installs-100'
    | 'installs-1k'
    | 'installs-10k'
    | 'featured'
    | 'skill-1k'
    | 'weekly-no1';

export interface BadgeDef {
    id: BadgeId;
    nameZh: string;
    nameEn: string;
    /** 证书与徽章墙上的一句话释义 */
    descZh: string;
    descEn: string;
    /** founding 单独成层：限量编号，视觉上最重 */
    tier: 'founding' | 'milestone' | 'quality';
}

export const FOUNDER_LIMIT = 100;

export const BADGE_DEFS: Record<BadgeId, BadgeDef> = {
    founder: {
        id: 'founder', tier: 'founding',
        nameZh: '创始贡献者', nameEn: 'Founding Contributor',
        descZh: `AI WorkDeck Skill 广场最早的 ${FOUNDER_LIMIT} 位创作者之一`,
        descEn: `One of the first ${FOUNDER_LIMIT} creators of the AI WorkDeck Skill community`,
    },
    'first-skill': {
        id: 'first-skill', tier: 'milestone',
        nameZh: '开篇', nameEn: 'Debut Work',
        descZh: '发布了第一个 Skill', descEn: 'Published a first Skill',
    },
    'skills-3': {
        id: 'skills-3', tier: 'milestone',
        nameZh: '笔耕', nameEn: 'Steady Author',
        descZh: '发布了三个 Skill', descEn: 'Published three Skills',
    },
    'skills-10': {
        id: 'skills-10', tier: 'milestone',
        nameZh: '著作等身', nameEn: 'Ten Works',
        descZh: '发布了十个 Skill', descEn: 'Published ten Skills',
    },
    'skills-25': {
        id: 'skills-25', tier: 'milestone',
        nameZh: '立言', nameEn: 'Master Author',
        descZh: '发布了二十五个 Skill', descEn: 'Published twenty-five Skills',
    },
    'installs-100': {
        id: 'installs-100', tier: 'milestone',
        nameZh: '百人之选', nameEn: 'Chosen by Hundreds',
        descZh: '作品累计被安装一百次', descEn: 'Works installed one hundred times',
    },
    'installs-1k': {
        id: 'installs-1k', tier: 'milestone',
        nameZh: '千人之选', nameEn: 'Chosen by Thousands',
        descZh: '作品累计被安装一千次', descEn: 'Works installed one thousand times',
    },
    'installs-10k': {
        id: 'installs-10k', tier: 'milestone',
        nameZh: '万人之选', nameEn: 'Chosen by Ten Thousands',
        descZh: '作品累计被安装一万次', descEn: 'Works installed ten thousand times',
    },
    featured: {
        id: 'featured', tier: 'quality',
        nameZh: '编辑精选', nameEn: "Editors' Pick",
        descZh: '作品入选官方精选', descEn: 'A work selected as an official pick',
    },
    'skill-1k': {
        id: 'skill-1k', tier: 'quality',
        nameZh: '千装之作', nameEn: 'Thousand-Install Work',
        descZh: '单个作品被安装一千次', descEn: 'A single work installed one thousand times',
    },
    'weekly-no1': {
        id: 'weekly-no1', tier: 'quality',
        nameZh: '周榜魁首', nameEn: 'Weekly Champion',
        descZh: '登顶 Skill 周榜', descEn: 'Ranked first on the weekly chart',
    },
};

export interface BadgeAward {
    /** 证书编号（也是证书 URL 的主键），8 字节随机 hex，发出后永不变更 */
    id: string;
    userId: string;
    badgeId: BadgeId;
    /** 仅 founder：创始编号 1..FOUNDER_LIMIT */
    seq?: number;
    /** 触发本徽章的作品（skill-1k / featured），证书上会署作品名 */
    skillId?: string;
    /** 仅 weekly-no1：周键 + 榜名，用于去重（同一周同一榜只发一次） */
    week?: string;
    chart?: 'free' | 'paid';
    awardedAt: string;
}

const AWARDS_FILE = path.join(process.cwd(), 'data', 'badges.json');

function readAwards(): BadgeAward[] {
    try {
        return JSON.parse(fs.readFileSync(AWARDS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function writeAwards(awards: BadgeAward[]) {
    const tmp = `${AWARDS_FILE}.tmp`;
    fs.mkdirSync(path.dirname(AWARDS_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(awards, null, 1));
    fs.renameSync(tmp, AWARDS_FILE);
}

export function listAwards(userId?: string): BadgeAward[] {
    const all = readAwards();
    return userId ? all.filter(a => a.userId === userId) : all;
}

export function getAward(certId: string): BadgeAward | undefined {
    return readAwards().find(a => a.id === certId);
}

function newAward(partial: Omit<BadgeAward, 'id' | 'awardedAt'>): BadgeAward {
    return { id: crypto.randomBytes(8).toString('hex'), awardedAt: new Date().toISOString(), ...partial };
}

/** 解锁邮件（尽力而为，失败不影响发放；mail-notify 未配置时静默跳过） */
function notifyAward(award: BadgeAward) {
    const user = findUserById(award.userId);
    if (!user?.email) return;
    const def = BADGE_DEFS[award.badgeId];
    const seq = award.seq ? `（No.${award.seq}）` : '';
    void sendNotifyMail({
        to: user.email,
        subject: `你获得了「${def.nameZh}」徽章 / You earned the "${def.nameEn}" badge`,
        text:
            `你在 AI WorkDeck Skill 广场获得了新徽章：${def.nameZh}${seq}——${def.descZh}。\n` +
            `专属证书已生成，可在个人主页查看、下载并分享：\n` +
            `https://www.aiworkdeck.com/zh/cert/${award.id}\n\n` +
            `You earned a new badge on the AI WorkDeck Skill community: ${def.nameEn}${seq ? ` (No.${award.seq})` : ''} — ${def.descEn}.\n` +
            `Your certificate is ready to view, download and share:\n` +
            `https://workdeck.ai/en/cert/${award.id}\n`,
    });
}

/**
 * 对单个用户做幂等评定，返回本次新发的徽章。
 * 在投稿成功、精选切换、榜单页重算时调用；重复调用无副作用。
 */
export function evaluateUserBadges(userId: string): BadgeAward[] {
    const all = readAwards();
    const mine = new Set(all.filter(a => a.userId === userId).map(a => a.badgeId));
    const skills = listSkills({ authorId: userId });
    if (skills.length === 0) return [];

    const granted: BadgeAward[] = [];
    const grant = (partial: Omit<BadgeAward, 'id' | 'awardedAt'>) => {
        const award = newAward(partial);
        all.push(award);
        granted.push(award);
        mine.add(partial.badgeId);
    };

    // 创始贡献者：名额未满即按当前到达顺序取号（存量用户的全局定序由 backfillFounders 负责，
    // 它在本函数之前跑过之后，这里的「到达顺序」就是正确的续号）
    if (!mine.has('founder')) {
        const taken = all.filter(a => a.badgeId === 'founder').length;
        if (taken < FOUNDER_LIMIT) {
            grant({ userId, badgeId: 'founder', seq: taken + 1 });
        }
    }

    const countGates: Array<[number, BadgeId]> = [[1, 'first-skill'], [3, 'skills-3'], [10, 'skills-10'], [25, 'skills-25']];
    for (const [n, id] of countGates) {
        if (skills.length >= n && !mine.has(id)) grant({ userId, badgeId: id });
    }

    const totalInstalls = skills.reduce((sum, s) => sum + s.downloads, 0);
    const installGates: Array<[number, BadgeId]> = [[100, 'installs-100'], [1000, 'installs-1k'], [10000, 'installs-10k']];
    for (const [n, id] of installGates) {
        if (totalInstalls >= n && !mine.has(id)) grant({ userId, badgeId: id });
    }

    const featured = skills.find(s => s.featured);
    if (featured && !mine.has('featured')) grant({ userId, badgeId: 'featured', skillId: featured.id });

    const thousand = skills.find(s => s.downloads >= 1000);
    if (thousand && !mine.has('skill-1k')) grant({ userId, badgeId: 'skill-1k', skillId: thousand.id });

    if (granted.length > 0) {
        writeAwards(all);
        for (const a of granted) notifyAward(a);
    }
    return granted;
}

/**
 * 创始编号追溯补发：对所有已投稿用户按**首次投稿时间**全局排序取号。
 * 必须先于任何增量取号执行一次（榜单页重算入口每次都会先跑它，幂等）；
 * 已取的号永不重排——哪怕后来发现更早的投稿者，先到先得以发放时点为准。
 */
export function backfillFounders() {
    const all = readAwards();
    const taken = new Set(all.filter(a => a.badgeId === 'founder').map(a => a.userId));
    let seq = all.filter(a => a.badgeId === 'founder').length;
    if (seq >= FOUNDER_LIMIT) return;

    const firstByAuthor = new Map<string, string>();
    for (const s of listSkills()) {
        const prev = firstByAuthor.get(s.authorId);
        if (!prev || s.createdAt < prev) firstByAuthor.set(s.authorId, s.createdAt);
    }
    const pending = [...firstByAuthor.entries()]
        .filter(([uid]) => !taken.has(uid))
        .sort((a, b) => a[1].localeCompare(b[1]));

    const granted: BadgeAward[] = [];
    for (const [uid] of pending) {
        if (seq >= FOUNDER_LIMIT) break;
        seq += 1;
        const award = newAward({ userId: uid, badgeId: 'founder', seq });
        all.push(award);
        granted.push(award);
    }
    if (granted.length > 0) {
        writeAwards(all);
        for (const a of granted) notifyAward(a);
    }
}

/** 周榜冠军（榜单周结算时由 lib/charts.ts 调用）；同一 (用户, 周, 榜) 只发一次 */
export function awardWeeklyNo1(userId: string, week: string, chart: 'free' | 'paid') {
    const all = readAwards();
    if (all.some(a => a.badgeId === 'weekly-no1' && a.week === week && a.chart === chart)) return;
    const award = newAward({ userId, badgeId: 'weekly-no1', week, chart });
    all.push(award);
    writeAwards(all);
    notifyAward(award);
}

/** 对全体投稿用户做一轮幂等评定（榜单页重算入口调用；当前量级下开销可忽略） */
export function evaluateAllBadges() {
    backfillFounders();
    const authors = new Set(listSkills().map(s => s.authorId));
    for (const uid of authors) evaluateUserBadges(uid);
}
