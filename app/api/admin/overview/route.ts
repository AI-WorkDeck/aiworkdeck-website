import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { listSkills } from '@/lib/skills-store';
import { findUserById, type User } from '@/lib/users';
import { getAiConfig, getExchangeRateAdminView, maskKey } from '@/lib/ai-config';
import { platformProvider } from '@/lib/platform-ai/config';
import { SITE_ID } from '@/lib/site-config';
import { listDevelopers } from '@/lib/developers';
import { listPlugins } from '@/lib/plugins-store';
import { listPacks } from '@/lib/packs-store';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** 管理后台概览：站点数据一屏尽收。用户只暴露公开字段 + email（维护者联系投稿人用）。 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const skills = listSkills({ sort: 'newest' }).map(s => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    category: s.category,
    featured: !!s.featured,
    origin: s.origin,
    downloads: s.downloads,
    version: s.version,
    updatedAt: s.updatedAt,
    author: (() => {
      const u = findUserById(s.authorId);
      return u ? { username: u.username, displayName: u.displayName } : undefined;
    })(),
  }));

  // 用户列表（含 email 与完整手机号，仅管理后台可见——admin 有口令闸，维护者
  // 2026-08-30 明确要求手机号不脱敏展示，dev-board#295）
  // 只列真实可联系的用户，计数同口径（dev-board#652）：境内站要有手机号、国际站要有邮箱；
  // scripts/seed.mjs 的种子账号（@seed.aiworkdeck.com）是系统用户，注销墓碑行也不算。
  let users: { username: string; displayName: string; email: string; phone: string; createdAt: string; lastLoginAt: string | null; lastActiveAt: string | null }[] = [];
  try {
    // 最后活跃 = 桌面端 Key 最近使用 / 平台模型调用 / 钱包流水 三者取最晚。
    // lastLoginAt 只在新建会话或领 Key 时写，Key 永不过期，所以它基本等于注册时间。
    const lastActive = new Map(
      (getDb().prepare(`
        SELECT userId, MAX(at) AS at FROM (
          SELECT userId, MAX(lastUsedAt) AS at FROM api_keys GROUP BY userId
          UNION ALL SELECT userId, MAX(createdAt) FROM platform_ai_request GROUP BY userId
          UNION ALL SELECT userId, MAX(ts) FROM wallet_ledger GROUP BY userId
        ) WHERE at IS NOT NULL GROUP BY userId`).all() as { userId: string; at: string }[])
        .map(r => [r.userId, r.at])
    );
    const raw: User[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'users.json'), 'utf-8'));
    users = raw
      .filter(u => !u.deletedAt && !(u.email ?? '').endsWith('@seed.aiworkdeck.com'))
      .filter(u => (SITE_ID === 'cn' ? !!u.phone : !!u.email))
      .map(u => ({
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      phone: u.phone ?? '',
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
      lastActiveAt: [lastActive.get(u.id), u.lastLoginAt].filter((v): v is string => !!v).sort().at(-1) ?? null,
    }));
  } catch {
    // 文件不存在即空
  }

  // 校验失败留底（最近 50 条，倒序）
  let failedSubmissions: any[] = [];
  try {
    const lines = fs
      .readFileSync(path.join(process.cwd(), 'data', 'failed-submissions.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean);
    failedSubmissions = lines
      .slice(-50)
      .reverse()
      .map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    // 文件不存在即空
  }

  const ai = getAiConfig();
  const fx = getExchangeRateAdminView();
  return NextResponse.json({
    stats: {
      skills: skills.length,
      users: users.length,
      downloads: skills.reduce((sum, s) => sum + s.downloads, 0),
      failedSubmissions: failedSubmissions.length,
      pendingDevelopers: listDevelopers().filter(p => p.status === 'pending').length,
      pendingPlugins: listPlugins({ status: 'pending' }).length,
      pendingPacks: listPacks({ status: 'pending' }).length,
    },
    skills,
    users,
    failedSubmissions,
    ai: {
      provider: platformProvider(),
      configured: !!ai.apiKey,
      keyMasked: maskKey(ai.apiKey),
      model: ai.model,
      keySource: (platformProvider() === 'bailian' ? process.env.DASHSCOPE_API_KEY : process.env.OPENROUTER_API_KEY) ? 'env' : ai.apiKey ? 'file' : 'none',
      exchangeRate: fx.rate,
      marginMultiplier: ai.marginMultiplier,
      fx,
    },
  });
}
