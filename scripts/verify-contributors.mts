// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import type { SkillEntry } from '../lib/skills-store';
import type { PluginEntry } from '../lib/plugins-store';
import type { PublicUser } from '../lib/users';

const { collectMarketplaceContributors, normalizeCodeContributors } = await import('../lib/contributors');

const code = normalizeCodeContributors([
  { login: 'second', type: 'User', contributions: 2 },
  { login: 'first', type: 'User', contributions: 3 },
  { login: 'duplicate', type: 'User', contributions: 1 },
  { login: 'DUPLICATE', type: 'User', contributions: 4 },
  { login: 'bot', type: 'Bot', contributions: 100 },
  { login: '../unsafe', type: 'User', contributions: 100 },
  { login: 'empty', type: 'User', contributions: 0 },
]);
assert.deepEqual(code.map(item => [item.login, item.contributions]), [['DUPLICATE', 4], ['first', 3], ['second', 2]]);
assert.equal(code[0].url, 'https://github.com/DUPLICATE');
assert.deepEqual(normalizeCodeContributors(null), []);

const users = new Map<string, PublicUser>([
  ['u1', { id: 'u1', username: 'alice', displayName: 'Alice', createdAt: '2026-01-01T00:00:00Z' }],
  ['u2', { id: 'u2', username: 'bob', displayName: 'Bob', createdAt: '2026-01-01T00:00:00Z' }],
]);
const skills = [
  { authorId: 'u1', name: 'Contract review' },
  { authorId: 'u1', name: 'Contract review' },
  { authorId: 'missing', name: 'Orphaned record' },
] as SkillEntry[];
const plugins = [
  { authorId: 'u1', name: 'Documents', status: 'approved' },
  { authorId: 'u1', name: 'Documents', status: 'approved' },
  { authorId: 'u2', name: 'Draft only', status: 'pending' },
  { authorId: 'u2', name: 'Published tool', status: 'approved' },
] as PluginEntry[];
const marketplace = collectMarketplaceContributors(skills, plugins, users);
assert.deepEqual(marketplace.map(item => ({
  username: item.user.username,
  skills: item.skills,
  plugins: item.plugins,
})), [
  { username: 'alice', skills: ['Contract review'], plugins: ['Documents'] },
  { username: 'bob', skills: [], plugins: ['Published tool'] },
]);
console.log('Contributor normalization and public marketplace attribution passed.');
