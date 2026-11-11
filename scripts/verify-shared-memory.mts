// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

assert.ok(!fs.existsSync(path.join(process.cwd(), 'package.json')), 'Run in an isolated directory');
fs.mkdirSync('data', { recursive: true });
// Seed both identities: joining a team is gated on the site's account identity —
// phone on cn, verified email on intl (dev-board#778). This script runs under both
// sites, so seeding only one of them makes the other fail with 403 email_required.
const users = ['boss', 'member', 'branch', 'outsider', 'deleted'].map((id, i) => ({
    id, username: id, displayName: id, phone: `1390000000${i + 1}`, passwordHash: '',
    email: `${id}@shared-memory.test.local`, emailVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), ...(id === 'deleted' ? { deletedAt: new Date().toISOString() } : {}),
}));
fs.writeFileSync('data/users.json', JSON.stringify(users));
const { generateApiKey } = await import('@/lib/api-keys');
const { createTeam, getMyTeamView, joinByCode, createFirm, joinFirmByCode, removeMember } = await import('@/lib/team');
const { NextRequest } = await import('next/server');
const route = await import('@/app/api/account/memory/[operation]/route');
const internal = await import('@/app/api/internal/memory/[operation]/route');
const keys = Object.fromEntries(users.map(user => [user.id, generateApiKey(user.id).key!.plaintextKey]));
const team = createTeam(users[0], 'Head team');
const view = getMyTeamView(users[0]);
assert.ok(view.team);
joinByCode(users[1], view.joinCode);
const firm = createFirm('boss', 'Firm');
createTeam(users[2], 'Branch');
const firmView = getMyTeamView(users[0]);
assert.ok(firmView.team && firmView.firm);
joinFirmByCode('branch', firmView.firm.joinCode);

async function request(user: string, operation: string, method = 'GET', body?: unknown, query: Record<string, string> = {}, headers?: Record<string, string>) {
    const req = new NextRequest(`http://localhost/api/account/memory/${operation}?${new URLSearchParams(query)}`, {
        method, headers: headers ?? { authorization: `Bearer ${keys[user]}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const handlers = headers ? internal : route;
    return handlers[method as 'GET' | 'PUT' | 'DELETE'](req, { params: Promise.resolve({ operation }) });
}
const teamId = `team:${team.id}`, firmId = `firm:${firm.id}`;
const query = { spaceId: teamId, path: 'preferences.md' };
let response = await request('boss', 'spaces');
assert.equal(response.status, 200);
assert.equal((await response.json()).data.find((s: {id: string}) => s.id === firmId).writable, true);
response = await request('branch', 'spaces');
assert.equal((await response.json()).data.find((s: {id: string}) => s.id === firmId).writable, false);
assert.equal((await request('outsider', 'files', 'GET', undefined, { spaceId: teamId })).status, 403);
assert.equal((await request('member', 'file', 'PUT', { ...query, content: 'forbidden', expectedRevision: 0 })).status, 403);
response = await request('boss', 'file', 'PUT', { ...query, content: '# Preferences\nUse concise Chinese.', expectedRevision: 0 });
assert.equal(response.status, 200);
const first = (await response.json()).data;
response = await request('member', 'search', 'GET', undefined, { spaceId: teamId, query: 'CONCISE', limit: '10' });
const matches = (await response.json()).data;
assert.deepEqual(matches.map((file: { path: string }) => file.path), ['preferences.md'], 'Search matches content without a filename match');
assert.equal(matches[0].content, undefined, 'Search returns compact metadata');
assert.equal(matches[0].writable, false);
assert.equal((await request('outsider', 'search', 'GET', undefined, { spaceId: teamId, query: 'concise' })).status, 403);
assert.equal((await request('member', 'search', 'GET', undefined, { spaceId: teamId, query: ' ' })).status, 400);
assert.equal((await request('member', 'search', 'GET', undefined, { spaceId: teamId, query: 'concise', limit: '0' })).status, 400);
response = await request('outsider', 'spaces');
assert.ok((await response.json()).data.every((space: { id: string | null; available: boolean }) => space.id === null && !space.available));
response = await request('member', 'file', 'GET', undefined, query);
assert.equal((await response.json()).data.content, first.content, 'Another member sees canonical data');
response = await request('boss', 'file', 'GET', undefined, { spaceId: teamId, path: 'remember.md' });
let index = (await response.json()).data;
assert.match(index.content, /preferences\.md/);
assert.equal((await request('boss', 'file', 'PUT', { ...query, content: 'stale', expectedRevision: 0 })).status, 409);
assert.equal((await request('boss', 'file', 'PUT', { ...query, path: '../secret.md', content: 'bad', expectedRevision: 0 })).status, 400);
assert.equal((await request('boss', 'file', 'PUT', { spaceId: teamId, path: 'remember.md', content: '[Missing](missing.md)', expectedRevision: index.revision })).status, 400);
assert.equal((await request('boss', 'file', 'PUT', { spaceId: teamId, path: 'remember.md', content: '# Custom prose\n[Preferences](preferences.md)', expectedRevision: index.revision })).status, 200);
response = await request('boss', 'download', 'GET', undefined, query);
assert.match(response.headers.get('content-type')!, /text\/markdown/);
assert.equal(await response.text(), first.content);
assert.equal((await request('boss', 'file', 'DELETE', undefined, { ...query, expectedRevision: String(first.revision) })).status, 200);
response = await request('boss', 'file', 'GET', undefined, { spaceId: teamId, path: 'remember.md' });
index = (await response.json()).data;
assert.match(index.content, /Custom prose/);
assert.doesNotMatch(index.content, /\]\(preferences\.md\)/);
assert.equal((await request('boss', 'file', 'GET', undefined, query)).status, 404);
assert.equal((await request('boss', 'file', 'DELETE', undefined, { spaceId: teamId, path: 'remember.md', expectedRevision: String(index.revision) })).status, 400);
response = await request('boss', 'file', 'PUT', { ...query, content: 'Recreated', expectedRevision: 0 });
assert.ok((await response.json()).data.revision > first.revision);
assert.equal((await request('boss', 'file', 'DELETE', undefined, { ...query, expectedRevision: String(first.revision) })).status, 409);
assert.equal((await request('boss', 'spaces', 'GET', undefined, {}, { 'x-internal-secret': 'wrong' })).status, 404);
process.env.AWD_SHARED_MEMORY_SECRET = 'isolated-test-secret';
const headers = { 'x-internal-secret': 'isolated-test-secret', 'x-requester-account-id': 'member' };
response = await request('', 'file', 'GET', undefined, query, headers);
assert.equal((await response.json()).data.content, 'Recreated', 'Internal and desktop routes share canonical data');
assert.equal((await request('', 'spaces', 'GET', undefined, {}, { ...headers, 'x-requester-account-id': 'deleted' })).status, 401);
removeMember('boss', 'member');
assert.equal((await request('', 'file', 'GET', undefined, query, headers)).status, 403, 'Revoked membership takes effect immediately');
console.log('Shared memory: permissions, canonical cross-client reads, revisions, index, downloads, tombstones and revocation PASS');
