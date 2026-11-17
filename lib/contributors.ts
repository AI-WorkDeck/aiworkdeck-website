// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import 'server-only';
import { listSkills, type SkillEntry } from './skills-store';
import { listPlugins, type PluginEntry } from './plugins-store';
import { mapPublicUsersByIds, type PublicUser } from './users';

export interface CodeContributor {
  login: string;
  url: string;
  contributions: number;
}

export interface MarketplaceContributor {
  user: PublicUser;
  skills: string[];
  plugins: string[];
}

const CODE_CONTRIBUTOR_SNAPSHOT: CodeContributor[] = [
  { login: 'zeweihan', url: 'https://github.com/zeweihan', contributions: 1739 },
  { login: 'AIWorkDeckAdmin', url: 'https://github.com/AIWorkDeckAdmin', contributions: 643 },
  { login: 'yuumizz', url: 'https://github.com/yuumizz', contributions: 34 },
  { login: '1152405245hwc-coder', url: 'https://github.com/1152405245hwc-coder', contributions: 1 },
  { login: '311miaowa', url: 'https://github.com/311miaowa', contributions: 1 },
  { login: 'Samix2026', url: 'https://github.com/Samix2026', contributions: 1 },
];

export function normalizeCodeContributors(value: unknown): CodeContributor[] {
  if (!Array.isArray(value)) return [];
  const contributors = new Map<string, CodeContributor>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (row.type !== 'User' || typeof row.login !== 'string' || !/^[A-Za-z0-9-]+$/.test(row.login)) continue;
    if (typeof row.contributions !== 'number' || !Number.isSafeInteger(row.contributions) || row.contributions < 1) continue;
    contributors.set(row.login.toLowerCase(), {
      login: row.login,
      url: `https://github.com/${row.login}`,
      contributions: row.contributions,
    });
  }
  return [...contributors.values()].sort((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login));
}

const OK_TTL_MS = 6 * 3600_000;
const FAIL_TTL_MS = 30 * 60_000;
let codeCache = { data: CODE_CONTRIBUTOR_SNAPSHOT, at: 0, ttl: 0 };
let codeRefresh: Promise<void> | null = null;

async function refreshCodeContributors(): Promise<void> {
  try {
    const response = await fetch('https://api.github.com/repos/AI-WorkDeck/aiworkdeck/contributors?per_page=100', {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const contributors = response.ok ? normalizeCodeContributors(await response.json()) : [];
    codeCache = contributors.length
      ? { data: contributors, at: Date.now(), ttl: OK_TTL_MS }
      : { data: codeCache.data, at: Date.now(), ttl: FAIL_TTL_MS };
  } catch {
    codeCache = { data: codeCache.data, at: Date.now(), ttl: FAIL_TTL_MS };
  } finally {
    codeRefresh = null;
  }
}

export function getCodeContributors(): CodeContributor[] {
  if (Date.now() - codeCache.at > codeCache.ttl && !codeRefresh) {
    codeRefresh = refreshCodeContributors();
  }
  return codeCache.data;
}

export function collectMarketplaceContributors(
  skills: SkillEntry[],
  plugins: PluginEntry[],
  users: ReadonlyMap<string, PublicUser>,
): MarketplaceContributor[] {
  const works = new Map<string, { skills: Set<string>; plugins: Set<string> }>();
  const add = (authorId: string, kind: 'skills' | 'plugins', name: string) => {
    if (!users.has(authorId)) return;
    const entry = works.get(authorId) ?? { skills: new Set<string>(), plugins: new Set<string>() };
    entry[kind].add(name);
    works.set(authorId, entry);
  };
  for (const skill of skills) add(skill.authorId, 'skills', skill.name);
  for (const plugin of plugins) {
    if (plugin.status === 'approved') add(plugin.authorId, 'plugins', plugin.name);
  }
  return [...works.entries()]
    .map(([userId, entry]) => ({
      user: users.get(userId)!,
      skills: [...entry.skills],
      plugins: [...entry.plugins],
    }))
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName) || a.user.username.localeCompare(b.user.username));
}

export function listMarketplaceContributors(): MarketplaceContributor[] {
  const skills = listSkills();
  const plugins = listPlugins({ status: 'approved' });
  const authorIds = new Set([...skills.map(skill => skill.authorId), ...plugins.map(plugin => plugin.authorId)]);
  return collectMarketplaceContributors(skills, plugins, mapPublicUsersByIds(authorIds));
}
